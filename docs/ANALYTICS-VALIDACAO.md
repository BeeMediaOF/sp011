# Analytics — roteiro de validação manual

Objetivo: comparar **evento bruto → linha no banco → número no painel** para
cada métrica, num ambiente controlado. **Rode após CADA deploy que toque o
pipeline de analytics** (é o gate do PRD 12): os §§1–11 são o roteiro clássico;
os §§12–17 cobrem os itens corrigidos pela série de PRDs. O ambiente de
validação de números públicos é **produção / IP externo** — em dev (ou IP
privado) tudo vira `is_internal=true`, útil só para validar a MARCAÇÃO.

> Preparação: janela anônima do navegador (sessão/visitante novos), SEM estar
> logado no admin nessa janela (admin logado = tráfego interno, não conta).
> Como o servidor marca IP privado/localhost como interno, a validação de
> números públicos precisa ser feita **no site em produção** (ou com o IP de
> teste fora da lista de internos). Em dev, os eventos aparecem com
> `is_internal = true` — útil para validar a marcação, não os totais.

## 1. Pageview simples

1. Abra a home UMA vez e aceite o banner LGPD.
2. Confira no banco (após ≤30s do flush):
   ```sql
   SELECT type, path, session_id, visitor_id, referrer, browser, os, is_internal
   FROM analytics_events ORDER BY ts DESC LIMIT 5;
   ```
   Esperado: **1** linha `pageview` com `path='/'`, `visitor_id` preenchido,
   `referrer='direto'` (entrada direta), `browser/os` corretos, `is_internal=false`.
3. Painel (período **Hoje**): Visualizações +1, Visitantes únicos +1,
   Sessões +1.

## 2. Refresh repetido (F5)

1. Na mesma aba, dê F5 3× em menos de 15s.
2. Esperado: NENHUM pageview novo no banco; em `/api/analytics/health`,
   `droppedDuplicate` aumentou.

## 3. Navegação SPA + segunda página

1. Navegue da home para uma editoria (sem recarregar).
2. Esperado: +1 pageview com o novo path, SEM novo `referrer` (origem é 1× por
   sessão); a sessão deixa de ser rejeição.

## 4. Artigo: pageview único + leitura + scroll

1. Abra um artigo e fique ~40s com a aba VISÍVEL, role até ~50% do texto.
2. Esperado no banco:
   - **1** pageview com `article_id` (sem pageview genérico em dobro);
   - eventos `read` com duração CUMULATIVA crescente (~30, ~40…) — o painel usa
     o MAX, não a soma;
   - `scroll` 25 e 50 — **uma vez cada** (role de novo: não repete).
3. Troque de aba por 2 minutos e volte: a duração NÃO deve ter crescido
   (tempo ativo visível, não relógio de parede).
4. Painel: artigo aparece em “Artigos com melhor desempenho” com tempo médio
   ≈40s; Profundidade de leitura mostra 1 sessão em 25% e 50%.

## 5. Origem/UTM

1. Nova janela anônima: abra `https://SEUSITE/?utm_source=nl&utm_medium=email`.
2. Esperado: pageview com `utm_source='nl'`, `utm_medium='email'`,
   `referrer='email'`; painel → Fontes de tráfego mostra “E-mail / Newsletter”
   e a campanha em “Campanhas”, período Hoje.
3. Entre via Google (busque o site e clique): `referrer='busca'`,
   `ref_host='google.com…'`.

## 6. Anúncio: impressão viewável + clique

1. Página com anúncio ABAIXO da dobra: passe rolando rápido por cima dele
   (<1s visível) → NENHUMA impressão nova.
2. Pare com o anúncio ≥50% visível por >1s → +1 impressão
   (`ad_daily_stats.impressions` do dia, BRT).
3. Recarregue e repita na MESMA sessão → NÃO conta de novo (1× por sessão).
4. Clique no anúncio → +1 clique; painel → Propagandas (período Hoje) mostra
   impressão/clique/CTR do anúncio.
5. Bloco da home marcado "É uma propaganda" (imagem/HTML): mesmas regras — 1s
   visível → +1 impressão (`ad_daily_stats.ad_id = 'block:<id>'`), clique em
   qualquer link do bloco → +1 clique; aparece na tabela de anúncios do painel
   com posição "bloco da home". Banner ao lado do logo (Configurações) NÃO é
   medido — não é bloco nem anúncio.

## 7. Tráfego interno

1. Logado no admin (mesma janela), visite o site público.
2. Esperado: linha gravada com `is_internal=true`; NENHUM número público muda;
   `flaggedInternal` aumenta no health.
3. Cadastre seu IP em Configurações → “IPs internos (Analytics)” e repita numa
   janela anônima: mesmo efeito.

## 8. Bot

