/**
 * imageTransform — pipeline de redimensionamento/conversão WebP|AVIF via sharp,
 * com cache em duas camadas (LRU em memória + disco) e coalescing de requisições.
 *
 * Compartilhado entre:
 *   - routes/image.ts    — proxy de imagens de domínios externos (allowlist)
 *   - routes/uploads.ts  — imagens enviadas pelo portal (disco local / legado Supabase)
 *
 * A camada de cache guarda sempre o buffer JÁ processado (resized + encodado),
 * indexado por uma chave que cobre origem + largura + qualidade + formato.
 */

import sharp from "sharp";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

export type ImageFormat = "webp" | "avif";

/**
 * Como a imagem encaixa na medida pedida.
 *
 * - `inside` (padrão, histórico): redimensiona por largura (ou por altura, no
 *   caso da logo) mantendo a proporção da origem. Quem recorta é o CSS.
 * - `cover`: o SERVIDOR recorta na proporção pedida (`w`×`h`). É para as caixas
 *   `object-cover` de proporção fixa — card retrato, faixa panorâmica. Ver
 *   `escalaCover` para o porquê de não existir `withoutEnlargement` aqui.
 */
export type ImageFit = "inside" | "cover";

// ── Config ───────────────────────────────────────────────────────────────────
export const MAX_WIDTH = 1600;
export const MAX_HEIGHT = 1600;
export const DEFAULT_W = 800;
export const DEFAULT_Q = 82;
export const MAX_Q = 100;

const CACHE_DIR = path.join(os.tmpdir(), "img-proxy-cache");
const MEM_MAX = 500; // entradas no LRU em memória

/**
 * Teto de memória do libvips (2026-08-14). Dois OOM-kills de api de blog em
 * 2026-08-12/13 nasceram aqui: `libvips worker invoked oom-killer`, ~2 GiB de
 * RSS, com uma dezena de `/api/image` disparados no mesmo segundo pelo
 * carregamento de uma página.
 *
 * - `concurrency`: o default é o número de vCPUs (8 na VPS) de threads POR
 *   operação — e são 10 blogs no mesmo host, cada um com o seu processo. 2 é o
 *   suficiente para uma imagem editorial de 1600px.
 * - `cache`: o default de 50 MB é por processo; ×10 blogs vira meio giga parado.
 */
sharp.concurrency(2);
sharp.cache({ memory: 32 });

/**
 * Transformações simultâneas por processo. O `concurrency` acima limita as
 * threads DENTRO de uma operação, não quantas operações existem ao mesmo tempo —
 * sem esta fila, dez requisições viram dez decodificações concorrentes e a soma
 * dos buffers é o que estourou o cgroup. As requisições excedentes esperam a
 * vaga (o coalescing por chave já colapsa as repetidas).
 */
const MAX_CONCURRENT_TRANSFORMS = 2;
let emAndamento = 0;
const esperando: Array<() => void> = [];

/** Executa `fn` ocupando uma das vagas de transformação. */
export async function withTransformSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (emAndamento < MAX_CONCURRENT_TRANSFORMS) emAndamento++;
  else await new Promise<void>((resolve) => esperando.push(resolve));
  try {
    return await fn();
  } finally {
    const proximo = esperando.shift();
    // A vaga passa direto para quem esperava: `emAndamento` não muda.
    if (proximo) proximo();
    else emAndamento--;
  }
}

// ── LRU em memória simples ────────────────────────────────────────────────────
const memCache = new Map<string, Buffer>();

export function memGet(key: string): Buffer | undefined {
  const val = memCache.get(key);
  if (val !== undefined) {
    memCache.delete(key);
    memCache.set(key, val);
  }
  return val;
}

export function memSet(key: string, buf: Buffer): void {
  if (memCache.size >= MEM_MAX) {
    const oldest = memCache.keys().next().value;
    if (oldest !== undefined) memCache.delete(oldest);
  }
  memCache.set(key, buf);
}

// ── Cache em disco ────────────────────────────────────────────────────────────
/**
 * Chave de cache. Sem `h`/`fit` a string é IDÊNTICA à de antes do recorte no
 * servidor — o cache em disco já gravado (milhares de arquivos por blog)
 * continua valendo depois do deploy, em vez de ser reconstruído do zero.
 */
