# Prompt v2 — candidato REPROVADO no benchmark (2026-07-17)

> **Status: REPROVADO — NÃO aplicar.** No benchmark A×B de 2026-07-17
> (20 itens, Ollama dedicado) o candidato perdeu em cobertura (18.4 vs 38.1),
> score (11.9 vs 25.4), números sem fonte (13 vs 8) e issues block (21 vs 17).
> Ganhou só em disciplina de formato (0 ilegíveis vs 3) — vale reaproveitar
> isso num futuro candidato MÍNIMO (uma mudança por vez). Relatório completo:
> `docs/BENCHMARK_PROMPT_V2_2026-07-17.md`. Produção segue no v1.0.0.

`candidate_pt.txt` é o prompt de reescrita fortalecido (F4 dos PRDs 01–05),
gerado a partir do template atual com 3 mudanças cirúrgicas — o estilo
editorial aprovado fica intacto:

1. **Bloco "RESTRIÇÕES DE FIDELIDADE (INVIOLÁVEIS)"** (novo, após a fonte):
   nunca inventar/alterar datas, horários, números, valores, placares,
   estatísticas, nomes, empresas, lugares; nunca conhecimento externo; nunca
   preencher lacunas; notícia em andamento sem frases conclusivas; na dúvida,
   omitir.
2. **Estrutura adaptativa ao tamanho da fonte**: lead 2–3 parágrafos, corpo
   com 1–4 seções conforme o material, FAQ 2–5 perguntas. Resolve o conflito
   do prompt atual (estrutura fixa + "extensão próxima da fonte") que FORÇAVA
   o modelo a inventar para preencher fonte curta.
3. **Régua de extensão explícita**: fonte curta gera matéria curta; proibido
   esticar além do que a fonte sustenta.

## Portão de entrada em produção (PRD 03: só troca com melhoria comprovada)

```bash
# Na VPS — benchmark A (atual) × B (este candidato) no golden set:
cd /opt/sp011
docker cp deploy/prompt-v2/candidate_pt.txt $(docker compose ps -q central-api):/tmp/candidate_pt.txt
docker compose exec -T central-api node dist/scripts/benchmark.mjs run \
  --golden /tmp/golden.json --b /tmp/candidate_pt.txt > /tmp/benchmark_v2.md
```

Critério: B ≥ A em cobertura e score, ≤ A em números sem fonte, falhas e
issues block, duração/tokens na mesma ordem. **Só então** aplicar:

1. Substituir o corpo de `DEFAULT_PROMPT_TEMPLATE` em
   `lib/news-engine/src/prompts.ts` E em
   `artifacts/api-server/src/lib/rssProcessor.ts` (byte-idêntico — o teste
   `prompt-mirror.test.ts` valida).
2. Bump `PROMPT_VERSION` para `2.0.0` (+ changelog no comentário).
3. Espelhar as MESMAS 3 mudanças (traduzidas) no prompt EN de
   `deploy/ksports/sources_en.sql` e rodar o SQL no banco central (o UPDATE
   do arquivo propaga às fontes EN).
4. Commitar o relatório do benchmark em `docs/`.

Rollback: reverter o commit do template (dados novos são opcionais, nada
quebra).