```bash
curl -X POST https://SEUSITE/api/analytics/event \
  -H "Content-Type: application/json" \
  -d '{"type":"pageview","path":"/bot","sessionId":"bot1"}'
```
Esperado: `{"ok":true}` mas NADA gravado (UA do curl é bot); `droppedBot` +1.

## 9. Períodos e fuso

1. Alterne Hoje/Ontem/7d/30d/Personalizado: todos os cards re-rotulam e os
   números mudam consistentemente (ex.: soma dos dias do gráfico = card de
   visualizações da janela).
2. `?period=custom&from=2026-07-01&to=2026-07-07` via API: `period.days=7`;
   parâmetros inválidos: resposta ecoa `period.key='30d'`.
3. Após as 21h de Brasília (0h UTC): “Hoje” continua sendo o dia BRT.

## 10. Consentimento

1. Janela anônima, REJEITE o banner: nenhuma request para `/api/analytics/*`
   no DevTools → Network; `bee_visitor_id` não existe no localStorage.

## 11. Falhas

1. Painel com API fora do ar → box vermelho de erro (não zeros silenciosos).
2. `GET /api/analytics/health` sem Bearer → 401.
3. Derrube o Postgres por <1min com o site vivo: eventos ficam no buffer
   (`buffered` cresce) e entram quando o banco volta; `flushFailed` só cresce
   se linhas forem realmente perdidas.
4. Reinicie o container (SIGTERM): log “Analytics buffer drenado” e nenhum
   evento perdido.

## 12. Anúncios: dedup + tráfego interno (PRD 04)

1. Impressão viewável conta **1** (não N): abra a página com o anúncio ≥50%
   visível por >1s → +1 em `ad_daily_stats.impressions` do dia BRT.
2. **Dedup server-side**: recarregue/abra 2ª aba na MESMA sessão dentro de 30min →
   NÃO conta de novo (`droppedDuplicate` da impressão no health); clique repetido
   em <10s idem.
3. **Zero par (ad_id, date) duplicado**:
   ```sql
   SELECT ad_id, date, count(*) FROM ad_daily_stats GROUP BY 1,2 HAVING count(*) > 1;
   ```
   Esperado: **0 linhas** (o upsert atômico colapsou tudo no par único).
4. **Impressão interna** (`internal:true` ou IP interno) cai em
   `ad_daily_stats.internal_impressions`/`internal_clicks`, NÃO nas colunas
   públicas — e não incrementa o all-time de `ads`.
5. `adsReliableSince` presente no `/api/analytics/health` (marcador do reparo).

## 13. Canal "pago" só com campanha (PRD 05)

1. Entrada com `fbclid`/`gclid` SEM campanha cadastrada → **NÃO** vira "pago"
   (cai em social/busca/referência). Fontes de tráfego não mostra "Tráfego pago"
   num blog sem campanha ativa.
2. Cadastre uma campanha ativa (Configurações) casando o `utm_campaign` da
   entrada → aí sim a linha é `referrer='pago'`.
3. `paidCampaigns` é redigido do `/api/site` (nunca exposto ao público).

## 14. Agregações (PRD 06)

1. Top categorias não lidera com **zero acessos** (ordena por acessos DESC).
2. Visitante **recorrente** não conta histórico interno (o EXISTS filtra
   `is_internal=false`).
3. Pico por dia da semana **normalizado** pelas ocorrências de cada dia na janela.

## 15. Comportamento (PRD 07)

1. "Buscas" / "Cliques externos" = **total** da janela, não a soma dos top-N.
2. Newsletter passa pelo **gate de consentimento** LGPD (PRD 02) — sem consentir,
   nenhuma request a `/api/analytics/behavior`.

## 16. Saúde e sanidade (PRD 08 / PRD 11)

1. Card Saúde mostra alertas quando há violação (ex.: `flush_failed`,
   `paid_without_campaign`), com skips rotulados; blog novo saudável = `alerts: []`.
2. `GET /api/analytics/sanity` (ou o campo `sanity` do `/health`) coerente com o
   SQL espelho de cada regra (ex.: `sessions_lt_visitors`):
   ```sql
   SELECT count(DISTINCT session_id) AS sessoes,
          count(DISTINCT visitor_id) FILTER (WHERE visitor_id IS NOT NULL) AS visitantes
   FROM analytics_events
   WHERE type='pageview' AND is_internal=false AND ts >= now() - interval '30 days';
   ```
   `visitantes > sessoes` ⇔ regra `sessions_lt_visitors` violada.

## 17. Tráfego sintético (`scripts/analytics-synth.mjs`)

Gera dezenas de eventos **marcados** (`synthtest-<runId>-…`, todos internos no
`/event`) contra UM blog e imprime a limpeza. Prova evento → linha → contador →
regra de sanidade, e que os cards **públicos não se mexem**. **NÃO** prova o
número público de nenhum card (isso são os §§1–16 com navegador real).

