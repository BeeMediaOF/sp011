# @workspace/news-engine

Lógica **pura** do pipeline de notícias (coleta RSS, scraping, prompts, reescrita
por IA com rodízio de chaves Gemini, parsing/quality-gate, dedup, criptografia e
assinatura HMAC do canal central→blog), extraída do `artifacts/api-server` para
ser consumida pelo painel central (`artifacts/central-hub`) sem acoplamento ao
banco/estado do blog.

## Origem dos módulos (cópias adaptadas — o blog continua com as versões dele)

| Módulo | Copiado de | Adaptação |
|---|---|---|
| `prompts.ts` | `api-server/src/lib/rssProcessor.ts` | blob de prompts vira parâmetro |
| `scrape.ts` | idem | `diffbotApiKey`/User-Agent viram parâmetros |
| `rss.ts` | idem | `EngineSource` próprio; limite default vira parâmetro; captura `guid` |
| `ai/geminiPool.ts` | idem (rodízio de chaves) | factory com estado encapsulado + **TokenUsage** via `usageMetadata` |
| `ai/rewrite.ts` | idem (`rewriteWithAI`) | provider/chaves/modelo injetados |
| `quality.ts` | `api-server/src/lib/rewriteQueue.ts` | cópia direta (funções puras) |
| `dedup.ts` | `api-server/src/lib/articleService.ts` | só a parte pura (normalização + overlap); a query SQL fica em cada app |
| `crypto.ts` | `api-server/src/lib/crypto.ts` | logger vira `console`; mesmo envelope `enc:v1:` e salt |
| `signing.ts` | (novo) | HMAC-SHA256 de `${timestamp}.${rawBody}` p/ o endpoint `/api/ingest` |

> **Atenção (drift):** durante o piloto, o api-server do blog mantém as cópias
> originais desses módulos. Correções de comportamento feitas de um lado devem
> ser replicadas no outro até o cutover (depois do cutover o pipeline local do
> blog fica dormente). Ver plano: riscos, item 5.
