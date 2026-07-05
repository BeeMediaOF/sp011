#!/usr/bin/env node
/**
 * Teste de integração do POST /api/ingest do blog (F4).
 *
 * Uso:
 *   CENTRAL_INGEST_SECRET=<segredo> node scripts/test-ingest.mjs [baseUrl]
 *
 * `baseUrl` padrão: http://localhost:8080/api
 * O segredo precisa ser o MESMO configurado no blog (settings.centralIngestSecret
 * ou env CENTRAL_INGEST_SECRET do api-server).
 *
 * Casos cobertos: probe (GET), test (ping assinado), created, replay,
 * duplicate, assinatura inválida (401), timestamp velho (401).
 */
import { createHmac, randomUUID } from "node:crypto";

const BASE = (process.argv[2] ?? "http://localhost:8080/api").replace(/\/+$/, "");
const SECRET = process.env.CENTRAL_INGEST_SECRET ?? "";

if (!SECRET) {
  console.error("Defina CENTRAL_INGEST_SECRET com o segredo configurado no blog.");
  process.exit(1);
}

let failures = 0;

function sign(secret, timestamp, rawBody) {
  const h = createHmac("sha256", secret);
  h.update(`${timestamp}.`);
  h.update(Buffer.from(rawBody, "utf8"));
  return h.digest("hex");
}

async function post(path, payload, { secret = SECRET, timestampOffsetMs = 0 } = {}) {
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Math.floor((Date.now() + timestampOffsetMs) / 1000));
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Central-Api-Version": "1",
      "X-Central-Timestamp": timestamp,
      "X-Central-Signature": sign(secret, timestamp, rawBody),
    },
    body: rawBody,
  });
  let body = {};
  try { body = await res.json(); } catch { /* vazio */ }
  return { status: res.status, body };
}

function check(name, ok, detail) {
  const mark = ok ? "✔" : "✖";
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const centralId = randomUUID();
const article = {
  title: `Teste de ingestão central ${centralId.slice(0, 8)} com título longo o bastante para o dedup`,
  subtitle: "Subtítulo do teste de integração do painel central",
  contentHtml: "<h2>Teste</h2><p>Conteúdo de teste enviado pelo script test-ingest.mjs. Pode apagar.</p>",
  category: "geral",
  imageUrl: "https://picsum.photos/seed/" + centralId.slice(0, 8) + "/800/450",
  sourceName: "Script de Teste",
  sourceUrl: `https://exemplo.test/noticia-${centralId.slice(0, 8)}`,
  keywords: "teste, ingest",
};
const payload = { v: 1, deliveryId: randomUUID(), centralId, mode: "draft", article };

// 1. Probe sem auth
const probe = await fetch(`${BASE}/ingest`);
check("GET /ingest (probe)", probe.status === 200);

// 2. Ping assinado
const ping = await post("/ingest/test", { v: 1, ping: 123 });
check("POST /ingest/test (ping assinado)", ping.status === 200 && ping.body.pong === 123, `status=${ping.status}`);

// 3. Criação
const created = await post("/ingest", payload);
check("created", created.status === 201 && created.body.result === "created",
  `status=${created.status} result=${created.body.result} articleId=${created.body.articleId ?? "-"}`);

// 4. Replay (mesmo centralId → nunca duplica)
const replay = await post("/ingest", payload);
check("replay (idempotência)", replay.status === 200 && replay.body.result === "replay",
  `status=${replay.status} result=${replay.body.result}`);

// 5. Duplicate (outro centralId, mesmo título/URL → dedup local)
const dup = await post("/ingest", { ...payload, centralId: randomUUID(), deliveryId: randomUUID() });
check("duplicate (dedup local)", dup.status === 200 && dup.body.result === "duplicate",
  `status=${dup.status} result=${dup.body.result}`);

// 6. Assinatura inválida
const badSig = await post("/ingest", { ...payload, centralId: randomUUID() }, { secret: "segredo-errado" });
check("assinatura inválida → 401", badSig.status === 401, `status=${badSig.status} error=${badSig.body.error}`);

// 7. Timestamp fora da janela (−10 min)
const oldTs = await post("/ingest", { ...payload, centralId: randomUUID() }, { timestampOffsetMs: -600_000 });
check("timestamp velho → 401", oldTs.status === 401 && oldTs.body.error === "timestamp_skew",
  `status=${oldTs.status} error=${oldTs.body.error}`);

console.log(failures === 0 ? "\nTodos os casos passaram." : `\n${failures} caso(s) falharam.`);
process.exit(failures === 0 ? 0 : 1);
