# PRD 12 — Plano de testes e validação (gate de rollout)

> **O que é este documento.** PRD de implementação, escrito para ser consumido pelo
> Claude Code numa sessão futura SEM o contexto da auditoria — autocontido: dá para
> executar lendo só este arquivo. Fontes: `analytics-audit/00-auditoria-estado-atual.md`
> (Fase 0.2), `analytics-audit/00-inventario.md` (mapa; §8 tem correções de linha),
> `analytics-audit/STATUS.md` (FRONTEIRAS), `PRD_ANALYTICS_PLANEJAMENTO_v2.md` (módulo 12),
> `docs/ANALYTICS.md` + `docs/ANALYTICS-VALIDACAO.md` (roteiro manual existente) e
> CLAUDE.md §§5, 6, 12, 14, 17. Evidências `arquivo:linha` reabertas na sessão de
> escrita (2026-07-23), salvo "(cf. auditoria)"/"(cf. PRD NN)". **Passe de revisão
> adversarial (2026-07-23)**: reabertos `routes/analytics.ts`, `routes/ads.ts`,
> `lib/trafficGuard.ts`, `lib/analyticsShared.ts`, os `package.json` de
> `api-server`/`brasilia-agora`, `scripts/test-ingest.mjs` e
> `docs/ANALYTICS-VALIDACAO.md` — correções aplicadas em §2.1, §2.2, RF3, §7, §8 e §11
> (marcação de teste por endpoint, runner do pacote web, faixa de linhas do roteiro).
>
> **2º passe adversarial (2026-07-23, 3 revisores independentes) — VEREDITO:
> APROVADO COM CORREÇÕES.** 41 achados brutos (9 alta, 23 média, 9 baixa), muitos
> convergentes entre revisores. Correções materiais aplicadas neste arquivo:
> **(1)** RF2/CA2 — a suite L2 NÃO pode importar `routes/analytics.ts`: o módulo inicia
> um `setInterval(30s)` no topo, sem `.unref()` (`analytics.ts:120`, reaberto e
> confirmado), e `node --test` nunca terminaria; a suite importa o handler EXTRAÍDO
> (módulo sem timer). **(2)** RF3.4/CA7 — `GET /api/analytics/sanity` é cache do monitor
> de 15 min (PRD 11 RF3), não avaliação sob demanda: snapshot antes×depois no MESMO run
> pode ser tautológico e o snapshot inicial NÃO é "saudável" (a §9.6 da auditoria mostra
> violações reais já no dado bruto) — a asserção foi reescrita. **(3)** RF3.6 P2/P4/P5 —
> oráculos que diziam "agregação" são impossíveis com tráfego 100% interno (todo `/stats`
> filtra `is_internal=false`): reescritos para "linha gravada"; a agregação (MAX, dedup)
> é asserção de L1/L2. **(4)** RF3.5/§13 — a limpeza `DELETE FROM ads` ganhou guarda
> contra apagar anúncio real, e RF3.2 passou a avisar que o anúncio de teste ATIVO é
> inventário público enquanto o run durar. **(5)** §8.3 e rótulos — o Anexo A FOI
> executado (auditoria §9); os números deixam de ser "Hipótese". Correções menores: nome
> do canário "Resenha Vip" (não "VIP"), título do RF3.5 (`--cleanup-only`),
> `ads_reliable_since` é chave de `settings` (não coluna), ressalva do `git grep` só
> rastreados, pausa de rate limit entre P13→P14 (P13 reordenado para último), baseline
> pré-bump no gate, ressalva de Node no host da VPS. Achados de menor severidade
> (cobertura parcial de regras, superfícies não-limpáveis por SQL, contradições de
> texto) consolidados no **§16 (Apêndice do 2º passe)**; nenhum exigiu reescrita
> estrutural. 3 achados foram REJEITADOS por não se sustentarem (registrados no §16).
>
> **Princípio obrigatório:** volume baixo NÃO é bug — os blogs são novos. Bug é o que
> for logicamente incorreto ou inconsistente, independente do volume. Corolário para
> testes: um teste NUNCA afirma "número deveria ser maior"; afirma "número é
> logicamente consistente" (identidade preservada, invariante respeitada).
>
> **Multi-blog:** os 8 blogs rodam a MESMA imagem `blog-api:vN`/`blog-web:vN`
> (CLAUDE.md §6). Este plano roda antes de CADA rollout de qualquer PRD desta série —
> é o gate que impede que uma correção quebre a rede inteira de uma vez. Nada
> condicionado a BLOG_ID.
>
> **Encurtamentos:** `api = artifacts/api-server/src`, `web = artifacts/brasilia-agora/src`,
> `db = lib/db/src`.

---

## 1. Objetivo

Definir a estratégia de teste e validação de toda a série de PRDs de analytics,
dentro das limitações reais do repositório (CLAUDE.md §14), e servir de **gate
obrigatório antes de cada rollout**. Entregáveis:

1. **Estratégia em camadas** — o que é `node --test` (função pura), o que é teste de
   ROTA com I/O (hoje ZERO cobertura em `routes/analytics.ts` e `routes/ads.ts`), e o
   que é validação de sistema (HTTP + SQL na VPS).
2. **Decisão explícita sobre testar rotas com I/O**: extrair o núcleo decisório das
   rotas para funções puras (padrão que o repo já usa) + teste de rota fino com `db`
   injetável — especificado no §4.
3. **Script de tráfego sintético** cobrindo os 25 itens da checklist e as 7 regras do
   PRD 11, com **marcação de teste inequívoca** e limpeza — nunca poluir dados reais.
4. **Roteiro de validação pós-rollout por blog** — atualização de
   `docs/ANALYTICS-VALIDACAO.md` com os cenários dos itens corrigidos.
5. **Definição do gate**: checklist que TEM de passar antes do bump de
   `BLOG_IMAGE_VERSION` de qualquer PRD desta série.

Itens da checklist do doc v2 cobertos: **todos os 25** (mapa item→passo no §4/RF3.6)
e as **7 regras do PRD 11** (catálogo reproduzido no §4/RF3.7). Este PRD não corrige
métrica nenhuma — ele PROVA que as correções dos outros PRDs funcionam e não regridem.

**Limite de escopo declarado (o que o L3 NÃO prova).** Todo evento do script é tráfego
marcado interno; logo o script prova **evento → linha gravada → contador de saúde →
regra de sanidade**, e prova que os cards PÚBLICOS **não se mexem** (a marcação
funcionou). Ele NÃO prova o número público de nenhum card, e não exercita
`classifyChannel`: com `isInternal=true` o servidor grava `referrer='interno'` sem
chamar o classificador (`api/routes/analytics.ts:263-265`, ramo
`isInternal ? "interno" : classifyChannel(...)` na `:264`). A classificação de canal
(item 11 / PRD 05) é provada em **L1** (`test/analyticsShared.channel.test.ts`) e em
**L2** (a rota deve chamar `classifyChannel` com os sinais crus quando não-interno); o
número público de qualquer card é provado pelo **roteiro manual** com navegador real em
produção (RF4). Quem confundir esses três níveis vai escrever um teste que "passa" sem
testar nada.

---

## 2. Contexto / estado atual (achados da auditoria, com evidência)

### 2.1 O que existe hoje (Confirmado no código)

- **Testes de lógica pura (bom)**: 5 suites `node --test` sobre `analyticsShared.ts`
  — `test/analyticsShared.channel.test.ts` (classificação de canal),
  `.aggregate.test.ts` (reducer: read MAX, scroll dedup, canais),
  `.period.test.ts` (janelas BRT), `.ua.test.ts` (parse UA/bot),
  `.validate.test.ts` (clamps/IP/dedup) — cf. inventário §1/§10. Client:
  `web/lib/analyticsClient.test.ts` (parseUtm, refHost, scroll, dwell).
- **Runners (DOIS, diferentes — conferido nos `package.json` nesta revisão)**:
  - api-server: `"test": "node --test \"test/**/*.test.ts\""`
    (`artifacts/api-server/package.json`, bloco `scripts`);
  - brasilia-agora: `"test": "tsx --test src/**/*.test.ts"`
    (`artifacts/brasilia-agora/package.json`) — **não** é `node --test`; usar sempre
    `pnpm run test` dentro do pacote (o PRD 10 assume o mesmo runner `tsx --test`).

  Imports relativos com extensão `.ts` explícita. Vitest NÃO roda (CLAUDE.md §14).
  `vite build` do web só no Docker da VPS. Typecheck por pacote (o filtro da raiz não
  casa no Windows — §14).
- **Roteiro manual**: `docs/ANALYTICS-VALIDACAO.md` (121 linhas) — 11 cenários-oráculo
  (§§1–11: pageview, F5, SPA, artigo+leitura+scroll, origem/UTM, anúncio, interno, bot,
  períodos, consentimento, falhas) + "Conferência final" (`:117`), cada um comparando
  evento bruto → linha no banco → número no painel. O bloco de preparação
  (`docs/ANALYTICS-VALIDACAO.md:7-12`) já diz o essencial: janela anônima, sem admin
  logado, **em produção** (em dev tudo vira `is_internal=true`).

- **Estado dos 25 itens na auditoria (Fase 0.2, para calibrar o oráculo de cada
  passo)**: **8 Bug** (3, 4, 11, 14, 19, 20, 21, 24) · **6 Parcial** (6, 15, 17, 18,
  23, 25) · **11 OK**; nenhum item "Ausente" — todas as cadeias existem de ponta a
  ponta. Os dois problemas nucleares: `upsertDailyStat` sem UNIQUE em `(ad_id,date)`
  (inflação ~quadrática, `ads.ts:36-50`) e `paidClick` pela mera presença de
  gclid/fbclid (`web/lib/analyticsClient.ts:23`) com precedência máxima
  (`analyticsShared.ts:126`). Um teste que "espera número maior" nesses itens está
  errado por construção — o que se testa é consistência lógica.

### 2.2 A lacuna central (Confirmado no código — auditoria)

- **Rotas com I/O têm ZERO teste** (auditoria, tabela dos 25 itens, "Lacuna de
  cobertura"; inventário §10): `routes/analytics.ts` (ingest `/event` `:206`,
  `/behavior` `:314`, `/health` `:351`, `/stats` `:366`) e `routes/ads.ts`
  (clique `:141-181`, impressão `:184-220`, `upsertDailyStat` `:36-50`) não têm
  nenhuma suite. Verificação objetiva do estado atual (rodada nesta revisão):
  `git grep -lE "routes/(ads|analytics)" -- artifacts/api-server/test` → **vazio**
  (exit 1). Exatamente onde vivem os dois problemas críticos:
  - o upsert defeituoso de `ad_daily_stats` (`ads.ts:36-50`: INSERT com
    `.onConflictDoNothing()` sem target + UPDATE incondicional `+1 WHERE ad_id AND
    date`, sem UNIQUE em `(ad_id,date)` — auditoria claim i) nunca teve teste que
    pegasse a inflação;
  - a decisão `isInternal` (`analytics.ts:239-243`), o dedup de pageview
    (`:231`), os filtros por endpoint e a montagem do `SanityInput`/`HealthAlertInput`
    (PRDs 08/11) são I/O-adjacentes e hoje não testados.
  - o handler de impressão (`ads.ts:184-220`) **nem lê o corpo do request** — não há
    `internal`/`isPrivateIp`/dedup por sessão no arquivo (auditoria claims a/c). É por
    isso que a marcação de teste do RF3 NÃO pode depender do flag `internal` nas rotas
    de anúncio antes do PRD 04.
