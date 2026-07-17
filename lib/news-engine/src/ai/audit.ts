/**
 * IA Auditora (PRD 02, F5) — 2ª opinião SÓ para reescritas suspeitas
 * (cobertura borderline, números sem fonte, fonte rasa, publieditorial).
 * Compara fonte × reescrita e responde perguntas SIM/NÃO; NUNCA reescreve.
 * Roda no provider configurado na central (default Gemini — juiz melhor que
 * o 7B local — e o volume é pequeno: só os casos borderline).
 *
 * Perguntas do PRD adaptadas à arquitetura: categoria e SEO ficam de fora —
 * categoria é por blog (gate de confiança do localizer) e SEO é validado em
 * código (validate.ts). Auditar aqui seria redundância que o próprio PRD 02
 * proíbe ("não criar validações redundantes").
 */
import { completeText, type RewriteEngineConfig } from "./rewrite.ts";
import type { TokenUsage } from "../types.ts";

export const AUDIT_PROMPT_TEMPLATE = `Você é o auditor de qualidade de um portal de notícias. Compare o MATERIAL DA FONTE com a MATÉRIA REESCRITA a partir dele e responda as perguntas.

## MATERIAL DA FONTE
Título: {{TITULO_FONTE}}
Texto: {{TEXTO_FONTE}}

## MATÉRIA REESCRITA
Título: {{TITULO}}
Subtítulo: {{SUBTITULO}}
Texto: {{TEXTO}}

## PERGUNTAS (responda true ou false)
- invented: a matéria afirma algum fato, número, data, nome ou citação que NÃO existe no material da fonte?
- title_ok: o título da matéria representa corretamente o que a fonte diz?
- contradiction: a matéria contradiz o material da fonte em algum ponto?
- exaggeration: a matéria exagera ou distorce o tom/alcance do que a fonte diz?
- publishable: considerando tudo, a matéria pode ser publicada automaticamente, sem revisão humana?

## REGRAS
- Julgue APENAS pela comparação entre os dois textos: não use conhecimento externo nem opinião sobre o tema.
- Reformulação com outras palavras é esperado e NÃO é problema; problema é informação nova, alterada ou contraditória.
- Você NUNCA reescreve nem sugere texto: só audita.
- "notes": justifique em 1 a 2 frases (em português) toda resposta problemática; se estiver tudo certo, deixe "".

Responda EXCLUSIVAMENTE com JSON válido, sem markdown:
{"invented": false, "title_ok": true, "contradiction": false, "exaggeration": false, "publishable": true, "notes": ""}`;

export interface AuditInput {
  sourceTitle: string;
  /** Texto puro do material da fonte (feed + scrape). */
  sourceText: string;
  title: string;
  subtitle?: string;
  /** Texto puro da reescrita (sem HTML). */
  contentText: string;
}

export interface AuditOutput {
  invented: boolean;
  titleOk: boolean;
  contradiction: boolean;
  exaggeration: boolean;
  publishable: boolean;
  notes?: string;
  usage?: TokenUsage;
}

function boolField(raw: string, name: string): boolean | undefined {
  const m = raw.match(new RegExp(`"${name}"\\s*:\\s*(true|false)`, "i"));
  return m ? m[1]!.toLowerCase() === "true" : undefined;
}

/**
 * Parse tolerante da resposta da auditoria (regex campo a campo — funciona
 * com JSON limpo, cercas markdown ou JSON truncado). Lança quando não há
 * `publishable` parseável: resposta imprestável, o chamador decide retry/flag.
 */
export function parseAuditResponse(text: string): Omit<AuditOutput, "usage"> {
  const publishable = boolField(text, "publishable");
  if (publishable === undefined) {
    throw new Error(`auditoria inconclusiva (resposta sem JSON): ${text.slice(0, 120)}`);
  }
  const notesMatch = text.match(/"notes"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  return {
    invented: boolField(text, "invented") ?? false,
    titleOk: boolField(text, "title_ok") ?? true,
    contradiction: boolField(text, "contradiction") ?? false,
    exaggeration: boolField(text, "exaggeration") ?? false,
    publishable,
    notes: notesMatch?.[1]?.replace(/\\"/g, '"').trim().slice(0, 500) || undefined,
  };
}

/**
 * Audita uma reescrita contra o material da fonte. Lança quando a resposta é
 * imprestável (sem `publishable` parseável) — o chamador decide retry/flag.
 */
export async function auditRewrite(
  input: AuditInput, cfg: RewriteEngineConfig,
): Promise<AuditOutput> {
  const prompt = AUDIT_PROMPT_TEMPLATE
    .replace(/\{\{TITULO_FONTE\}\}/g, input.sourceTitle)
    .replace(/\{\{TEXTO_FONTE\}\}/g, input.sourceText.slice(0, 5_000))
    .replace(/\{\{TITULO\}\}/g, input.title)
    .replace(/\{\{SUBTITULO\}\}/g, input.subtitle ?? "")
    .replace(/\{\{TEXTO\}\}/g, input.contentText.slice(0, 5_000));

  const { text, usage } = await completeText(prompt, cfg);
  return { ...parseAuditResponse(text), usage };
}
