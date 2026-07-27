/**
 * analyticsSanity — catálogo CANÔNICO de regras de sanidade cross-metric (PRD 11).
 *
 * Contrato "sem I/O": importa APENAS o módulo puro irmão analyticsShared.ts (helpers
 * de fórmula do PRD 04) — nada de Express/Drizzle/rede/relógio. É alvo direto de
 * `node --test`. Cada regra recebe números JÁ AGREGADOS e devolve um veredito; o
 * instante, quando necessário, é injetado pelo chamador. 100% DETECTOR — nenhuma
 * regra corrige, recalcula ou "conserta" um valor de métrica (RF4).
 *
 * DONO das fórmulas de sanidade. O motor on-demand do PRD 08 (healthAlerts.ts)
 * consome as MESMAS fórmulas de anúncio (checkAdSanity/checkClicksVsImpressions em
 * analyticsShared.ts) e a MESMA constante AD_SANITY_MARGIN — declarada AQUI e
 * re-exportada lá, para haver UMA verdade no repo (CA13). Mapa de ids PRD 08 ↔ 11
 * no §14 do PRD (ex.: ad_sanity ≡ impressions_gt_pageviews).
 *
 * Princípio (PRD 11): volume baixo NÃO é bug. Nenhuma regra dispara por número
 * pequeno — toda regra exige uma IDENTIDADE LÓGICA QUEBRADA ou um DADO IMPOSSÍVEL
 * (cliques > impressões, soma das fontes ≠ 100%, % exibido > 100%, sessões <
 * visitantes). Blog novo sem tráfego = nenhuma violação, e isso é SUCESSO.
 */
// Import de VALOR do irmão puro: extensão .ts explícita (não .js) para resolver nos
// TRÊS contextos — node --test (type-stripping resolve .ts), esbuild bundle e tsc
// (allowImportingTsExtensions). Único import do módulo; nada de I/O.
import { checkAdSanity, checkClicksVsImpressions } from "./analyticsShared.ts";

export type Severity = "critical" | "warning";

export interface SanityViolation {
  rule: string;      // id estável (ver RULE_IDS)
  severity: Severity;
  scope: string;     // "" (blog) | "ad:<id>" | "day:<YYYY-MM-DD>" | "cat:<slug>"
  observed: number;  // valor medido que viola
  limit: number;     // limite/esperado
  detail: string;    // frase curta, determinística (ASCII, sem locale)
}

export interface SanityInput {
  // R1/R6 — por (anúncio, dia BRT), já filtrado por adsReliableSince (PRD 04).
  // Array SEMPRE presente (vazio = sem dados = ok). O SKIP (PRD 04 não no ar) é
  // sinalizado FORA daqui, pelo coletor (RF2) — evaluateSanity só avalia o que recebe.
  adDays: { adId: string; date: string; impressions: number; clicks: number;
            pageviews: number; slots: number }[];
  adMargin: number;  // valor de M injetado (AD_SANITY_MARGIN; 1.5 pós-PRD 02 — PRD 04 RF6).

  // R2 — canal pago × cadastro (PRD 05). null = dependência ausente → NÃO avaliada.
  paid: { activeCampaigns: number; paidLinesSinceRule: number } | null;

  // R3 — fontes de tráfego da janela (valores absolutos do referrerChart).
  channelCounts: Record<string, number>;

  // R4 — views por categoria × pageviews não-internos da janela.
  categoryViews: { slug: string; views: number }[];
  windowPageviewsNonInternal: number;

  // R5 — sessões × visitantes únicos da janela.
  windowSessions: number;
  windowUniqueVisitors: number;

  // R7 — percentuais já calculados como o front os exibe (itens 3/14).
  displayedPercents: { scope: string; pct: number }[];
}

/** Ordem de escrita das 7 regras (o ruleStatus cobre TODAS — nunca ausente). */
export const RULE_IDS = [
  "clicks_gt_impressions",
  "impressions_gt_pageviews",
  "paid_without_campaign",
  "sources_not_100",
  "category_gt_pageviews",
  "sessions_lt_visitors",
  "percent_over_100",
] as const;
export type RuleId = (typeof RULE_IDS)[number];

/** Margem M da sanidade de impressões (PRD 04 RF6). Reduzir para 1.5 quando o PRD 02
 *  alinhar consentimento (a severidade de impressions_gt_pageviews acompanha:
 *  warning→critical). ÚNICA declaração no repo — healthAlerts.ts re-exporta (CA13). */
export const AD_SANITY_MARGIN = 3;

/** 1 pageview de folga (skew de buffer ~30s entre KPIs vizinhos — auditoria §4.2). */
export const CATEGORY_TOLERANCE = 1;
/** Teto de % exibido + epsilon de arredondamento (0.5) aplicado na regra. */
export const PERCENT_CEILING = 100.0;
/** Folga do clique antes do dwell de 1s. Vira 0 (regra estrita) quando o PRD 02
 *  disparar impressão junto do clique — muda ESTA constante + o default do helper
 *  checkClicksVsImpressions (analyticsShared.ts), sem tocar a lógica de evaluateSanity. */
export const CLICK_TOLERANCE = 1;

/**
 * Avalia o catálogo fechado. Devolve SÓ as violações (o ruleStatus ok/violated/
 * skipped é montado pelo chamador via buildRuleStatus, juntando estes resultados com
 * a lista de skips do coletor). Ordenação: critical antes de warning, depois por
 * rule e scope (estável/determinística).
 */
