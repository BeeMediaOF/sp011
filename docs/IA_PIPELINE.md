# IA_PIPELINE.md — Arquitetura da IA de reescrita (inventário + análise)

> Fase 0 do plano dos PRDs 01–05 (`PRD_PromptIA/`). Retrato do sistema em 2026-07-17,
> ANTES das melhorias. Serve de baseline para as fases seguintes e de mapa para auditoria.
> Runbook operacional: `deploy/README.md`. Contexto geral do projeto: `CLAUDE.md`.

## 1. Fluxo ponta a ponta (pipeline ativo = painel central)

```
RSS/scrape → collector → news_items(queued) → rewriter (IA) → rewrites (compartilhada)
  → distributor (regras) → deliveries → localizer (traduz/classifica quando preciso)
  → deliveryWorker (HMAC) → POST /api/ingest do blog → artigo publicado/draft
```

O pipeline interno do blog (`api-server/src/lib/rssProcessor.ts` + `rewriteQueue.ts`) está
DORMENTE desde jul/2026 (todos os blogs são alimentados pela central), mas é o fallback de
emergência e espelha o prompt principal.

## 2. Inventário de prompts (onde cada um vive)

| # | Prompt | Localização | Propósito | Saída |
|---|---|---|---|---|
| 1 | Reescrita PT (`DEFAULT_PROMPT_TEMPLATE`) | `lib/news-engine/src/prompts.ts:10` (espelho byte-idêntico: `api-server/src/lib/rssProcessor.ts:92`) | Reescrita completa SEO/AIO/Discover | JSON: title, subtitle, social_title, social_summary, social_hashtags, content_html, slug, keywords |
| 2 | Reescrita EN (ksports) | `deploy/ksports/sources_en.sql` → coluna `central_sources.custom_prompt` das 33 fontes EN | Mesma reescrita em EN | Mesmo JSON |
| 3 | Tradução+classificação (`TRANSLATION_PROMPT_TEMPLATE`) | `prompts.ts:158`; override em `hub_settings.translationPromptTemplate` | Localizer: traduz reescrita p/ idioma do blog E escolhe categoria na mesma chamada | Mesmo JSON + `category` |
| 4 | Classificação barata (`CLASSIFY_PROMPT_TEMPLATE`) | `prompts.ts:217` | Localizer: só categoria (título+resumo), sem tradução | `{"category":"slug"}` |
| 5 | Autofill SEO manual | `central-hub/src/routes/news.ts:396` (espelho blog: `api-server/src/routes/admin.ts:400`) | Botão "Gerar com IA" do editor manual | JSON: subtitle, summary, tags, seoTitle, metaDesc, slug |
| 6 | Perplexity (fallback/reforço) | `lib/news-engine/src/ai/perplexity.ts:29` (system prompt) | Reescrita quando Ollama/Gemini falham | JSON reduzido (sem social_summary/hashtags) |
| 7 | Legenda social viral | `central-hub/src/lib/social/caption.ts:39`; override `socialCaptionPromptTemplate` | Automação Social (repost TikTok/IG) | Texto estruturado |

**Hierarquia de resolução do prompt de reescrita** (`resolvePrompt`, `prompts.ts:238`):
`central_sources.custom_prompt` > `rss_prompts.categories[cat]` > `rss_prompts.global` >
`DEFAULT_PROMPT_TEMPLATE`. O blob `rss_prompts` vive em `central_settings`.

**Entrada enviada à IA** (`applyPromptTemplate`): título do feed + nome da fonte +
`contentRaw ?? description` truncado em **7.000 chars** (tradução: 20.000). Scrape já limita
em 8.000 (`scrape.ts`).

**Parâmetros por provider** (`ai/rewrite.ts`): Ollama `response_format json_object`,
`max_tokens 8192`, timeout 5 min; Gemini `maxOutputTokens 8192`; Perplexity `sonar`,
`max_tokens 2000`, `temperature 0.6` (único com temperature fixa). Provider primário em
produção: **Ollama qwen2.5:7b-instruct em CPU** (~1 artigo/min); fallback Gemini pool →
Perplexity; lane de reforço (boost) paralela.

