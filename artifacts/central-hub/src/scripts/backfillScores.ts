/**
 * Backfill retroativo das métricas de fidelidade (cobertura, números sem
 * fonte, score) para reescritas criadas ANTES do sistema de qualidade —
 * fecha o buraco da limpeza pós-incidente da janela truncada do Ollama
 * (2026-07): reescritas da era pré-métricas ficavam com fidelity_coverage
 * NULL e escapavam do critério "cobertura < 40".
 *
 * Uso (na VPS, dentro do container central-api):
 *   docker compose exec -T central-api node dist/scripts/backfillScores.mjs --days 12
 *
 * Só CALCULA e persiste métricas (mesma matemática do rewriter.ts) —
 * não muda status, não apaga nada. A limpeza continua sendo o SQL de
 * cobertura < 40 rodado depois.
 */
import { writeFileSync } from "node:fs";
import { fidelityReport, plainTextOf, qualityScore } from "@workspace/news-engine";
import { db, newsItemsTable, rewritesTable } from "@workspace/central-db";
import { and, eq, gte, isNull } from "drizzle-orm";

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function main(): Promise<void> {
  const days = Math.max(1, Math.min(Number(arg("days", "12")), 60));
  const cutoff = new Date(Date.now() - days * 86_400_000);

  const rows = await db
    .select({ rewrite: rewritesTable, news: newsItemsTable })
    .from(rewritesTable)
    .innerJoin(newsItemsTable, eq(newsItemsTable.id, rewritesTable.newsItemId))
    .where(and(
      isNull(rewritesTable.fidelityCoverage),
      eq(rewritesTable.status, "ok"),
      gte(rewritesTable.createdAt, cutoff),
    ));

  let updated = 0;
  const out: string[] = [];
  for (const { rewrite, news } of rows) {
    // Mesma composição do rewriter.ts: cobertura vs feed; números vs material completo
    const rewriteText = `${rewrite.title ?? ""} ${plainTextOf(rewrite.contentHtml ?? "")}`;
    const feedText = `${news.title} ${news.description ?? ""}`;
    const fullSourceText = `${feedText} ${plainTextOf(news.contentRaw ?? "")}`;
    const report = fidelityReport(rewriteText, feedText, fullSourceText);
    const score = qualityScore({ coverage: report.coverage, inventedNumbers: report.inventedNumbers, issues: [] });

    await db
      .update(rewritesTable)
      .set({
        fidelityCoverage: report.coverage,
        inventedNumbers: report.inventedNumbers,
        qualityScore: score,
      })
      .where(eq(rewritesTable.id, rewrite.id));
    updated++;
    if (report.coverage < 40 || report.inventedNumbers.length > 1) {
      out.push(`SUSPEITA cobertura=${report.coverage}% inv=${report.inventedNumbers.length} [${rewrite.blogId ?? "compartilhada"}] ${String(rewrite.title ?? news.title).slice(0, 70)}`);
    }
  }

  out.push(`backfill: ${updated} reescritas pontuadas (janela ${days}d); suspeitas acima.`);
  writeFileSync(1, out.join("\n") + "\n");
}

main().then(() => process.exit(0)).catch((err) => {
  writeFileSync(2, String(err) + "\n");
  process.exit(1);
});
