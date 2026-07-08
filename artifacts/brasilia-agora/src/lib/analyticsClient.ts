/**
 * analyticsClient — lógica pura do rastreamento no navegador (sem DOM no
 * escopo de módulo; testável com `tsx --test`). O hook useAnalytics e o
 * useAdImpression consomem estas funções; quem classifica canal é o SERVIDOR —
 * daqui saem apenas sinais crus (hostname do referrer, parâmetros UTM).
 */

export interface UtmSignals {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  /** gclid/fbclid presente na URL de entrada — só a PRESENÇA é enviada, nunca o ID. */
  paidClick: boolean;
}

export function parseUtm(search: string): UtmSignals {
  try {
    const p = new URLSearchParams(search);
    const get = (k: string): string | undefined => {
      const v = p.get(k)?.trim();
      return v ? v.slice(0, 120) : undefined;
    };
    const out: UtmSignals = { paidClick: p.has("gclid") || p.has("fbclid") };
    const source = get("utm_source");
    const medium = get("utm_medium");
    const campaign = get("utm_campaign");
    if (source) out.utmSource = source;
    if (medium) out.utmMedium = medium;
    if (campaign) out.utmCampaign = campaign;
    return out;
  } catch {
    return { paidClick: false };
  }
}

/** Hostname do referrer, minúsculo e sem `www.` — undefined para URL inválida/vazia. */
export function refHostOf(referrer: string): string | undefined {
  if (!referrer) return undefined;
  try {
    const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, "");
    return host || undefined;
  } catch {
    return undefined;
  }
}

/**
 * % de leitura relativo ao BLOCO DE CONTEÚDO do artigo (não à página inteira —
 * cabeçalho, lateral e rodapé não contam como leitura). "Lido" é o que já
 * passou acima do fundo da viewport.
 */
export function contentScrollPct(viewportBottom: number, contentTop: number, contentHeight: number): number {
  if (contentHeight <= 0) return 100;
  const read = viewportBottom - contentTop;
  return Math.max(0, Math.min(100, Math.floor((read / contentHeight) * 100)));
}

/** Marcos ainda não disparados que o % atual já alcançou. */
export function newMilestones(pct: number, fired: ReadonlySet<number>): number[] {
  return [25, 50, 75, 100].filter((m) => pct >= m && !fired.has(m));
}

/**
 * Decisor de dwell da impressão de anúncio: só conta após `thresholdMs` de
 * visibilidade CONTÍNUA (sair da tela zera o relógio). Clock injetável p/ teste.
 */
export function createDwellDecider(thresholdMs: number, nowFn: () => number = Date.now) {
  let visibleSince: number | null = null;
  return {
    setVisible(v: boolean): void {
      if (v) visibleSince = visibleSince ?? nowFn();
      else visibleSince = null;
    },
    /** true quando está visível há pelo menos `thresholdMs` contínuos. */
    shouldCount(): boolean {
      return visibleSince !== null && nowFn() - visibleSince >= thresholdMs;
    },
  };
}
