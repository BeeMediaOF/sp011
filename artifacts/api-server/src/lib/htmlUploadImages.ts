/**
 * Otimização dos `<img>` de upload dentro do HTML escrito pelo OPERADOR —
 * banner do cabeçalho, blocos HTML da home e da sidebar de artigo (as artes de
 * anúncio "faixa" e "lateral" do template da rede).
 *
 * Por que existe (PageSpeed do oleysports, 2026-08-26): o painel grava a arte
 * como `<img src="/api/uploads/anuncie-lateral-c547f90f.png" alt="banner"
 * style="width:100%;height:auto;...">` — PNG cru, sem `width`/`height`. Numa
 * home de 1280 isso é **252,7 KiB em duas imagens** (163,4 + 89,3), dos quais o
 * Lighthouse aponta 229,5 KiB de desperdício, e as duas ainda aparecem em "Os
 * elementos de imagem não têm width e height explícitas" (fonte de CLS).
 *
 * O `/api/uploads/:filename` JÁ sabe redimensionar e converter para WebP desde
 * que receba `?w=` (ver routes/uploads.ts) — o HTML é que nunca pedia. Aqui o
 * servidor reescreve o `src` para pedir, e carimba as dimensões NATIVAS lidas do
 * arquivo, como `blockImageMeta.ts` já faz para o bloco de imagem.
 *
 * POR QUE NO SERVIDOR e não no `sanitizeArticleHtml` do front: (a) só o servidor
 * tem o arquivo para ler `width`/`height` com o sharp; (b) o HTML das settings é
 * renderizado no SSR **e** na hidratação — reescrever no payload faz os dois
 * lados receberem a MESMA string por construção, sem risco do mismatch #418 que
 * já custou o LCP da home uma vez (ver sanitize.ts).
 *
 * O que NÃO se faz aqui, de propósito:
 *   - `loading="lazy"`: o banner do cabeçalho fica acima da dobra e o `lazy`
 *     rebaixa a prioridade do fetch. Trocar semântica de carregamento de um
 *     slot PAGO, em 11 blogs de layout desconhecido, não é assunto de uma
 *     correção de bytes.
 *   - `srcset`/`sizes`: a largura de exibição vem do CSS do bloco, que este
 *     módulo não conhece. Um `sizes` chutado erra para o lado caro (o padrão é
 *     `100vw`) e sairia PIOR que o `src` único já dimensionado.
 */

/** Prefixo servido por routes/uploads.ts. */
const UPLOADS_PREFIX = "/api/uploads/";

/**
 * Teto de largura pedido ao proxy. Acima disto nenhuma arte de banner da rede é
 * exibida, e o `withoutEnlargement` do sharp garante que pedir mais que a
 * origem é no-op — o valor só limita o caso patológico (arte de 4000 px).
 */
export const HTML_IMG_MAX_W = 1280;

/** Qualidade do WebP. Mesmo DEFAULT_Q do proxy — arte chapada não precisa mais. */
export const HTML_IMG_Q = 82;

export interface UploadDims { width: number; height: number }

const IMG_TAG_RE = /<img\b[^>]*>/gi;
const SRC_RE = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

/**
 * Nome do arquivo de um `src` de upload, ou null quando a tag não é candidata.
 *
 * Devolve null (deixa a tag intacta) para: origem externa, travessia de caminho
 * e — importante — `src` que JÁ tem query. Um `?w=`/`?v=` ali é escolha
 * deliberada de quem escreveu o HTML; reescrever por cima seria desfazer o
 * ajuste manual dele.
 */
export function uploadImgName(src: string | undefined): string | null {
  const s = (src ?? "").trim();
  if (!s.startsWith(UPLOADS_PREFIX)) return null;
  const resto = s.slice(UPLOADS_PREFIX.length);
  if (resto.includes("?") || resto.includes("#")) return null;
  if (!resto || resto.includes("/") || resto.includes("\\") || resto.includes("..")) return null;
  // Mesmo saneamento do parâmetro de rota em uploads.ts: o que ele descartaria
  // não é um nome que vale a pena reescrever.
  if (resto.replace(/[^a-zA-Z0-9._-]/g, "") !== resto) return null;
  return resto;
}

