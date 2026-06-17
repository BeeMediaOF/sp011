/**
 * Perplexity Sonar API — busca notícias recentes sobre um tema.
 * Usa formato de lista numerada (não JSON) que o modelo retorna de forma confiável.
 * Prioriza: Google News, X/Twitter, portais regionais.
 */

export interface PerplexityArticle {
  title: string;
  summary: string;
  fullText: string;
  sourceUrl: string;
  sourceName: string;
  imageUrl: string;
  publishedAt: string;
}

export interface PerplexitySearchResult {
  query: string;
  articles: PerplexityArticle[];
  rawAnswer: string;
}

function getApiKey(): string {
  const key = process.env["PERPLEXITY_API_KEY"];
  if (!key) throw new Error("PERPLEXITY_API_KEY não configurada");
  return key;
}

function deriveSourceName(url: string): string {
  if (!url) return "Fonte desconhecida";
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    const KNOWN: Record<string, string> = {
      "twitter.com": "Twitter/X", "x.com": "Twitter/X",
      "instagram.com": "Instagram", "facebook.com": "Facebook",
      "tiktok.com": "TikTok", "youtube.com": "YouTube",
      "news.google.com": "Google News",
      "g1.globo.com": "G1", "uol.com.br": "UOL",
      "folha.uol.com.br": "Folha de S.Paulo",
      "estadao.com.br": "Estadão", "oglobo.globo.com": "O Globo",
      "r7.com": "R7", "band.uol.com.br": "Band",
      "metropoles.com": "Metrópoles",
      "correiobraziliense.com.br": "Correio Braziliense",
      "tvsaobernardo.com.br": "TV São Bernardo",
      "folhadoabc.com.br": "Folha do ABC",
      "diariodogrande.com.br": "Diário do Grande ABC",
    };
    if (KNOWN[hostname]) return KNOWN[hostname];
    const parts = hostname.split(".");
    const n = parts.length >= 2 ? parts[parts.length - 2]! : hostname;
    return n.charAt(0).toUpperCase() + n.slice(1);
  } catch {
    return "Fonte";
  }
}

/**
 * Parses Perplexity's natural language response into structured articles.
 *
 * Confirmed Perplexity format:
 *   • **TÍTULO** — RESUMO completo aqui. [N]
 *
 * Uses line-by-line processing (not one big regex) for reliability.
 */