- Consequência: as correções dos PRDs 03/04/05/06/07/08/11 mexem justamente nesse
  código sem rede de teste — este PRD estabelece a rede.

### 2.3 Precedentes no repo que este PRD reusa

- **Padrão "núcleo puro + casca I/O"**: `analyticsShared.ts` (puro, testado) é o
  núcleo de `routes/analytics.ts` (I/O). O repo JÁ separa assim; este PRD estende o
  padrão às partes ainda acopladas (upsert, dedup, coleta de insumos).
- **Testes com relógio/estado injetado**: os testes existentes de dwell
  (`analyticsClient.test.ts`) e de janela (`analyticsShared.period.test.ts`)
  injetam tempo — padrão para testar agendador (PRD 11 RF3) e dedup temporal.
- **Acesso ao banco por redirect** (CLAUDE.md §12): `docker compose exec -T
  pg-blogs psql "$DBURL" ... < arquivo.sql` — base dos comandos de validação SQL.
- **Anexo A da auditoria**: 7 blocos SQL prontos (composição de impressões,
  pageviews não-internos, razão, sinais crus do "pago", proporção interna,
  behavior_events, all-time de ads) — reusados como parte da validação de sistema.
- **Script standalone de operação já existe**: `scripts/test-ingest.mjs` (pacote
  `@workspace/scripts`, `"type": "module"`, sem build) — `node scripts/test-ingest.mjs
  [baseUrl]`, recusa rodar sem o segredo (`process.exit(1)`), casos roteirizados com
  contador de falhas. É o **precedente direto** de forma, local e ergonomia para o
  `scripts/analytics-synth.mjs` do RF3 (mesmo diretório, mesmo padrão de argumentos e
  de recusa segura).

---

## 3. Problema a resolver

1. **Sem cobertura de rota, cada correção é um salto no escuro**: PRDs
   03/04/05/06/07/08/11 alteram `routes/analytics.ts`/`routes/ads.ts`; sem teste de
   rota, uma regressão só aparece em produção (na rede inteira, mesma imagem).
2. **Sem tráfego sintético reprodutível**, a validação depende de "abrir o navegador
   e torcer" — não cobre os 25 itens de forma sistemática nem as 7 regras do PRD 11.
3. **Risco de poluir dados reais**: qualquer geração de tráfego de teste sem marcação
   inequívoca corromperia as métricas que a série inteira tenta consertar.
4. **Sem gate formal**, um PRD pode ir a rollout sem prova de que passou — o oposto do
   objetivo da auditoria.

---

## 4. Requisitos funcionais

### RF1 — Estratégia em 3 camadas (definição normativa)

| Camada | O que testa | Ferramenta | Onde | Bloqueia rollout? |
|---|---|---|---|---|
| **L1 — Unidade pura** | funções puras (classificação, agregação, sanidade, dedup lógico, estimador de reparo, catálogo de regras) | `node --test` no api-server e nos `.mjs` da raiz; `tsx --test` no brasilia-agora (§2.1) | dev (Windows) | SIM |
| **L2 — Rota com I/O** | control-flow das rotas de ingest/leitura com `db` injetável (fake) | `node --test` + fake db | dev (Windows) | SIM |
| **L3 — Sistema** | cadeia HTTP→banco (evento gravado, marcação, contadores, sanidade), por blog | script de tráfego sintético + SQL do §8.2 + Anexo A da auditoria | VPS (canário → rede) | SIM (pós-rollout, antes de propagar) |

Regra: **nada vai a rollout sem L1+L2 verdes no dev e L3 verde no canário
resenhavip** (§8.4/gate). O número exibido em card público NÃO é L3: é o roteiro
manual (RF4), pelos motivos do §1.

### RF2 — Testar rotas com I/O: extração de núcleo + `db` injetável (a DECISÃO)

O repo lazy-inicializa o `db` (`lib/db`, cf. CLAUDE.md §2) e as rotas importam o
singleton. Estratégia adotada (não é supertest contra Postgres real — pesado e não
roda bem no Windows; não é mock de módulo experimental):

1. **Extrair para funções puras** todo o control-flow decisório que hoje vive inline
   nas rotas e ainda não é testável, deixando a rota como casca fina que só faz
   `await db...` e chama as puras. Alvos (coordenar com o PRD dono de cada um):
   - seleção de campo/coluna e montagem do statement do upsert de anúncio →
     função pura que devolve `{ conflictTarget, setExpr, values }` (PRD 04);
   - decisão `isInternal` e roteamento por endpoint (PRD 03);
   - construção das chaves de dedup e do veredito temporal (PRD 04 RF4/PRD 03);
   - montagem do `SanityInput`/`HealthAlertInput` a partir de linhas já lidas
     (PRDs 11/08) — a QUERY fica na casca; a MONTAGEM vira pura.
2. **Teste de rota fino com `db` fake**: introduzir um ponto de injeção de `db` nas
   rotas de analytics/ads — um módulo `api/lib/dbHandle.ts` (ou parâmetro opcional
   nos factories de rota) que em produção devolve o `db` real e em teste aceita um
   objeto fake com as mesmas assinaturas usadas (`insert().values().onConflict...`,
   `update().set().where()`, `select().from().where()`). O fake registra as chamadas
   e devolve linhas roteirizadas. Assim `node --test` exercita o control-flow real da
   rota (validação de payload, ordem dos filtros, resposta) sem Postgres.
   - ⚠️ **A suite L2 importa o HANDLER EXTRAÍDO, nunca o módulo `routes/analytics.ts`**
     (Confirmado no código, 2º passe): esse módulo executa `setInterval(() => void
     flushBuffer(), 30_000)` no escopo de módulo, SEM `.unref()` (`analytics.ts:120`).
     Importá-lo numa suite `node --test` mantém o event loop vivo e o processo **nunca
     termina** (trava até o timeout). Logo a extração do item 1 (handler puro/`deps.db`,
     de responsabilidade de cada PRD dono) tem de viver num módulo LIVRE do timer, e é
     ESSE módulo que o teste importa. Alternativa aceitável de produção (dono: PRD 03/04
     ao mexer na rota): dar `.unref()` ao intervalo — mas o teste continua importando o
     handler, não a rota. Este PRD não faz essa mudança de produção; só a declara.
   - **Escopo mínimo**: cobrir os caminhos de `POST /api/ads/:id/impression` e
     `/click` (bot/rate/dedup/interno/bloco/clássico/inativo) e de
     `POST /api/analytics/event` (bot/rate/inválido/admin-path/duplicado/interno/
     first-touch) — os pontos onde os bugs viveram.
   - Se a injeção de `db` for custosa demais em algum arquivo, o fallback aceitável é
     extrair o corpo do handler para uma função `handleImpression(deps, req-like)` com
     `deps.db` — mesma ideia, granularidade de função. O objetivo verificável é: existe
     teste `node --test` que exercita o control-flow da rota sem banco real (CA2).
3. **Não** introduzir vitest, jsdom, supertest com Postgres real, nem testcontainers
   (fora do que roda no Windows por §14). Nenhum teste L1/L2 toca rede ou banco.

### RF3 — Script de tráfego sintético (`scripts/analytics-synth.mjs`)

Script Node standalone (fora do bundle; roda com `node scripts/analytics-synth.mjs`,
mesmo padrão de `scripts/test-ingest.mjs`) que gera tráfego HTTP contra UM blog-alvo e
valida a cadeia.

#### RF3.1 — Argumentos e recusas (segurança antes de qualquer request)

| Flag | Obrigatória | Efeito |
|---|---|---|
| `--base <url>` | SIM | Alvo (ex.: `https://resenhavip.midia.run`). Sem ela o script sai com código 1 e não emite nada — nunca há default de produção. |
| `--run-id <id>` | SIM | Carimbo do run. Sem ele o script sai com código 1 (evita lixo não-limpável). Formato livre sem espaço; recomendado `$(date +%s)`. |
| `--ad-id <id>` | SIM se emitir anúncio | Id do anúncio de teste dedicado (RF3.2). Ausente ⇒ o passo de anúncio é **pulado** e reportado como `skipped`, nunca "silenciosamente ok". |
| `--behavior <marked\|public>` | não (default `marked`) | Ver RF3.2. `public` exige também `--i-know-this-is <blog>` batendo com o host de `--base`. |
| `--assert` | não | Roda a asserção de sanidade (RF3.4); exige `--admin-token`. |
| `--admin-token <t>` | com `--assert` | Bearer de admin para `/api/analytics/health` e `/api/analytics/sanity`. |
| `--i-know-this-is <blog>` | ver acima | Confirmação explícita do alvo; se não casar com o host de `--base`, o script sai com código 1. |
| `--cleanup-only` | não | Imprime SÓ o bloco de limpeza do `--run-id`/`--ad-id` informados e sai (sem gerar nenhum evento) — modo de recuperação de run interrompido (§11 caso 4). |

O script **imprime o comando de limpeza ANTES de gerar** e o repete no fim (run
interrompido continua limpável — §11 caso 3).

#### RF3.2 — Marcação de teste: a política é POR ENDPOINT (o servidor trata cada um diferente)

Ids: `sessionId = synthtest-<runId>-<seq>` e `visitorId = synthtest-<runId>-v<seq>`
(prefixo fixo `synthtest-`, hierarquia `synthtest-<runId>-` para limpar um run
específico). E-mail da newsletter: `synthtest+<runId>@example.invalid`.

| Endpoint | O que o servidor faz HOJE com `internal:true` | Estratégia do script |
|---|---|---|
| `POST /api/analytics/event` (`analytics.ts:206`) | **Marca e grava**: `isInternal` = flag OU IP cadastrado OU IP privado (`:239-243`); a linha entra com `is_internal=true` e fica fora de TODA query pública do `/stats`. Efeito colateral: `referrer` vira `'interno'` sem passar por `classifyChannel` (`:263-265`). | SEMPRE `internal:true`. É a invariante §17 funcionando — o teste depende dela. |
| `POST /api/analytics/behavior` (`analytics.ts:314`) | **DESCARTA** (não grava): `if (b["internal"] === true \|\| internalIpSet().has(ip)) return ok` (`:328-330` — a tabela não tem coluna de marcação interna). | Dois modos: `marked` (default) manda `internal:true` e o oráculo é "**0 linhas** gravadas" — valida o descarte, não a cadeia; `public` manda SEM o flag, as linhas entram nos cards 22/23/24 e **a limpeza por `session_id LIKE 'synthtest-%'` passa a ser obrigatória** (por isso exige `--i-know-this-is`). Depois de PRD 01 (coluna `is_internal` em `behavior_events`) + PRD 03 (marcação no ingest), o modo `public` deixa de ser necessário. |
| `POST /api/ads/:id/impression` (`ads.ts:184-220`) e `/click` (`:141-181`) | **Ignora o corpo inteiro** — não há leitura de `internal` no arquivo (auditoria claim a). Impressão de bloco exige bloco visível marcado `isAd`; anúncio clássico exige `active` e não expirado (`:200-210`). | Nunca apontar para um anúncio/bloco REAL. Usar um **anúncio de teste dedicado** (`--ad-id`), criado ativo no admin e apagado no fim; a limpeza remove as linhas por `ad_id` (a tabela não guarda sessão). ⚠️ **Um anúncio de teste ATIVO é inventário PÚBLICO** enquanto o run durar (aparece em `GET /api/ads` e pode ser servido a um visitante real): criá-lo com nome/`title` `synthtest-<runId>` (para a guarda da limpeza — RF3.5) e removê-lo imediatamente após o run; preferir rodar fora de horário de pico. Só depois do PRD 04 RF3 o flag `internal:true` passa a cair em `internal_impressions` — o script manda o flag desde já (inerte hoje, correto depois). |

