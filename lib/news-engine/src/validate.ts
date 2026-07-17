/**
 * Validação estrutural da reescrita em CÓDIGO (PRD 02, Fase 1) — funções
 * puras, sem IA. Cada checagem devolve um issue tipado; a POLÍTICA (bloquear,
 * auditar, só logar) é decidida pelo chamador conforme o `validationMode` dos
 * settings da central. Severidades:
 * - "block": defeito que não deveria publicar (corpo raso, HTML perigoso);
 * - "warn":  fora do padrão editorial/SEO, publicável (tamanhos, FAQ, slug).
 *
 * Checagens de texto insensíveis a acento usam `normForCompare` (score.ts) e
 * padrões ASCII puros — NUNCA unicode literal em regex (regra do repo).
 */
import type { ExtractedAI } from "./quality.ts";
import { plainTextLength } from "./quality.ts";
import { normForCompare } from "./score.ts";

export interface ValidationIssue {
  code: string;
  severity: "block" | "warn";
  detail?: string;
}

export interface ValidateOptions {
  /** Texto visível mínimo do corpo (default 700 — régua do short_rewrite). */
  minBodyChars?: number;
  /** Texto visível máximo do corpo (default 20000). */
  maxBodyChars?: number;
}

/** HTML que jamais deveria sair da IA nem entrar no blog. */
const DANGEROUS_HTML =
  /<script\b|<iframe\b|<object\b|<embed\b|<form\b|\son[a-z]+\s*=|javascript:/i;

/** Sinais de publieditorial/promo no material da FONTE (texto já normalizado). */
const PROMO_PATTERNS = [
  "aposte agora", "cupom de desconto", "codigo promocional", "oferta exclusiva",
  "link de afiliado", "conteudo patrocinado", "publieditorial", "publipost",
  "confira a promocao",
];

/** Sinais de notícia em andamento no material da FONTE (texto normalizado). */
const LIVE_PATTERNS = [
  "em atualizacao", "ao vivo", "acompanhe ao vivo", "tempo real", "live blog",
  "breaking news", "developing story",
];

function pushLen(
  issues: ValidationIssue[], code: string, value: string | undefined,
  min: number, max: number, severity: "block" | "warn" = "warn",
): void {
  if (!value) return;
  const len = value.trim().length;
  if (len < min || len > max) {
    issues.push({ code, severity, detail: `${len} chars (esperado ${min}-${max})` });
  }
}

/**
 * Valida uma reescrita extraída (`extractFromRawAI`) contra o material da
 * fonte. Não lança e não altera nada — só reporta.
 */
export function validateRewrite(
  x: ExtractedAI,
  sourceText: string,
  opts?: ValidateOptions,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const minBody = opts?.minBodyChars ?? 700;
  const maxBody = opts?.maxBodyChars ?? 20_000;

  // ── Título ────────────────────────────────────────────────────────────────
  const title = x.title?.trim() ?? "";
  if (!title) {
    issues.push({ code: "title_missing", severity: "block" });
  } else if (title.length < 20) {
    issues.push({ code: "title_short", severity: "block", detail: `${title.length} chars` });
  } else if (title.length < 40) {
    issues.push({ code: "title_short", severity: "warn", detail: `${title.length} chars (prompt pede 70-110)` });
  } else if (title.length > 120) {
    issues.push({ code: "title_long", severity: "warn", detail: `${title.length} chars (prompt pede 70-110)` });
  }

  // ── Subtítulo (é a meta description do blog — Artigo.tsx corta em 160) ────
  pushLen(issues, "subtitle_len", x.subtitle, 80, 200);

  // ── Manchete social (bestSocialTitle já corrige; aqui só sinaliza) ────────
  pushLen(issues, "social_title_len", x.socialTitle, 60, 90);

  // ── Corpo ─────────────────────────────────────────────────────────────────
  const bodyLen = plainTextLength(x.content);
  if (bodyLen < minBody) {
    issues.push({ code: "body_short", severity: "block", detail: `${bodyLen} chars visíveis (mínimo ${minBody})` });
  } else if (bodyLen > maxBody) {
    issues.push({ code: "body_long", severity: "warn", detail: `${bodyLen} chars visíveis (máximo ${maxBody})` });
  }
  if (DANGEROUS_HTML.test(x.content)) {
    issues.push({ code: "html_dangerous", severity: "block" });
  }
  if (/<h1[\s>]/i.test(x.content)) {
    issues.push({ code: "html_h1", severity: "warn", detail: "prompt proíbe <h1> no content_html" });
  }
  const bodyNorm = normForCompare(x.content);
  if (!bodyNorm.includes("perguntas frequentes") && !bodyNorm.includes("frequently asked questions")) {
    issues.push({ code: "faq_missing", severity: "warn" });
  }

  // ── Metadados ─────────────────────────────────────────────────────────────
  const slug = x.slug?.trim() ?? "";
  if (slug && !/^[a-z0-9-]{3,80}$/.test(slug)) {
    issues.push({ code: "slug_invalid", severity: "warn", detail: slug.slice(0, 60) });
  }
  if (!x.keywords?.trim()) {
    issues.push({ code: "keywords_missing", severity: "warn" });
  }

  // ── Casos especiais do PRD 02 (sinal vem da FONTE, não da reescrita) ──────
  const srcNorm = normForCompare(sourceText);
  if (PROMO_PATTERNS.some((p) => srcNorm.includes(p))) {
    issues.push({ code: "promo_content", severity: "warn", detail: "fonte com cara de publieditorial" });
  }
  if (LIVE_PATTERNS.some((p) => srcNorm.includes(p))) {
    issues.push({ code: "live_updating", severity: "warn", detail: "notícia em andamento na fonte" });
  }

  return issues;
}
