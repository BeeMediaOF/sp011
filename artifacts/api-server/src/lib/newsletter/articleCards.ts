/**
 * Cards de artigo na newsletter — FONTE ÚNICA do HTML.
 *
 * Dois consumos, um gerador só:
 *   1. Estático — o picker do admin ("Inserir artigos do blog") chama
 *      POST /newsletter/article-cards, cola o HTML no corpo e ele congela ali.
 *   2. Dinâmico — o corpo guarda um token (`{{artigos:3}}`) e o envio o resolve
 *      com os artigos do momento (`resolveArticleTokens`), então uma campanha de
 *      boas-vindas nunca envelhece.
 *
 * Invariantes de e-mail que este arquivo respeita (não quebrar):
 *   - UM card por linha. Três colunas lado a lado quebram no Outlook e no
 *     celular sem media query, e media query é justamente o que os clientes de
 *     e-mail mais engolem mal.
 *   - Links e imagens saem ROOT-RELATIVOS (`/artigo/…`, `/api/uploads/…`); quem
 *     absolutiza é o `absolutizeHtml` do dispatch, com a base pública do blog.
 *     Isso mantém o mesmo HTML portátil entre os 8 blogs da rede.
 *   - Só `<table>` + `style` inline + atributos de tabela — o que sobrevive ao
 *     `sanitizeEmailHtml` (ver test/newsletterArticleCards.test.ts).
 *
 * Este arquivo é PURO e sem imports — quem busca artigo no banco é o
 * `articleSource.ts`, injetado como `ArticleLoader`. Mesma separação de
 * `articlesList.ts`: assim a suíte roda sem banco (e `node --test` não resolve
 * import `.js` de arquivo `.ts`).
 */

export interface CardArticle {
  id: string;
  slug?: string | undefined;
  title: string;
  category?: string | undefined;
  imageUrl?: string | undefined;
}

export interface CardOpts {
  /** Cor de destaque da campanha (chip da categoria + CTA). */
  accent?: string | undefined;
  /** Cor do texto do corpo. */
  textColor?: string | undefined;
  /** Rótulo do CTA — em blog EN vira "Read article →". */
  ctaLabel?: string | undefined;
}

const DEFAULT_ACCENT = "#0B2A66";
const DEFAULT_TEXT = "#1A202C";
const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;