#### RF3.3 — Restrições técnicas do servidor que o script TEM de respeitar

- **User-Agent explícito de navegador** (ex.: `Mozilla/5.0 (X11; Linux x86_64)
  synthtest/<runId>`): UA vazio OU casando `BOT_RE` é descartado silenciosamente
  (`trafficGuard.ts:14-19` — a regex pega `curl/`, `python`, `axios/`, `headless`,
  `go-http`…). `fetch` do Node sem header explícito pode ir com UA vazio ⇒ tudo viraria
  `droppedBot`. Nenhum token de bot pode aparecer no UA do script.
- **Rate limit por IP e por endpoint** (janela de 1 min, em memória): `/event` 120/min
  (`analytics.ts:212`), `/behavior` 30/min (`:318`), impressão 60/min (`ads.ts:187`),
  clique 30/min (`ads.ts:145`). O script pausa entre lotes para ficar abaixo de cada
  teto — senão os próprios eventos de teste viram `droppedRate`.
- **Tipos válidos do `/event`**: `pageview | read | category | scroll | share`
  (`analyticsShared.ts:27`); marcos de scroll `25|50|75|100` (`:28`); `duration`
  limitada a `MAX_READ_SECONDS = 1800` (`:30`). Tipo fora da lista → `droppedInvalid`
  (400).
- **Paths `/admin*` são rejeitados** (`analytics.ts:228`, conta `droppedInvalid`) — o script só usa paths
  públicos (`/`, `/artigo/<slug>`, `/categoria/<slug>`), exceto no passo que testa
  justamente esse descarte (RF3.6, passo P13).
- **Dedup de 15s** por `pv:<sessão>|<path>` (`analytics.ts:231`): pageviews repetidos
  do mesmo par são descartados. O script usa paths distintos, exceto no passo que testa
  o dedup.

#### RF3.4 — `--assert`: comparação ANTES × DEPOIS (nunca violação intencional em produção)

⚠️ **`/api/analytics/sanity` é o cache do monitor de 15 min (PRD 11 RF3), não uma
avaliação sob demanda** (2º passe). Dois corolários que a asserção TEM de respeitar,
senão vira tautologia:

- **O snapshot inicial NÃO é "saudável".** A §9.6 da auditoria mostra violações reais já
  presentes no dado bruto (ex.: `clicks_gt_impressions`) ANTES de qualquer tráfego de
  teste. O `--assert` compara CONJUNTOS de violações (antes vs depois), nunca supõe
  "zero violações no início".
- **Antes×depois no MESMO run pode ler o MESMO cache** (o monitor só recomputa a cada
  15 min) → comparar dois snapshots consecutivos provaria nada. O `--assert` portanto
  força a atualização entre os snapshots — via o gatilho de recomputação sob demanda que
  o PRD 11 expõe (RF5: parâmetro/rota de "recompute now") — e, se esse gatilho não
  existir, o `--assert` reporta `indeterminado` para as regras cujo insumo o run tocou,
  NUNCA `ok`. O único veredito forte de `--assert` é o do item 1 abaixo.

O script tira um snapshot de `GET /api/analytics/sanity` (PRD 11 RF5; se o PRD 11
ainda não estiver no ar, cai para `GET /api/analytics/health`, `analytics.ts:351` — que
NÃO tem `violations`/`ruleStatus`: nesse fallback o `--assert` só checa que o `/health`
respondeu e reporta todas as 7 regras como `skipped`) **antes** de gerar e **depois** de
gerar (com recomputação forçada entre eles), e exige:

1. **Nenhuma violação NOVA** entre os dois snapshots recomputados (o tráfego sintético é
   marcado interno; ele não pode quebrar regra nenhuma — se surgir violação nova, ou a
   marcação falhou ou há bug real). Este é o veredito forte do `--assert`;
2. regras cujos PRDs-fonte não estão no ar aparecem em `skipped` (nunca `ok` falso);
3. **depois da limpeza** (e nova recomputação), o conjunto de `violations` volta a ser
   igual ao do snapshot inicial (nenhuma violação sobrevive ao run).

Violação PROPOSITAL de regra é assunto de **L1** (fixtures puros de `evaluateSanity`,
PRD 11 CA2) — nunca de tráfego gerado contra um blog no ar.

#### RF3.5 — Limpeza obrigatória (`--cleanup-only`)

O script não executa SQL (não tem acesso ao banco): ele **imprime os comandos exatos**
para colar na VPS, no padrão CLAUDE.md §12, já parametrizados com o `runId` e o
`--ad-id` usados (forma canônica no §8.2). Escopo da limpeza:

- `analytics_events`: `WHERE session_id LIKE 'synthtest-%'`;
- `behavior_events`: `WHERE session_id LIKE 'synthtest-%'` (obrigatório no modo
  `public`; no modo `marked` deve retornar `DELETE 0`);
- `ad_daily_stats`: `WHERE ad_id = '<--ad-id>'` (a tabela diária não guarda sessão — a
  chave é o anúncio de teste);
- `ads` (remoção do anúncio de teste): ⚠️ **`DELETE FROM ads WHERE id = '<--ad-id>'`
  apaga o anúncio SEM verificar que ele é de teste** — se o operador colar o id errado,
  perde um anúncio real. Guarda obrigatória: o `DELETE` do `ads` é condicionado ao nome
  de teste — `DELETE FROM ads WHERE id = '<--ad-id>' AND title LIKE 'synthtest-%'` — e o
  script imprime, ANTES, um `SELECT id, title FROM ads WHERE id='<--ad-id>'` para o
  operador conferir que é mesmo o anúncio `synthtest-<runId>` antes de apagar.

Nenhum comando de limpeza pode usar filtro mais largo que o prefixo/ad de teste — o
teste de unidade do §12 item 2 existe para provar isso.

#### RF3.6 — Cobertura dos 25 itens (mapa item → passo, com oráculo)

Este mapa vai comentado no próprio script (cada passo cita os itens que exercita) e é
a verificação de CA4.

| Passo | Emite | Itens | Oráculo verificável (L3, tudo marcado interno) |
|---|---|---|---|
| P1 | `pageview` `/` com `firstTouch:true` | 1, 2, 5, 7, 10 | 1 linha `analytics_events` `type='pageview'`, `is_internal=true`, `referrer='interno'`; KPIs públicos do painel INALTERADOS |
| P2 | `pageview` de 2 paths distintos, mesma sessão | 9, 16, 17 | 2 linhas `analytics_events` da mesma `session_id` (o que tornaria a sessão não-rejeição). ⚠️ Como tudo é interno, a NÃO-rejeição não aparece no `/stats` (filtra `is_internal=false`); o cálculo de rejeição/pico é asserção de **L1/L2**, não deste passo |
| P3 | `pageview` repetido do MESMO path em <15s | 25 | `droppedDuplicate` sobe em `/health`; 0 linha nova |
| P4 | `read` 30s → 90s → 60s (mesma sessão+artigo) | 8, 13 | 3 linhas `read` gravadas com os `duration` crus. ⚠️ A regra MAX=90 (nunca 180, invariante §17) é do REDUCER — verificada em **L1** (`analyticsShared.aggregate.test.ts`); L3 só confirma que as 3 linhas entraram (interno não chega ao `/stats`) |
| P5 | `scroll` 25/50/75/100 do mesmo artigo | 18 | 4 linhas `scroll` gravadas. ⚠️ O dedup de marco por sessão (não criar 5ª unidade) é do reducer — asserção de **L1**; L3 só confirma as linhas cruas |
| P6 | `category` ×2 na mesma categoria, <15s | 3, 14 | 2 linhas (o dedup de 15s cobre só `pageview` — `analytics.ts:231`; é o achado do PRD 03) |
| P7 | `share` | 24 | 1 linha `share` |
| P8 | `pageview` `firstTouch` com `utmMedium=cpc`, depois outro com `refHost=facebook.com` + `paidClick:true` | 11 | linhas com `utm_*`/`ref_host` crus gravados e `referrer='interno'` (interno vence — `:264`). **A classificação em si é L1/L2**, não L3 (§1) |
| P9 | `behavior` `search` × >15 termos distintos | 22 | modo `public`: >15 linhas (exercita o truncamento do PRD 07); modo `marked`: 0 linhas |
| P10 | `behavior` `link_click` × >10 domínios distintos | 23 | idem P9 |
| P11 | `behavior` `newsletter` com `synthtest+<runId>@example.invalid` | 24 | idem P9; o gate LGPD da newsletter é client-side (PRD 02) — não observável por HTTP |
| P12 | impressão ×K no `--ad-id` + 1 clique | 4, 19, 20, 21 | linhas em `ad_daily_stats` só do ad de teste; **zero par `(ad_id,date)` duplicado** (pós-PRD 04); `clicks ≤ impressions` |
| P14 | `pageview` com UA de mobile e de desktop; `visitorId` novo e repetido | 6, 12, 15 | `browser/os/device` gravados corretamente; recorrente vs novo consistente. **Geo (item 15) não é sintetizável** — depende do IP real (`analytics.ts:151-203`): reportar `skipped` |
| P13 | 1 evento sem `path`, 1 com UA de bot, 1 com path `/admin/x`, 1 rajada acima do teto | 25 | `/health` (`analytics.ts:351`): `droppedInvalid`, `droppedBot`, `droppedRate` sobem; `flaggedInternal` acompanha o run. ⚠️ **P13 é o ÚLTIMO passo gerador** (reordenado no 2º passe): a rajada estoura o rate limit por IP (janela de 1 min, `trafficGuard.ts:51-60`) e envenenaria qualquer passo seguinte com `droppedRate` falso. Se algum passo tiver de rodar depois, o script aguarda >60s para a janela zerar |

Itens 4, 19, 20, 21 dependem do `--ad-id`; sem ele, P12 é `skipped` (nunca `ok`).

#### RF3.7 — As 7 regras do PRD 11 (catálogo reproduzido — autocontenção)

Ids canônicos de `api/lib/analyticsSanity.ts` (PRD 11 RF1), que o `--assert` lê de
`ruleStatus`:

