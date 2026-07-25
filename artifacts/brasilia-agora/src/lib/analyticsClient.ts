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
  /** gclid OU fbclid presente — fundido, mantido por retrocompat (PRD 05 separou os dois). */
  paidClick: boolean;
  /** Presença de gclid/fbclid na URL de entrada — só a PRESENÇA, nunca o ID. O servidor
   *  decide o canal: gclid/fbclid só viram "pago" se casarem uma campanha cadastrada. */
  gclid?: boolean;
  fbclid?: boolean;
}

export function parseUtm(search: string): UtmSignals {
  try {
    const p = new URLSearchParams(search);
    const get = (k: string): string | undefined => {
      const v = p.get(k)?.trim();
      return v ? v.slice(0, 120) : undefined;
    };
    const gclid = p.has("gclid");
    const fbclid = p.has("fbclid");
    const out: UtmSignals = { paidClick: gclid || fbclid };
    const source = get("utm_source");
    const medium = get("utm_medium");
    const campaign = get("utm_campaign");
    if (source) out.utmSource = source;
    if (medium) out.utmMedium = medium;
    if (campaign) out.utmCampaign = campaign;
    if (gclid) out.gclid = true;
    if (fbclid) out.fbclid = true;
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
 * Href externo válido para link_click: só http/https e origin DIFERENTE do
 * atual. mailto:/tel:/javascript:/âncoras/relativos/inválidos → null. Corrige o
 * item 23 da auditoria (domínio vazio de mailto: e exclusão por prefixo de
 * string em vez de origin real). O `href` de um <a> do DOM já vem absoluto; a
 * função é pura para ser testável sem DOM.
 */
export function externalHrefOf(href: string, currentOrigin: string): string | null {
  try {
    const u = new URL(href);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.origin === currentOrigin) return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * Debounce de link_click: o MESMO href dentro de `windowMs` do último clique
 * CONTADO não gera evento (duplo-clique acidental = 1 evento). href diferente
 * sempre conta. Relógio injetável p/ teste (espelha createDwellDecider).
 */
export function createLinkClickDebouncer(windowMs = 1000, nowFn: () => number = Date.now) {
  let lastHref: string | null = null;
  let lastAt = 0;
  return {
    shouldCount(href: string): boolean {
      const now = nowFn();
      if (href === lastHref && now - lastAt < windowMs) return false;
      lastHref = href;
      lastAt = now;
      return true;
    },
  };
}

/** ?adminPreview=1 na query — mesma regra do Home.tsx (prévia do admin nunca é
 *  audiência). Pura: não lança em query malformada. */
export function hasAdminPreviewParam(search: string): boolean {
  try {
    return new URLSearchParams(search).get("adminPreview") === "1";
  } catch {
    return false;
  }
}

/** Plataformas de share ainda não enviadas nesta sessão+conteúdo. Repetir a
 *  MESMA plataforma → []; plataforma nova → [plataforma] (RF4: dedup de share). */
export function newSharePlatforms(platform: string, already: ReadonlySet<string>): string[] {
  return already.has(platform) ? [] : [platform];
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