## 3. Máquina de estados

### `news_items.status`
`collected | queued | rewriting | rewritten | distributed | failed | discarded`

- insert → `queued` (texto ≥400 chars) ou `collected` (curto demais; segura o dedup)
- `queued → rewriting` (claim) → `rewritten` (gate ok) → `distributed`
- `rewriting → failed` (gates/erro) ou `→ queued` (requeue por quota/provider)
- `discarded` = descarte manual

### `deliveries.status`
`awaiting_localization | localizing | awaiting_approval | pending | delivering | delivered |
duplicate | failed | dead | cancelled`

- distributor cria: `awaiting_localization` (traduzir/classificar) | `awaiting_approval`
  (blog exige aprovação) | `pending`
- localizer: `awaiting_localization → localizing → pending/awaiting_approval` (ou defer)
- worker: `pending → delivering → delivered | duplicate | failed (4xx) | pending (retry
  1m→5m→15m→1h→6h) | dead (5 tentativas) | cancelled (blog inativo)`

## 4. Códigos de `fail_reason` (news_items) — enum informal

| Código | Onde | Significado |
|---|---|---|
| `no_content` | collector | Item sem texto e sem imagem |
| `short_content` | collector | Texto <400 chars — registrado só p/ dedup, não entra na fila |
| `thin_source` | rewriter (pré-IA) | Fonte com <80 chars visíveis — NÃO chama IA (anti-alucinação) |
| `unrenderable` | rewriter | Resposta da IA inextraível (`extractFromRawAI` = null) |
| `short_rewrite` | rewriter | Reescrita com <700 chars visíveis após 3 tentativas |
| `off_topic_rewrite` | rewriter | Reescrita sem termos em comum com a fonte após 3 tentativas (gate anti-alucinação) |
| (texto livre) | rewriter | Mensagem de erro crua truncada em 500 chars (falha genérica) |
| `audit_rejected` | (reservado, Fase 5) | IA Auditora reprovou com invenção confirmada |
| `pausa_prioridade_creditovc` | (operacional) | Parqueamento manual durante a pausa da rede |

## 5. Gates de qualidade existentes (2026-07-17)

Central (`central-hub/src/services/rewriter.ts` + `lib/news-engine/src/quality.ts`):
- **Pré-IA**: `MIN_SOURCE_PLAIN_CHARS = 80` → `thin_source` (incidente "Três Moços").
- **Pós-IA**: `extractFromRawAI` (unrenderable) → `MIN_REWRITE_PLAIN_CHARS = 700`
  (short_rewrite) → `rewriteMatchesSource` (off_topic: 2 termos distintivos em comum com
  título+descrição do feed) → `bestSocialTitle` (manchete social sem palavra inventada).
- Dedup: guid/URL/título normalizado (SQL) + overlap 0.65 nos 500 títulos recentes.
- Localizer: `matchCategorySlug` valida a categoria devolvida pela IA contra a taxonomia;
  inválida/indecisa → fallback `others`/último slug; provider fora do ar adia (não decide).
- Ingest do blog: HMAC + anti-replay 300s, idempotência por `centralId`, dedup local
  (título/URL/imagem + overlap), sem imagem → draft `no_image`.

Blog dormente (`rewriteQueue.ts`): APENAS `extractFromRawAI`/`isContentRenderable` — sem
thin_source, sem off_topic, sem guarda de social_title (espelhar na Fase 7).

## 6. Análise crítica do prompt de reescrita (baseline da v2)

Pontos fortes: papel/tarefa claros; instruções por campo; JSON estruturado com formato de
resposta explícito; regras de estilo detalhadas (parágrafos curtos, sem travessão, sem cara
de IA); tratamento de citações com fidelidade; regras do social_title maduras (aprendizado
do incidente "garantivaga"); linha de crédito parametrizada.