| id | Severidade | Viola quando |
|---|---|---|
| `clicks_gt_impressions` | critical | `clicks > impressions + 1` por (anúncio, dia) |
| `impressions_gt_pageviews` | warning (critical pós-PRD 02) | `impressions > max(pageviews,1) × slots × adMargin` |
| `paid_without_campaign` | critical | `activeCampaigns === 0` E `paidLinesSinceRule > 0` |
| `sources_not_100` | warning | percentuais reconstruídos das fontes não somam 100 ±1 |
| `category_gt_pageviews` | warning | `soma(views por categoria) > pageviews não-internos + 1` |
| `sessions_lt_visitors` | critical | `visitantes únicos > sessões` na janela |
| `percent_over_100` | warning | qualquer `%` exibido > 100,5 |

Regra com insumo ausente ⇒ `skipped` (PRD 11 RF1) — o `--assert` trata `skipped` como
resultado válido e o reporta; nunca como `ok`.

### RF4 — Roteiro de validação pós-rollout (`docs/ANALYTICS-VALIDACAO.md`)

Estender o roteiro existente (11 cenários) com os cenários dos itens CORRIGIDOS pela
série, cada um no formato atual (evento bruto → linha no banco → número no painel →
resultado esperado):

- **Anúncios (PRD 04)**: impressão viewável conta 1 (não N); 2ª impressão da mesma
  sessão não conta (dedup server); impressão `internal:true` cai em
  `internal_impressions` e NÃO no público; zero par duplicado em `ad_daily_stats`;
  `adsReliableSince` presente.
- **Canal pago (PRD 05)**: entrada com fbclid sem campanha → NÃO vira "pago" (vira
  social/busca/referência); com campanha ativa casando → "pago"; card sem linha
  "Tráfego pago" em blog sem campanha.
- **Agregações (PRD 06)**: top categorias não lidera com zero acessos; recorrentes
  não contam histórico interno; pico por dia da semana normalizado.
- **Comportamento (PRD 07)**: "Buscas"/"Cliques externos" = total, não soma de
  top-N; newsletter passa pelo gate de consentimento (PRD 02).
- **Saúde/validação (PRD 08/11)**: card mostra alertas quando há violação; endpoint
  `/sanity` coerente com o SQL espelho.
- **Cenário novo obrigatório — "Tráfego sintético"**: como rodar o
  `scripts/analytics-synth.mjs`, o que ele prova e o que ele NÃO prova (§1: número
  público de card nunca vem do script), e a limpeza como passo do próprio cenário.
- Marcar no topo do roteiro: rodar após CADA deploy que toque o pipeline (o roteiro
  já diz isso na abertura, `docs/ANALYTICS-VALIDACAO.md:3-5` — reforçar) e que o
  ambiente de validação é produção/IP externo (em dev tudo vira interno — bloco de
  preparação em `docs/ANALYTICS-VALIDACAO.md:7-12`).

### RF5 — O gate de rollout (checklist normativo)

Nenhum PRD desta série sobe `BLOG_IMAGE_VERSION` sem:

1. L1+L2 verdes no dev (`pnpm run test` do api-server + `pnpm run test` do
   brasilia-agora quando o PRD tocar o web + typecheck dos pacotes tocados).
2. Build da imagem OK na VPS (o build real só acontece lá — §14).
3. Deploy no **canário resenhavip** e L3 verde nele: `/api/site` devolve o nome
   próprio (anti-mistura), o script sintético `--assert` passa e é limpo, e os cards
   do PRD em questão revalidados (a lista "cards a revalidar" de cada PRD — resumo
   consolidado no §8.5).
4. Só então propagar aos demais blogs (loop do §8.5, padrão CLAUDE.md §6).
5. `docs/ANALYTICS-VALIDACAO.md` atualizado se o PRD mudou a cadeia de algum item.

Este PRD entrega o gate como SEÇÃO executável (§8.4), o rollout multi-blog pronto para
colar (§8.5) e o texto equivalente em `docs/ANALYTICS-VALIDACAO.md` (RF4).

---

## 5. Requisitos não-funcionais

- **Performance**: os testes L1/L2 são funções puras + fake db — rodam em segundos no
  Windows; o script sintético gera dezenas (não milhares) de eventos, marcados
  internos (não disparam coleta pesada). Nenhum teste adiciona custo ao runtime de
  produção.
- **LGPD**: o tráfego sintético usa e-mail `@example.invalid` (TLD reservado, RFC 2606)
  e ids `synthtest-*`; nada de dado pessoal real; `internal:true` em todo `/event`;
  limpeza obrigatória. Parte da rede opera conteúdo político-adjacente — não deixar
  resíduo de teste é requisito. **Exceção declarada**: o modo `--behavior public`
  (RF3.2) grava linhas NÃO-marcadas em `behavior_events` (única forma de exercitar a
  cadeia dos itens 22/23/24 enquanto a tabela não tem coluna de marcação interna —
  PRD 01) e por isso exige `--i-know-this-is <blog>` e limpeza no mesmo run; o valor
  gravado é sempre sintético (`synthtest…`), nunca dado de pessoa real.
- **Confiabilidade**: o script recusa rodar sem `--base` e `--run-id` (exit 1 antes de
  qualquer request); a limpeza é determinística por prefixo/ad de teste; os testes L2
  não tocam banco real (fake db); o `--assert` compara snapshots antes×depois em vez de
  gerar violação proposital (RF3.4).
- **Multi-blog**: o gate roda por blog (canário → rede); mesma imagem; nada
  condicionado a BLOG_ID. O script sintético aponta para um blog por vez via `--base`
  e nunca deriva o alvo do ambiente.
- **Windows/dev (CLAUDE.md §14)**: `node --test` (api-server) e `tsx --test`
  (brasilia-agora) com imports `.ts` explícitos; vitest não roda; `vite build` só na
  VPS; sem unicode literal em regex; scripts com dollar-quote via arquivo (PowerShell
  expande `$` em aspas duplas). O script sintético é `.mjs` puro (sem build) e seu
  teste de unidade é `.mjs` (`node --test`), sem depender do runner de nenhum pacote.

---

## 6. Modelo de dados

**Nenhuma coluna, tabela ou índice novo.** Este PRD é teste/validação — não persiste
métrica; o diff em `lib/db` e em `api/lib/ensureSchema.ts` é vazio (verificado no
§8.1). O script sintético ESCREVE via as rotas públicas normais e APAGA na limpeza —
não altera schema. O que ele toca, e como sai:

| Tabela | O que o script grava | Como sai |
|---|---|---|
| `analytics_events` | linhas `is_internal=true` (`analytics.ts:239-243`), `session_id LIKE 'synthtest-%'` | `DELETE ... WHERE session_id LIKE 'synthtest-%'` |
| `behavior_events` | nada no modo `marked` (o servidor descarta — `analytics.ts:328-330`); linhas públicas no modo `public` | `DELETE ... WHERE session_id LIKE 'synthtest-%'` (obrigatório no modo `public`) |
| `ad_daily_stats` + `ads` | linhas do anúncio de teste (`--ad-id`) — hoje contam como públicas, pois a rota ignora o corpo (`ads.ts:184-220`) | `DELETE FROM ad_daily_stats WHERE ad_id='<--ad-id>'` + remover o anúncio de teste |

(A dependência de artefatos novos — a coluna `internal_impressions` e a chave de
`settings` `ads_reliable_since` (PRD 04; `ads_reliable_since` é KV em `settings`, fora do
Drizzle por design do dono), e a coluna `is_internal` em `behavior_events` (PRD 01) — é
dos PRDs donos; o script apenas as exercita quando presentes e degrada, reportando
`skipped`, quando ausentes.)

---

## 7. Contrato de API

Nenhum endpoint novo. Este PRD CONSOME endpoints existentes/de outros PRDs:

| Endpoint | Auth | Uso pelo script / pela validação |
|---|---|---|
| `POST /api/analytics/event` (`analytics.ts:206`) | público | pageview/read/category/scroll/share (`analyticsShared.ts:27`), sempre com `internal:true`; UA de navegador obrigatório |
| `POST /api/analytics/behavior` (`analytics.ts:314`) | público | search/link_click/newsletter; `internal:true` = **descartado** (`:328-330`) — ver RF3.2 |
| `POST /api/ads/:id/impression` (`ads.ts:184-220`) e `/click` (`ads.ts:141-181`) | público | impressão/clique **só no anúncio de teste** (`--ad-id`); corpo hoje ignorado pelo servidor |
| `GET /api/analytics/stats` (`analytics.ts:366`) | admin (`authMiddleware` + `requirePermission("analytics.view")`) | validação: cards públicos NÃO se movem durante o run |
| `GET /api/analytics/health` (`analytics.ts:351`) | admin (`authMiddleware`) | validação: `droppedBot`/`droppedRate`/`droppedInvalid`/`droppedDuplicate`/`flaggedInternal` (PRD 08) |
| `GET /api/analytics/sanity` (PRD 11 RF5) | admin | `--assert` (snapshot antes×depois). Se o PRD 11 expuser como campo `sanity` do `/health` em vez de rota nova (alternativa registrada no PRD 11 RF5), o script lê do `/health` — a asserção é a mesma |

Nenhum endpoint novo é criado por este PRD.

---

## 8. Comandos de verificação (rodar exatamente estes, com resultado esperado)

### 8.1 Local (Windows) — L1 + L2

```powershell
cd "c:\Users\Usuario(a) Master\sp011\artifacts\api-server"
pnpm run typecheck
# esperado: exit 0, sem erros
pnpm run test
# = node --test "test/**/*.test.ts" (script do package.json). Esperado: TODAS as suites
# passam, incluindo as novas de rota (test/routesAds.test.ts, test/routesEvent.test.ts)
# e as puras dos outros PRDs
cd "c:\Users\Usuario(a) Master\sp011\artifacts\brasilia-agora"
pnpm run typecheck
pnpm run test
# = tsx --test src/**/*.test.ts (NAO e node --test — package.json do web).
# Esperado: sem erros; analyticsClient.test.ts passa
```

```powershell
cd "c:\Users\Usuario(a) Master\sp011"
node --test "scripts/analytics-synth.test.mjs"
# esperado: passa — testes puros do parser de argumentos e do filtro de limpeza (§12)
```

```powershell
cd "c:\Users\Usuario(a) Master\sp011"
# ATENCAO: `git grep` so enxerga arquivos JA RASTREADOS. Um arquivo novo ainda nao
# adicionado (script/suite recem-criados) devolve VAZIO mesmo existindo no disco. Rodar
# `git add` antes destes greps, OU trocar por `grep -rn ... <path>` / `ls` para conferir
# arquivos ainda nao versionados.
git grep -lE "handleImpression|handleEvent" -- artifacts/api-server/test
# esperado: >=1 arquivo (a suite importa o HANDLER extraido, nao o modulo de rota — RF2/CA2).
# HOJE (antes da implementacao) este comando devolve VAZIO/exit 1 — conferido na revisao.
git grep -n "example.invalid" -- scripts/analytics-synth.mjs
# esperado: >=1 (e-mail de newsletter sintetico e seguro)
git grep -n "synthtest-" -- scripts/analytics-synth.mjs
# esperado: >=1 (prefixo de marcacao de teste)
git grep -nE "i-know-this-is|run-id|--base" -- scripts/analytics-synth.mjs
# esperado: >=3 (as recusas do RF3.1 existem no codigo)
git diff --stat HEAD -- lib/db artifacts/api-server/src/lib/ensureSchema.ts
# esperado: VAZIO antes do commit (nenhum schema novo). Depois do commit, a forma
# equivalente e: git show --stat HEAD -- lib/db artifacts/api-server/src/lib/ensureSchema.ts
```

