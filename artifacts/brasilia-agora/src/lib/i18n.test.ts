/**
 * Testes dos formatadores de data do site público.
 *
 * O que está sendo protegido aqui não é a aparência da data — é a HIDRATAÇÃO.
 * O SSR (Node) e o navegador chamam exatamente estas funções para o mesmo
 * artigo; se as strings divergirem em um único caractere, o React descarta o
 * HTML do servidor (#418) e o LCP volta ao que era antes do PRD-PERF-05.
 *
 * Por isso o teste central compara a implementação nova (Intl.DateTimeFormat
 * cacheado, PRD-PERF-07) com a antiga (`toLocaleDateString` a cada chamada),
 * que é a que gerou o HTML hoje em produção: nenhuma saída pode mudar.
 *
 * Rodar com: pnpm run test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatShortDate, formatDayMonth, formatLongDate, formatDateTime,
  relativeTime, relativeTimeOrDate, DEFAULT_TZ, type Lang,
} from "./i18n";

const LANGS: Lang[] = ["pt-BR", "en"];
/** Fusos que a rede usa de fato + dois extremos para pegar virada de dia. */
const ZONES = [DEFAULT_TZ, "UTC", "Africa/Lagos", "Pacific/Kiritimati"];

/** Datas de teste: virada de dia, virada de ano, meio-dia, meia-noite e horário
 *  de verão do hemisfério norte. Em ISO com Z para não depender do fuso da máquina. */
const DATES = [
  "2026-07-30T14:35:00.000Z",
  "2026-07-30T02:10:00.000Z",
  "2026-01-01T00:00:00.000Z",
  "2025-12-31T23:59:59.000Z",
  "2026-03-15T12:00:00.000Z",
  "2026-11-07T23:30:00.000Z",
];

/* ── Implementação ANTIGA, copiada literalmente do que estava no i18n.ts ────── */
const antigo = {
  short: (d: string, lang: Lang, tz: string) =>
    new Date(d).toLocaleDateString(lang, { timeZone: tz }),
  dayMonth: (d: string, lang: Lang, tz: string) =>
    new Date(d).toLocaleDateString(lang, { day: "numeric", month: "short", timeZone: tz }),
  long: (d: string, lang: Lang, tz: string) =>
    new Date(d).toLocaleDateString(lang, {
      weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz,
    }),
  dateTime: (d: string, lang: Lang, tz: string) =>
    new Date(d).toLocaleDateString(lang, {
      day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: tz,
    }),
};

const novo = {
  short: formatShortDate,
  dayMonth: formatDayMonth,
  long: formatLongDate,
  dateTime: formatDateTime,
};

test("cache de Intl não muda nenhuma string (SSR e cliente continuam iguais)", () => {
  let comparadas = 0;
  for (const estilo of ["short", "dayMonth", "long", "dateTime"] as const) {
    for (const lang of LANGS) {
      for (const tz of ZONES) {
        for (const d of DATES) {
          assert.equal(
            novo[estilo](d, lang, tz),
            antigo[estilo](d, lang, tz),
            `${estilo} · ${lang} · ${tz} · ${d}`,
          );
          comparadas++;
        }
      }
    }
  }
  assert.equal(comparadas, 4 * LANGS.length * ZONES.length * DATES.length);
});

test("o formatador é reaproveitado entre chamadas (é disto que vem o ganho)", () => {
  // Não dá para inspecionar o Map de fora, então mede-se o efeito: a 2ª rodada
  // não paga mais a construção. Só se exige que ela não seja MAIS LENTA que a
  // 1ª multiplicada por uma folga generosa — o teste falha se alguém remover o
  // cache e cada chamada voltar a construir um Intl.DateTimeFormat.
  const N = 2000;
  const medir = () => {
    const t0 = performance.now();
    for (let i = 0; i < N; i++) formatDayMonth(DATES[i % DATES.length]!, "pt-BR", DEFAULT_TZ);
    return performance.now() - t0;
  };
  medir();                       // aquece (JIT + construção do formatador)
  const comCache = medir();
  const semCache = (() => {
    const t0 = performance.now();
    for (let i = 0; i < N; i++) antigo.dayMonth(DATES[i % DATES.length]!, "pt-BR", DEFAULT_TZ);
    return performance.now() - t0;
  })();
  assert.ok(
    comCache * 2 < semCache,
    `esperado bem mais rápido que sem cache: ${comCache.toFixed(1)}ms vs ${semCache.toFixed(1)}ms`,
  );
});

test("fusos diferentes não se contaminam no cache", () => {
  // Mesma chave de estilo/idioma, fusos distintos: a data vira dias diferentes.
  const d = "2026-07-30T02:10:00.000Z";
  const saoPaulo = formatDayMonth(d, "pt-BR", "America/Sao_Paulo"); // 29/jul (UTC-3)
  const lagos = formatDayMonth(d, "pt-BR", "Africa/Lagos");         // 30/jul (UTC+1)
  assert.notEqual(saoPaulo, lagos);
  // e repetir devolve o mesmo (não é o último formatador construído que manda)
  assert.equal(formatDayMonth(d, "pt-BR", "America/Sao_Paulo"), saoPaulo);
});

test("data inválida não derruba a página", () => {
  // Intl.DateTimeFormat.format(new Date("lixo")) LANÇA RangeError. A home
  // renderiza um card por artigo: uma data ruim no banco não pode virar tela
  // branca. O comportamento antigo ("Invalid Date") é preservado.
  for (const ruim of ["", "não é data", "0000-13-45"]) {
    assert.equal(formatDayMonth(ruim, "pt-BR", DEFAULT_TZ), antigo.dayMonth(ruim, "pt-BR", DEFAULT_TZ));
    assert.equal(formatShortDate(ruim, "en", "UTC"), antigo.short(ruim, "en", "UTC"));
  }
});

test("relativeTime não usa Intl e continua nos literais de cada idioma", () => {
  const agora = Date.now();
  assert.equal(relativeTime(agora, "pt-BR"), "agora");
  assert.equal(relativeTime(agora, "en"), "now");
  assert.equal(relativeTime(agora - 5 * 60_000, "pt-BR"), "5 min atrás");
  assert.equal(relativeTime(agora - 3 * 3600_000, "pt-BR"), "3 horas atrás");
  assert.equal(relativeTime(agora - 3 * 3600_000, "en"), "3 hours ago");
  assert.equal(relativeTime(agora - 2 * 86400_000, "pt-BR"), "2 dias atrás");
});

test("relativeTimeOrDate cai para data absoluta depois de 7 dias", () => {
  const agora = Date.now();
  assert.equal(relativeTimeOrDate(agora - 30_000, "pt-BR", DEFAULT_TZ), "agora mesmo");
  assert.equal(relativeTimeOrDate(agora - 36 * 3600_000, "pt-BR", DEFAULT_TZ), "ontem");
  const antigoIso = new Date(agora - 30 * 86400_000).toISOString();
  assert.equal(
    relativeTimeOrDate(antigoIso, "pt-BR", DEFAULT_TZ),
    formatShortDate(antigoIso, "pt-BR", DEFAULT_TZ),
  );
  assert.equal(relativeTimeOrDate("não é data", "pt-BR", DEFAULT_TZ), "—");
});