/** `src` da tag `<img …>` crua. */
function tagSrc(tag: string): string {
  const m = SRC_RE.exec(tag);
  return (m?.[1] ?? m?.[2] ?? m?.[3] ?? "").trim();
}

/**
 * A tag já traz o atributo? (evita sobrescrever escolha do operador)
 *
 * Literais, não `new RegExp(nome)`: o espaço à esquerda é o que separa um
 * atributo `width=` de um `data-width=` — e de `width:` dentro do `style`.
 */
const ATTR_RE = {
  width: /\swidth\s*=/i,
  height: /\sheight\s*=/i,
  decoding: /\sdecoding\s*=/i,
} as const;

function hasAttr(tag: string, name: keyof typeof ATTR_RE): boolean {
  return ATTR_RE[name].test(tag);
}

/** Insere atributos logo antes do fechamento da tag, preservando `/>`. */
function appendAttrs(tag: string, extra: string): string {
  if (!extra) return tag;
  const fim = /\s*\/?>$/.exec(tag);
  const corte = fim ? tag.length - fim[0].length : tag.length - 1;
  const autoFechada = fim ? fim[0].includes("/") : false;
  return `${tag.slice(0, corte)}${extra}${autoFechada ? " />" : ">"}`;
}

/**
 * Nomes de arquivo de upload citados por `<img>` no HTML (sem repetição).
 * É o que o chamador precisa resolver em disco antes de reescrever.
 */
export function collectUploadImgNames(html: string | undefined): string[] {
  if (!html || !html.includes(UPLOADS_PREFIX)) return [];
  const nomes = new Set<string>();
  for (const tag of html.match(IMG_TAG_RE) ?? []) {
    const nome = uploadImgName(tagSrc(tag));
    if (nome) nomes.add(nome);
  }
  return [...nomes];
}

/**
 * Reescreve os `<img>` de upload: `src` pedindo WebP dimensionado e
 * `width`/`height` nativos quando conhecidos.
 *
 * PURA e conservadora: HTML sem `<img>` de upload volta **idêntico** (mesma
 * string), e qualquer atributo que o operador já tenha escrito é preservado.
 * `dims` devolve null quando o arquivo não foi lido — nesse caso a conversão
 * para WebP ainda acontece (é o ganho maior), só não há o que carimbar de
 * dimensão.
 */
export function rewriteUploadImgs(
  html: string | undefined,
  dims: (name: string) => UploadDims | null,
): string {
  const entrada = html ?? "";
  if (!entrada.includes(UPLOADS_PREFIX)) return entrada;

  return entrada.replace(IMG_TAG_RE, (tag) => {
    const src = tagSrc(tag);
    const nome = uploadImgName(src);
    if (!nome) return tag;

    const d = dims(nome);
    const w = d ? Math.min(d.width, HTML_IMG_MAX_W) : HTML_IMG_MAX_W;
    const novoSrc = `${UPLOADS_PREFIX}${nome}?w=${w}&q=${HTML_IMG_Q}`;

    // Troca só o VALOR do src, mantendo aspas e posição originais.
    let saida = tag.replace(SRC_RE, (attr) =>
      attr.replace(src, novoSrc),
    );

    let extra = "";
    // width/height nativos: dão a proporção ao navegador antes de a imagem
    // chegar. O `style="width:100%;height:auto"` do painel continua mandando no
    // tamanho exibido — os atributos só reservam a caixa (fim do CLS).
    if (d && !hasAttr(saida, "width") && !hasAttr(saida, "height")) {
      extra += ` width="${d.width}" height="${d.height}"`;
    }
    if (!hasAttr(saida, "decoding")) extra += ' decoding="async"';

    saida = appendAttrs(saida, extra);
    return saida;
  });
}