Pontos fracos (o que a v2 corrige — só após benchmark A×B):
1. **Regras anti-invenção dispersas**: "nunca invente dados" aparece em 1 linha da seção de
   CITAÇÕES; não há lista explícita NUNCA-alterar (datas, horários, nomes, números,
   estatísticas, placares, locais, empresas) nem proibição de conhecimento externo/preencher
   lacunas.
2. **Conflito estrutural que FORÇA alucinação**: a estrutura é fixa (lead 3 parágrafos + até
   4 seções `<h3>` + FAQ 3–5) mas a régua de tamanho manda "extensão próxima da fonte" —
   com fonte curta o modelo precisa inventar para preencher a estrutura. (Suspeito nº 1 da
   invenção em fontes de scrape parcial entre 80 e ~1.500 chars.)
3. **Sem regra para notícia em andamento** ("ao vivo", "em atualização") — o modelo produz
   frases conclusivas indevidas.
4. **Sem versionamento**: nenhuma versão/data/changelog; impossível correlacionar qualidade
   com versão de prompt no banco.
5. **Tamanhos não verificados**: título 70–110, subtitle ~150, social_title 70–85 são só
   instrução; nada é checado em código (Fase 1 cria a validação).
6. `subtitle` faz papel de meta description no blog (`Artigo.tsx:169`, corte em 160) — o
   prompt pede ~150 chars, compatível, mas sem validação nem menção a esse papel.

## 7. Mapa PRD → estado atual

| Pedido do PRD | Status | Onde/observação |
|---|---|---|
| Prompt com restrições anti-alucinação explícitas | Parcial → F4 | Hoje disperso (§6.1) |
| JSON estruturado | OK | Todos os prompts |
| Categoria + confiança na IA | Parcial → F4 | Categoria já é per-blog no localizer; confiança não existe |
| Score de qualidade | Ausente → F1/F2 | Calculado em CÓDIGO (decisão: 7B não se auto-avalia) |
| Validação estrutural em código | Parcial → F1/F2 | Só slug (`trimSlug`) e gates de tamanho do corpo |
| Validação semântica de categoria | OK | `matchCategorySlug` + fallback residual |
| Slug único no blog | Ausente → F7 | Índice não-único, sem sufixação |
| HTML sanitizado na entrada | Ausente → F7 | Só no render (DOMPurify/SSR) |
| Dedup hash+similaridade | Parcial | guid/URL/título+overlap; sem hash de corpo (aceito) |
| IA Auditora só quando necessário | Ausente → F5 | Gemini, gatilhos borderline, nunca reescreve |
| Casos especiais (RSS incompleto, curta, em andamento, promocional) | Parcial → F1/F4 | thin_source cobre incompleto; resto novo |
| Logging de decisões | Parcial → F2 | `central_event_logs` ad-hoc; sem score/versão/duração |
| Dashboard de qualidade | Ausente → F6 | `/stats/quality` + página |
| Modo shadow | Substituído → F3 | Benchmark offline com golden set (Ollama CPU não aguenta 2×) |
| Golden set permanente | Ausente → F3 | `lib/news-engine/test/fixtures/golden/` |
| Versionamento de prompts | Ausente → F4 | `PROMPT_VERSION` + changelog + coluna em rewrites |
| Configs parametrizáveis | Ausente → F2 | Thresholds hoje hardcoded (80/700/400/0.65/3) |
| Rollback simples | → F2/F5 | `validationMode: off/log/enforce` via settings, sem deploy |

## 8. Observabilidade atual

- `ai_usage_events`: provider, model, keyHint, tokens, purpose (`rewrite|translate|classify|
  caption|autofill`) — SÓ sucesso, SEM duração (F2 adiciona `duration_ms`, `ok`, `error_kind`
  e o purpose `audit`).
- `rewrites`: provider/model/attempts/status/errorMessage — sem score/versão/duração (F2).
- `central_event_logs`: pino + `logEvent()` por módulo (ad-hoc).
- `delivery_attempts`: única duração medida hoje (HTTP central→blog).
- UI: Dashboard (`/stats`), Notícias (badge failReason), Revisão (aprovação humana), Consumo
  (`/usage`, sem filtro de purpose), Logs. Sem visão agregada de fail_reason (F6).