```bash
RUN=$(date +%s)
node scripts/analytics-synth.mjs --base https://SEUBLOG.midia.run --run-id "$RUN" \
     --ad-id '<ID_DO_ANUNCIO_DE_TESTE>' --assert --admin-token '<BEARER>'
```

- **Marcação** — em `analytics_events`, `linhas_synth > 0` E `publicos_synth = 0`:
  ```sql
  SELECT count(*) AS linhas_synth,
         count(*) FILTER (WHERE NOT is_internal) AS publicos_synth
  FROM analytics_events WHERE session_id LIKE 'synthtest-%';
  ```
- **`--assert`** — nenhuma violação NOVA em `/sanity` vs o snapshot inicial.
- **Limpeza (obrigatória, parte do teste)** — cole o bloco impresso pelo script
  (ou `--cleanup-only --run-id "$RUN" --ad-id '<ID>'`); depois reconfira que as
  contagens `synthtest-%` voltaram a **0**. O anúncio de teste (criado ativo no
  admin) é removido no fim — nunca aponte impressão/clique para anúncio real.

## 18. Sessão engajada (anti-scanner de link)

O scanner do Facebook/Meta (data center — cidades tipo Luleå/Fort Worth com UA de
navegador) carrega a página 1× e some: 1 pageview, nenhum outro evento. Ele NÃO deve
aparecer nas métricas públicas da **janela** (Fontes de tráfego, Localização,
Dispositivos, pageviews da janela, Sessões, Visitantes).

1. **Sessões da janela e se engajam** (espelho de `computeEngagedSessions`/`engagedSub`):
   ```sql
   SELECT session_id,
          count(*) FILTER (WHERE type = 'pageview')  AS pv,
          count(*) FILTER (WHERE type <> 'pageview') AS outros,
          (count(*) FILTER (WHERE type <> 'pageview') > 0
             OR count(*) FILTER (WHERE type = 'pageview') >= 2) AS engajada
   FROM analytics_events
   WHERE is_internal = false AND ts >= now() - interval '30 days'
   GROUP BY 1 ORDER BY engajada, pv DESC;
   ```
   Uma sessão `engajada=f` (1 pageview, `outros=0`) é o scanner: **não** entra em
   nenhum card da janela.
2. **`totals.window` do `/stats` = soma dos pageviews das sessões engajadas** (não de
   todas). Conferência: a soma de `pv` das linhas `engajada=t` acima bate com
   `payload.totals.window`.
3. **Fontes de tráfego**: um blog cujo único "social" era o scanner do Facebook passa a
   mostrar Redes Sociais **sem** essas linhas; idem Localização (some Luleå/Fort Worth de
   data center) e Dispositivos.
4. **Leitor real permanece**: uma sessão com pageview + `scroll`/`read` (ou 2 pageviews)
   continua contando — inclusive um bounce legítimo (1 pageview + 1 `read` = engajada).
5. **Dashboard fica no cru**: `totals.today/week/month/allTime` NÃO são filtrados (são
   contadores de volume) — é esperado o Dashboard (mês cru) divergir do Analytics
   (30 dias engajado). O `/health` e a malha de sanidade (PRD 11) também seguem no cru.

## 19. Rede de data center / scanner de link por ASN (razão `hosting`)

Complementa a §18: o scanner de link do Facebook/Meta que **renderiza JS** (headless)
dispara `read`/`scroll` e passa por "engajado" — o filtro de sessão engajada NÃO o pega.
Ele é marcado como interno pelo **ASN** do IP (o geo assíncrono pede `as`/`hosting` ao
ip-api; `isHostingNetwork` casa `AS32934`/Meta e a flag `hosting`).

1. Dispare o scanner (poste/reabra o link no Facebook). Em ≤1min, os eventos do IP da
   Meta devem entrar `is_internal=true`:
   ```sql
   SELECT city, referrer, is_internal, count(*)
   FROM analytics_events
   WHERE ts >= now() - interval '1 hour'
   GROUP BY 1, 2, 3 ORDER BY 1;
   ```
   Esperado: linhas de cidade de data center (Luleå/Fort Worth/…) com `is_internal=t`.
2. `GET /api/analytics/health` → `internalByReason.hosting > 0`.
3. `/stats?period=30d`: `topCities` sem Luleå/Fort Worth e `referrerChart.social` cai
   (o scanner saiu do público).
4. Corrida do flush: eventos já gravados ANTES do lookup resolver não são reescritos
   (o retro-fill só toca o buffer). Como o geo resolve em ~1–3s e o cache é por IP, na
   prática todos os eventos do scanner são marcados; historicamente já gravados somem na
   janela de 30d. Um leitor real (ISP residencial/móvel) NUNCA casa `isHostingNetwork`.

## Conferência final

Para cada item: o número no PAINEL = agregação do `/stats` = linhas em
`analytics_events`/`ad_daily_stats`. Qualquer divergência fora do skew de 30s
do buffer é bug — abrir investigação, não aceitar o número.
