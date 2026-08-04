/**
 * Imagens de um HTML de e-mail — leitura e troca cirúrgica do `src`.
 *
 * Serve ao painel "Imagens deste e-mail" do editor de campanha: o corpo pode ter
 * vindo de fora (ChatGPT, agência, outro blog) apontando para caminhos que não
 * existem aqui. O painel lista cada `<img>`, aceita o upload do arquivo e troca
 * a URL sozinho.
 *
 * Por que regex sobre a string crua, e não DOMParser:
 *   `parseFromString` + `serialize` reescreveria o HTML INTEIRO (reordena
 *   atributos, normaliza aspas, fecha tags implícitas) — num corpo de e-mail
 *   escrito à mão isso destrói a formatação e é impossível revisar o diff. Aqui
 *   guardamos os offsets do VALOR do `src` e trocamos só aquele trecho: o resto
 *   do documento sai byte a byte igual.
 *
 * Módulo sem dependência (nem React) de propósito — a suíte do api-server o
 * importa por caminho relativo, como já faz com lib/news-engine.
 */

/** Convenção do briefing para IA: toda imagem nasce com este `src`. */
export const PLACEHOLDER_SRC = "COLOQUE_A_IMAGEM_AQUI";

export interface HtmlImage {
  /** Valor cru do atributo `src`. */
  src: string;
  /** `alt` da imagem — é o rótulo que o painel mostra e o nome do arquivo enviado. */
  alt: string;
  /** Offset do primeiro caractere do VALOR do src (dentro das aspas). */
  start: number;
  /** Offset logo APÓS o último caractere do valor. */
  end: number;
  /** `true` quando o src não é utilizável num e-mail (placeholder, vazio, token). */
  pending: boolean;
}

/** Um src só resolve num cliente de e-mail se for root-relativo ou http(s). */
export function isPendingSrc(src: string): boolean {
  const s = src.trim();
  if (!s) return true;
  return !(s.startsWith("/") || /^https?:\/\//i.test(s));
}

const IMG_TAG_RE = /<img\b[^>]*>/gi;
// O separador à esquerda é obrigatório para `\bsrc` não casar dentro de
// `data-src`/`lazy-src` (o `-` conta como fronteira de palavra em JS).
// Valor entre aspas duplas, simples, ou sem aspas (HTML de e-mail solto).
const SRC_RE = /(?:^|[\s"'])src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const ALT_RE = /(?:^|[\s"'])alt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

function attrValue(m: RegExpMatchArray | null): { value: string; offset: number } | null {
  if (!m || m.index === undefined) return null;
  const value = m[1] ?? m[2] ?? m[3] ?? "";
  // Onde o valor começa dentro do trecho casado: o fim do casamento menos o
  // tamanho do valor, menos 1 quando há aspa de fechamento.
  const quoted = m[1] !== undefined || m[2] !== undefined;
  const offset = m.index + m[0].length - value.length - (quoted ? 1 : 0);
  return { value, offset };
}

/** Todas as `<img>` do HTML, na ordem em que aparecem. */
export function listHtmlImages(html: string): HtmlImage[] {
  const out: HtmlImage[] = [];
  IMG_TAG_RE.lastIndex = 0;
  for (let tag = IMG_TAG_RE.exec(html); tag; tag = IMG_TAG_RE.exec(html)) {
    const src = attrValue(tag[0].match(SRC_RE));
    if (!src) continue; // <img> sem src: nada a trocar
    const alt = attrValue(tag[0].match(ALT_RE));
    out.push({
      src: src.value,
      alt: (alt?.value ?? "").trim(),
      start: tag.index + src.offset,
      end: tag.index + src.offset + src.value.length,
      pending: isPendingSrc(src.value),
    });
  }
  return out;
}

/**
 * Troca o `src` da Nª imagem (0-based). Índice fora da faixa devolve o HTML
 * intocado — o painel pode ter ficado defasado do texto enquanto se digita.
 */
export function replaceHtmlImageSrc(html: string, index: number, newSrc: string): string {
  const images = listHtmlImages(html);
  const img = images[index];
  if (!img) return html;
  // Aspas no valor quebrariam o atributo (o HTML original pode usar `"` ou `'`).
  const safe = newSrc.trim().replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  return html.slice(0, img.start) + safe + html.slice(img.end);
}
