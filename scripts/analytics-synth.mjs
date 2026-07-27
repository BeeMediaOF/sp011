#!/usr/bin/env node
/**
 * analytics-synth — tráfego sintético MARCADO para validar a cadeia de analytics de
 * UM blog (PRD 12 RF3). Gera eventos HTTP contra `--base`, todos carimbados
 * `synthtest-<runId>-…`, e imprime os comandos de LIMPEZA para colar na VPS (o script
 * não acessa o banco). Prova: evento → linha gravada → contador de saúde → regra de
 * sanidade, e que os cards PÚBLICOS não se mexem (marcação interna funcionou). NÃO prova
 * o número público de nenhum card (isso é o roteiro manual, docs/ANALYTICS-VALIDACAO.md).
 *
 * Uso (VPS, canário):
 *   RUN=$(date +%s)
 *   node scripts/analytics-synth.mjs --base https://resenhavip.midia.run --run-id "$RUN" \
 *        --ad-id '<ID_DO_ANUNCIO_DE_TESTE>' --assert --admin-token '<BEARER>'
 *   node scripts/analytics-synth.mjs --cleanup-only --run-id "$RUN" --ad-id '<ID>'   # recuperação
 *
 * Segurança: recusa sem --base e --run-id (exit 1, ZERO requests). E-mail de newsletter
 * usa o TLD reservado example.invalid (RFC 2606) — nunca alcança ninguém. Todo /event vai
 * com internal:true (é a invariante §17 do CLAUDE.md funcionando: marcado, fora do público).
 *
 * NOTA (código atual, 2026-07): com PRD 01+03 no ar, /api/analytics/behavior MARCA o
 * interno (coluna is_internal) em vez de descartar — logo o modo `marked` GRAVA linhas
 * marcadas (excluídas dos cards, removidas pela limpeza por session_id). O modo `public`
 * omite o flag para exercitar a cadeia pública dos itens 22/23/24.
 */
import { pathToFileURL } from "node:url";

// ── UA de navegador (NUNCA casa BOT_RE do trafficGuard: sem curl/python/headless/…) ──
const SYNTH_UA_PREFIX = "Mozilla/5.0 (X11; Linux x86_64) synthtest";
const RESERVED_EMAIL_TLD = "example.invalid"; // RFC 2606 — e-mail de teste sem destinatário real
const TEST_PREFIX = "synthtest-";

// ─────────────────────────────────────────────────────────────────────────────
// Funções puras (exportadas — cobertas por scripts/analytics-synth.test.mjs)
// ─────────────────────────────────────────────────────────────────────────────

