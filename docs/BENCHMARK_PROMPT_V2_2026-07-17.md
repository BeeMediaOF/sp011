# Benchmark A×B — prompt v1.0.0 (produção) × candidato v2 — 2026-07-17

**Veredito: REPROVADO. O prompt de produção continua o v1.0.0.**
O candidato (`deploy/prompt-v2/candidate_pt.txt`) NÃO deve ser aplicado.

## Método

- Golden set: 20 notícias reais pt-BR do banco central (≥400 chars de fonte,
  round-robin de categorias), colhido com `dist/scripts/benchmark.mjs collect`.
- Execução: `benchmark.mjs run` na VPS, Ollama `qwen2.5:7b-instruct` DEDICADO
  (reescrita de produção pausada durante a rodada — rodada anterior com
  contenção foi descartada). Sem fallback Gemini. Sequencial, A e B sobre os
  mesmos itens.
- Métricas em código (news-engine `score.ts`/`validate.ts`): cobertura de
  termos distintivos do feed, números sem fonte (vs material completo),
  issues block/warn, score 0–100.

## Resultado

| métrica | A: current (v1.0.0) | B: candidate_pt.txt |
|---|---|---|
| reescritas ok | 17/20 | 20/20 |
| falhas/ilegíveis | 3 | 0 |
| cobertura média % | 38.1 | 18.4 |
| score médio | 25.4 | 11.9 |
| itens c/ nº sem fonte | 8 | 13 |
| issues block | 17 | 21 |
| issues warn | 21 | 26 |
| chars visíveis méd. | 1522.5 | 1287.5 |
| título méd. (chars) | 60.3 | 57.4 |
| duração média (s) | 156.8 | 138.6 |
| tokens médios | 3467.2 | 3226.1 |

Critério de aceite (PRD 03): B ≥ A em cobertura e score, ≤ A em números sem
fonte, falhas/ilegíveis e issues block, duração/tokens na mesma ordem.
**B perdeu em cobertura (18.4 vs 38.1), score (11.9 vs 25.4), números sem
fonte (13 vs 8 itens) e issues block (21 vs 17).** Ganhou apenas em
confiabilidade de formato (20/20 ok, zero ilegíveis) e ficou ~12% mais
rápido/curto.

## Leitura do resultado

1. **Hipótese principal: sobrecarga de instruções no 7B.** O candidato somou
   um bloco de restrições + estrutura adaptativa + régua de extensão. O
   qwen2.5:7b em vez de obedecer melhor, ficou MAIS genérico: menos termos da
   fonte (cobertura caiu pela metade) e MAIS números sem fonte — o oposto do
   objetivo. O risco previsto no plano ("qwen ignora instruções novas")
   se materializou de forma mensurável. O gate impediu o deploy.
2. **Viés de sobrevivência favorece A** (médias só dos 17 ok), mas o gap de
   cobertura (2×) é grande demais para ser só isso.
3. **Ganho real do B a reaproveitar**: 0 falhas de parse (vs 3 do A). Algo no
   candidato melhorou a disciplina de formato JSON — vale isolar essa parte
   num futuro candidato mínimo.
4. **Itens com cobertura ~0% NAS DUAS variantes** (ex.: "Uso de IA nas
   eleições", "tarifaço dos EUA", "Arábia Saudita/Houthis"): o problema é do
   item/fonte ou da métrica, não do prompt — a reescrita não repete nenhum
   termo distintivo do título+descrição do feed. Investigar na calibração
   (modo log em produção): olhar o texto real desses casos na página
   Qualidade IA antes de fixar `fidelityMinCoverage`.

## Próximos passos

- Manter `PROMPT_VERSION = "1.0.0"`; candidato arquivado como reprovado
  (`deploy/prompt-v2/README.md`).
- Calibração em produção (modo log) segue normal — os thresholds serão
  fixados com dados reais, não com este benchmark.
- Se/quando houver novo candidato (**v2.1**): mudança MÍNIMA (só o bloco de
  fidelidade OU só a estrutura adaptativa, não tudo junto), re-rodar este
  mesmo benchmark (golden set é fixo — comparável entre rodadas).
- Gatilho de prioridade externa: se a revisão do Safe Browsing do resenhavip
  for negada, variação de reescrita por blog passa na frente de qualquer v2.1.

## Reproduzir

```bash
cd /opt/sp011
docker cp deploy/prompt-v2/candidate_pt.txt $(docker compose ps -q central-api):/tmp/candidate_pt.txt
docker compose exec -T central-api node dist/scripts/benchmark.mjs collect --limit 20 --language pt-BR --out /tmp/golden.json
docker compose exec -T central-api node dist/scripts/benchmark.mjs run --golden /tmp/golden.json --b /tmp/candidate_pt.txt --limit 20 --out /tmp/benchmark_v2.md
docker compose exec -T central-api cat /tmp/benchmark_v2.md
```

⚠️ Pausar a reescrita da produção durante a rodada (Ollama é fila única) —
senão a contenção contamina os tempos e derruba a qualidade das duas
variantes.
