/**
 * Montagem e geração de legendas da Automação Social (port do hub-portais:
 * `buildCaption` da AutomacaoSocialPage + prompt/parse do `video-download`).
 * Funções puras — a chamada de IA fica no videoDownloader.
 */

export interface CaptionParts {
  caption?: string;
  cta?: string;
  credits?: string;
  hashtags?: string;
}

/**
 * Junta os pedaços informados pelo usuário na legenda final:
 * legenda → CTA → créditos ("🎥 Créditos: @user") → hashtags normalizadas.
 * Blocos vazios são omitidos; separador é linha em branco.
 */
export function buildCaption(parts: CaptionParts): string {
  const blocks: string[] = [];
  const caption = parts.caption?.trim();
  const cta = parts.cta?.trim();
  const credits = parts.credits?.trim();
  const hashtags = parts.hashtags?.trim();
  if (caption) blocks.push(caption);
  if (cta) blocks.push(cta);
  if (credits) blocks.push(`\u{1F3A5} Créditos: @${credits.replace(/^@+/, "")}`);
  if (hashtags) {
    const tags = hashtags
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((t) => (t.startsWith("#") ? t : `#${t}`))
      .join(" ");
    if (tags) blocks.push(tags);
  }
  return blocks.join("\n\n");
}

export const DEFAULT_CAPTION_PROMPT_TEMPLATE = `Você é um estrategista de conteúdo especializado em crescimento viral para TikTok e Instagram, com foco em maximizar retenção e comentários.

Sua tarefa é analisar o vídeo e criar uma legenda altamente otimizada.

Legenda original:
{{LEGENDA}}

Perfil de origem do vídeo (para créditos obrigatórios):
@{{CREATOR}}

📏 ESTRUTURA OBRIGATÓRIA

TÍTULO (máx. 4 palavras)

(linha em branco)

HOOK (1 linha, máx. 12 palavras)

PERGUNTA (1 linha, máx. 12 palavras)

(linha em branco)

🎥 Créditos: @{{CREATOR}}

(linha em branco)

HASHTAGS (3 a 6 no máximo)

⚠️ SAÍDA FINAL
- Retorne APENAS o texto final
- NÃO explique nada
- NÃO use aspas
- NÃO quebre o formato`;

/** Substitui os placeholders {{LEGENDA}}/{{CREATOR}} (template custom nas settings). */
export function buildCaptionPrompt(
  originalCaption: string,
  creator: string,
  template?: string,
): string {
  const tpl = template?.trim() || DEFAULT_CAPTION_PROMPT_TEMPLATE;
  return tpl
    .replaceAll("{{LEGENDA}}", (originalCaption || "").slice(0, 500))
    .replaceAll("{{CREATOR}}", creator || "desconhecido");
}

export interface ParsedCaption {
  title: string;
  caption: string;
}

// Rótulos estruturais que a IA às vezes devolve apesar da instrução.
// Regra do repo: NUNCA unicode literal em regex — acentos via \uXXXX.
// Í = Í; – = – (en-dash); — = — (em-dash).
const LABEL_LINE_RE = /^\s*(?:T[IÍií]tulo|LEGENDA|HOOK|PERGUNTA|HASHTAGS)\s*(?:\([^)]*\))?\s*[:–—-]?\s*$/gim;
const LABEL_PREFIX_RE = /^(\s*)(?:HOOK|PERGUNTA|HASHTAGS)\s*(?:\([^)]*\))?\s*[:–—-]\s+/gim;

/**
 * Limpa a resposta da IA (cercas de código, rótulos, "(linha em branco)") e
 * separa: 1ª linha não-vazia = título (≤80), resto = legenda (≤2000).
 */
export function parseCaptionOutput(raw: string): ParsedCaption {
  const clean = (raw || "")
    .replace(/^```[a-z]*\n?/gm, "")
    .replace(/^```$/gm, "")
    .replace(/^\s*\(linha em branco\)\s*$/gim, "")
    .replace(LABEL_LINE_RE, "")
    .replace(LABEL_PREFIX_RE, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const allLines = clean.split("\n");
  const firstNonEmpty = allLines.findIndex((l) => l.trim().length > 0);
  if (firstNonEmpty < 0) return { title: "", caption: "" };
  const title = (allLines[firstNonEmpty] || "").trim().slice(0, 80);
  const caption = allLines
    .slice(firstNonEmpty + 1)
    .join("\n")
    .replace(/^\n+/, "")
    .slice(0, 2000);
  return { title, caption };
}
