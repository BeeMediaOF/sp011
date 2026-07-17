/**
 * Benchmark offline de prompt de reescrita (F3 dos PRDs 01–05) — substitui o
 * "modo shadow" do PRD 04: em vez de reescrever tudo 2x em produção (Ollama em
 * CPU não aguenta dobrar), roda um GOLDEN SET fixo de notícias reais contra
 * o prompt atual (A) × candidato (B) e compara métricas DE CÓDIGO. Critério
 * do PRD 03: só trocar o prompt com melhoria comprovada.
 *
 * Uso (na VPS, dentro do container central-api):
 *   # 1. Extrair golden set de notícias reais do banco (uma vez; commitar depois)
 *   docker compose exec -T central-api node dist/scripts/benchmark.mjs collect --limit 40 > golden.json
 *
 *   # 2. Rodar A×B (B = arquivo com o template candidato; A default = atual)
 *   docker compose exec -T central-api node dist/scripts/benchmark.mjs run \
 *     --golden /data/golden.json --b /data/candidate.txt --limit 20
 *
 * Sem escrita no banco no modo run; provider/modelo vêm das Configurações da
 * central (override por --provider/--model). Fallback Gemini fica DESLIGADO
 * no benchmark: a medição é do provider alvo, sem troca silenciosa.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  DEFAULT_PROMPT_TEMPLATE,
  extractFromRawAI,
  fidelityReport,
  plainTextLength,
  plainTextOf,
  qualityScore,
  rewriteNews,
  validateRewrite,
  type RewriteEngineConfig,
  type ValidationIssue,
} from "@workspace/news-engine";
import { db, newsItemsTable, centralSourcesTable } from "@workspace/central-db";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { initStore, getSettings } from "../lib/store.js";
import { getGeminiPool } from "../lib/aiPool.js";

interface GoldenItem {
  id: string;
  title: string;
  description: string | null;
  contentRaw: string | null;
  sourceName: string;
  category: string;
  language: string;
}

interface RunMetrics {
  ok: boolean;
  error?: string;
  coverage?: number;
  invented?: number;
  score?: number;
  issues?: ValidationIssue[];
  bodyChars?: number;
  titleLen?: number;
  durationMs: number;
  totalTokens?: number;
}

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

// ── collect: extrai notícias reais variadas para o fixture ───────────────────
async function collect(): Promise<void> {
  const limit = Math.max(1, Math.min(Number(arg("limit", "40")), 200));
  const rows = await db
    .select({
      id: newsItemsTable.id,
      title: newsItemsTable.title,
      description: newsItemsTable.description,
      contentRaw: newsItemsTable.contentRaw,
      sourceName: newsItemsTable.sourceName,
      category: newsItemsTable.category,
      language: centralSourcesTable.language,
    })
    .from(newsItemsTable)
    .leftJoin(centralSourcesTable, eq(centralSourcesTable.id, newsItemsTable.sourceId))
    .where(and(
      inArray(newsItemsTable.status, ["rewritten", "distributed"]),
      isNotNull(newsItemsTable.contentRaw),
    ))
    .orderBy(desc(newsItemsTable.createdAt))
    .limit(limit * 4);

  // Diversifica por categoria (round-robin) e exige fonte com corpo real
  const byCat = new Map<string, GoldenItem[]>();
  for (const r of rows) {
    if (plainTextLength(r.contentRaw ?? "") < 400) continue;
    const item: GoldenItem = { ...r, language: r.language ?? "pt-BR" };
    const list = byCat.get(r.category) ?? [];
    list.push(item);
    byCat.set(r.category, list);
  }
  const picked: GoldenItem[] = [];
  const lists = [...byCat.values()];
  for (let round = 0; picked.length < limit; round++) {
    let added = false;
    for (const list of lists) {
      const it = list[round];
      if (it && picked.length < limit) { picked.push(it); added = true; }
    }
    if (!added) break;
  }

  const json = JSON.stringify(picked, null, 2);
  const out = arg("out");
  // Sem --out: escrita SÍNCRONA no fd 1 — console.log + process.exit trunca
  // stdout em 64 KiB (golden.json saía cortado no meio de uma string) e o
  // pino também loga no stdout, sujando o JSON redirecionado. Prefira --out.
  if (out) { writeFileSync(out, json); console.error(`golden set: ${picked.length} itens → ${out}`); }
  else writeFileSync(1, json + "\n");
}

// ── run: A×B no golden set ────────────────────────────────────────────────────
function loadTemplate(spec: string): { label: string; template: string } {
  if (spec === "current") return { label: "current (v. em produção)", template: DEFAULT_PROMPT_TEMPLATE };
  return { label: spec, template: readFileSync(spec, "utf8") };
}

function engineCfg(): RewriteEngineConfig {
  const s = getSettings();
  const provider = (arg("provider") ?? s.aiProvider) as "gemini" | "openai" | "ollama";
  const model = arg("model") ?? s.aiModel;
  if (provider === "ollama") {
    return {
      provider, model,
      ollamaBaseUrl: s.ollamaBaseUrl || process.env["OLLAMA_BASE_URL"] || "http://ollama:11434",
      geminiPool: getGeminiPool(),
      fallbackToGemini: false, // benchmark mede o provider alvo, sem troca silenciosa
    };
  }
  if (provider === "openai") {
    return { provider, model, openaiApiKey: s.openaiApiKey, openaiBaseUrl: s.openaiBaseUrl };
  }
  return { provider: "gemini", model, geminiPool: getGeminiPool() };
}

async function runOne(item: GoldenItem, template: string, cfg: RewriteEngineConfig): Promise<RunMetrics> {
  const t0 = Date.now();
  try {
    const out = await rewriteNews(
      {
        title: item.title,
        text: item.contentRaw ?? item.description ?? "",
        sourceName: item.sourceName,
        giveCredit: false,
        promptTemplate: template,
      },
      cfg,
    );
    const durationMs = Date.now() - t0;
    const extracted = extractFromRawAI(out.content);
    if (!extracted) return { ok: false, error: "unrenderable", durationMs, totalTokens: out.usage?.totalTokens };

    const feedText = `${item.title} ${item.description ?? ""}`;
    const fullText = `${feedText} ${plainTextOf(item.contentRaw ?? "")}`;
    const rewriteText = `${out.title || extracted.title || ""} ${plainTextOf(extracted.content)}`;
    const report = fidelityReport(rewriteText, feedText, fullText);
    const issues = validateRewrite(extracted, fullText);
    return {
      ok: true,
      coverage: report.coverage,
      invented: report.inventedNumbers.length,
      score: qualityScore({ coverage: report.coverage, inventedNumbers: report.inventedNumbers, issues }),
      issues,
      bodyChars: plainTextLength(extracted.content),
      titleLen: (out.title || extracted.title || "").length,
      durationMs,
      totalTokens: out.usage?.totalTokens,
    };
  } catch (err) {
    return { ok: false, error: String(err).slice(0, 120), durationMs: Date.now() - t0 };
  }
}

function avg(ns: number[]): number {
  return ns.length ? Math.round((ns.reduce((a, b) => a + b, 0) / ns.length) * 10) / 10 : 0;
}

function summarize(label: string, runs: RunMetrics[]): Record<string, string | number> {
  const ok = runs.filter((r) => r.ok);
  const issueCount = (sev: "block" | "warn") =>
    ok.reduce((n, r) => n + (r.issues?.filter((i) => i.severity === sev).length ?? 0), 0);
  return {
    variante: label,
    "reescritas ok": `${ok.length}/${runs.length}`,
    "falhas/ilegíveis": runs.length - ok.length,
    "cobertura média %": avg(ok.map((r) => r.coverage ?? 0)),
    "score médio": avg(ok.map((r) => r.score ?? 0)),
    "itens c/ nº sem fonte": ok.filter((r) => (r.invented ?? 0) > 0).length,
    "issues block": issueCount("block"),
    "issues warn": issueCount("warn"),
    "chars visíveis méd.": avg(ok.map((r) => r.bodyChars ?? 0)),
    "título méd. (chars)": avg(ok.map((r) => r.titleLen ?? 0)),
    "duração média (s)": avg(runs.map((r) => r.durationMs / 1000)),
    "tokens médios": avg(runs.filter((r) => r.totalTokens).map((r) => r.totalTokens!)),
  };
}

async function run(): Promise<void> {
  const goldenPath = arg("golden");
  if (!goldenPath) { console.error("uso: run --golden <arquivo.json> [--a current|arq] [--b arq] [--limit N]"); process.exit(1); }
  await initStore();

  const limit = Number(arg("limit", "0"));
  const language = arg("language", "pt-BR");
  let golden = (JSON.parse(readFileSync(goldenPath, "utf8")) as GoldenItem[])
    .filter((g) => !language || g.language === language);
  if (limit > 0) golden = golden.slice(0, limit);
  if (golden.length === 0) { console.error("golden set vazio (confira --language)"); process.exit(1); }

  const variants = [loadTemplate(arg("a", "current")!)];
  const b = arg("b");
  if (b) variants.push(loadTemplate(b));
  const cfg = engineCfg();

  console.error(`Benchmark: ${golden.length} itens × ${variants.length} variante(s), provider ${cfg.provider} — sequencial, pode demorar.`);
  const results = new Map<string, RunMetrics[]>();
  for (const v of variants) results.set(v.label, []);
  for (let i = 0; i < golden.length; i++) {
    for (const v of variants) {
      const m = await runOne(golden[i]!, v.template, cfg);
      results.get(v.label)!.push(m);
      console.error(`[${i + 1}/${golden.length}] ${v.label === variants[0]!.label ? "A" : "B"} ` +
        `${m.ok ? `ok cobertura=${m.coverage}% score=${m.score} inv=${m.invented}` : `FALHA ${m.error}`} (${Math.round(m.durationMs / 1000)}s)`);
    }
  }

  // Relatório markdown — montado em memória e escrito de forma SÍNCRONA
  // (--out ou fd 1): console.log + process.exit trunca stdout em 64 KiB e o
  // pino loga no stdout (o "Store central inicializado" sujava o arquivo).
  const rows = variants.map((v) => summarize(v.label, results.get(v.label)!));
  const keys = Object.keys(rows[0]!);
  const md: string[] = [];
  md.push(`# Benchmark de prompt — ${golden.length} itens (${language}), provider ${cfg.provider}\n`);
  md.push(`| métrica | ${rows.map((r) => r["variante"]).join(" | ")} |`);
  md.push(`|---|${rows.map(() => "---").join("|")}|`);
  for (const k of keys.filter((k) => k !== "variante")) {
    md.push(`| ${k} | ${rows.map((r) => r[k]).join(" | ")} |`);
  }
  md.push("\n## Piores itens por variante (score)");
  for (const v of variants) {
    const worst = results.get(v.label)!
      .map((m, i) => ({ m, title: golden[i]!.title }))
      .filter((x) => x.m.ok)
      .sort((a, b2) => (a.m.score ?? 0) - (b2.m.score ?? 0))
      .slice(0, 5);
    md.push(`\n### ${v.label}`);
    for (const w of worst) md.push(`- score ${w.m.score}, cobertura ${w.m.coverage}%, nº sem fonte ${w.m.invented}: ${w.title.slice(0, 90)}`);
  }
  md.push("\n## Critério de aceite (PRD 03)");
  md.push("Só substitua o prompt se B ≥ A em cobertura e score, ≤ A em números sem fonte,");
  md.push("falhas/ilegíveis e issues block, com duração/tokens na mesma ordem de grandeza.");

  const report = md.join("\n") + "\n";
  const outPath = arg("out");
  if (outPath) { writeFileSync(outPath, report); console.error(`relatório → ${outPath}`); }
  else writeFileSync(1, report);
}

const cmd = process.argv[2];
if (cmd === "collect") collect().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
else if (cmd === "run") run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
else { console.error("uso: benchmark.mjs <collect|run> [opções] (ver cabeçalho do arquivo)"); process.exit(1); }
