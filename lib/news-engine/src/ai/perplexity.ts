/**
 * Reescrita via Perplexity — porte do `rewriteWithPerplexity` do blog
 * (`api-server/src/lib/rewriteQueue.ts`). Usada como IA DE APOIO: fallback
 * imediato quando o Gemini está sem cota/chave e lane de reforço da fila.
 *
 * Devolve a resposta BRUTA + consumo de tokens — o chamador extrai/valida os
 * campos com `extractFromRawAI` (mesmo desenho do blog).
 */
import type { TokenUsage } from "../types.ts";

export interface PerplexityConfig {
  apiKey: string;
  /** Padrão: "sonar". */
  model?: string;
}

export interface PerplexityInput {
  title: string;
  text: string;
  sourceName: string;
  giveCredit: boolean;
}

interface PerplexityResponse {
  choices: Array<{ message: { content: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

const SYSTEM_PROMPT = [
  "Você é um editor de notícias brasileiro experiente.",
  "Reescreva o artigo de forma original, profissional e envolvente, preservando todos os fatos.",
  "Escreva APENAS em português do Brasil. Nunca use inglês.",
  "Responda SOMENTE com um JSON válido (sem markdown fences) no formato:",
  '{"title":"Título reescrito","subtitle":"Subtítulo curto","social_title":"MANCHETE DE 70 A 85 CARACTERES COM *DESTAQUE* NO TRECHO DE MAIOR IMPACTO","content_html":"<p>...</p>","keywords":"palavra1, palavra2","slug":"slug-do-artigo"}',
  "O social_title é a manchete da arte de rede social: analise o conteúdo completo e escolha o ângulo mais chamativo para o público (fato surpreendente, número, prazo, consequência prática), em voz ativa e tempo presente.",
  "TAMANHO OBRIGATÓRIO do social_title: entre 70 e 85 caracteres (10 a 13 palavras) — NUNCA menos de 70, a arte do Instagram precisa de 3 linhas cheias de título; NUNCA mais de 90. Sem reticências, sem cortar palavras, sem clickbait enganoso.",
  "Envolva com asteriscos (*assim*) apenas o trecho de maior impacto da manchete (nome, resultado, prazo, valor ou consequência), em qualquer posição. Nunca destaque a manchete inteira nem palavras genéricas.",
].join("\n");

export async function rewriteWithPerplexity(
  input: PerplexityInput,
  cfg: PerplexityConfig,
): Promise<{ raw: string; usage: TokenUsage }> {
  const model = cfg.model || "sonar";

  const creditLine = input.giveCredit
    ? `\n\nFonte original: ${input.sourceName}. Mencione discretamente ao final.`
    : "";
  const userPrompt = `Artigo de ${input.sourceName}:\nTítulo: ${input.title}\n\n${input.text}${creditLine}`;

  const resp = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 2_000,
      temperature: 0.6,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Perplexity ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = (await resp.json()) as PerplexityResponse;
  const raw = data.choices[0]?.message?.content ?? "";
  return {
    raw,
    usage: {
      provider: "perplexity",
      model,
      keyHint: cfg.apiKey.slice(-4),
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
      totalTokens: data.usage?.total_tokens,
    },
  };
}
