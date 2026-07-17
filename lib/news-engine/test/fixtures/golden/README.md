# Golden set — base permanente de testes de prompt (PRD 05)

Conjunto FIXO de notícias reais usado pelo benchmark A×B de prompts
(`central-hub/src/scripts/benchmark.ts`). Depois de gerado, **não mude os
itens** — é a imutabilidade que permite comparar versões de prompt/modelo ao
longo do tempo. Para ampliar cobertura, adicione um arquivo novo
(`golden-2.json`), nunca edite o existente.

## Como gerar (na VPS, uma vez)

```bash
cd /opt/sp011
docker compose exec -T central-api node dist/scripts/benchmark.mjs collect --limit 40 > golden.json
```

Depois copie o `golden.json` para este diretório e commite. O extrator pega
notícias que JÁ passaram pelo pipeline (status rewritten/distributed, corpo
real ≥400 chars), diversificadas por categoria (round-robin).

## Como rodar o benchmark

```bash
cd /opt/sp011
docker compose exec -T central-api node dist/scripts/benchmark.mjs run \
  --golden /app/lib/news-engine/test/fixtures/golden/golden.json \
  --b /tmp/candidate_pt.txt --limit 20 > relatorio.md
```

(se o caminho do repo dentro da imagem for outro, use qualquer caminho: o
`--golden` aceita arquivo em /tmp, /data etc.)

Formato do item: `{ id, title, description, contentRaw, sourceName, category,
language }` — o mesmo material que o rewriter envia à IA.
