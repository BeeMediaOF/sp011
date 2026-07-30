/**
 * Dimensões nativas das imagens de bloco, publicadas junto com as settings.
 *
 * O bloco de imagem da home guarda só a URL. O `<img>` do site sai com
 * `w-full h-auto` e SEM width/height: até a imagem chegar ela ocupa altura zero,
 * e quando chega empurra tudo abaixo dela. Medido no esporteagora em
 * 2026-07-30 (PageSpeed): **CLS 0,945**, dos quais 0,605 só do rodapé sendo
 * empurrado — nota 48 de desempenho num blog cujo FCP é 1,2 s.
 *
 * Com as dimensões no payload, o navegador reserva a caixa desde o primeiro
 * quadro (inclusive no HTML do SSR) e o deslocamento some. Ler do arquivo é
 * seguro de cachear para sempre: o nome do upload carrega hash de conteúdo
 * (`anuncie-lateral-16e026e7.png`), então nome igual = bytes iguais.
 */
import sharp from "sharp";
// Extensão .ts explícita (e não .js) nos imports de VALOR porque este módulo tem
// teste: o `node --test` resolve o especificador literal, e só o import de TIPO
// some na compilação. Mesmo padrão de ingestHandlers.ts (CLAUDE.md §14).
import { loadRawBuffer } from "./uploadsFile.ts";
import { logger } from "./logger.ts";
import type { HomeBlock } from "./store.js";

const UPLOADS_PREFIX = "/api/uploads/";

/** filename → dimensões (ou null quando o arquivo sumiu / não é imagem lida). */
const dimensionsCache = new Map<string, { width: number; height: number } | null>();

/** Nome do arquivo de uma URL de upload do próprio portal, ou null. */
function uploadFilename(imageUrl: string | undefined): string | null {
  const src = (imageUrl ?? "").trim();
  if (!src.startsWith(UPLOADS_PREFIX)) return null;
  const name = src.slice(UPLOADS_PREFIX.length).split(/[?#]/)[0] ?? "";
  // Sem travessia de caminho: é nome de arquivo, não caminho.
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  return name;
}

async function dimensionsOf(filename: string): Promise<{ width: number; height: number } | null> {
  const cached = dimensionsCache.get(filename);
  if (cached !== undefined) return cached;
  let result: { width: number; height: number } | null = null;
  try {
    const raw = await loadRawBuffer(filename);
    if (raw) {
      const meta = await sharp(raw.buffer).metadata();
      if (meta.width && meta.height) result = { width: meta.width, height: meta.height };
    }
  } catch (err) {
    logger.warn({ err, filename }, "blockImageMeta: dimensões não lidas");
  }
  dimensionsCache.set(filename, result);
  return result;
}

/**
 * Devolve a lista com `imageWidth`/`imageHeight` preenchidos nos blocos de
 * imagem. Não altera nada mais: bloco sem imagem, com URL externa ou com
 * arquivo ilegível sai idêntico ao que entrou (o front volta ao comportamento
 * de hoje). Nunca lança.
 */
export async function withBlockImageDimensions<T extends HomeBlock>(
  blocks: readonly T[] | undefined,
): Promise<T[] | undefined> {
  if (!Array.isArray(blocks) || blocks.length === 0) return blocks as T[] | undefined;
  const names = blocks.map((b) => uploadFilename(b.imageUrl));
  if (names.every((n) => n === null)) return blocks as T[];
  const dims = await Promise.all(names.map((n) => (n ? dimensionsOf(n) : Promise.resolve(null))));
  return blocks.map((b, i) => {
    const d = dims[i];
    return d ? { ...b, imageWidth: d.width, imageHeight: d.height } : b;
  });
}
