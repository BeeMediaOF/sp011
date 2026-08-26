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
 *
 * Desde 2026-08-26 o mesmo passe também reescreve os `<img>` de upload dentro do
 * `html` do bloco (as artes de anúncio "faixa"/"lateral" do template da rede),
 * que sofriam do MESMO defeito e ainda saíam em PNG cru — ver
 * `htmlUploadImages.ts` para o porquê de ser aqui e não no sanitizador do front.
 */
import sharp from "sharp";
// Extensão .ts explícita (e não .js) nos imports de VALOR porque este módulo tem
// teste: o `node --test` resolve o especificador literal, e só o import de TIPO
// some na compilação. Mesmo padrão de ingestHandlers.ts (CLAUDE.md §14).
import { readLocalBuffer } from "./uploadsFile.ts";
import { logger } from "./logger.ts";
import { collectUploadImgNames, rewriteUploadImgs, type UploadDims } from "./htmlUploadImages.ts";
import type { HomeBlock } from "./store.js";

const UPLOADS_PREFIX = "/api/uploads/";

/** filename → dimensões (ou null quando o arquivo sumiu / não é imagem lida). */
const dimensionsCache = new Map<string, UploadDims | null>();

/** Nome do arquivo de uma URL de upload do próprio portal, ou null. */
function uploadFilename(imageUrl: string | undefined): string | null {
  const src = (imageUrl ?? "").trim();
  if (!src.startsWith(UPLOADS_PREFIX)) return null;
  const name = src.slice(UPLOADS_PREFIX.length).split(/[?#]/)[0] ?? "";
  // Sem travessia de caminho: é nome de arquivo, não caminho.
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  return name;
}

/**
 * Dimensões nativas de um upload, lidas UMA vez por nome de arquivo.
 * Nunca lança: arquivo ausente ou ilegível vira null (e o null também é
 * cacheado — não adianta reler a cada request).
 */
export async function uploadDimensions(filename: string): Promise<UploadDims | null> {
  const cached = dimensionsCache.get(filename);
  if (cached !== undefined) return cached;
  let result: UploadDims | null = null;
  try {
    // Disco local apenas: ver readLocalBuffer. O /api/site não pode ficar preso
    // num timeout de rede por causa de uma otimização de layout.
    const raw = readLocalBuffer(filename);
    if (raw) {
      const meta = await sharp(raw).metadata();
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
 * imagem e com os `<img>` de upload do `html` já dimensionados/convertidos.
 * Não altera nada mais: bloco sem imagem, com URL externa ou com arquivo
 * ilegível sai idêntico ao que entrou (e a LISTA inteira sai por referência
 * quando não há nada a fazer). Nunca lança.
 */
export async function withBlockImageDimensions<T extends HomeBlock>(
  blocks: readonly T[] | undefined,
): Promise<T[] | undefined> {
  if (!Array.isArray(blocks) || blocks.length === 0) return blocks as T[] | undefined;

  const capas = blocks.map((b) => uploadFilename(b.imageUrl));
  const noHtml = blocks.map((b) => collectUploadImgNames(b.html));
  if (capas.every((n) => n === null) && noHtml.every((l) => l.length === 0)) return blocks as T[];

  // Uma leitura de disco por ARQUIVO, compartilhada entre capa e html.
  const nomes = [...new Set([
    ...capas.filter((n): n is string => n !== null),
    ...noHtml.flat(),
  ])];
  const pares = await Promise.all(
    nomes.map(async (n) => [n, await uploadDimensions(n)] as const),
  );
  const mapa = new Map(pares);
  const lookup = (n: string): UploadDims | null => mapa.get(n) ?? null;

  return blocks.map((b, i) => {
    const d = capas[i] ? lookup(capas[i]!) : null;
    const html = noHtml[i]!.length > 0 ? rewriteUploadImgs(b.html, lookup) : b.html;
    const mudouHtml = html !== b.html;
    if (!d && !mudouHtml) return b;
    return {
      ...b,
      ...(d ? { imageWidth: d.width, imageHeight: d.height } : {}),
      ...(mudouHtml ? { html } : {}),
    };
  });
}

/**
 * Mesma reescrita, para um HTML solto das settings (hoje o banner do cabeçalho).
 * Devolve a string ORIGINAL quando não há `<img>` de upload nela.
 */
export async function withHtmlImageDimensions(html: string | undefined): Promise<string | undefined> {
  const nomes = collectUploadImgNames(html);
  if (nomes.length === 0) return html;
  const pares = await Promise.all(
    nomes.map(async (n) => [n, await uploadDimensions(n)] as const),
  );
  const mapa = new Map(pares);
  return rewriteUploadImgs(html, (n) => mapa.get(n) ?? null);
}
