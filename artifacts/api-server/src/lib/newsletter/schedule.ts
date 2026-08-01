/**
 * Agendamento do fan-out de campanha (módulo puro, testável sem banco).
 *
 * O teto diário (`newsletterDailyCap`) existe para NÃO estourar o limite de ~500
 * envios/dia do Gmail (que barra o remetente por 24h ao ser excedido). O produtor
 * distribui os inscritos por dias-do-blog de modo que nenhum dia receba mais que
 * o teto; dentro de cada dia, um "drip" espaça os envios (controla a velocidade,
 * evita rajada). O worker reforça o teto na hora do envio — cinto e suspensório.
 *
 * As fronteiras de dia são do FUSO DO BLOG (`siteTimezone`), não UTC — o teto é
 * "por dia civil do blog". Cálculo via Intl (sem dependência de lib de data).
 */

/** Espaçamento padrão entre envios dentro de um mesmo dia (velocidade do drip). */
export const DEFAULT_DRIP_MS = 4_000;

/**
 * Início do dia civil (00:00) do fuso `tz` que contém o instante `instant`,
 * retornado como o instante UTC correspondente. Ex.: 2026-08-01T10:00Z em
 * "America/Sao_Paulo" (UTC-3) → 2026-08-01T03:00Z (= 2026-08-01 00:00 BRT).
 */
export function startOfDayInTz(instant: Date, tz: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
  const y = get("year"), mo = get("month"), d = get("day");
  const h = get("hour"), mi = get("minute"), s = get("second");
  // Offset do fuso = (hora local interpretada como UTC) − (UTC real), em minutos.
  const localAsUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  const offsetMs = Math.round((localAsUtc - instant.getTime()) / 60_000) * 60_000;
  // Meia-noite local do MESMO dia local → instante UTC.
  const localMidnightAsUtc = Date.UTC(y, mo - 1, d, 0, 0, 0);
  return new Date(localMidnightAsUtc - offsetMs);
}

/** Início do dia civil SEGUINTE ao de `dayStart` (robusto a DST: +26h e re-normaliza). */
export function nextDayStartInTz(dayStart: Date, tz: string): Date {
  return startOfDayInTz(new Date(dayStart.getTime() + 26 * 3_600_000), tz);
}

export interface PlanOptions {
  /** Quantos e-mails escalonar. */
  count: number;
  /** Agora (referência). */
  now: Date;
  /** Fuso civil do blog (IANA). */
  tz: string;
  /** Teto diário (envios de campanha por dia do blog). */
  cap: number;
  /** Envios de campanha JÁ efetivados hoje (consomem o teto do 1º dia). */
  sentToday?: number;
  /** Quando começar (agendamento). Se no passado, usa `now`. */
  firstAt?: Date;
  /** Espaçamento entre envios no mesmo dia. */
  dripMs?: number;
}

/**
 * Calcula o `scheduledAt` de cada um dos `count` envios, garantindo por
 * construção que nenhum dia civil do blog receba mais que `cap` envios (o 1º dia
 * já desconta `sentToday`). Dentro do dia, os envios ficam espaçados por `dripMs`.
 *
 * Invariante testável: para todo dia D, |{ i : scheduledAt[i] ∈ D }| ≤ cap.
 */
export function planCampaignSchedule(opts: PlanOptions): Date[] {
  const { count, now, tz } = opts;
  const cap = Math.max(1, Math.floor(opts.cap));
  const drip = Math.max(0, opts.dripMs ?? DEFAULT_DRIP_MS);
  const sentToday = Math.max(0, Math.floor(opts.sentToday ?? 0));

  // 1º dia começa em max(now, firstAt); dias seguintes na meia-noite do blog.
  const start = opts.firstAt && opts.firstAt.getTime() > now.getTime() ? opts.firstAt : now;
  const day0Midnight = startOfDayInTz(start, tz);

  const out: Date[] = [];
  let dayCapacity = Math.max(0, cap - sentToday);     // capacidade do 1º dia
  let inDay = 0;
  let dayBase = start;                                // base do 1º dia = o próprio start
  let dayMidnight = day0Midnight;

  for (let i = 0; i < count; i++) {
    if (inDay >= dayCapacity) {
      // Próximo dia: meia-noite do blog, teto cheio.
      dayMidnight = nextDayStartInTz(dayMidnight, tz);
      dayBase = dayMidnight;
      dayCapacity = cap;
      inDay = 0;
    }
    out.push(new Date(dayBase.getTime() + inDay * drip));
    inDay += 1;
  }
  return out;
}