export function cacheKey(
  source: string, w: number, q: number, fmt: string,
  h?: number, fit?: ImageFit,
): string {
  const base = `${source}|${w}|${q}|${fmt}`;
  const completa = h !== undefined || (fit !== undefined && fit !== "inside")
    ? `${base}|${h ?? ""}|${fit ?? ""}`
    : base;
  return createHash("sha256").update(completa).digest("hex");
}

function cachePath(key: string): string {
  return path.join(CACHE_DIR, key.slice(0, 2), `${key}.img`);
}

async function diskRead(key: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(cachePath(key));
  } catch {
    return null;
  }
}

async function diskWrite(key: string, buf: Buffer): Promise<void> {
  const p = cachePath(key);
  try {
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, buf);
  } catch {
    // falha silenciosa — cache não é crítico
  }
}

// ── Pipeline sharp ────────────────────────────────────────────────────────────
/**
 * Redimensiona e codifica o buffer de origem.
 * effort: 1 (vs padrão 4) → ~3-4× mais rápido na codificação WebP/AVIF, com
 * diferença de tamanho < 5%. Ideal para um proxy onde latência > compressão.
 */
/**
 * Teto de pixels de ENTRADA do sharp (PRD-11, anti-bomba de decompressão):
 * 50 MP — muito acima de qualquer imagem editorial real (MAX_WIDTH=1600), bem
 * abaixo do default ~268 MP. Fonte ÚNICA do cap (uploads.ts importa daqui).
 */
export const MAX_INPUT_PIXELS = 50_000_000;
const SHARP_TIMEOUT_S = 15;

/**
 * Perfil de compressão. `photo` é o das imagens editoriais: lossy barato, porque
 * são milhares de imagens diferentes e o custo de CPU por request importa.
 *
 * `artwork` é para LOGO e arte de identidade — texto, bordas duras, gradiente e
 * canal alfa. Nesse conteúdo o lossy do WebP produz ringing em volta das letras
 * e sujeira nas bordas, visível a olho nu mesmo em q=82 (regressão observada na
 * logo do KSports em 2026-07-28). São poucos arquivos, cacheados como immutable
 * e transformados uma única vez, então lossless + effort alto é barato: paga-se
 * CPU uma vez e o resultado é pixel-idêntico ao PNG de origem, ainda muito menor
 * que ele por causa do resize.
 */
export type ImageProfile = "photo" | "artwork";

/**
 * Maior recorte NA PROPORÇÃO PEDIDA que a origem consegue entregar sem ampliar.
 *
 * Existe porque `withoutEnlargement` é INCOMPATÍVEL com `fit: "cover"`: quando o
 * alvo é mais alto que a origem, o sharp devolve a imagem com a proporção
 * ERRADA em vez de encolher o pedido — uma origem 1280x720 pedida em 592x790
 * volta 592x720 (medido em 2026-08-14). Aí o `object-cover` do navegador
 * recortaria de novo, e o ganho todo do recorte no servidor se perdia.
 *
 * Com o fator aplicado aos DOIS lados, a proporção pedida é sempre respeitada e
 * nunca se amplia: 1280x720 pedido em 592x790 vira 539x720 (exatamente 3:4).
 * Origem menor que a caixa devolve a caixa inteira em escala reduzida — o
 * navegador amplia, mas sem recortar de novo.
 */
export function escalaCover(
  origem: { width?: number | undefined; height?: number | undefined },
  w: number,
  h: number,
): { width: number; height: number } {
  const ow = origem.width ?? 0;
  const oh = origem.height ?? 0;
  // Origem sem metadata legível: entrega o pedido como veio.
  if (ow <= 0 || oh <= 0) return { width: w, height: h };
  const fator = Math.min(1, ow / w, oh / h);
  return {
    width: Math.max(1, Math.round(w * fator)),
    height: Math.max(1, Math.round(h * fator)),
  };
}

