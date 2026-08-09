/**
 * Política CANÔNICA de sanitização de HTML do projeto (PRD-04a) — FONTE ÚNICA.
 *
 * Substitui os três sanitizadores por REGEX espelhados e divergentes (ingest,
 * SSR, AMP) e a regex `DANGEROUS_HTML` do gate por UMA allowlist baseada em
 * PARSER (cheerio — já dependência do news-engine, sem nova superfície de
 * supply chain). Parser real neutraliza os bypass que a regex não pegava:
 * `<svg onload>`, `<math href=javascript:>`, tag aninhada/malformada
 * (`<scr<script>ipt>`), handler sem aspas/sem espaço, `style="expression(...)"`,
 * URLs `javascript:`/`data:`/`vbscript:` (inclusive com tab/quebra no meio).
 *
 * Consumidores (todos importam DAQUI):
 *   - api-server: `lib/ingestSanitize.ts` (write-path do ingest) -> sanitizeArticleHtml
 *   - api-server: `routes/amp.ts` (toAmpHtml)                    -> sanitizeAmpHtml
 *   - news-engine: `validate.ts` (gate html_dangerous)          -> containsDangerousHtml
 * (O ramo SSR do frontend em `brasilia-agora` NAO importa este modulo para nao
 *  puxar cheerio ao bundle do cliente — ver PRD-04a / STATUS para o plano.)
 *
 * Regras do repo: nunca unicode literal em regex (usar \uXXXX).
 */
import * as cheerio from "cheerio";

type El = { tagName?: string; name?: string; attribs?: Record<string, string> };

function tagOf(el: unknown): string {
  const e = el as El;
  return (e.tagName ?? e.name ?? "").toLowerCase();
}

/** Tags que jamais devem sobreviver: executaveis ou vetores de embed/estilo. */
const DANGEROUS_TAGS = [
  "script", "style", "iframe", "object", "embed", "form", "svg", "math",
  "link", "meta", "base", "noscript", "template", "frame", "frameset", "applet",
];

/**
 * Players cujo `<iframe>` e a UNICA excecao a `DANGEROUS_TAGS` no corpo de
 * artigo. O bloco "Adicionar video" do editor grava um iframe no corpo; sem
 * esta excecao ele morria aqui, na entrega, e o video sumia do site depois de
 * aparecer no editor. So https e so estes hosts.
 * ESPELHADO em `brasilia-agora/src/lib/sanitize.ts` (isVideoEmbedSrc), que faz
 * o mesmo filtro na hora de exibir — mudar nos DOIS.
 */
const VIDEO_EMBED_SRC =
  /^https:\/\/(?:www\.)?(?:youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/|player\.vimeo\.com\/video\/)/i;

/** `true` so para src de player permitido (o resto do iframe continua caindo). */
export function isVideoEmbedSrc(src: string | null | undefined): boolean {
  return VIDEO_EMBED_SRC.test((src ?? "").trim());
}

/** Atributos seguros permitidos em qualquer tag (nao executaveis). */
const GLOBAL_SAFE_ATTRS = new Set(["class", "id", "title", "dir", "lang", "role", "align"]);

/** Allowlist de tags de conteudo editorial (texto puro, sem media incorporada). */
const TEXT_TAGS = [
  "p", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li",
  "dl", "dt", "dd", "a", "img", "b", "strong", "i", "em", "u", "s", "strike",
  "del", "ins", "sub", "sup", "blockquote", "q", "cite", "figure", "figcaption",
  "span", "div", "section", "article", "table", "thead", "tbody", "tfoot",
  "tr", "th", "td", "caption", "colgroup", "col", "pre", "code", "mark",
  "small", "abbr", "time",
];

/**
 * Corpo de artigo: texto + media passiva. `iframe` entra na allowlist mas so
 * chega aqui o que passou pelo filtro de host; `video` e media sem execucao,
 * do mesmo naipe de `img` (a URL ainda passa por `isSafeUrl`).
 */
const ARTICLE_TAGS = new Set([...TEXT_TAGS, "iframe", "video"]);

