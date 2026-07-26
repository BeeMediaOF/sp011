/**
 * healthAlerts — motor puro de alertas de saúde da coleta (PRD 08).
 *
 * Contrato "zero imports" (mesmo padrão de analyticsShared.ts): é alvo direto de
 * `node --test` e não conhece Express, Drizzle nem I/O. Recebe um input já montado
 * pelo gatherer do /health e é 100% LEITURA — nenhum UPDATE/DELETE em lugar algum.
 *
 * Princípio (PRD 08): nenhum alerta dispara por "número pequeno" — blog novo com
 * zero tráfego tem `alerts: []`, e isso é sucesso. Todo alerta exige uma
 * INCONSISTÊNCIA lógica (identidade quebrada, invariante violada, dado impossível)
 * ou uma MUDANÇA estrutural, nunca volume absoluto.
 */

export interface HealthAlertDto {
  id: string;
  severity: "critical" | "warning";
  params: Record<string, number | string>;
}
export interface SkippedRule {
  id: string;
  reason: string;
}

export interface HealthAlertInput {
  /** Contadores desde o boot (sempre frescos, custo zero) — regras sempre avaliadas. */
  counters: { received: number; flushedOk: number; flushFailed: number; buffered: number };
  /** 2×BUFFER_MAX = 1000: tolera lote em voo + o teto de re-enfileiramento do PRD 03 RF6. */
  bufferIdentityTolerance: number;
  /** PRD 03 RF4 — null = contadores por razão ausentes (PRD 03 não no ar). */
  internalByReason?: { flag: number; configuredIp: number; privateIp: number } | null;
  /** Pageviews: 7d recentes vs 28d anteriores. null = query falhou (db_error). */
  internalShare?: {
    recentTotal: number; recentInternal: number;
    priorTotal: number; priorInternal: number;
  } | null;
  /** Linhas (anúncio, dia) já filtradas por adsReliableSince, com pageviews não-internos
   *  do MESMO dia BRT. null = reparo do PRD 04 pendente (ou db_error, via override do gatherer). */
  adDays?: {
    adId: string; date: string; impressions: number; clicks: number;
    pageviews: number;
  }[] | null;
  /** AD_SANITY_MARGIN (3 até o PRD 02 alinhar consentimento; 1.5 depois). */
  adMargin: number;
  /** PRD 05 — null = cadastro/PAID_RULE_SINCE ausente (ou db_error, via override). */
  paid?: { activeCampaigns: number; paidLinesSinceRule: number } | null;
  /** behavior_events.event_type IN ('video_play','download'), 30d, internos incluídos.
   *  null = query falhou (db_error). */
  reservedBehaviorCount?: number | null;
}

/** Reduzir para 1.5 quando o PRD 02 alinhar consentimento (PRD 04 RF6). */
export const AD_SANITY_MARGIN = 3;

export const HEALTH_ALERT_THRESHOLDS = {
  privateIpDominanceMinReceived: 30, // amostra mínima
  privateIpDominanceShare: 0.9,      // privateIp ≥ 90% dos aceitos
  internalShiftMinSample: 50,        // por janela
  internalShiftPoints: 40,           // pontos percentuais
} as const;

/**
 * Avalia o catálogo de alertas (regras EXATAS — nada subjetivo). Segmento `null`
 * ⇒ regra NÃO avaliada e listada em `skipped` com uma razão-PADRÃO (o gatherer
 * reatribui `db_error` às regras cujas queries realmente falharam). Amostra
 * insuficiente NÃO é skip — é silêncio legítimo (volume baixo não é bug).
 */