export async function transformImage(
  raw: Buffer,
  w: number,
  q: number,
  fmt: ImageFormat,
  profile: ImageProfile = "photo",
  h?: number,
  fit: ImageFit = "inside",
): Promise<Buffer> {
  // limitInputPixels + timeout: um input acima do cap (ou que trava a decodificação)
  // faz o sharp LANÇAR — tratado a montante (proxy → placeholder; upload GET →
  // streaming cru), sem derrubar o processo.
  //
  // Por ALTURA quando `h` vem: é a restrição de layout de uma logo — o CSS fixa
  // `style={{ height }}` e deixa a largura livre. Dimensionar logo por largura
  // exige saber a proporção, que só o servidor conhece: a do KSports é 1080x300
  // (3,6:1) e, exibida a 120 px de altura, ocupa 432 px — pedir w=320 fazia o
  // navegador dar UPSCALE e borrava a marca (observado em 2026-07-28).
  return withTransformSlot(async () => {
    const entrada = () => sharp(raw, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" });

    // Recorte na proporção da caixa: o alvo é reduzido ao que a origem cobre
    // (ver escalaCover), e `position: centre` reproduz exatamente o
    // enquadramento que o `object-cover` do navegador já fazia — o que muda é
    // que os pixels descartados param de ser baixados.
    const alvo = fit === "cover" && h
      ? escalaCover(await entrada().metadata(), w, h)
      : null;

    const pipeline = entrada()
      .resize(
        alvo
          ? { width: alvo.width, height: alvo.height, fit: "cover", position: "centre" }
          : h
            ? { height: h, withoutEnlargement: true }
            : { width: w, withoutEnlargement: true },
      )
      .timeout({ seconds: SHARP_TIMEOUT_S });
    if (profile === "artwork") {
      /* Lossless e lossy q95/effort 4, servindo o MENOR. Em arte de identidade os
         dois são visualmente indistinguíveis do original nesse nível, mas qual
         vence em bytes depende do conteúdo: lossless ganha em logo chapada de
         poucas cores, o lossy ganha quando há gradiente (a do KSports tem). Custa
         duas passadas de sharp uma única vez — o resultado é cacheado como
         immutable em memória e disco. AVIF fica de fora: no lossless costuma sair
         maior que o WebP nesse tipo de arte. */
      const [lossless, lossy] = await Promise.all([
        pipeline.clone().webp({ lossless: true, effort: 4 }).toBuffer(),
        pipeline.clone().webp({ quality: 95, effort: 4 }).toBuffer(),
      ]);
      return lossless.length <= lossy.length ? lossless : lossy;
    }
    if (fmt === "avif") {
      return pipeline.avif({ quality: q, effort: 1 }).toBuffer();
    }
    return pipeline.webp({ quality: q, effort: 1 }).toBuffer();
  });
}

// ── Resolução com cache + coalescing ──────────────────────────────────────────
const inFlight = new Map<string, Promise<Buffer>>();

/**
 * Resolve um buffer processado para `key`, consultando mem → disco e, em caso de
 * miss, executando `produceRaw()` (que entrega os bytes de origem), aplicando o
 * pipeline sharp e gravando nas duas camadas de cache. Requisições simultâneas
 * para a mesma `key` compartilham um único `produceRaw` + transform.
 */
export async function resolveImage(
  key: string,
  produceRaw: () => Promise<Buffer>,
  w: number,
  q: number,
  fmt: ImageFormat,
  profile: ImageProfile = "photo",
  h?: number,
  fit: ImageFit = "inside",
): Promise<Buffer> {
  // 1. Mem
  const memHit = memGet(key);
  if (memHit) return memHit;

  // 2. Disco
  await fs.mkdir(CACHE_DIR, { recursive: true }).catch(() => undefined);
  const diskHit = await diskRead(key);
  if (diskHit) {
    memSet(key, diskHit);
    return diskHit;
  }

  // 3. Coalescing: reutiliza um fetch/transform já em andamento para esta chave
  let pending = inFlight.get(key);
  if (!pending) {
    pending = (async () => {
      const raw = await produceRaw();
      return transformImage(raw, w, q, fmt, profile, h, fit);
    })()
      .then((buf) => {
        memSet(key, buf);
        void diskWrite(key, buf);
        return buf;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }

  return pending;
}