/** Cor só entra no HTML se for hex — o valor vem do corpo de uma requisição. */
function color(v: string | undefined, fallback: string): string {
  const c = (v ?? "").trim();
  return HEX_RE.test(c) ? c : fallback;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Fonte da miniatura, ou "" quando não dá para exibir.
 * `data:` cai fora: a maioria dos clientes de e-mail não renderiza data-URI, e
 * um artigo com capa em base64 (fallback do editor) inflaria o e-mail à toa.
 */
function thumbSrc(imageUrl: string | undefined): string {
  const src = (imageUrl ?? "").trim();
  if (!src || src.startsWith("data:")) return "";
  // Upload do próprio blog: pede a versão reduzida ao transform do /api/uploads
  // (a rota já faz resize/WebP) — a capa original costuma ter 1600px.
  if (src.startsWith("/api/uploads/")) return `${src}${src.includes("?") ? "&" : "?"}w=320&q=75`;
  if (src.startsWith("/") || /^https?:\/\//i.test(src)) return src;
  return "";
}

/** Rótulo legível da editoria (o slug vem em minúscula com hífen). */
function categoryLabel(category: string | undefined): string {
  const c = (category ?? "").trim();
  if (!c) return "";
  return c.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

/**
 * HTML dos cards. Sem artigos devolve "" — o chamador nunca deve emitir uma
 * seção "Confira nossos conteúdos" vazia.
 */
export function buildArticleCardsHtml(articles: readonly CardArticle[], opts: CardOpts = {}): string {
  if (articles.length === 0) return "";
  const accent = color(opts.accent, DEFAULT_ACCENT);
  const text = color(opts.textColor, DEFAULT_TEXT);
  const cta = esc((opts.ctaLabel ?? "Ler artigo →").slice(0, 40));

  const rows = articles.map((a) => {
    const href = `/artigo/${encodeURIComponent(a.slug || a.id)}`;
    const title = esc(a.title || "Sem título");
    const thumb = thumbSrc(a.imageUrl);
    const cat = esc(categoryLabel(a.category));

    const thumbCell = thumb
      ? `<td width="132" valign="top" style="padding:0 16px 0 0;">` +
        `<a href="${esc(href)}" style="text-decoration:none;">` +
        `<img src="${esc(thumb)}" width="132" alt="" ` +
        `style="display:block;width:132px;max-width:132px;height:auto;border:0;border-radius:12px;" /></a></td>`
      : "";

    const chip = cat
      ? `<div style="margin:0 0 6px;"><span style="display:inline-block;padding:3px 9px;border-radius:20px;` +
        `background:${accent};color:#ffffff;font-size:11px;font-weight:700;letter-spacing:.3px;` +
        `text-transform:uppercase;">${cat}</span></div>`
      : "";

    return (
      `<tr><td style="padding:0 0 18px;">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
      thumbCell +
      `<td valign="top" style="padding:0;">` +
      chip +
      `<a href="${esc(href)}" style="display:block;margin:0 0 6px;color:${text};font-size:16px;` +
      `line-height:1.35;font-weight:700;text-decoration:none;">${title}</a>` +
      `<a href="${esc(href)}" style="color:${accent};font-size:13px;font-weight:700;` +
      `text-decoration:none;">${cta}</a>` +
      `</td></tr></table></td></tr>`
    );
  });

  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:100%;border-collapse:collapse;">${rows.join("")}</table>`
  );
}

// ── Tokens ────────────────────────────────────────────────────────────────────

/**
 * `{{artigos:N}}`, `{{artigos:N:editoria}}`, `{{mais-lidos:N}}`,
 * `{{mais-lidos:N:editoria}}`. Texto puro dentro de um `<td>` — atravessa o
 * `sanitizeEmailHtml` intacto (comentário HTML NÃO atravessaria: o sanitizador
 * remove comentários).
 */
const TOKEN_RE = /\{\{\s*(artigos|mais-lidos)\s*:\s*(\d{1,2})\s*(?::\s*([a-z0-9-]{1,60})\s*)?\}\}/gi;

/** Teto proposital: 6 cards já é um e-mail longo, e o token vem de texto livre. */
const MAX_CARDS = 6;

export function hasArticleTokens(html: string): boolean {
  TOKEN_RE.lastIndex = 0;
  return TOKEN_RE.test(html);
}

export interface ArticleToken {
  /** Texto exato do token no corpo (é o que será substituído). */
  raw: string;
  count: number;
  /** Slug da editoria; "" = sem filtro. */
  category: string;
  sort: "recent" | "views";
}

/** Tokens encontrados no corpo, já com `count` clampado. */
export function parseArticleTokens(html: string): ArticleToken[] {
  const out: ArticleToken[] = [];
  TOKEN_RE.lastIndex = 0;
  for (let m = TOKEN_RE.exec(html); m; m = TOKEN_RE.exec(html)) {
    out.push({
      raw: m[0],
      count: Math.min(Math.max(Number(m[2]) || 1, 1), MAX_CARDS),
      category: (m[3] ?? "").toLowerCase(),
      sort: (m[1] ?? "").toLowerCase() === "mais-lidos" ? "views" : "recent",
    });
  }
  return out;
}

/** Busca os artigos de um token. Implementação real em `articleSource.ts`. */
export type ArticleLoader = (t: ArticleToken) => Promise<readonly CardArticle[]>;

/**
 * Troca cada token pelos cards do momento. Token sem resultado vira string
 * vazia — nunca deixar `{{…}}` cru chegar ao inscrito.
 */
export async function resolveArticleTokens(
  html: string,
  load: ArticleLoader,
  opts: CardOpts = {},
): Promise<string> {
  const tokens = parseArticleTokens(html);
  if (tokens.length === 0) return html;

  // Coleta e substituição em passos separados: a busca é assíncrona e
  // String.replace não aceita callback async. Tokens idênticos resolvem uma vez
  // só (cache por assinatura).
  const cache = new Map<string, string>();
  let out = html;
  for (const t of tokens) {
    const key = `${t.sort}|${t.count}|${t.category}`;
    let block = cache.get(key);
    if (block === undefined) {
      block = buildArticleCardsHtml(await load(t), opts);
      cache.set(key, block);
    }
    out = out.split(t.raw).join(block);
  }
  return out;
}