function parseResponse(raw: string, citations: string[]): PerplexityArticle[] {

  function makeArticle(title: string, summary: string, citIdx: number): PerplexityArticle {
    const clean = (s: string) => s.replace(/\*\*/g, "").replace(/\[\d+\]/g, "").trim();
    const t = clean(title);
    const s = clean(summary);
    const url = citIdx >= 0 && citIdx < citations.length ? (citations[citIdx] ?? "") : "";
    return {
      title:       t,
      summary:     s,
      fullText:    s ? `${t} — ${s}` : t,
      sourceUrl:   url,
      sourceName:  deriveSourceName(url),
      imageUrl:    "",
      publishedAt: new Date().toISOString(),
    };
  }

  function parseLine(line: string, fallbackCitIdx: number): PerplexityArticle | null {
    // Remove leading bullet (•, -, *)
    let text = line.replace(/^[•\-\*]\s+/, "").trim();
    if (text.length < 10) return null;

    // Extract trailing citation [N]
    const citMatch = text.match(/\[(\d+)\]\.?\s*$/);
    const citIdx = citMatch ? parseInt(citMatch[1]!, 10) - 1 : fallbackCitIdx;
    text = text.replace(/\[\d+\]\.?\s*$/, "").trim();

    // Try: **TITLE** — SUMMARY  (primary Perplexity format)
    const boldDash = text.match(/^\*\*(.+?)\*\*\s*[—–-]\s*([\s\S]+)$/);
    if (boldDash) {
      return makeArticle(boldDash[1]!.trim(), boldDash[2]!.trim(), citIdx);
    }

    // Try: **TITLE**  (bold only, no dash)
    const boldOnly = text.match(/^\*\*(.+?)\*\*\s*([\s\S]*)$/);
    if (boldOnly && boldOnly[1]!.length > 5) {
      return makeArticle(boldOnly[1]!.trim(), boldOnly[2]!.trim(), citIdx);
    }

    // Try: plain text with em-dash separator
    const dashIdx = text.indexOf(" — ");
    if (dashIdx > 10) {
      return makeArticle(text.slice(0, dashIdx), text.slice(dashIdx + 3), citIdx);
    }

    // Fallback: whole line as title, look for ". Capital" to split
    const dotIdx = text.search(/\.\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ]/);
    if (dotIdx > 10 && dotIdx < 160) {
      return makeArticle(text.slice(0, dotIdx + 1), text.slice(dotIdx + 1), citIdx);
    }

    return makeArticle(text, "", citIdx);
  }

  // ── Primary: find all bullet lines (each may span one line)
  const bulletLines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[•\-\*]\s+/.test(l));

  if (bulletLines.length >= 1) {
    const articles = bulletLines
      .map((l, i) => parseLine(l, i))
      .filter((a): a is PerplexityArticle => a !== null);
    if (articles.length >= 1) return articles;
  }

  // ── Fallback: numbered items  1. TEXT [N]
  const numberedLines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\d+[\.\)]\s+/.test(l));

  if (numberedLines.length >= 2) {
    const articles = numberedLines.map((l, i) => {
      const text = l.replace(/^\d+[\.\)]\s+/, "").trim();
      return parseLine(`• ${text}`, i);
    }).filter((a): a is PerplexityArticle => a !== null);
    if (articles.length >= 2) return articles;
  }

  // ── Fallback: paragraph blocks
  const paragraphs = raw
    .split(/\n{2,}/)
    .map((p) => p.replace(/\[\d+\]/g, "").replace(/\*\*/g, "").replace(/^[•\-\*]\s+/, "").trim())
    .filter((p) => p.length > 40 && !/^#{1,3}\s/.test(p));

  if (paragraphs.length >= 1) {
    return paragraphs.slice(0, 10).map((p, i) => {
      const dashIdx = p.indexOf(" — ");
      const title   = dashIdx > 10 ? p.slice(0, dashIdx).trim() : p.split("\n")[0]?.slice(0, 160) ?? "";
      const summary = dashIdx > 10 ? p.slice(dashIdx + 3).trim() : p.split("\n").slice(1).join(" ");
      return makeArticle(title, summary, Math.min(i, citations.length - 1));
    });
  }

  // ── Last resort
  const clean = raw.replace(/\[\d+\]/g, "").replace(/\*\*/g, "").trim();
  return [{
    title:       clean.split("\n")[0]?.slice(0, 160) ?? "Resultado da busca",
    summary:     clean.slice(0, 300),
    fullText:    clean,
    sourceUrl:   citations[0] ?? "",
    sourceName:  deriveSourceName(citations[0] ?? ""),
    imageUrl:    "",
    publishedAt: new Date().toISOString(),
  }];
}

export async function searchNews(
  query: string,
  maxResults = 5
): Promise<PerplexitySearchResult> {
  const apiKey = getApiKey();

  // Prompt instructs bullet list — matches what Perplexity naturally returns.
  // We do NOT ask for JSON here because the model often ignores it.
  const systemPrompt =
    "Você é um jornalista pesquisador especializado em notícias brasileiras. " +
    "Ao receber um tema, retorne as últimas notícias encontradas na web, priorizando: " +
    "portais regionais, Google News, Twitter/X, Instagram e portais de notícia locais. " +
    "Responda em português brasileiro com uma lista de bullets (•) numerados, " +
    "um por notícia, no seguinte formato:\n" +
    "• Título completo e específico da notícia. Resumo em 1-2 frases com os fatos principais. [N]\n\n" +
    "Use sempre o número da citação [N] ao final de cada item. " +
    "Não inclua texto introdutório ou conclusivo — apenas a lista de bullets.";

  const userPrompt =
    `Busque as ${maxResults} notícias mais recentes e relevantes sobre: "${query}". ` +
    "Inclua notícias das últimas 48 horas. Priorize fontes locais e redes sociais.";

  const body = {
    model: "sonar",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt },
    ],
    max_tokens: 3000,
    search_recency_filter: "week",
    return_citations: true,
    return_related_questions: false,
  };

  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Perplexity API error ${res.status}: ${errText}`);
  }

  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    citations?: string[];
  };

  const rawAnswer  = data.choices?.[0]?.message?.content ?? "";
  const citations: string[] = data.citations ?? [];

  const articles = parseResponse(rawAnswer, citations).slice(0, maxResults);

  return { query, articles, rawAnswer };
}