export function evaluateHealthAlerts(input: HealthAlertInput): { alerts: HealthAlertDto[]; skipped: SkippedRule[] } {
  const alerts: HealthAlertDto[] = [];
  const skipped: SkippedRule[] = [];
  const th = HEALTH_ALERT_THRESHOLDS;

  // ── Contadores (sempre avaliados; nunca entram em skipped) ──
  const { received, flushedOk, flushFailed, buffered } = input.counters;

  // flush_failed (critical): perda de eventos em flush com erro desde o boot.
  if (flushFailed > 0) {
    alerts.push({ id: "flush_failed", severity: "critical", params: { flushFailed } });
  }

  // buffer_identity (warning): received = flushedOk + flushFailed + buffered (PRD 03 RF6.3).
  const drift = Math.abs(received - (flushedOk + flushFailed + buffered));
  if (drift > input.bufferIdentityTolerance) {
    alerts.push({ id: "buffer_identity", severity: "warning", params: { drift, tolerance: input.bufferIdentityTolerance } });
  }

  // ── internal_privateip_dominant (critical) — assinatura de proxy quebrado ──
  if (input.internalByReason == null) {
    skipped.push({ id: "internal_privateip_dominant", reason: "prd03_pendente" });
  } else if (received >= th.privateIpDominanceMinReceived
    && input.internalByReason.privateIp >= th.privateIpDominanceShare * received) {
    alerts.push({
      id: "internal_privateip_dominant", severity: "critical",
      params: { privateIp: input.internalByReason.privateIp, received },
    });
  }

  // ── internal_share_shift (warning) — salto estrutural da proporção de internos ──
  if (input.internalShare == null) {
    skipped.push({ id: "internal_share_shift", reason: "db_error" });
  } else {
    const s = input.internalShare;
    if (s.recentTotal >= th.internalShiftMinSample && s.priorTotal >= th.internalShiftMinSample) {
      const pctRecent = (100 * s.recentInternal) / s.recentTotal;
      const pctPrior = (100 * s.priorInternal) / s.priorTotal;
      if (Math.abs(pctRecent - pctPrior) >= th.internalShiftPoints) {
        alerts.push({
          id: "internal_share_shift", severity: "warning",
          params: { pctRecent: Math.round(pctRecent), pctPrior: Math.round(pctPrior) },
        });
      }
    }
  }

  // ── ad_sanity (warning) + ad_clicks_gt_impressions (critical) — PRD 04 RF6 ──
  if (input.adDays == null) {
    skipped.push({ id: "ad_sanity", reason: "prd04_reparo_pendente" });
    skipped.push({ id: "ad_clicks_gt_impressions", reason: "prd04_reparo_pendente" });
  } else {
    for (const row of input.adDays) {
      // S=1 pós-dedup do PRD 04; max(pageviews,1) mantém a regra avaliável em dia sem pageview.
      const limit = Math.max(row.pageviews, 1) * 1 * input.adMargin;
      if (row.impressions > limit) {
        alerts.push({
          id: "ad_sanity", severity: "warning",
          params: { adId: row.adId, date: row.date, impressions: row.impressions, limit },
        });
      }
      // +1 cobre o clique legítimo antes do dwell de 1s (PRD 04 RF6, regra irmã).
      if (row.clicks > row.impressions + 1) {
        alerts.push({
          id: "ad_clicks_gt_impressions", severity: "critical",
          params: { adId: row.adId, date: row.date, clicks: row.clicks, impressions: row.impressions },
        });
      }
    }
  }

  // ── paid_without_campaign (critical) — PRD 05 ──
  if (input.paid == null) {
    skipped.push({ id: "paid_without_campaign", reason: "prd05_pendente" });
  } else if (input.paid.activeCampaigns === 0 && input.paid.paidLinesSinceRule > 0) {
    alerts.push({
      id: "paid_without_campaign", severity: "critical",
      params: { paidLinesSinceRule: input.paid.paidLinesSinceRule },
    });
  }

  // ── reserved_behavior_type (warning) — PRD 01 RF6 (anomalia de contrato) ──
  if (input.reservedBehaviorCount == null) {
    skipped.push({ id: "reserved_behavior_type", reason: "db_error" });
  } else if (input.reservedBehaviorCount > 0) {
    alerts.push({
      id: "reserved_behavior_type", severity: "warning",
      params: { count: input.reservedBehaviorCount },
    });
  }

  // Ordenação: critical antes de warning, depois por id (estável).
  const rank = (sev: string): number => (sev === "critical" ? 0 : 1);
  alerts.sort((a, b) => rank(a.severity) - rank(b.severity) || a.id.localeCompare(b.id));

  return { alerts, skipped };
}
