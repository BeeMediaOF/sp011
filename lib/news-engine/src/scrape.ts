/**
 * Scraping de páginas de artigo — cópia de `api-server/src/lib/rssProcessor.ts`.
 * Adaptações: User-Agent parametrizável e `diffbotApiKey` como argumento
 * (já era). Nenhuma dependência de store/banco.
 */
import * as cheerio from "cheerio";
import type Parser from "rss-parser";

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (compatible; NewsHub/1.0; news aggregation bot)";

// ─── Diffbot ──────────────────────────────────────────────────────────────────

interface DiffbotArticle {
  title?: string;
  text?: string;
  html?: string;
  images?: Array<{ url?: string; primary?: boolean }>;
}

interface DiffbotResponse {
  objects?: DiffbotArticle[];
  errorCode?: number;
  error?: string;
}

/**
 * Extrai um artigo usando a Diffbot Article API.
 * Retorna null se a chave não estiver configurada ou a requisição falhar.
 */
export async function scrapeWithDiffbot(
  url: string,
  apiKey: string,
): Promise<{ title: string; text: string; imageUrl: string } | null> {
  try {
    const endpoint = `https://api.diffbot.com/v3/article?url=${encodeURIComponent(url)}&token=${encodeURIComponent(apiKey)}&discussion=false`;
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const data = await res.json() as DiffbotResponse;
    if (data.errorCode || !data.objects?.length) return null;
    const obj = data.objects[0]!;
    const imageUrl =
      obj.images?.find((i) => i.primary)?.url ??
      obj.images?.[0]?.url ??
      "";
    return {
      title: obj.title ?? "",
      text: obj.text ?? "",
      imageUrl,
    };
  } catch {
    return null;
  }
}

// ─── Scraping cheerio ─────────────────────────────────────────────────────────