/** Converte um padrão SQL LIKE (%, _) em RegExp ancorado, escapando o resto. */
export function likeToRegExp(pattern) {
  let out = "^";
  for (const ch of pattern) {
    if (ch === "%") out += ".*";
    else if (ch === "_") out += ".";
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(out + "$");
}

/** Filtro de limpeza restrito ao run (nunca mais largo). `synthtest-<runId>-%`. */
export function runScopeFilter(runId) {
  return `${TEST_PREFIX}${runId}-%`;
}

/** ids de teste de uma unidade do run (hierarquia synthtest-<runId>-<seq>). */
export function synthIds(runId, seq) {
  return {
    sessionId: `${TEST_PREFIX}${runId}-${seq}`,
    visitorId: `${TEST_PREFIX}${runId}-v${seq}`,
  };
}

/**
 * Monta o body de um evento sintético. `kind` decide o endpoint e os campos.
 * Sempre inclui sessionId (carimbo de limpeza). /event vai marcado interno.
 * Retorna { endpoint, body }.
 */
export function buildEventPayload(runId, seq, kind) {
  const { sessionId, visitorId } = synthIds(runId, seq);
  switch (kind) {
    case "pageview":
      return { endpoint: "event", body: { type: "pageview", path: `/artigo/synth-${seq}`, sessionId, visitorId, firstTouch: true, internal: true } };
    case "pageview-utm":
      return { endpoint: "event", body: { type: "pageview", path: `/artigo/synth-${seq}`, sessionId, visitorId, firstTouch: true, utmSource: "synthtest", utmMedium: "cpc", internal: true } };
    case "pageview-fbclid":
      return { endpoint: "event", body: { type: "pageview", path: `/synth-${seq}`, sessionId, visitorId, firstTouch: true, refHost: "facebook.com", fbclid: true, internal: true } };
    case "read":
      return { endpoint: "event", body: { type: "read", path: `/artigo/synth-${seq}`, sessionId, visitorId, articleId: `synth-art-${seq}`, duration: 30, internal: true } };
    case "category":
      return { endpoint: "event", body: { type: "category", path: `/categoria/synth-${seq}`, sessionId, visitorId, category: `synthcat-${seq}`, internal: true } };
    case "scroll":
      return { endpoint: "event", body: { type: "scroll", path: `/artigo/synth-${seq}`, sessionId, visitorId, scrollDepth: 50, internal: true } };
    case "share":
      return { endpoint: "event", body: { type: "share", path: `/artigo/synth-${seq}`, sessionId, visitorId, platform: "whatsapp", internal: true } };
    case "search":
      return { endpoint: "behavior", body: { eventType: "search", value: `busca-synth-${seq}`, sessionId, internal: true } };
    case "link_click":
      return { endpoint: "behavior", body: { eventType: "link_click", value: `https://exemplo-${seq}.invalid/`, sessionId, internal: true } };
    case "newsletter":
      return { endpoint: "behavior", body: { eventType: "newsletter", value: `synthtest+${runId}@${RESERVED_EMAIL_TLD}`, sessionId, internal: true } };
    default:
      throw new Error(`kind desconhecido: ${kind}`);
  }
}

/**
 * SQL de limpeza (para colar na VPS, padrão CLAUDE.md §12). Escopo RESTRITO ao run
 * (session_id LIKE 'synthtest-<runId>-%') e ao anúncio de teste (ad_id EXATO, nunca LIKE).
 * O DELETE de `ads` é guardado por title LIKE 'synthtest-%' (não apaga anúncio real).
 */
export function buildCleanupSql({ runId, adId }) {
  const like = runScopeFilter(runId);
  const lines = [
    `DELETE FROM analytics_events WHERE session_id LIKE '${like}';`,
    `DELETE FROM behavior_events WHERE session_id LIKE '${like}';`,
  ];
  if (adId) {
    lines.push(`DELETE FROM ad_daily_stats WHERE ad_id = '${adId}';`);
    lines.push(`DELETE FROM ads WHERE id = '${adId}' AND title LIKE '${TEST_PREFIX}%';`);
  }
  return lines.join("\n");
}

/** SELECT de conferência do anúncio de teste ANTES de apagar (RF3.5). */
export function buildAdCheckSql(adId) {
  return `SELECT id, title FROM ads WHERE id = '${adId}';`;
}

/**
 * Parser dos argumentos. LANÇA (não process.exit) em uso inválido — o main captura e
 * sai 1. Regras: --base e --run-id obrigatórios; --assert exige --admin-token; --behavior
 * public exige --i-know-this-is casando o host de --base.
 */
export function parseArgs(argv) {
  const opts = {
    base: null, runId: null, adId: null, behavior: "marked",
    assert: false, adminToken: null, iKnowThisIs: null, cleanupOnly: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`faltou valor para ${a}`);
      return v;
    };
    switch (a) {
      case "--base": opts.base = next().replace(/\/+$/, ""); break;
      case "--run-id": opts.runId = next(); break;
      case "--ad-id": opts.adId = next(); break;
      case "--behavior": opts.behavior = next(); break;
      case "--admin-token": opts.adminToken = next(); break;
      case "--i-know-this-is": opts.iKnowThisIs = next(); break;
      case "--assert": opts.assert = true; break;
      case "--cleanup-only": opts.cleanupOnly = true; break;
      default: throw new Error(`argumento desconhecido: ${a}`);
    }
  }

  // --cleanup-only só precisa de run-id (e opcionalmente ad-id); não toca a rede.
  if (opts.cleanupOnly) {
    if (!opts.runId) throw new Error("--run-id é obrigatório (carimbo limpável do run; use $(date +%s))");
    if (/\s/.test(opts.runId)) throw new Error("--run-id não pode conter espaço");
    return opts;
  }

  if (!opts.base) throw new Error("--base é obrigatório (URL pública do blog-alvo)");
  if (!opts.runId) throw new Error("--run-id é obrigatório (carimbo limpável do run; use $(date +%s))");
  if (/\s/.test(opts.runId)) throw new Error("--run-id não pode conter espaço");
  if (opts.behavior !== "marked" && opts.behavior !== "public") {
    throw new Error("--behavior deve ser 'marked' ou 'public'");
  }
  if (opts.assert && !opts.adminToken) throw new Error("--assert exige --admin-token");
  if (opts.behavior === "public") {
    if (!opts.iKnowThisIs) throw new Error("--behavior public exige --i-know-this-is <blog>");
    const host = new URL(opts.base).host;
    if (!host.includes(opts.iKnowThisIs)) {
      throw new Error(`--i-know-this-is '${opts.iKnowThisIs}' não casa o host de --base (${host})`);
    }
  }
  return opts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Emissão HTTP + orquestração dos 14 passos (só roda como main — não no import)
