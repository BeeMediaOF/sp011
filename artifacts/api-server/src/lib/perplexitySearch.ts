/**
 * Perplexity Sonar API — busca notícias recentes sobre um tema
 * e retorna artigos estruturados com título real, resumo e texto completo.
 * Prioriza fontes sociais: Google News, X (Twitter), Instagram, portais de notícia.
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

/** Deriva um nome legível de domínio a partir de uma URL */
function sourceName(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    // Friendly names for common sources
    const map: Record<string, string> = {
      "twitter.com": "Twitter/X",
      "x.com": "Twitter/X",
      "instagram.com": "Instagram",
      "facebook.com": "Facebook",
      "tiktok.com": "TikTok",
      "youtube.com": "YouTube",
      "news.google.com": "Google News",
      "g1.globo.com": "G1",
      "uol.com.br": "UOL",
      "folha.uol.com.br": "Folha de S.Paulo",
      "estadao.com.br": "Estadão",
      "oglobo.globo.com": "O Globo",
      "r7.com": "R7",
      "band.uol.com.br": "Band",
      "metropoles.com": "Metrópoles",
      "correiobraziliense.com.br": "Correio Braziliense",
    };
    if (map[hostname]) return map[hostname];
    const parts = hostname.split(".");
    const name = parts[parts.length - 2] ?? hostname;
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return "Fonte";
  }
}

interface RawArticle {
  title?: string;
  summary?: string;
  full_text?: string;
  source_url?: string;
  source_name?: string;
}

function parseStructuredResponse(
  raw: string,
  citations: string[]
): PerplexityArticle[] {
  // Try to parse JSON array from response
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
    ?? raw.match(/(\[\s*\{[\s\S]*\}\s*\])/);

  if (jsonMatch) {
    try {
      const arr = JSON.parse(jsonMatch[1]!) as RawArticle[];
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.map((item, i) => ({
          title:       (item.title      ?? "").trim() || `Notícia ${i + 1}`,
          summary:     (item.summary    ?? "").trim(),
          fullText:    (item.full_text  ?? item.summary ?? "").trim(),
          sourceUrl:   (item.source_url ?? citations[i] ?? "").trim(),
          sourceName:  (item.source_name ?? sourceName(item.source_url ?? citations[i] ?? "")).trim(),
          imageUrl:    "",
          publishedAt: new Date().toISOString(),
        }));
      }
    } catch { /* fallback below */ }
  }

  // Fallback: split by numbered headers ## 1. / **1.** / 1.
  const blocks = raw.split(/(?=(?:^|\n)(?:#{1,3}\s*\d+\.|(?:\*\*\d+\.?\*\*)|(?:^|\n)\d+\.))/m)
    .map(b => b.trim())
    .filter(b => b.length > 40);

  if (blocks.length > 1) {
    return blocks.slice(0, 10).map((block, i) => {
      // Extract title: first line or bold first sentence
      const titleMatch =
        block.match(/^(?:#{1,3}\s*\d+\.\s*)(.+)$/m)
        ?? block.match(/^\*\*(.+?)\*\*/m)
        ?? block.match(/^\d+\.\s+(.+)$/m);
      const title = titleMatch
        ? titleMatch[1]!.replace(/\*\*/g, "").trim()
        : block.split("\n")[0]?.slice(0, 120).trim() ?? `Notícia ${i + 1}`;

      const body = block
        .replace(/^(?:#{1,3}\s*\d+\..*|^\*\*.*?\*\*|\d+\..*)/m, "")
        .replace(/\[\d+\]/g, "")
        .trim();

      const url = citations[i] ?? "";
      return {
        title,
        summary:     body.slice(0, 280).trim(),
        fullText:    body,
        sourceUrl:   url,
        sourceName:  sourceName(url),
        imageUrl:    "",
        publishedAt: new Date().toISOString(),
      };
    });
  }

  // Last resort: one article from full answer
  const clean = raw.replace(/\[\d+\]/g, "").trim();
  const firstSentence = clean.match(/^([^.!?\n]{10,140})[.!?]/)?.[1]?.trim() ?? "Resultado da busca";
  return [{
    title:       firstSentence,
    summary:     clean.slice(0, 300),
    fullText:    clean,
    sourceUrl:   citations[0] ?? "",
    sourceName:  sourceName(citations[0] ?? ""),
    imageUrl:    "",
    publishedAt: new Date().toISOString(),
  }];
}

export async function searchNews(
  query: string,
  maxResults = 5
): Promise<PerplexitySearchResult> {
  const apiKey = getApiKey();

  const systemPrompt =
    "Você é um jornalista pesquisador especializado em notícias locais brasileiras. " +
    "Busque notícias recentes sobre o tema solicitado priorizando fontes como: " +
    "Google News, Twitter/X, Instagram, portais de notícia locais e regionais. " +
    "IMPORTANTE: Responda APENAS com um array JSON válido, sem texto extra, no seguinte formato:\n" +
    "[\n" +
    "  {\n" +
    '    "title": "Título completo e específico da notícia",\n' +
    '    "summary": "Resumo em 2-3 frases com os fatos principais",\n' +
    '    "full_text": "Texto completo com todos os detalhes da notícia",\n' +
    '    "source_url": "URL completa da fonte",\n' +
    '    "source_name": "Nome do veículo ou rede social"\n' +
    "  }\n" +
    "]\n" +
    "Retorne exatamente " + maxResults + " itens. Priorize notícias das últimas 48 horas. " +
    "Inclua notícias de redes sociais (X/Twitter, Instagram) quando disponíveis. " +
    "Responda em português brasileiro.";

  const userPrompt =
    `Busque as ${maxResults} notícias mais recentes e relevantes sobre: "${query}". ` +
    "Priorize: Google News, Twitter/X, Instagram, portais de notícia locais. " +
    "Retorne somente o array JSON conforme solicitado.";

  const body = {
    model: "sonar",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt },
    ],
    max_tokens: 4096,
    search_recency_filter: "day",
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

  const articles = parseStructuredResponse(rawAnswer, citations).slice(0, maxResults);

  return { query, articles, rawAnswer };
}
