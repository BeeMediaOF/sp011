/**
 * Perplexity Sonar API — busca notícias recentes sobre um tema
 * e retorna artigos estruturados prontos para reescrita pela IA.
 */

export interface PerplexityArticle {
  title: string;
  excerpt: string;
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

function parseCitations(
  answer: string,
  citations: string[]
): PerplexityArticle[] {
  // Split answer by citation markers [1], [2], …
  // Each paragraph that ends with [N] is treated as one article block
  const paragraphs = answer
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 30);

  const articles: PerplexityArticle[] = [];
  const seen = new Set<string>();

  // Build one article per citation
  citations.forEach((url, idx) => {
    if (seen.has(url)) return;
    seen.add(url);

    const num = idx + 1;
    // Collect paragraphs that reference this citation
    const related = paragraphs.filter((p) => p.includes(`[${num}]`));
    const text = related
      .map((p) => p.replace(/\[\d+\]/g, "").trim())
      .join("\n\n");

    if (!text && idx > 0) return; // skip empty non-first entries

    // Extract title: first sentence of first related paragraph, or generic
    const firstParagraph = related[0] ?? paragraphs[idx] ?? "";
    const titleMatch = firstParagraph.match(/^([^.!?\n]{10,120})[.!?]/);
    const title = titleMatch
      ? titleMatch[1]!.replace(/\[\d+\]/g, "").trim()
      : `Notícia ${num}`;

    // Derive source name from URL
    let sourceName = "Fonte desconhecida";
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, "");
      sourceName = hostname.split(".")[0] ?? hostname;
      sourceName = sourceName.charAt(0).toUpperCase() + sourceName.slice(1);
    } catch {}

    articles.push({
      title,
      excerpt: text.slice(0, 200),
      fullText: text || firstParagraph.replace(/\[\d+\]/g, "").trim(),
      sourceUrl: url,
      sourceName,
      imageUrl: "",
      publishedAt: new Date().toISOString(),
    });
  });

  // Fallback: if citations empty, create one article from the whole answer
  if (articles.length === 0 && answer.trim().length > 50) {
    const cleanAnswer = answer.replace(/\[\d+\]/g, "").trim();
    const lines = cleanAnswer.split(/\n+/).filter((l) => l.length > 20);
    const titleMatch = cleanAnswer.match(/^([^.!?\n]{10,120})[.!?]/);
    articles.push({
      title: titleMatch ? titleMatch[1]!.trim() : "Resultado da busca",
      excerpt: cleanAnswer.slice(0, 200),
      fullText: cleanAnswer,
      sourceUrl: citations[0] ?? "",
      sourceName: "Perplexity",
      imageUrl: "",
      publishedAt: new Date().toISOString(),
    });
    void lines;
  }

  return articles;
}

export async function searchNews(
  query: string,
  maxResults = 5
): Promise<PerplexitySearchResult> {
  const apiKey = getApiKey();

  const systemPrompt =
    "Você é um assistente de pesquisa jornalística. " +
    "Busque as notícias mais recentes sobre o tema solicitado. " +
    "Para cada notícia encontrada, escreva um parágrafo completo com os fatos principais, " +
    "citando a fonte com [N]. Apresente no máximo " +
    maxResults +
    " notícias distintas. " +
    "Responda em português brasileiro.";

  const userPrompt =
    `Busque as ${maxResults} notícias mais recentes e relevantes sobre: "${query}". ` +
    "Para cada notícia, apresente um parágrafo detalhado com os principais fatos.";

  const body = {
    model: "sonar",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt },
    ],
    max_tokens: 4096,
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

  const rawAnswer = data.choices?.[0]?.message?.content ?? "";
  const citations: string[] = data.citations ?? [];

  const articles = parseCitations(rawAnswer, citations).slice(0, maxResults);

  return { query, articles, rawAnswer };
}