// ─────────────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function postJson(base, path, body, ua = `${SYNTH_UA_PREFIX}/run`) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": ua },
    body: JSON.stringify(body),
  });
  let json = {};
  try { json = await res.json(); } catch { /* vazio */ }
  return { status: res.status, json };
}

async function getJson(base, path, adminToken) {
  const res = await fetch(`${base}${path}`, { headers: { "User-Agent": `${SYNTH_UA_PREFIX}/probe`, Authorization: `Bearer ${adminToken}` } });
  let json = {};
  try { json = await res.json(); } catch { /* vazio */ }
  return { status: res.status, json };
}

async function emit(base, kind, runId, seq, behaviorMode) {
  const { endpoint, body } = buildEventPayload(runId, seq, kind);
  // Modo public: behavior SEM o flag → linhas entram nos cards 22/23/24 (exige limpeza).
  if (endpoint === "behavior" && behaviorMode === "public") delete body.internal;
  const path = endpoint === "event" ? "/api/analytics/event" : "/api/analytics/behavior";
  return postJson(base, path, body);
}

/** Lê o conjunto de violações do /sanity (ou /health) — para o antes×depois do --assert. */
function extractViolations(healthOrSanity) {
  const sanity = healthOrSanity?.sanity ?? healthOrSanity; // /health embute sanity; /sanity é o próprio
  const vs = sanity?.violations;
  if (!Array.isArray(vs)) return null; // sem PRD 11 no ar → indeterminado
  return new Set(vs.map((v) => `${v.rule}|${v.scope ?? "-"}`));
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`✖ ${err.message}`);
    process.exit(1);
  }

  const cleanup = buildCleanupSql({ runId: opts.runId, adId: opts.adId });
  const printCleanup = () => {
    console.log("\n── LIMPEZA (colar na VPS — padrão CLAUDE.md §12) ──");
    if (opts.adId) console.log(`# confira o anúncio antes de apagar:\n${buildAdCheckSql(opts.adId)}`);
    console.log(cleanup + "\n");
  };

  if (opts.cleanupOnly) {
    console.log(`# --cleanup-only do run ${opts.runId}`);
    printCleanup();
    process.exit(0);
  }

  console.log(`▶ analytics-synth run=${opts.runId} base=${opts.base} behavior=${opts.behavior} ad=${opts.adId ?? "(pulado)"}`);
  printCleanup(); // imprime ANTES de gerar (run interrompido continua limpável)

  const results = [];
  const step = async (id, items, fn) => {
    try { await fn(); results.push({ id, status: "ok", items }); console.log(`✔ ${id} (itens ${items})`); }
    catch (err) { results.push({ id, status: "failed", items, err: String(err) }); console.log(`✖ ${id} — ${err}`); }
  };
  const skip = (id, items, why) => { results.push({ id, status: "skipped", items, why }); console.log(`↷ ${id} (itens ${items}) — skipped: ${why}`); };

  let sanityBefore = null;
  if (opts.assert) {
    const r = await getJson(opts.base, "/api/analytics/sanity", opts.adminToken);
    if (r.status !== 200) {
      const h = await getJson(opts.base, "/api/analytics/health", opts.adminToken);
      sanityBefore = extractViolations(h.json);
    } else {
      sanityBefore = extractViolations(r.json);
    }
  }

  let seq = 0;
  const emitN = async (kind, n, gapMs) => { for (let k = 0; k < n; k++) { await emit(opts.base, kind, opts.runId, ++seq, opts.behavior); await sleep(gapMs); } };

  // P1 pageview de entrada (firstTouch) — itens 1,2,5,7,10
  await step("P1", "1,2,5,7,10", () => emitN("pageview", 1, 300));
  // P2 2 paths distintos, mesma sessão — itens 9,16,17
  await step("P2", "9,16,17", async () => {
    const { sessionId } = synthIds(opts.runId, ++seq);
    await postJson(opts.base, "/api/analytics/event", { type: "pageview", path: "/synth-a", sessionId, internal: true });
    await sleep(300);
    await postJson(opts.base, "/api/analytics/event", { type: "pageview", path: "/synth-b", sessionId, internal: true });
  });
  // P3 pageview repetido do MESMO path <15s (droppedDuplicate) — item 25
  await step("P3", "25", async () => {
    const { sessionId } = synthIds(opts.runId, ++seq);
    await postJson(opts.base, "/api/analytics/event", { type: "pageview", path: "/synth-dup", sessionId, internal: true });
    await postJson(opts.base, "/api/analytics/event", { type: "pageview", path: "/synth-dup", sessionId, internal: true });
  });
  // P4 read cumulativo 30→90→60 (MAX é do reducer, prova em L1) — itens 8,13
  await step("P4", "8,13", async () => {
    const { sessionId } = synthIds(opts.runId, ++seq);
    for (const d of [30, 90, 60]) { await postJson(opts.base, "/api/analytics/event", { type: "read", path: "/artigo/synth-read", sessionId, articleId: "synth-art", duration: d, internal: true }); await sleep(300); }
  });
  // P5 scroll 25/50/75/100 do mesmo artigo — item 18
  await step("P5", "18", async () => {
    const { sessionId } = synthIds(opts.runId, ++seq);
    for (const sd of [25, 50, 75, 100]) { await postJson(opts.base, "/api/analytics/event", { type: "scroll", path: "/artigo/synth-scroll", sessionId, scrollDepth: sd, internal: true }); await sleep(300); }
  });
  // P6 category ×2 na mesma categoria <15s (dedup só cobre pageview) — itens 3,14
  await step("P6", "3,14", () => emitN("category", 2, 400));
  // P7 share — item 24
  await step("P7", "24", () => emitN("share", 1, 300));
  // P8 first-touch com utm cru e depois com fbclid (classificação é L1/L2) — item 11
  await step("P8", "11", async () => { await emitN("pageview-utm", 1, 400); await emitN("pageview-fbclid", 1, 400); });
  // P9 behavior search × >15 termos distintos — item 22
  await step("P9", "22", () => emitN("search", 16, 2100));
  // P10 behavior link_click × >10 domínios distintos — item 23
  await step("P10", "23", () => emitN("link_click", 11, 2100));
  // P11 behavior newsletter (gate LGPD é client-side, PRD 02) — item 24
  await step("P11", "24", () => emitN("newsletter", 1, 2100));
  // P12 impressão ×K + 1 clique no anúncio de teste — itens 4,19,20,21
  if (!opts.adId) skip("P12", "4,19,20,21", "sem --ad-id (nunca aponta para anúncio real)");
  else await step("P12", "4,19,20,21", async () => {
    const { sessionId } = synthIds(opts.runId, ++seq);
    for (let k = 0; k < 3; k++) { await postJson(opts.base, `/api/ads/${encodeURIComponent(opts.adId)}/impression`, { sessionId: `${sessionId}-imp${k}`, internal: true }); await sleep(1100); }
    await postJson(opts.base, `/api/ads/${encodeURIComponent(opts.adId)}/click`, { sessionId, internal: true });
  });
  // P14 UA mobile e desktop; visitorId novo e repetido (geo não é sintetizável) — itens 6,12,15
  await step("P14", "6,12", async () => {
    const { sessionId, visitorId } = synthIds(opts.runId, ++seq);
    await postJson(opts.base, "/api/analytics/event", { type: "pageview", path: "/synth-mob", sessionId, visitorId, internal: true }, `${SYNTH_UA_PREFIX} Mobile`);
    await sleep(300);
    await postJson(opts.base, "/api/analytics/event", { type: "pageview", path: "/synth-desk", sessionId: `${sessionId}-2`, visitorId, internal: true });
  });
  // P13 (ÚLTIMO gerador): sem path, UA de bot, path /admin/x, rajada acima do teto — item 25
  await step("P13", "25", async () => {
    await postJson(opts.base, "/api/analytics/event", { type: "pageview", sessionId: synthIds(opts.runId, ++seq).sessionId, internal: true }); // sem path → droppedInvalid
    await postJson(opts.base, "/api/analytics/event", { type: "pageview", path: "/synth-bot", sessionId: synthIds(opts.runId, ++seq).sessionId, internal: true }, "curl/8.4 synthtest"); // bot
    await postJson(opts.base, "/api/analytics/event", { type: "pageview", path: "/admin/x", sessionId: synthIds(opts.runId, ++seq).sessionId, internal: true }); // /admin → droppedInvalid
    for (let k = 0; k < 130; k++) await postJson(opts.base, "/api/analytics/event", { type: "pageview", path: `/synth-flood-${k}`, sessionId: `${TEST_PREFIX}${opts.runId}-flood`, internal: true }); // estoura o rate
  });

  if (opts.assert) {
    // Sem gatilho de recomputação sob demanda no PRD 11 (o /sanity é cache de ~15min):
    // o antes×depois pode ler o MESMO snapshot. Reportamos o que der para observar; o
    // veredito FORTE é "nenhuma violação NOVA" (o tráfego é interno e não pode quebrar regra).
    const r = await getJson(opts.base, "/api/analytics/sanity", opts.adminToken);
    const src = r.status === 200 ? r.json : (await getJson(opts.base, "/api/analytics/health", opts.adminToken)).json;
    const after = extractViolations(src);
    if (sanityBefore === null || after === null) {
      console.log("\n--assert: /sanity sem violations (PRD 11 não no ar?) → as 7 regras ficam INDETERMINADAS (nunca 'ok' falso)");
    } else {
      const novas = [...after].filter((v) => !sanityBefore.has(v));
      if (novas.length === 0) console.log("\n--assert: nenhuma violação NOVA vs o snapshot inicial ✔ (marcação interna preservou as regras)");
      else console.log(`\n--assert: ✖ VIOLAÇÃO NOVA após o run: ${novas.join(", ")} — investigar (marcação falhou ou bug real)`);
    }
  }

  const failed = results.filter((r) => r.status === "failed").length;
  const oks = results.filter((r) => r.status === "ok").length;
  const skips = results.filter((r) => r.status === "skipped").length;
  console.log(`\nResumo: ${oks} ok, ${skips} skipped, ${failed} falha(s).`);
  printCleanup();
  console.log("⚠ Rode a LIMPEZA acima na VPS e confira V2/V3/V4 do PRD 12 §8.2 (0 linhas).");
  process.exit(failed === 0 ? 0 : 1);
}

// Guarda: só executa como programa; importar no teste NÃO dispara tráfego (PRD 12 §16.10).
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) { await main(); }