```powershell
cd "c:\Users\Usuario(a) Master\sp011"
node scripts/analytics-synth.mjs
# esperado: exit 1 + mensagem exigindo --base (nenhum request emitido)
node scripts/analytics-synth.mjs --base https://resenhavip.midia.run
# esperado: exit 1 + mensagem exigindo --run-id (nenhum request emitido)
```

### 8.2 VPS — L3, tráfego sintético no canário — ⚠️ **PENDENTE DE EXECUÇÃO**

(Nada abaixo foi executado na escrita nem na revisão: **MCP Supabase não conectado** e
sem acesso à VPS nesta sessão. Padrão de acesso: CLAUDE.md §12. `RUN` fixa o id
limpável; o script exige `--base` e `--run-id`. O anúncio de teste é criado no admin do
blog canário antes do run e removido depois — V4. ⚠️ **Pré-requisito não comprovado no
repo**: o V1 assume `node` instalado no HOST da VPS. Conferir com `node -v` antes; se o
host não tiver Node, rodar o script de dentro de um container que tenha — ex.:
`docker compose exec -T api node scripts/analytics-synth.mjs ...` com o repo montado, ou
a partir de uma máquina externa com Node apontando `--base` para o domínio público.)

```bash
# V1 — Gera + assere + imprime a limpeza (canario resenhavip).
#      RUN vem de fora para ser deterministico e limpavel.
RUN=$(date +%s)
cd /opt/sp011
node scripts/analytics-synth.mjs --base https://resenhavip.midia.run --run-id "$RUN" --ad-id 'COLE_O_ID_DO_ANUNCIO_DE_TESTE' --assert --admin-token 'COLE_AQUI'
# esperado: um "ok" ou "skipped" por passo P1..P14 (nunca falha silenciosa);
#           /sanity sem violacao NOVA vs o snapshot inicial; ao fim, o comando exato de limpeza
echo "RUN=$RUN"   # anote: e a chave da limpeza
```

```bash
# V2 — NADA sintetico entrou nas metricas publicas de analytics_events (tudo internal:true)
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d resenhavip -v ON_ERROR_STOP=1 -c "SELECT count(*) AS linhas_synth, count(*) FILTER (WHERE NOT is_internal) AS publicos_synth FROM analytics_events WHERE session_id LIKE 'synthtest-%';"
# esperado: linhas_synth > 0 (a cadeia gravou) E publicos_synth = 0 (marcacao interna funcionou)
```

```bash
# V3 — behavior_events: no modo default (marked) o servidor DESCARTA o evento interno
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d resenhavip -v ON_ERROR_STOP=1 -c "SELECT count(*) AS behavior_synth FROM behavior_events WHERE session_id LIKE 'synthtest-%';"
# esperado: 0 no modo --behavior marked (descarte em analytics.ts:328-330);
#           >0 no modo --behavior public — e nesse caso a limpeza (V5) e OBRIGATORIA
```

```bash
# V4 — anuncio de teste: linhas so dele e ZERO par (ad_id,date) duplicado (pos-PRD 04)
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d resenhavip -v ON_ERROR_STOP=1 -c "SELECT ad_id, date, count(*) AS linhas, sum(impressions) AS impressoes, sum(clicks) AS cliques FROM ad_daily_stats WHERE ad_id = 'COLE_O_ID_DO_ANUNCIO_DE_TESTE' GROUP BY 1,2 ORDER BY 2 DESC;"
# esperado: 1 linha por (ad_id,date) — count>1 = bug do PRD 04 ainda no ar; cliques <= impressoes
```

```bash
# V5 — Limpeza obrigatoria (colar o comando que o script imprimiu; forma canonica abaixo)
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d resenhavip -v ON_ERROR_STOP=1 -c "DELETE FROM analytics_events WHERE session_id LIKE 'synthtest-%'; DELETE FROM behavior_events WHERE session_id LIKE 'synthtest-%'; DELETE FROM ad_daily_stats WHERE ad_id = 'COLE_O_ID_DO_ANUNCIO_DE_TESTE'; DELETE FROM ads WHERE id = 'COLE_O_ID_DO_ANUNCIO_DE_TESTE' AND title LIKE 'synthtest-%';"
# esperado: DELETE N em cada comando — reconferir rodando V2/V3/V4: 0 linhas em todos
```

Para o **sp011** (banco Supabase, não está no pg-blogs — CLAUDE.md §3), o acesso muda
só na obtenção da connection string; os filtros são idênticos:

```bash
# Mesmo V2/V5 no sp011 (Supabase via .env raiz) — padrao CLAUDE.md §12
cd /opt/sp011
DBURL=$(grep -m1 '^SUPABASE_DATABASE_URL=' /opt/sp011/.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT count(*) AS linhas_synth, count(*) FILTER (WHERE NOT is_internal) AS publicos_synth FROM analytics_events WHERE session_id LIKE 'synthtest-%';"
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "DELETE FROM analytics_events WHERE session_id LIKE 'synthtest-%'; DELETE FROM behavior_events WHERE session_id LIKE 'synthtest-%';"
# esperado: publicos_synth = 0 antes; DELETE N depois; reconferir = 0 linhas synthtest
```

### 8.3 Anexo A da auditoria como validação de sistema — ✅ **BASELINE JÁ EXECUTADO (§9)**

Rodar os 7 blocos do Anexo A de `analytics-audit/00-auditoria-estado-atual.md` (§7)
por blog — composição de impressões (A1), pageviews não-internos (A2), razão
impressões/pageviews (A3), sinais crus do "pago" (A4), proporção interna (A5),
behavior_events (A6), all-time de ads (A7). O Anexo já traz o bloco B parametrizado por
`BLOG=` para os blogs replicados. Pós-PRDs 04/05, os resultados esperados mudam (zero
par `(ad_id,date)` duplicado; zero linha `referrer='pago'` nova sem campanha
cadastrada) — o roteiro pós-rollout (RF4) registra o novo oráculo.

**O Anexo A FOI executado em 2026-07-23** (sp011 + 5 replicados) — resultados na §9 da
auditoria. Consequências para este PRD: (a) a inflação do upsert e o falso "pago" são
**Confirmado com dados** (não mais Hipótese); (b) o baseline pré-correção existe e é o
snapshot inicial de referência do gate (§8.4) e do `--assert` (RF3.4) — que por isso
**não pode supor "zero violações no início"**: a §9.6 registra violações reais de
`clicks_gt_impressions` já no dado bruto; (c) reexecutar o Anexo A por blog DEPOIS de
cada rollout é o oráculo de sistema — comparar contra os números da §9 prova que a
correção surtiu efeito (ex.: A1 deixa de ter par `(ad_id,date)` duplicado; A4 deixa de
ter linha `referrer='pago'` sem campanha).

### 8.4 O gate (rodar antes de CADA rollout desta série)

```
[ ] BASELINE capturado ANTES do bump: snapshot do /stats do canário + reexecução do
    Anexo A (§9 da auditoria) para o par blog-alvo — é a referência de comparação
    pós-rollout (PRD 11 CA12 exige o baseline pré-imagem; sem ele não há como provar
    que a correção mudou o número na direção certa)
[ ] L1 verde: pnpm run typecheck + pnpm run test no api-server (node --test) e,
    se o PRD tocou o web, pnpm run typecheck + pnpm run test no brasilia-agora (tsx --test)
[ ] L2 verde: as suites de rota com db fake passam e ENCERRAM (test/routesAds.test.ts,
    test/routesEvent.test.ts — importam o handler extraído, não o módulo de rota: RF2)
[ ] Build da imagem OK na VPS (docker compose build api web no sp011 — §8.5)
[ ] Canário resenhavip no ar; curl /api/site devolve "Resenha Vip" (anti-mistura;
    nome cadastrado do blog, CLAUDE.md §4 — conferir a grafia exata do próprio blog)
[ ] Script sintético --assert passa no canário E foi limpo (V2..V5 do §8.2:
    publicos_synth=0, behavior/ad de teste zerados)
[ ] Cards do PRD-alvo revalidados no canário (lista do próprio PRD; resumo no §8.5)
[ ] docs/ANALYTICS-VALIDACAO.md atualizado se a cadeia de algum item mudou
[ ] Só então: loop de propagação aos demais blogs (§8.5)
```

Este PRD NÃO faz rollout próprio de código de produção (é teste/infra de validação):
`scripts/analytics-synth.mjs` e as suites de teste não vão na imagem servida (o
script é ferramenta de operação; os testes ficam em `test/`, fora do bundle esbuild).
Quando este PRD é implementado isolado, o "rollout" é só `git pull` na VPS para ter o
script disponível — **sem bump de `BLOG_IMAGE_VERSION`**:

```bash
# Rollout deste PRD, isolado (so o script + testes entram no repo)
cd /opt/sp011
git pull
ls -l scripts/analytics-synth.mjs
# esperado: arquivo presente; nenhum build, nenhum restart de container
```

### 8.5 Rollout multi-blog (CLAUDE.md §6) — o bloco que o gate governa

Este PRD não sobe imagem, mas é ele que define a sequência obrigatória para TODOS os
PRDs da série. Reproduzido aqui para ser colável sem abrir outro arquivo. Mapeamento
arquivo→serviço (CLAUDE.md §5): `artifacts/api-server` ou `lib/db` → `api`;
`artifacts/brasilia-agora` → `web`.

```bash
# 1) bump + build + sp011 (so DEPOIS do gate §8.4 verde no dev)
cd /opt/sp011
git pull
V=$(grep -m1 '^BLOG_IMAGE_VERSION=' .env | cut -d= -f2); N="v$((${V#v}+1))"
sed -i "s|^BLOG_IMAGE_VERSION=.*|BLOG_IMAGE_VERSION=$N|" .env
grep '^BLOG_IMAGE_VERSION=' .env
docker compose build api web
docker compose up -d api web
```

```bash
# 2) canario resenhavip — rodar o L3 (§8.2 V1..V5) e revalidar os cards ANTES de propagar
N=$(grep -m1 '^BLOG_IMAGE_VERSION=' /opt/sp011/.env | cut -d= -f2)
cd /opt/blogs/resenhavip
sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=$N|" .env
docker compose up -d
curl -s https://resenhavip.midia.run/api/site | grep -o '"siteName":"[^"]*"'
# esperado: o nome do proprio blog (anti-mistura — incidente 2026-07-07)
```

```bash
# 3) demais blogs (pula os que ainda nao existem)
N=$(grep -m1 '^BLOG_IMAGE_VERSION=' /opt/sp011/.env | cut -d= -f2)
for b in ksports esporteagora oleysports beeesportes pontofarma creditovc; do
  [ -d "/opt/blogs/$b" ] || continue
  cd "/opt/blogs/$b"
  sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=$N|" .env
  docker compose up -d
done
cd /opt/sp011
```

