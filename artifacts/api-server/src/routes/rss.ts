import { Router } from "express";
import Parser from "rss-parser";
import * as cheerio from "cheerio";
import { GoogleGenAI } from "@google/genai";
import { authMiddleware } from "../middlewares/auth.js";
import { store } from "../lib/store.js";

const router = Router();
router.use(authMiddleware);

const parser = new Parser({
  timeout: 10_000,
  headers: { "User-Agent": "SBC-Agora-RSS-Bot/1.0" },
});

function getGemini() {
  const baseURL = process.env["AI_INTEGRATIONS_GEMINI_BASE_URL"];
  const apiKey  = process.env["AI_INTEGRATIONS_GEMINI_API_KEY"] ?? "dummy";
  if (!baseURL) throw new Error("AI_INTEGRATIONS_GEMINI_BASE_URL not set");
  return new GoogleGenAI({ apiKey, httpOptions: { baseUrl: baseURL } });
}

/** Strip HTML tags and normalise whitespace */
function stripHtml(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, nav, header, footer, aside, .ad, .advertisement, .sidebar").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

/** Try to scrape full article body from original URL */
async function scrapeFullText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SBC-Agora/1.0)" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    const $ = cheerio.load(html);
    // Try common article selectors
    const selectors = [
      "article", "[itemprop='articleBody']", ".article-body",
      ".post-content", ".entry-content", ".materia-conteudo",
      ".content-article", "main p",
    ];
    for (const sel of selectors) {
      const el = $(sel);
      if (el.length && el.text().trim().length > 200) {
        return el.text().replace(/\s+/g, " ").trim();
      }
    }
    return stripHtml(html).slice(0, 3000);
  } catch {
    return "";
  }
}

/** Best-effort image extraction from RSS item */
function extractImage(item: Parser.Item): string {
  const enc = (item as Record<string, unknown>)["enclosure"] as { url?: string } | undefined;
  if (enc?.url) return enc.url;
  const media = (item as Record<string, unknown>)["media:content"] as { $?: { url?: string } } | undefined;
  if (media?.$?.url) return media.$.url;
  // Try extracting from content/summary HTML
  const html = item.content ?? item.summary ?? item["content:encoded"] ?? "";
  if (html) {
    const $ = cheerio.load(html);
    const src = $("img").first().attr("src");
    if (src) return src;
  }
  return "";
}

// ─── Sources CRUD ─────────────────────────────────────────────────────────────

/** GET /api/admin/rss/sources */
router.get("/sources", (_req, res) => {
  res.json({ sources: store.getRssSources() });
});

/** POST /api/admin/rss/sources */
router.post("/sources", (req, res) => {
  const { name, url, category, active } = req.body as {
    name?: string; url?: string; category?: string; active?: boolean;
  };
  if (!name || !url) { res.status(400).json({ error: "name and url are required" }); return; }
  const source = store.createRssSource({
    name: name.trim(),
    url: url.trim(),
    category: (category ?? "geral").trim(),
    active: active !== false,
  });
  res.status(201).json({ source });
});

/** PATCH /api/admin/rss/sources/:id */
router.patch("/sources/:id", (req, res) => {
  const updated = store.updateRssSource(req.params.id ?? "", req.body as Record<string, unknown>);
  if (!updated) { res.status(404).json({ error: "Source not found" }); return; }
  res.json({ source: updated });
});

/** DELETE /api/admin/rss/sources/:id */
router.delete("/sources/:id", (req, res) => {
  const deleted = store.deleteRssSource(req.params.id ?? "");
  if (!deleted) { res.status(404).json({ error: "Source not found" }); return; }
  res.json({ ok: true });
});

// ─── Fetch articles from one source ──────────────────────────────────────────

/** POST /api/admin/rss/fetch  { sourceId?: string } */
router.post("/fetch", async (req, res) => {
  const { sourceId } = req.body as { sourceId?: string };
  const sources = store.getRssSources().filter((s) =>
    s.active && (!sourceId || s.id === sourceId)
  );
  if (!sources.length) { res.status(400).json({ error: "No active sources found" }); return; }

  const results: Array<{
    sourceId: string; sourceName: string; category: string;
    title: string; link: string; pubDate: string;
    imageUrl: string; excerpt: string; fullText: string;
  }> = [];

  await Promise.allSettled(
    sources.map(async (src) => {
      try {
        const feed = await parser.parseURL(src.url);
        const items = feed.items.slice(0, 10);
        await Promise.allSettled(
          items.map(async (item) => {
            const link = item.link ?? "";
            const rawText = item["content:encoded"] ?? item.content ?? item.summary ?? "";
            const excerpt = stripHtml(rawText).slice(0, 300);
            const fullText = rawText.length > 500
              ? stripHtml(rawText)
              : (link ? await scrapeFullText(link) : excerpt);
            results.push({
              sourceId: src.id,
              sourceName: src.name,
              category: src.category,
              title: item.title ?? "Sem título",
              link,
              pubDate: item.pubDate ?? item.isoDate ?? new Date().toISOString(),
              imageUrl: extractImage(item),
              excerpt,
              fullText: fullText || excerpt,
            });
          })
        );
      } catch (err) {
        results.push({
          sourceId: src.id,
          sourceName: src.name,
          category: src.category,
          title: `Erro ao ler feed: ${String(err)}`,
          link: "", pubDate: "", imageUrl: "", excerpt: "", fullText: "",
        });
      }
    })
  );

  res.json({ articles: results });
});

// ─── Rewrite with Gemini ──────────────────────────────────────────────────────

/** POST /api/admin/rss/rewrite  { title, text, sourceName } */
router.post("/rewrite", async (req, res) => {
  const { title, text, sourceName } = req.body as {
    title?: string; text?: string; sourceName?: string;
  };
  if (!text) { res.status(400).json({ error: "text is required" }); return; }

  let ai: GoogleGenAI;
  try { ai = getGemini(); } catch (e) {
    res.status(503).json({ error: String(e) }); return;
  }

  const prompt = `Você é redator de um portal de notícias do Distrito Federal chamado "SBC Agora".
Reescreva o artigo abaixo com linguagem jornalística clara e objetiva, em português brasileiro.
- Mantenha todos os fatos e dados originais
- Use parágrafos curtos (2-4 frases)
- Não invente informações
- Ao final, adicione uma linha de crédito: "Com informações de: ${sourceName ?? "fonte"}"
- Retorne apenas o texto reescrito, sem títulos ou comentários extras

Título original: ${title ?? ""}

Texto original:
${text.slice(0, 6000)}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 8192 },
    });
    const rewritten = response.text ?? "";
    res.json({ rewritten });
  } catch (err) {
    res.status(500).json({ error: `Gemini error: ${String(err)}` });
  }
});

// ─── Import article to store ──────────────────────────────────────────────────

/** POST /api/admin/rss/import */
router.post("/import", (req, res) => {
  const { title, subtitle, content, category, tag, imageUrl, author, status } = req.body as {
    title?: string; subtitle?: string; content?: string; category?: string;
    tag?: string; imageUrl?: string; author?: string; status?: string;
  };
  if (!title) { res.status(400).json({ error: "title is required" }); return; }
  const article = store.createArticle({
    title: title ?? "",
    subtitle: subtitle ?? "",
    content: content ?? "",
    category: category ?? "geral",
    tag: tag ?? "GERAL",
    imageUrl: imageUrl ?? "",
    author: author ?? "Redação",
    publishedAt: new Date().toISOString(),
    status: (status === "published" ? "published" : "draft"),
  });
  res.status(201).json({ article });
});

export default router;