/** Atributos por tag (alem dos globais seguros). */
const ARTICLE_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title", "rel", "target"]),
  img: new Set(["src", "alt", "width", "height", "loading"]),
  "amp-img": new Set(["src", "alt", "width", "height", "layout"]),
  // `srcdoc` fica DE FORA de proposito: com ele um host permitido executaria
  // markup arbitrario.
  iframe: new Set(["src", "width", "height", "allow", "allowfullscreen", "frameborder", "loading", "referrerpolicy"]),
  video: new Set(["src", "controls", "poster", "width", "height", "preload", "playsinline"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
  time: new Set(["datetime"]),
  col: new Set(["span"]),
  colgroup: new Set(["span"]),
};

/** AMP: base de texto, `img` vira `amp-img` e media incorporada nao existe. */
const AMP_TAGS = new Set(TEXT_TAGS.filter((t) => t !== "img").concat("amp-img"));

/** E-mail: base de texto. Cliente de e-mail nao roda iframe nem video. */
const EMAIL_TAGS = new Set(TEXT_TAGS);

/**
 * Extrai o esquema de uma URL para inspecao, removendo espacos e quebras
 * (\s) que ofuscam esquemas (`java\tscript:` vira `javascript:`, como o
 * navegador faz). Retorna o esquema minusculo, ou null quando nao ha esquema
 * (URL relativa/ancora). Caracteres de controle exoticos quebram o esquema
 * tanto aqui quanto no navegador, entao nao precisam ser removidos.
 */
function schemeOf(v: string | undefined): string | null {
  if (v == null) return null;
  const t = v.replace(/\s+/g, "").toLowerCase();
  const m = t.match(/^([a-z][a-z0-9+.-]*):/);
  return m ? (m[1] ?? null) : null;
}

/** `true` so para URLs seguras: http(s), relativas/ancora, mailto, tel. */
function isSafeUrl(v: string | undefined): boolean {
  if (v == null || v.trim() === "") return false;
  const scheme = schemeOf(v);
  if (scheme === null) return true; // sem esquema -> relativa/ancora
  return scheme === "http" || scheme === "https" || scheme === "mailto" || scheme === "tel";
}

/** `true` para URLs de esquema perigoso (o que o detector do gate marca). */
function hasDangerousScheme(v: string | undefined): boolean {
  const scheme = schemeOf(v);
  return scheme === "javascript" || scheme === "data" || scheme === "vbscript";
}

const URL_ATTRS = new Set(["href", "src", "xlink:href"]);

/** Remove atributos executaveis/perigosos e fora da allowlist do elemento. */
function cleanAttrs($: cheerio.CheerioAPI, el: unknown, attrMap: Record<string, Set<string>>): void {
  const e = el as El;
  const tag = tagOf(el);
  const perTag = attrMap[tag] ?? new Set<string>();
  const attribs = e.attribs ?? {};
  for (const name of Object.keys(attribs)) {
    const ln = name.toLowerCase();
    if (ln.startsWith("on")) { $(el as never).removeAttr(name); continue; }
    if (ln === "style") { $(el as never).removeAttr(name); continue; }
    if (URL_ATTRS.has(ln) && !isSafeUrl(attribs[name])) { $(el as never).removeAttr(name); continue; }
    if (!GLOBAL_SAFE_ATTRS.has(ln) && !perTag.has(ln)) { $(el as never).removeAttr(name); }
  }
}

/** Desembrulha (mantem o texto/filhos) toda tag fora da allowlist. */
function unwrapDisallowed($: cheerio.CheerioAPI, allowed: Set<string>): void {
  for (let pass = 0; pass < 6; pass++) {
    const bad = $("*").toArray().filter((el) => !allowed.has(tagOf(el)));
    if (bad.length === 0) break;
    for (const el of bad) {
      const $el = $(el as never);
      $el.replaceWith($el.contents());
    }
  }
}

/**
 * Sanitiza HTML de corpo de artigo por allowlist (parser). Remove tags
 * executaveis/embed, desembrulha tags fora da allowlist (preserva o texto),
 * e limpa atributos `on*`/`style`/URLs perigosas. Saida pronta para gravar.
 */
export function sanitizeArticleHtml(html: string | null | undefined): string {
  if (!html) return "";
  const $ = cheerio.load(html, undefined, false);
  // `iframe` sai do lote e e tratado por host logo abaixo — os outros caem todos.
  $(DANGEROUS_TAGS.filter((t) => t !== "iframe").join(",")).remove();
  $("iframe").each((_, el) => {
    if (!isVideoEmbedSrc((el as El).attribs?.["src"])) $(el as never).remove();
  });
  unwrapDisallowed($, ARTICLE_TAGS);
  $("*").each((_, el) => cleanAttrs($, el, ARTICLE_ATTRS));
  return $.html();
}

/** Atributos presentacionais seguros extras permitidos SÓ no HTML de e-mail
 *  (molduras de newsletter): layout de tabela, dimensoes, cor de fundo. Nao
 *  executaveis. `style` inline e tratado a parte (isSafeStyle). */
const EMAIL_EXTRA_ATTRS = new Set([
  "bgcolor", "width", "height", "valign", "cellpadding", "cellspacing", "border", "nowrap",
]);

/**
 * `true` se o `style` inline e seguro. E-mail so se estiliza com CSS inline, entao
 * `style` e PRESERVADO (ao contrario do corpo de artigo, que o descarta), mas
 * bloqueia os unicos vetores executaveis dentro de style: `expression(...)`
 * (IE legado) e esquema `javascript:`/`vbscript:` (inclusive dentro de `url()`).
 */
function isSafeStyle(v: string | undefined): boolean {
  if (v == null) return false;
  if (/expression\s*\(/i.test(v)) return false;
  if (/(javascript|vbscript)\s*:/i.test(v)) return false;
  return true;
}

/**
 * Sanitiza HTML de CABECALHO/RODAPE de molduras de e-mail (newsletter). Mesma
 * base da politica de artigo (allowlist por parser, remove script/iframe/tag de
 * style, handlers `on...` e URLs perigosas), MAS preserva `style` inline seguro
 * e os atributos presentacionais de tabela — sem eles o e-mail sai sem estilo.
 * NUNCA usada no corpo de artigo nem no ingest: exclusiva do e-mail.
 */
export function sanitizeEmailHtml(html: string | null | undefined): string {
  if (!html) return "";
  const $ = cheerio.load(html, undefined, false);
  $(DANGEROUS_TAGS.join(",")).remove();
  unwrapDisallowed($, EMAIL_TAGS);
  $("*").each((_, el) => {
    const e = el as El;
    const tag = tagOf(el);
    const perTag = ARTICLE_ATTRS[tag] ?? new Set<string>();
    const attribs = e.attribs ?? {};
    for (const name of Object.keys(attribs)) {
      const ln = name.toLowerCase();
      if (ln.startsWith("on")) { $(el as never).removeAttr(name); continue; }
      if (ln === "style") { if (!isSafeStyle(attribs[name])) $(el as never).removeAttr(name); continue; }
      if (URL_ATTRS.has(ln)) { if (!isSafeUrl(attribs[name])) $(el as never).removeAttr(name); continue; }
      if (!GLOBAL_SAFE_ATTRS.has(ln) && !EMAIL_EXTRA_ATTRS.has(ln) && !perTag.has(ln)) {
        $(el as never).removeAttr(name);
      }
    }
  });
  return $.html();
}

/**
 * Sanitiza HTML para AMP (allowlist estrita): converte `<img>` em `<amp-img>`
 * responsivo, remove tudo de executavel/embed e limpa atributos. Nunca deixa
 * `style` inline nem `on*`.
 */
export function sanitizeAmpHtml(html: string | null | undefined): string {
  if (!html) return "";
  const $ = cheerio.load(html, undefined, false);
  $(DANGEROUS_TAGS.join(",")).remove();
  // <img> -> <amp-img> (descarta imagem com URL insegura)
  $("img").each((_, el) => {
    const e = el as El;
    const src = e.attribs?.["src"];
    if (!src || !isSafeUrl(src)) { $(el as never).remove(); return; }
    const alt = e.attribs?.["alt"] ?? "";
    e.tagName = "amp-img";
    e.name = "amp-img";
    e.attribs = { src, alt, width: "800", height: "450", layout: "responsive" };
  });
  unwrapDisallowed($, AMP_TAGS);
  $("*").each((_, el) => cleanAttrs($, el, ARTICLE_ATTRS));
  return $.html();
}

/**
 * Detector do gate `html_dangerous` (PRD-04a) — por PARSER, nunca por regex de
 * igualdade (normalizacao benigna geraria falso-positivo). `true` se o material
 * contem tag executavel/embed, atributo `on*`, `style` com expression/js, ou
 * URL `javascript:`/`data:`/`vbscript:` em href/src.
 */
export function containsDangerousHtml(html: string | null | undefined): boolean {
  if (!html) return false;
  const $ = cheerio.load(html, undefined, false);
  // Player permitido nao e flagrado — senao a saida de sanitizeArticleHtml, que
  // preserva esses iframes, seria detectada como perigosa pelo proprio gate.
  const perigosas = $(DANGEROUS_TAGS.join(","))
    .toArray()
    .filter((el) => !(tagOf(el) === "iframe" && isVideoEmbedSrc((el as El).attribs?.["src"])));
  if (perigosas.length > 0) return true;
  let bad = false;
  $("*").each((_, el) => {
    if (bad) return;
    const attribs = (el as El).attribs ?? {};
    for (const name of Object.keys(attribs)) {
      const ln = name.toLowerCase();
      const val = attribs[name] ?? "";
      if (ln.startsWith("on")) { bad = true; return; }
      if (URL_ATTRS.has(ln) && hasDangerousScheme(val)) { bad = true; return; }
      if (ln === "style" && /expression\s*\(|(javascript|vbscript|data)\s*:/i.test(val)) { bad = true; return; }
    }
  });
  return bad;
}