export function evaluateSanity(input: SanityInput): SanityViolation[] {
  const out: SanityViolation[] = [];

  // ── R1 clicks_gt_impressions (critical) + R6 impressions_gt_pageviews ──
  // Fórmulas do PRD 04 (analyticsShared) — nunca reimplementadas aqui (CA3/CA13).
  const impSeverity: Severity = input.adMargin <= 1.5 ? "critical" : "warning";
  for (const row of input.adDays) {
    const slots = row.slots > 0 ? row.slots : 1;
    const clk = checkClicksVsImpressions(row.clicks, row.impressions, CLICK_TOLERANCE);
    if (!clk.ok) {
      out.push({
        rule: "clicks_gt_impressions", severity: "critical", scope: `ad:${row.adId}`,
        observed: row.clicks, limit: clk.limit,
        detail: `clicks=${row.clicks} > impressions+${CLICK_TOLERANCE}=${clk.limit} em ${row.date}`,
      });
    }
    const ad = checkAdSanity(row.impressions, row.pageviews, slots, input.adMargin);
    if (!ad.ok) {
      out.push({
        rule: "impressions_gt_pageviews", severity: impSeverity, scope: `ad:${row.adId}`,
        observed: row.impressions, limit: ad.limit,
        detail: `impressions=${row.impressions} > pv(${row.pageviews})*${slots}*${input.adMargin}=${ad.limit} em ${row.date}`,
      });
    }
  }

  // ── R2 paid_without_campaign (critical) — PRD 05 ──
  // null = dependência ausente → não avaliada (o coletor marca skip prd05_pendente).
  if (input.paid !== null
    && input.paid.activeCampaigns === 0 && input.paid.paidLinesSinceRule > 0) {
    out.push({
      rule: "paid_without_campaign", severity: "critical", scope: "",
      observed: input.paid.paidLinesSinceRule, limit: 0,
      detail: `paid=${input.paid.paidLinesSinceRule} sem campanha ativa cadastrada`,
    });
  }

  // ── R3 sources_not_100 (warning) — soma reconstruída das fontes ≠ 100% ──
  // Total 0 = sem dados → não avaliada (blog novo é saudável).
  let sourcesTotal = 0;
  for (const v of Object.values(input.channelCounts)) {
    if (Number.isFinite(v) && v > 0) sourcesTotal += v;
  }
  if (sourcesTotal > 0) {
    let pctSum = 0;
    for (const v of Object.values(input.channelCounts)) {
      if (Number.isFinite(v) && v > 0) pctSum += Math.round((100 * v) / sourcesTotal);
    }
    if (Math.abs(pctSum - 100) > 1) {
      out.push({
        rule: "sources_not_100", severity: "warning", scope: "",
        observed: pctSum, limit: 100,
        detail: `soma das fontes reconstruida=${pctSum}% (esperado 100 +-1)`,
      });
    }
  }

  // ── R4 category_gt_pageviews (warning) ──
  let catSum = 0;
  for (const c of input.categoryViews) {
    if (Number.isFinite(c.views) && c.views > 0) catSum += c.views;
  }
  const catLimit = input.windowPageviewsNonInternal + CATEGORY_TOLERANCE;
  if (catSum > catLimit) {
    out.push({
      rule: "category_gt_pageviews", severity: "warning", scope: "",
      observed: catSum, limit: input.windowPageviewsNonInternal,
      detail: `soma views/categoria=${catSum} > pageviews nao-internos=${input.windowPageviewsNonInternal} (+${CATEGORY_TOLERANCE})`,
    });
  }

  // ── R5 sessions_lt_visitors (critical) — identidade lógica: visitors ⊆ sessions ──
  if (input.windowUniqueVisitors > input.windowSessions) {
    out.push({
      rule: "sessions_lt_visitors", severity: "critical", scope: "",
      observed: input.windowUniqueVisitors, limit: input.windowSessions,
      detail: `visitantes unicos=${input.windowUniqueVisitors} > sessoes=${input.windowSessions}`,
    });
  }

  // ── R7 percent_over_100 (warning) — % exibido no card estoura o teto ──
  for (const p of input.displayedPercents) {
    if (Number.isFinite(p.pct) && p.pct > PERCENT_CEILING + 0.5) {
      out.push({
        rule: "percent_over_100", severity: "warning", scope: p.scope,
        observed: Math.round(p.pct * 10) / 10, limit: PERCENT_CEILING,
        detail: `percentual exibido=${Math.round(p.pct * 10) / 10}% > ${PERCENT_CEILING}%`,
      });
    }
  }

  const rank = (s: Severity): number => (s === "critical" ? 0 : 1);
  out.sort((a, b) =>
    rank(a.severity) - rank(b.severity)
    || a.rule.localeCompare(b.rule)
    || a.scope.localeCompare(b.scope));
  return out;
}

/**
 * Monta o ruleStatus das 7 regras: parte de "ok", aplica os skips do coletor
 * (dependência ausente / db_error) e, por último, marca "violated" onde houve
 * violação — "violated" sempre vence (defesa em profundidade; uma regra skipada
 * nunca produz violação, então não há conflito real).
 */
export function buildRuleStatus(
  violations: readonly { rule: string }[],
  skipped: readonly { rule: string }[],
): Record<string, "ok" | "violated" | "skipped"> {
  const status: Record<string, "ok" | "violated" | "skipped"> = {};
  for (const id of RULE_IDS) status[id] = "ok";
  for (const s of skipped) if (s.rule in status) status[s.rule] = "skipped";
  for (const v of violations) if (v.rule in status) status[v.rule] = "violated";
  return status;
}