**Cards a revalidar POR BLOG após cada rollout** — em sp011.com.br, ksports.bebee.me,
esporteagora.midia.run, resenhavip.midia.run, oleysports.midia.run,
beeesportes.midia.run (+ pontofarma e creditovc quando no ar; blogs sem go-live
validam no primeiro boot da imagem nova). Cada PRD traz a lista detalhada; o gate exige
a do PRD-alvo, e este resumo é o índice (idêntico ao `ROADMAP.md` §4.1):

| PRD | Cards/observações a revalidar |
|---|---|
| 04 | Propagandas (Dashboard) · KPIs/tabela/top-3 de anúncios (Analytics) · block-stats (AdsManager) · `adsReliableSince` no `/health` · zero par duplicado em `ad_daily_stats` |
| 05 | Fontes de tráfego (sem "Tráfego pago" em blog sem campanha) · `paidCampaigns` redigido do `/api/site` · KPIs sem regressão |
| 01 | Colunas novas criadas no boot (information_schema) · nenhuma regressão de shape |
| 02 | Newsletter passa pelo gate LGPD · scroll/link_click sem dupla contagem · preview `?adminPreview=1` sem token não trackeia |
| 03 | Saúde: bots/descartes de ads e behavior visíveis · dedup do evento `category` |
| 06 | Top categorias (sem líder de zero acesso) · recorrentes/visitantes · pico por dia · geo |
| 07 | "Buscas"/"Cliques externos" = total (não top-N) · resumo de interações |
| 08 | Card Saúde com tabela por endpoint + faixa de alertas + "desde o boot" + filtros |
| 09 | Contratos/latência do dashboard sem regressão |
| 10 | Chips de % ≤ 100% (itens 3/14) · estados vazios/loading corretos |
| 11 | `GET /api/analytics/sanity` com as 7 regras coerentes com os espelhos SQL |
| 12 | Gate executado no canário; script sintético limpo (V2..V5 do §8.2 zerados) |

**Impacto na rede declarado**: como este PRD só adiciona testes e um script de
operação, o impacto direto nos 8 blogs é **nulo** (nada muda na imagem servida). O
impacto INDIRETO é o oposto de nulo: é o gate que impede que uma correção da série
quebre os 8 blogs de uma vez, já que todos rodam a MESMA imagem (CLAUDE.md §6). O único
efeito observável do script num blog é o lixo de teste que ele mesmo limpa (§8.2 V5).

---

## 9. Critérios de aceite

Mapeamento: os 25 itens (mapa item→passo no RF3.6) e as 7 regras do PRD 11 (RF3.7).
Critérios que dependem de banco/produção estão ⚠️ **PENDENTE DE EXECUÇÃO** — **MCP
Supabase não conectado e sem acesso à VPS** na escrita e na revisão; nenhum deles pode
ser marcado como atendido sem rodar o comando citado.

| # | Critério | Verificação (comando/observação objetiva) | Status |
|---|---|---|---|
| CA1 | L1: `pnpm run test` do api-server (node --test) e do brasilia-agora (tsx --test) passam, incluindo as suites puras novas dos outros PRDs | §8.1 blocos 1 e 2 — exit 0 nos dois pacotes | a executar no dev |
| CA2 | L2: existe teste de rota que exercita o control-flow de `POST /ads/:id/impression`, `/click` e `POST /analytics/event` com `db` fake (sem Postgres real), cobrindo bot/rate/dedup/interno/inválido. O teste importa o HANDLER EXTRAÍDO (módulo sem o `setInterval` de `analytics.ts:120`), nunca o módulo de rota — senão `node --test` não termina (RF2) | a suite `test/routesAds.test.ts`/`test/routesEvent.test.ts` roda e ENCERRA no `pnpm run test` (exit 0, sem timeout); `git grep -l "handleImpression\|handleEvent" -- artifacts/api-server/test` → ≥1 (hoje: vazio) | a executar no dev |
| CA3 | Script recusa rodar sem `--base` e sem `--run-id` (exit 1, zero requests) e usa `synthtest-` + `@example.invalid` | §8.1 blocos 3 e 5 (execução com args faltando + greps) | a executar no dev |
| CA4 | Cobertura dos 25 itens: cada passo P1..P14 do RF3.6 existe no script, comentado com os itens que exercita, e a saída marca cada passo como `ok` ou `skipped` (nunca ausente) | `git grep -nE "^\s*// P[0-9]+ " -- scripts/analytics-synth.mjs` → 14 passos; saída do V1 lista P1..P14 | parcial (VPS ⚠️ PENDENTE) |
| CA5 | Marcação interna funciona: `linhas_synth > 0` E `publicos_synth = 0` em `analytics_events` | §8.2 V2 | ⚠️ **PENDENTE DE EXECUÇÃO** |
| CA6 | Limpeza remove 100% do run: após V5, V2/V3/V4 devolvem 0 linhas (`analytics_events`, `behavior_events`, `ad_daily_stats` do ad de teste) | §8.2 V5 seguido de V2/V3/V4 | ⚠️ **PENDENTE DE EXECUÇÃO** |
| CA7 | `--assert` coerente com o PRD 11: o conjunto `violations` DEPOIS do run é igual ao de ANTES (nenhuma violação nova), regras sem PRD-fonte no ar aparecem em `skipped`, e após a limpeza o relatório volta ao snapshot inicial | §8.2 V1 (saída do `--assert`) + rechecagem de `/sanity` pós-V5 | ⚠️ **PENDENTE DE EXECUÇÃO** |
| CA8 | Nenhum schema novo: diff vazio em `lib/db` e `ensureSchema.ts` | `git diff --stat HEAD -- lib/db artifacts/api-server/src/lib/ensureSchema.ts` → vazio (§8.1) | a executar no dev |
| CA9 | `docs/ANALYTICS-VALIDACAO.md` estendido com os cenários do RF4 (anúncio dedup/interno; pago sem campanha; agregações; comportamento; saúde/sanidade; tráfego sintético) | `git grep -nE "sint[eé]tico\|dedup\|sanity" -- docs/ANALYTICS-VALIDACAO.md` → ≥1 por cenário novo; contagem de `^## ` sobe de 12 para ≥13 | a executar no dev |
| CA10 | O gate é referenciado no plano de rollout dos PRDs da série | `git grep -c "PRD 12" -- analytics-audit/` → hoje 01,02,03,05,06,07,08,10,11 e ROADMAP citam; **04 e 09 não citam** — ao implementar cada um, o gate vem do `ROADMAP.md` §3/§4 (que cobre todos) ou a citação é adicionada ao PRD | a executar no dev |
| CA11 | Volume baixo não falha teste: nenhuma asserção do script compara dados PRÉ-EXISTENTES do blog contra piso de volume — só os eventos que ele mesmo gerou, e por identidade/consistência | leitura do script + `git grep -nE "expect.*>=|minimo|at least" -- scripts/analytics-synth.mjs` → nenhuma asserção de piso sobre dados do blog; confirmação no canário (blog novo, pouco tráfego) | ⚠️ **PENDENTE DE EXECUÇÃO** (parte VPS) |
| CA12 | Nada sintético fica em `behavior_events`: no modo default `marked` o V3 devolve 0; se o run usou `--behavior public`, o V3 devolve 0 **depois** do V5 | §8.2 V3 (antes e depois do V5) | ⚠️ **PENDENTE DE EXECUÇÃO** |
| CA13 | O script nunca aponta impressão/clique para anúncio ou bloco REAL: sem `--ad-id` o passo P12 é `skipped`; com `--ad-id`, todas as linhas criadas em `ad_daily_stats` têm esse `ad_id` | §8.2 V4 (nenhum outro `ad_id` novo na janela do run) + leitura do script | ⚠️ **PENDENTE DE EXECUÇÃO** |
| CA14 | Teste de unidade da limpeza: a query gerada casa exatamente o prefixo do run e nada além (`synthtest-<runId>-` gerado ⊂ filtro; `synthtest-<outroRun>-` fora quando o filtro é por run) | `node --test "scripts/analytics-synth.test.mjs"` (§8.1 bloco 2) | a executar no dev |

---

## 10. Invariantes do §17 preservadas por este PRD

Este PRD não altera código de produção; a evidência de não-violação é, em cada item, o
mecanismo do servidor que ele apenas exercita.

1. **"Tráfego interno marcado `is_internal`, nunca dropado"** — o script DEPENDE dela:
   `/event` com `internal:true` grava a linha com `is_internal=true`
   (`analytics.ts:239-243`) e o `/stats` a exclui de todas as queries públicas
   (auditoria §2.1: `analytics.ts:408,420,429,438-439,448,458,465,474-475,501,520`).
   **Evidência de não-violação**: CA5 exige `linhas_synth > 0` E `publicos_synth = 0`
   — gravado e fora do público, exatamente a invariante. Exceção pré-existente e
   documentada (não criada aqui): o `/behavior` DROPA interno (`:328-330`) porque a
   tabela não tem a coluna — o PRD 12 declara isso em RF3.2 em vez de escondê-lo, e a
   correção pertence aos PRDs 01/03 (fronteira do STATUS.md).
2. **"Heartbeat cumulativo agregado por MAX"** — o passo P4 emite reads 30s→90s→60s da
   mesma sessão+artigo; o reducer usa `max(LEAST(duration, MAX_READ_SECONDS))`
   (`analytics.ts:436`; agregação em `analyticsShared.ts:319-327`). **Evidência**: o
   oráculo do P4 é MAX=90 (nunca 180) — o teste valida a invariante, não a altera.
3. **"`totals.*` do /stats fixos ao agora"** — não tocada: o script e os testes só
   LEEM o `/stats` (contrato em `analytics.ts:374-381`); nenhuma linha deste PRD entra
   no cálculo dos totais.
4. **"Canal classificado no servidor"** — o script envia apenas SINAIS CRUS
   (`utmMedium`, `refHost`, `paidClick`) e nunca um canal pronto; quem classifica é
   `classifyChannel` (`analyticsShared.ts:121-141`) chamado no ingest
   (`analytics.ts:263-265`). **Evidência de não-violação**: com tráfego interno o
   servidor grava `'interno'` sem classificar (`:264`) — por isso a validação da árvore
   de decisão fica em L1/L2 (§1), e nada no client/script decide canal.
5. **"Migrações via Drizzle E ensureSchema" / "colunas se autocriam no boot"** —
   respeitadas por vacuidade: zero schema novo. **Evidência**: CA8 (`git diff --stat
   HEAD -- lib/db artifacts/api-server/src/lib/ensureSchema.ts` vazio).
6. **"Linhas históricas nunca são reescritas"** (precedente `normalizeLegacyChannel`,
   `analyticsShared.ts:143-147`) — os testes L1/L2 não tocam banco; o script só INSERE
   via rotas públicas e a limpeza é DELETE restrito ao prefixo/ad de teste (§8.2 V5):
   **nenhum UPDATE** em `analytics_events` em lugar algum deste PRD.