/** Busca a URL do artigo e extrai og:image + corpo de texto completo. */
export async function scrapeArticle(
  url: string,
  userAgent: string = DEFAULT_USER_AGENT,
): Promise<{ text: string; imageUrl: string; description: string }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": userAgent },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return { text: "", imageUrl: "", description: "" };
    const html = await res.text();
    const $ = cheerio.load(html);

    // 1. Imagem destacada via meta tags (og:image é a imagem canônica de share)
    const metaImage =
      $("meta[property='og:image:secure_url']").attr("content") ||
      $("meta[property='og:image']").attr("content") ||
      $("meta[name='twitter:image:src']").attr("content") ||
      $("meta[name='twitter:image']").attr("content") ||
      $("link[rel='image_src']").attr("href") ||
      $("meta[itemprop='image']").attr("content") ||
      $("meta[name='thumbnail']").attr("content") ||
      "";

    // 2. Imagem principal do corpo como fallback mais confiável
    //    (cobre og:image ausente, errada ou renderizada via JS)
    const BODY_IMG_SELECTORS = [
      "article figure img",
      ".article-image img", ".article-img img", ".article__image img",
      ".post-image img", ".entry-image img",
      "[class*='featured-image'] img", "[class*='destaque'] img",
      "figure.featured img", "figure.hero img",
      ".article-body figure:first-of-type img",
      "article .content figure:first-of-type img",
      "[itemprop='image'] img",
    ];
    let bodyImage = "";
    for (const sel of BODY_IMG_SELECTORS) {
      const src =
        $(sel).first().attr("src") ||
        $(sel).first().attr("data-src") ||
        $(sel).first().attr("data-lazy-src");
      if (src && src.startsWith("http") && !src.includes("logo") && !src.includes("pixel") && !src.includes("icon")) {
        bodyImage = src;
        break;
      }
    }

    // Prefere og:image; cai para a imagem do corpo
    const imageUrl = metaImage || bodyImage;

    const description =
      $("meta[property='og:description']").attr("content") ??
      $("meta[name='description']").attr("content") ??
      $("meta[name='twitter:description']").attr("content") ??
      "";

    // 2. Remove ruído — elementos estruturais + widgets comuns de sites BR
    $([
      "script", "style", "nav", "header", "footer", "aside",
      ".ad", ".advertisement", ".sidebar", ".menu", ".popup",
      "[class*='cookie']", "[class*='banner']", "[id*='cookie']",
      "figure figcaption", "noscript",
      // Agência Brasil / EBC
      ".destaques-ebc", ".radio-agencia", ".tv-brasil",
      // Seções de relacionadas/recomendados
      ".relacionadas", ".related", ".related-news",
      ".mais-noticias", ".mais-lidas", ".mais-conteudo",
      ".ver-mais", ".leia-mais", ".read-more",
      "[class*='read-more']", "[class*='leia-mais']", "[class*='relacionad']",
      "[class*='recommended']", "[class*='sugest']", "[class*='widget']",
      // Social / newsletter
      ".tags-list", ".tags", ".article-tags",
      ".compartilhe", ".share", ".social-share",
      ".newsletter", ".newsletter-box",
      ".breadcrumb", ".breadcrumbs",
      // Slots de anúncio
      ".gpt-ad", ".gam-ad", "[id*='gpt']", "[id*='taboola']",
      "[data-type='_mgwidget']", "[class*='mgwidget']",
      // Paywall
      ".paywall", ".subscription", ".premium-content",
      ".edicao", ".edition-bar",
      ".article-footer", ".post-footer",
      // InfoMoney / financeiros BR
      ".wp-block-infomoney-blocks-infomoney-read-more",
      "[class*='infomoney-read-more']",
    ].join(",")).remove();

    // 3. Seletores de corpo do artigo (ordem de prioridade)
    const bodySelectors = [
      "[itemprop='articleBody']",
      ".article-body", ".article-content", ".article-text",
      ".post-content", ".entry-content",
      ".materia-conteudo", ".noticia-texto", ".texto-noticia",
      ".content-article", ".content-body",
      "article .content", "article .body", "article",
      ".main-content main", "main",
    ];

    // Padrões de separador de anúncio para pular no nível de parágrafo
    const AD_SEPARATOR = /^(continua depois da publicidade|continua após (a )?publicidade|publicidade|advertisement|sponsored content|conteúdo patrocinado)$/i;

    /** Extrai parágrafos de um elemento preservando a estrutura */
    function extractParagraphs(el: ReturnType<typeof $>): string {
      const paras: string[] = [];
      el.find("p, h2, h3, h4, li").each((_i, node) => {
        const tag = (node as { tagName?: string }).tagName?.toLowerCase() ?? "p";
        const t = $(node).text().replace(/\s+/g, " ").trim();
        if (t.length < 20) return;
        if (AD_SEPARATOR.test(t)) return;
        if (tag === "h2" || tag === "h3" || tag === "h4") {
          paras.push(`## ${t}`);
        } else if (tag === "li") {
          paras.push(`- ${t}`);
        } else {
          paras.push(t);
        }
      });
      return paras.join("\n\n");
    }

    let text = "";
    for (const sel of bodySelectors) {
      const el = $(sel);
      if (el.length && el.text().trim().length > 250) {
        const structured = extractParagraphs(el);
        text = structured.length > 100 ? structured : el.text().replace(/\s+/g, " ").trim();
        break;
      }
    }

    // 4. Fallback: junta todos os <p> preservando quebras de parágrafo
    if (!text) {
      const pSource = $("article").length ? $("article") : $("main").length ? $("main") : $("body");
      text = pSource
        .find("p")
        .map((_i, el) => $(el).text().replace(/\s+/g, " ").trim())
        .get()
        .filter((t) => t.length > 50 && !AD_SEPARATOR.test(t))
        .join("\n\n");
    }

    // 5. Pós-processamento: trunca em sentinelas de fim de matéria
    const SENTINELS = [
      /\bRelacionadas?\b/,
      /\bVer mais\b/i,
      /\bMais not[ií]cias?\b/i,
      /\bDestaques EBC\b/i,
      /\bRadioagência\b/i,
      /\bTV Brasil\b/i,
      /\bCompartilhe essa not[ií]cia\b/i,
      /\bContinuar lendo\b/i,
      /\bLeia (também|mais)\b/i,
      /\bEdi[çc][aã]o:\s/i,
      /\bNewsletter\b/i,
      /^Tags?:/im,
    ];
    for (const sentinel of SENTINELS) {
      const match = sentinel.exec(text);
      if (match && match.index > 200) {
        text = text.slice(0, match.index).trim();
        break;
      }
    }

    // 6. Remove ruído de metadados no início (cidade, data, CTAs)
    text = text
      .replace(/Publicado em \d{2}\/\d{2}\/\d{4}[^.]*?(Versão em áudio\s*)?/gi, "")
      .replace(/^(São Paulo|Brasília|Rio de Janeiro|Belo Horizonte|Curitiba|Salvador|Fortaleza)\s+/i, "")
      .replace(/>>?\s*Siga .{0,80}/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    return { text: text.slice(0, 8000), imageUrl, description };
  } catch {
    return { text: "", imageUrl: "", description: "" };
  }
}

/** Extrai imagem direto dos campos do item RSS (fallback quando não raspou a página). */
export function extractRssImage(item: Parser.Item): string {
  type IE = Parser.Item & {
    "media:content"?: { $?: { url?: string }; url?: string };
    "media:thumbnail"?: { $?: { url?: string }; url?: string };
    enclosure?: { url?: string };
  };
  const it = item as IE;
  if (it["media:content"]?.$?.url) return it["media:content"]!.$!.url!;
  if (it["media:content"]?.url) return it["media:content"]!.url!;
  if (it["media:thumbnail"]?.$?.url) return it["media:thumbnail"]!.$!.url!;
  if (it.enclosure?.url) return it.enclosure.url;
  const html = (item as { "content:encoded"?: string })["content:encoded"] ?? item.content ?? item.summary ?? "";
  if (html) {
    const $ = cheerio.load(html);
    const src = $("img[src]").filter((_i, el) => {
      const s = $(el).attr("src") ?? "";
      return !s.includes("logo") && !s.includes("icon") && !s.includes("pixel");
    }).first().attr("src");
    if (src) return src;
  }
  return "";
}

/** Remove tags HTML e normaliza espaços. */
export function stripHtml(html: string): string {
  const $ = cheerio.load(html);
  $("script, style").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}
