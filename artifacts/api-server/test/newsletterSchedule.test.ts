import { test } from "node:test";
import assert from "node:assert/strict";
import { backoffMsForAttempt, MAX_SEND_ATTEMPTS } from "../src/lib/newsletter/backoff.ts";
import { startOfDayInTz, nextDayStartInTz, planCampaignSchedule } from "../src/lib/newsletter/schedule.ts";

// PRD-NEWSLETTER-01 (Fase 3) — provas puras do motor de disparo: backoff e o
// escalonamento com teto diário. Sem banco; a validação com dados reais é na VPS.

const TZ = "America/Sao_Paulo"; // UTC-3, sem DST desde 2019.

test("backoff espelha a curva das entregas (1m→5m→15m→1h→6h, clamp)", () => {
  assert.equal(backoffMsForAttempt(1), 1 * 60_000);
  assert.equal(backoffMsForAttempt(2), 5 * 60_000);
  assert.equal(backoffMsForAttempt(3), 15 * 60_000);
  assert.equal(backoffMsForAttempt(4), 60 * 60_000);
  assert.equal(backoffMsForAttempt(5), 360 * 60_000);
  // Além do máximo (e abaixo de 1) fica preso nas pontas.
  assert.equal(backoffMsForAttempt(6), 360 * 60_000);
  assert.equal(backoffMsForAttempt(0), 1 * 60_000);
  assert.equal(MAX_SEND_ATTEMPTS, 5);
});

test("startOfDayInTz devolve a meia-noite civil do blog como instante UTC", () => {
  // 2026-08-01 10:00Z = 07:00 BRT → início do dia = 2026-08-01 00:00 BRT = 03:00Z.
  assert.equal(
    startOfDayInTz(new Date("2026-08-01T10:00:00Z"), TZ).toISOString(),
    "2026-08-01T03:00:00.000Z",
  );
  // 2026-08-01 02:00Z = 2026-07-31 23:00 BRT → início = 2026-07-31 00:00 BRT = 03:00Z.
  assert.equal(
    startOfDayInTz(new Date("2026-08-01T02:00:00Z"), TZ).toISOString(),
    "2026-07-31T03:00:00.000Z",
  );
  // Idempotente sobre a própria meia-noite.
  const mid = startOfDayInTz(new Date("2026-08-01T10:00:00Z"), TZ);
  assert.equal(startOfDayInTz(mid, TZ).toISOString(), mid.toISOString());
});

test("nextDayStartInTz avança exatamente um dia civil", () => {
  const d0 = startOfDayInTz(new Date("2026-08-01T10:00:00Z"), TZ);
  const d1 = nextDayStartInTz(d0, TZ);
  assert.equal(d1.toISOString(), "2026-08-02T03:00:00.000Z");
});

/** Agrupa os instantes por dia civil do blog e devolve as contagens ordenadas. */
function bucketCounts(dates: Date[]): number[] {
  const byDay = new Map<number, number>();
  for (const d of dates) {
    const key = startOfDayInTz(d, TZ).getTime();
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c);
}

test("teto diário: nenhum dia recebe mais que o cap (cap=5, 12 inscritos)", () => {
  const dates = planCampaignSchedule({
    count: 12,
    now: new Date("2026-08-01T12:00:00Z"), // 09:00 BRT
    tz: TZ,
    cap: 5,
    sentToday: 0,
    dripMs: 1_000,
  });
  assert.equal(dates.length, 12);
  const buckets = bucketCounts(dates);
  assert.deepEqual(buckets, [5, 5, 2]);
  assert.ok(Math.max(...buckets) <= 5, "nenhum dia > cap");
});

test("teto diário: sentToday reduz a capacidade só do 1º dia", () => {
  const dates = planCampaignSchedule({
    count: 12,
    now: new Date("2026-08-01T12:00:00Z"),
    tz: TZ,
    cap: 5,
    sentToday: 3, // hoje já saíram 3 → sobram 2 hoje
    dripMs: 1_000,
  });
  assert.deepEqual(bucketCounts(dates), [2, 5, 5]);
});

test("cap já estourado hoje empurra tudo para os próximos dias", () => {
  const dates = planCampaignSchedule({
    count: 4,
    now: new Date("2026-08-01T12:00:00Z"),
    tz: TZ,
    cap: 5,
    sentToday: 5, // hoje não cabe mais nada
    dripMs: 1_000,
  });
  const buckets = bucketCounts(dates);
  assert.equal(buckets.length, 1, "tudo no mesmo dia seguinte");
  assert.deepEqual(buckets, [4]);
  // E esse dia é o SEGUINTE ao de agora (não hoje).
  const today = startOfDayInTz(new Date("2026-08-01T12:00:00Z"), TZ).getTime();
  assert.ok(startOfDayInTz(dates[0]!, TZ).getTime() > today);
});

test("drip espaça os envios do mesmo dia por dripMs", () => {
  const dates = planCampaignSchedule({
    count: 3,
    now: new Date("2026-08-01T12:00:00Z"),
    tz: TZ,
    cap: 10,
    sentToday: 0,
    dripMs: 5_000,
  });
  assert.equal(dates[1]!.getTime() - dates[0]!.getTime(), 5_000);
  assert.equal(dates[2]!.getTime() - dates[1]!.getTime(), 5_000);
});

test("firstAt no futuro adia o começo do 1º dia", () => {
  const future = new Date("2026-08-05T13:00:00Z");
  const dates = planCampaignSchedule({
    count: 2,
    now: new Date("2026-08-01T12:00:00Z"),
    tz: TZ,
    cap: 10,
    firstAt: future,
    dripMs: 1_000,
  });
  assert.equal(dates[0]!.getTime(), future.getTime());
});