7. **Isolamento entre blogs / nada hardcodado por blog** (§13, reforça §17) — o script
   recebe o alvo por `--base` (e a confirmação `--i-know-this-is`); nenhuma lógica por
   BLOG_ID; o gate roda por blog (§8.5).
8. **SSR/perf (`no-cache` nunca `no-store`; `sanitizeArticleHtml` isomórfico)** — não
   tocadas: o PRD não altera rota pública, header, SSR nem sanitizador; só adiciona
   testes (`test/`, fora do bundle esbuild) e um script em `scripts/`.

---

## 11. Casos de borda

1. **Blog sem o PRD 04 no ar (estado de hoje)** — a rota de impressão IGNORA o corpo
   (`ads.ts:184-220`): `internal:true` é inerte e a impressão sintética entraria nas
   métricas públicas. Por isso o passo P12 EXIGE `--ad-id` de um anúncio de teste
   dedicado (limpável por `ad_id`) e, sem ele, é `skipped`. Depois do PRD 04 RF3 o flag
   passa a cair em `internal_impressions` e o ad dedicado vira reforço, não requisito.
2. **Blog sem o PRD 05 / PRD 11 no ar** — regras sem insumo aparecem como `skipped` no
   `/sanity` (PRD 11 RF1); se nem o endpoint existir, o `--assert` cai para o `/health`
   e reporta as regras como `skipped` — nunca falha o run e nunca marca `ok` falso.
3. **`ad_daily_stats` não guarda sessão** (auditoria §2.3) — a limpeza de anúncio NÃO
   pode filtrar por `synthtest-`; a única chave possível é o `ad_id` de teste. É por
   isso que o `--ad-id` é obrigatório para o passo de anúncio e que o script imprime o
   `DELETE ... WHERE ad_id=` explícito.
4. **Run interrompido no meio** — o `--run-id` fixo permite limpar mesmo assim
   (`session_id LIKE 'synthtest-<runId>-%'`, ou o prefixo largo `synthtest-%` para
   varrer runs órfãos antigos); o script imprime o comando de limpeza ANTES de gerar,
   não só no fim.
5. **Dedup de 15s do pageview** (`analytics.ts:231`, chave `pv:<sessão>|<path>`) — o
   script usa paths distintos, exceto no passo P3, que testa justamente o descarte
   (`droppedDuplicate`). Atenção: o dedup NÃO cobre `category` — o passo P6 depende
   disso (achado do PRD 03).
6. **Rate limit por endpoint** — `/event` 120/min (`analytics.ts:212`), `/behavior`
   30/min (`:318`), impressão 60/min (`ads.ts:187`), clique 30/min (`ads.ts:145`), tudo
   por IP em janela de 1 min em memória (`trafficGuard.ts:51-60`). O script pausa entre
   lotes para ficar abaixo do MENOR teto do passo; ultrapassar transformaria os eventos
   de teste em `droppedRate` e daria falso negativo.
7. **UA sem header explícito** — `fetch` sem `user-agent` manda UA vazio e
   `isBotRequest` descarta (`trafficGuard.ts:17-20`): o run inteiro viraria
   `droppedBot` com HTTP 200 em tudo (descarte silencioso). O script SEMPRE define o
   header e o passo P13 usa um UA de bot de propósito, para provar o contador.
8. **`node --test` de rota sem fake db bem montado** — se o fake não cobrir uma
   assinatura Drizzle usada, o teste quebra no dev (não em produção) — sinal para
   completar o fake, nunca para pular a camada L2.
9. **Ambiente de validação interno por engano** (rodar o script contra dev/localhost) —
   o servidor marcaria tudo interno por `isPrivateIp` de qualquer forma
   (`analytics.ts:242`); mas `--base` exige a URL pública do blog e o roteiro (RF4)
   reforça: números públicos só se validam em produção/IP externo
   (`docs/ANALYTICS-VALIDACAO.md:7-12`).
10. **`example.invalid`** — TLD reservado (RFC 2606): nenhum e-mail de teste alcança
    destinatário real. No modo `--behavior public` o valor fica em
    `behavior_events.value` até a limpeza — motivo extra para a limpeza ser parte do
    run, não um passo opcional.
11. **Blog canário fora do ar / anúncio de teste inativo ou expirado** — a rota
    responde `ok:true` sem gravar (`ads.ts:200-210`); o script veria HTTP 200 e
    concluiria "ok" indevidamente. Mitigação obrigatória: o passo P12 só declara `ok`
    depois de o V4 mostrar linha para o `--ad-id`; sem linha, o resultado é `falha`, e
    o script instrui a conferir se o anúncio está ativo/não expirado.

---

## 12. Plano de testes (deste próprio PRD)

Este PRD É o plano de testes da série; a auto-verificação é:

1. **As suites L1/L2 que ele exige existem e passam** (`pnpm run test` do api-server =
   `node --test`), incluindo as novas de rota (`test/routesAds.test.ts`,
   `test/routesEvent.test.ts`) com `db` fake. Casos mínimos por suite:
   - `routesAds.test.ts`: bot (UA `curl/8`) → nenhuma escrita; acima do rate → nenhuma
     escrita; `block:<id>` inexistente/invisível → nenhuma escrita; anúncio inativo ou
     expirado → nenhuma escrita; caminho feliz → uma escrita de impressão e uma de
     clique; `internal:true` → `internal_impressions` (pós-PRD 04).
   - `routesEvent.test.ts`: bot → `droppedBot`; rate → `droppedRate`; payload sem
     `type`/`path`/`sessionId` → 400 + `droppedInvalid`; `path='/admin/x'` →
     `droppedInvalid` sem gravar; pageview repetido <15s → `droppedDuplicate`;
     `internal:true` → linha com `is_internal=true` e `referrer='interno'`; não-interno
     com `utmMedium='cpc'` → `classifyChannel` recebe os sinais crus.
2. **O script sintético tem teste de unidade do seu próprio parser/limpeza**
   (`scripts/analytics-synth.test.mjs`, rodado por `node --test` a partir da raiz —
   não depende do runner de nenhum pacote). Funções puras exportadas pelo script:
   `parseArgs(argv)`, `buildEventPayload(runId, seq, kind)` e
   `buildCleanupSql({ runId, adId })`. Asserções: (a) `parseArgs` recusa sem `--base`
   e sem `--run-id`; (b) todo id gerado por `buildEventPayload` casa o filtro de
   `buildCleanupSql`; (c) o filtro NÃO casa `synthtest-<outroRun>-…` quando a limpeza é
   por run, nem qualquer `session_id` sem o prefixo (nenhuma limpeza larga demais);
   (d) o SQL de anúncio filtra por `ad_id` exato — nunca `LIKE`.
3. **Ensaio a seco do gate** (§8.4) contra um PRD já implementado (ex.: rodar o
   checklist para o PRD 04 no canário) — prova que o gate é executável de ponta a
   ponta. ⚠️ **PENDENTE DE EXECUÇÃO** (VPS).

Dados sintéticos só via script marcado; testes de unidade sem banco e sem rede. Nunca
poluir produção — a limpeza é parte do teste, não um passo opcional.

---

## 13. Plano de rollback

- **Testes (L1/L2)** e **script** não vão na imagem servida — reverter é `git revert`
  na `main`; **nenhum rollout de imagem necessário** (nada muda em produção). Um teste
  novo que quebre o `pnpm run test` é corrigido ou revertido antes de qualquer bump
  (é justamente o que o gate impede de passar):

```bash
# Reverter este PRD (script + testes + doc) — sem bump, sem rebuild
cd /opt/sp011
git revert --no-edit <sha-do-commit-do-PRD-12>
git push origin main   # se o revert for feito no dev, na VPS basta: git pull
ls scripts/analytics-synth.mjs 2>/dev/null || echo "script removido — ok"
```

- **Se o script deixou resíduo** num blog (run interrompido sem limpeza): rodar a
  limpeza por prefixo/ad de teste no banco do blog — DELETE restrito ao lixo de teste:

```bash
# Blog replicado (banco = BLOG_ID). Trocar BLOG e o id do anuncio de teste.
BLOG='resenhavip'
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM analytics_events WHERE session_id LIKE 'synthtest-%';"
docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -v ON_ERROR_STOP=1 -c "DELETE FROM analytics_events WHERE session_id LIKE 'synthtest-%'; DELETE FROM behavior_events WHERE session_id LIKE 'synthtest-%'; DELETE FROM ad_daily_stats WHERE ad_id = 'COLE_O_ID_DO_ANUNCIO_DE_TESTE'; DELETE FROM ads WHERE id = 'COLE_O_ID_DO_ANUNCIO_DE_TESTE' AND title LIKE 'synthtest-%';"
docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM analytics_events WHERE session_id LIKE 'synthtest-%';"
# esperado: contagem > 0 no 1o SELECT, DELETE N no meio, 0 no ultimo SELECT
```

  Para o **sp011**, o mesmo com `DBURL` (bloco do §8.2). A operação é reversível por
  natureza: só remove linhas que o próprio teste criou (todas com o prefixo/ad de
  teste). Nunca há UPDATE — nenhuma linha real é reescrita.
- **`docs/ANALYTICS-VALIDACAO.md`**: mudança de documentação — `git revert` do commit
  se algum cenário estiver errado; nenhum efeito em runtime.
- **Critério de acionamento** (qualquer um ⇒ parar o uso do script e reverter/limpar):
  (a) `publicos_synth > 0` no V2 — falha de marcação, parar imediatamente e limpar;
  (b) linhas `synthtest-` sobrevivendo ao V5 — bug no filtro de limpeza; (c) o V4
  mostrando `ad_id` diferente do `--ad-id`; (d) `--assert` acusando violação nova
  causada pelo próprio run. Em (b) e (c), corrigir o teste de unidade da limpeza
  (§12 item 2) ANTES de reusar o script em qualquer blog.

---

## 14. Riscos e dependências de outros PRDs (FRONTEIRAS do STATUS.md)

### 14.1 FRONTEIRAS do `STATUS.md` que tocam este PRD (citadas literalmente)

Este PRD **testa**, nunca **corrige** — toda correção pertence ao PRD dono declarado
nas fronteiras. As que incidem sobre o plano de testes:

| Fronteira (texto do `STATUS.md`) | Consequência para o PRD 12 |
|---|---|
| "Dedup de impressão server-side → **PRD 04**; PRD 03 fica com filtros genéricos de ingest e referencia o 04." | A suite L2 `routesAds.test.ts` só pode asserir dedup DEPOIS do PRD 04; antes dele, o caso existe marcado como pendente do 04 — o PRD 12 não implementa dedup. |
| "Contadores `droppedBot` para ads/behavior: incremento nas rotas → **PRD 03**; exposição/alerta → **PRD 08**." | O passo P13 só vê `droppedBot` de ads/behavior depois do PRD 03; até lá o oráculo é apenas o `/event` (`analytics.ts:208`) e o resto é `skipped`. |
| "`is_internal` em `behavior_events` (e eventual dimensão interna em `ad_daily_stats`): coluna (Drizzle+ensureSchema) → **PRD 01**; lógica de marcação no ingest → **PRD 03** (e 04 para ads)." | É a razão de existir o modo `--behavior public` (RF3.2) e o `--ad-id` obrigatório: enquanto a coluna não existe, marcar não é possível — o PRD 12 contorna com limpeza, sem criar coluna (CA8). |
| "Gate de consentimento da newsletter → **PRD 02**; PRD 03 apenas anota que o servidor não distingue." | O passo P11 NÃO valida o gate LGPD (é client-side); o roteiro manual (RF4) valida, com navegador real. |
| "UNIQUE `(ad_id,date)` + upsert atômico + reparo dos dados históricos → **PRD 04**." | O V4 do §8.2 é o oráculo (`count(*)` por par = 1); enquanto o PRD 04 não subir, `count>1` é o bug esperado — e **não** falha do script. |
| "Defeitos de agregação do `/stats` → **PRD 06**; `adDailyChart` → **PRD 04**; exibição/cálculo no frontend → **PRD 10**; totais não truncados de comportamento → **PRD 07**." | O script gera os insumos (P6, P9, P10, P12) mas os oráculos de número exibido são dos PRDs donos + roteiro manual — o PRD 12 não redefine fórmula nenhuma. |
| "Dedup do evento `category` no ingest → **PRD 03**; cobertura do `link_click` (mailto:/tel:) → **PRD 02**." | Passos P6 e P10 exercitam exatamente esses pontos; o resultado "2 linhas de `category`" é o estado atual documentado, não uma falha do teste. |

### 14.2 Dependências por PRD

| PRD | Relação |
|---|---|
| **PRD 01–11** | Este PRD TESTA todos. As suites L1/L2 e o script sintético exercitam o que cada um entrega; o gate (§8.4) precede o bump de imagem de cada um (`ROADMAP.md` §3/§4). Ordem: as suites puras podem ser escritas junto de cada PRD; as suites de ROTA (L2) e o script (L3) dependem das rotas já alteradas — implementar/atualizar este PRD por último OU incrementalmente conforme cada PRD entra. |
| **PRD 04** | O teste do estimador de reparo e do upsert atômico (o PRD 04 já define `test/adsDaily.test.ts`) é L1 e **pertence ao 04**; este PRD adiciona a camada de ROTA (impressão/clique com db fake) e a validação de sistema (dedup server, `internal_impressions`, `ads_reliable_since`) no script. Enquanto o 04 não subir, P12 depende de `--ad-id`. |
| **PRD 05** | O script NÃO valida a classificação de canal em L3 (tráfego interno vira `'interno'` — §1); cobre os sinais crus e deixa o oráculo do card Fontes para L1/L2 + roteiro pós-rollout (fbclid sem campanha não vira "pago"; `paidCampaigns` redigido do `/api/site`). |
| **PRD 08 / 11** | O `--assert` consome `/health` (`analytics.ts:351`) e `/sanity` (PRD 11 RF5, que pode ser um campo do `/health`); a coerência antes×depois é o critério CA7. As 7 regras estão reproduzidas no RF3.7 para o PRD 12 ser autocontido, mas o **dono do catálogo é o PRD 11** — divergência entre os dois textos resolve-se sempre a favor de `analyticsSanity.ts`. |
| **PRD 06 / 07 / 09 / 10** | O script valida a cadeia dos itens que eles corrigem; se mudarem shape de payload/resposta, script e roteiro acompanham. O PRD 10 usa o mesmo runner do web (`tsx --test`) — este PRD não muda runner de ninguém. |
| **PRD 03 / 08 (prefixos de teste)** | Os PRDs 03 e 08 já preveem sessões de verificação com prefixos próprios (`prd03-*`, `prd08-*`, limpeza por `session_id LIKE`). O filtro `synthtest-%` deste PRD **não** remove aquelas — cada PRD limpa o seu prefixo. Convenção da série: todo prefixo de teste é limpo pelo PRD que o criou. |

**Riscos principais**: (1) fake db incompleto → teste L2 frágil, mitigado por cobrir só
os caminhos críticos e completar o fake conforme necessário; (2) script sintético mal
marcado poluindo produção → mitigado pela política por endpoint (RF3.2) + teste de
unidade da limpeza + recusa sem `--base`/`--run-id`/`--i-know-this-is`; (3) gate
ignorado sob pressa → mitigado por torná-lo item explícito no `ROADMAP.md` §3 e no
plano de rollout de cada PRD (CA10 registra que **04 e 09 ainda não citam o PRD 12** —
para esses, o gate vem do ROADMAP); (4) validação rodada em dev (tudo interno) dando
falsa sensação de cobertura → mitigado pelo `--base` público e pela nota do roteiro;
(5) **falso "verde"**: script que recebe HTTP 200 de descarte silencioso e conclui "ok"
— mitigado por exigir confirmação no banco (V2..V4) para declarar `ok`, nunca o status
HTTP.

---

## 15. Estimativa de esforço

**M/G.** L1 é barato (padrão existente). L2 (fake db + extração de núcleo das rotas)
é o maior custo real e o mais valioso — é a primeira cobertura das rotas de I/O da
história do repo, e exige tocar `routes/analytics.ts`/`routes/ads.ts` com cuidado
para não regredir. O script sintético (RF3) é um arquivo standalone de porte médio
(14 passos + parser + impressão da limpeza) mais o seu teste de unidade
(`scripts/analytics-synth.test.mjs`). A atualização do roteiro (RF4) e o gate
(RF5/§8.4/§8.5) são baratos. Sobe para G se a extração de núcleo das rotas for feita de
forma completa (todos os caminhos), o que é recomendável mas pode ser incremental por
PRD. Arquivos previstos: `scripts/analytics-synth.mjs`,
`scripts/analytics-synth.test.mjs`, `artifacts/api-server/test/routesAds.test.ts`,
`artifacts/api-server/test/routesEvent.test.ts`, `docs/ANALYTICS-VALIDACAO.md`
(edição) e, se a injeção de `db` for pelo módulo, `artifacts/api-server/src/lib/dbHandle.ts`
(+ pontos de import nas duas rotas).

---

## 16. Apêndice do 2º passe adversarial (2026-07-23)

Registro dos achados de menor severidade que foram **incorporados como ressalva** (não
exigiram reescrita) e dos **rejeitados**. Achados materiais estão aplicados no corpo e
resumidos na nota de cabeçalho (VEREDITO: APROVADO COM CORREÇÕES).

**Incorporados como ressalva / limite de escopo declarado:**

1. **Cobertura real dos "25 itens" é qualificada.** No modo default `--behavior marked`,
   os passos P9/P10/P11 gravam 0 linhas (o servidor descarta o interno): isso valida o
   DESCARTE, não a cadeia de exibição dos itens 22/23/24. A cadeia desses três só é
   exercitada no modo `--behavior public`. O "todos os 25" do §1 refere-se à existência
   de um passo por item, não a que cada card público seja provado por L3 (o §1 já
   separa isso — reforçado aqui).
2. **Só 2 das 7 regras do PRD 11 recebem estímulo do script** (`clicks_gt_impressions` e
   `impressions_gt_pageviews`, via P12). As outras 5 dependem de insumo que tráfego
   interno não produz e são cobertas por fixtures L1 do PRD 11 (RF3.7 já reproduz o
   catálogo; o `--assert` só garante "nenhuma violação NOVA", não exercita cada regra).
3. **Superfícies não-limpáveis por SQL.** O run incrementa os contadores em memória do
   `/health` (`droppedBot`/`droppedRate`/`flaggedInternal`), que NÃO são apagáveis por
   SQL — zeram só no restart do container (`analyticsHealth.ts`). A limpeza (§8.2 V5) só
   cobre as tabelas; os contadores de saúde carregam o resíduo do teste até o próximo
   deploy. Aceitável (são diagnósticos, não métrica pública), mas declarado.
4. **Item 14 (% > 100%) não é provado por P6.** P6 só grava 2 linhas de `category`; o
   bug de percentual estourado é de cálculo/exibição (PRD 06/10) e se prova em L1 +
   roteiro manual, não em L3.
5. **P8/L2 exercita o `paidClick` LEGADO.** A regra nova "pago exige campanha" (PRD 05)
   é testada pelo L2 do PRD 05; P8 aqui só garante que os sinais crus são gravados.
6. **V4 pós-PRD 04 com `internal:true`.** Quando o RF3 do PRD 04 estiver no ar, a
   impressão interna cai em `internal_impressions` e a coluna pública fica 0 — o V4 deve
   então checar também `internal_impressions` do `--ad-id`, não só `impressions`.
7. **Gate circular só na 1ª vez.** O gate (§8.4) exige as suites `routesAds/routesEvent`,
   que passam a existir quando ESTE PRD é implementado; como o ROADMAP ordena o PRD 12
   como contínuo/gate desde cedo, quando qualquer outro PRD chega a rollout as suites já
   existem. Para o rollout do PRÓPRIO PRD 12 (isolado, §8.4) não há bump de imagem.
8. **`ad_daily_stats_backup_prd04`** (backup canônico do reparo do PRD 04) NÃO é tocado
   pela limpeza deste PRD (que filtra por `ad_id` de teste) — declarado para evitar que
   uma limpeza larga o atinja.
9. **Células de tabela markdown com `\|`** (CA2/CA9/CA10): o pipe escapado é sintaxe de
   tabela; ao copiar o comando para o shell, remover a barra invertida (`\|` → `|`).
10. **Script não pode auto-executar no import.** O teste de unidade (§12 item 2) importa
    `parseArgs`/`buildEventPayload`/`buildCleanupSql` do `.mjs`; o script deve guardar a
    execução real atrás de um `if (import.meta.url === ...)` para o import no teste não
    disparar tráfego.
11. **§8.5 "cards a revalidar"** está ALINHADO ao `ROADMAP.md` §4.1 (não necessariamente
    idêntico linha a linha); em divergência, o dono é o card listado no PRD-alvo.
12. **Caso 11 (§11) vale para IMPRESSÃO.** Anúncio inativo/expirado responde `ok:true`
    sem gravar na impressão (`ads.ts:200-210`); a rota de clique (`:141-181`) tem lógica
    própria — conferir o comportamento do clique separadamente ao usar ad expirado.

**Rejeitados (não se sustentaram na reconferência):**

- **"O limite de escopo do §1 sobre `classifyChannel` está errado"** — REJEITADO: o
  revisor reabriu `analytics.ts:263-265` e CONFIRMOU que com `isInternal=true` o ramo
  grava `'interno'` sem chamar o classificador; o §1 está correto.
- **"P13 faz `droppedRate` subir mas `/health` não conta ads/behavior"** — REJEITADO
  como defeito: P13 estoura o rate do `/event`, e é o `/event` que o `/health` conta
  (`analytics.ts:208`); o texto já é coerente (o descarte de ads/behavior é fronteira do
  PRD 03/08, já declarada).
- **"Extração do `SanityInput`/`HealthAlertInput` no RF2 contradiz os donos"** —
  REJEITADO: o RF2 já diz "coordenar com o PRD dono de cada um" e separa QUERY (casca)
  de MONTAGEM (pura); não há contradição, só a coordenação já prevista.
