# Analytics — documentação técnica da coleta

> Rodada 2 aplicada em **08/07/2026**. Dados são confiáveis a partir de
> **2026-07-08** (`ANALYTICS_V2_SINCE`) — antes disso o histórico foi limpo
> (eventos de admin e duplicados removidos) e não existiam visitor_id, UTM,
> navegador/SO nem flag de tráfego interno.

## Pipeline (navegador → banco → painel)

```
useAnalytics (hook do site)
  │  consentimento LGPD (bee_analytics_consent) — nada sai sem aceite
  │  sendBeacon/fetch keepalive
  ▼
POST /api/analytics/event  (público)
  │  1. filtro de bot (user-agent)            → descartado (contador droppedBot)
  │  2. rate limit 120/min por IP             → descartado (droppedRate)
  │  3. validação whitelist (tipo/caps/enums) → 400 (droppedInvalid)
  │  4. caminho /admin                        → descartado (droppedInvalid)
  │  5. pageview repetido sessão+path <15s    → descartado (droppedDuplicate)
  │  6. tráfego interno (flag/IP/privado)     → MARCADO is_internal (flaggedInternal)
  │  7. canal classificado no servidor (classifyChannel) + parse de UA
  ▼
buffer em memória (máx 500, flush a cada 30s, drenado no SIGTERM/SIGINT)
  ▼
Postgres analytics_events  (lote; fallback linha a linha descarta só o evento inválido)
  ▼
GET /api/analytics/stats?period=…  (admin, Bearer)
  │  linhas da janela (is_internal = false) + buffer não persistido
  │  + queries SQL agregadas (totais fixos, janela anterior, geo, browser/SO, visitantes)
  ▼
Painel /admin/analytics  (+ GET /api/analytics/health para a faixa de saúde)
```

Módulos: lógica pura em `artifacts/api-server/src/lib/analyticsShared.ts`
(testada em `artifacts/api-server/test/`), rotas em `src/routes/analytics.ts`,
contadores em `src/lib/analyticsHealth.ts`, filtros em `src/lib/trafficGuard.ts`.
Cliente: `artifacts/brasilia-agora/src/hooks/useAnalytics.ts` + lógica pura em
`src/lib/analyticsClient.ts` (testada em `src/lib/analyticsClient.test.ts`).

## Regras de exclusão de tráfego (aplicadas a TODAS as métricas públicas)

| Regra | Onde | Efeito |
|---|---|---|
| User-agent de bot/CLI ou vazio | servidor (`trafficGuard.isBotRequest`) | descartado em silêncio |
| >120 eventos/min por IP (30/min behavior, 30–60/min ads) | servidor | descartado em silêncio |
| Caminho `/admin*` | cliente E servidor | não enviado / descartado |
| Pageview repetido (mesma sessão+path em <15s — F5) | servidor | descartado |
| Admin logado no navegador (`admin_token` no localStorage) | cliente envia `internal:true` | gravado com `is_internal=true`, fora das métricas |
| Ambiente dev (`import.meta.env.DEV`) | cliente | idem |
| IP na lista de Configurações → “IPs internos (Analytics)” | servidor (`settings.internalIps`) | idem |
| IP privado/loopback (dev local, health checks) | servidor | idem |
| Sem consentimento LGPD | cliente | nada é enviado; visitor_id nem existe |

Tráfego interno é **marcado, não apagado** (`is_internal=true`) — auditável via
SQL; apenas `behavior_events` (busca/link/newsletter) não tem a coluna e nesses
casos o evento interno simplesmente não é gravado.

## Dicionário de métricas

Formato: **evento fonte · regra de cálculo · filtros · janela · fuso · dedup**.
Filtros = as exclusões da tabela acima, sempre. Fuso = dias/horas de Brasília
(UTC-3 fixo; horário de verão abolido em 2019). “Janela” = período selecionado
no painel (`?period=today|yesterday|7d|30d|custom`), ecoado em `stats.period`.

| Métrica (painel) | Evento fonte | Cálculo | Janela | Dedup |
|---|---|---|---|---|
| Visualizações de página | `pageview` | contagem | selecionada (`totals.window`) | F5 <15s descartado; artigo não conta pageview genérico em dobro |
| Hoje/7d/30d/Total (Dashboard) | `pageview` | contagem SQL | fixas ao agora, independem do seletor | idem |
| Visitantes únicos | `pageview.visitor_id` | `COUNT(DISTINCT visitor_id)` | selecionada | ID aleatório em localStorage, criado só pós-consentimento |
| — novos / recorrentes | idem | recorrente = tem evento `ts <` início da janela (`EXISTS` no índice `visitor_id,ts`) | selecionada | — |
| Sessões únicas | `pageview.session_id` | nº de sessões com ≥1 pageview | selecionada | sessionStorage = 1 por aba/visita |
| Tempo médio por página | `read` | `MAX(duration)` por (sessão, path), depois média. Heartbeats de 30s enviam o total **cumulativo** de tempo ATIVO VISÍVEL (aba oculta pausa o relógio) — o MAX torna reenvio idempotente. Teto 1800s | selecionada | MAX por sessão+página |
| Taxa de rejeição | `pageview` | sessões com exatamente 1 pageview ÷ sessões | selecionada | — (tendência em pontos percentuais) |
| Tendências (badges) | todos | janela atual vs janela imediatamente anterior de mesmo tamanho; `null` = sem base → sem badge (nunca inventa %) | selecionada | — |
| Tráfego ao longo do tempo | `pageview` | contagem por dia BRT | selecionada | — |
| Pico por hora / dia da semana | `pageview` | bucket hora/dia BRT; `null` sem dados | selecionada | — |
| Fontes de tráfego | `pageview.referrer` (canal) | canal atribuído 1× por sessão (first-touch); classificado NO SERVIDOR a partir de refHost+UTM+gclid/fbclid: `direto, busca, social, referencia, email, pago, desconhecido` (linhas legadas `outro`→`referencia` só na agregação) | selecionada | 1 por sessão (`bee_ref_done`) |
| Domínios de origem / Campanhas | `pageview.ref_host` / `utm_campaign` | contagem, top 10 | selecionada | first-touch por sessão |
| Dispositivos | `pageview.device` | derivado do UA no servidor (mobile/desktop/tablet) | selecionada | — |
| Navegadores / Sistemas | `pageview.browser/os` | parse próprio do UA no ingest (8 famílias; fora do catálogo = `outro`) | selecionada | — |
| Artigos com melhor desempenho | `pageview.article_id` (+`read`) | views por artigo; tempo médio = média dos MAX por sessão | selecionada | — |
| Top categorias | `pageview.category` + `category` | views (pageviews com categoria) e cliques (evento `category`) separados | selecionada | — |
| Localização | `pageview.city/region` | agregado por evento DA JANELA; cidade nula = **“Não identificado”** (nunca inventamos local). `geo_stats` virou histórico bruto, não alimenta o painel | selecionada | — |
| Profundidade de leitura | `scroll` (25/50/75/100) | **sessões únicas** (sessão+artigo) por marco; % medido sobre o BLOCO do corpo do artigo (contentRef — cabeçalho/lateral/rodapé não contam); página curta = 100% após 3s | selecionada | sessionStorage `bee_scroll_<artigo>` — remount não redispara |
| Leram 100% | `scroll depth=100` | tamanho do set de sessões | selecionada | idem |
| Impressões de anúncio | `POST /api/ads/:id/impression` | IntersectionObserver ≥50% visível por **1s contínuo** (dwell IAB); anúncio inativo/expirado não conta (checado no servidor) | selecionada (`ad_daily_stats` por dia BRT) | 1× por anúncio por sessão (`bee_adimp_<id>`); admin/dev não envia |
| Cliques de anúncio | `POST /api/ads/:id/click` | registrado antes do redirect (target=_blank) | selecionada | admin/dev não envia |
| CTR | derivado | cliques válidos ÷ impressões válidas × 100, por anúncio e médio | selecionada | — |
| Melhor anúncio | derivado | maior CTR entre anúncios com impressão > 0 na janela; `—` sem dados | selecionada | — |
| “sem dados no período” (ads) | `ad_daily_stats` | anúncio sem NENHUMA linha diária na janela (≠ zero real); `adHasAnyData=false` = coleta nunca começou (“Acumulando…”) | selecionada | — |
| Termos buscados / Links externos / Newsletter | `behavior_events` (search/link_click/newsletter) | contagem; link externo = href fora do próprio domínio (delegação no corpo do artigo + links markdown) | selecionada | eventos internos não são gravados |

## Saúde da coleta (`GET /api/analytics/health`, admin)

Contadores **em memória desde o boot** (reiniciar o container zera — proposital,
é diagnóstico, não histórico): `received, droppedBot, droppedRate,
droppedInvalid, droppedDuplicate, flaggedInternal, flushedOk, flushFailed,
buffered, lastEventAt, lastFlushAt, reliableSince, filters[]`. Exibidos na faixa
“Saúde da coleta” do painel. `flushFailed > 0` aparece em vermelho.

## LGPD / privacidade

- Nada é enviado antes do aceite do banner (`bee_analytics_consent`).
- `visitor_id` = UUID aleatório em localStorage, criado só após o aceite; sem
  fingerprinting; rejeitou = nunca existe.
- UTM da URL de entrada fica em sessionStorage até o aceite — não sai do
  dispositivo sem consentimento. `gclid`/`fbclid`: só a PRESENÇA é enviada
  (flag `paidClick`), nunca o ID.
- IPs não são gravados em `analytics_events` (o campo `_ip` do buffer é
  transiente, para retro-preencher geo, e não vai ao banco).

## Limitações conhecidas (explícitas de propósito)

1. **Geolocalização = ip-api.com gratuito** (decisão de 08/07/2026: manter por
   ora). Plano grátis é HTTP-only e proíbe uso comercial. A agregação é
   agnóstica de provedor (lê `city/region` das linhas): trocar de provedor =
   trocar só `lookupGeoAsync` em `routes/analytics.ts`. Alternativas: MaxMind
   GeoLite2 local (precisa de conta/licença) ou desligar cidade/estado.
2. **Toggles de categoria do banner LGPD são cosméticos** — aceite/rejeição é
   tudo-ou-nada (`bee_analytics_consent` único).
3. **Contadores de saúde zeram no restart** (em memória).
4. **`behavior_events` não tem coluna `is_internal`** — evento interno é
   descartado em vez de marcado (sem trilha de auditoria nesse caso).
5. **visitor_id/UTM/navegador/SO/interno só existem a partir de 08/07/2026** —
   períodos anteriores mostram esses cards zerados/parciais (o card Visitantes
   avisa “desde 08/07/2026”).
6. **Skew de ~30s**: geo/browser/visitantes vêm de SQL e não veem o buffer
   ainda não persistido; o gráfico diário vê. Diferenças somem no flush.
7. **Impressões de anúncio caíram após 08/07/2026** — é o número honesto
   (dwell de 1s + 1× por sessão). Comparações com o histórico anterior
   superestimado não são válidas. Totais all-time seguem no AdsManager.
8. Revisita à mesma página na mesma sessão conta o MAX de tempo (não a soma) —
   leve subestimação, preferida a duplicar leituras.

## Testes

- `artifacts/api-server`: `pnpm run test` (node --test) — classificação de
  canal, parse de UA/bot (inclui CUBOT ≠ bot), períodos com virada de mês BRT,
  reducer de agregação (bounce, scroll por sessão, read MAX com heartbeats,
  janela vazia, remap legado), validação/caps/dedup.
- `artifacts/brasilia-agora`: `pnpm run test` (tsx --test) — parseUtm,
  refHostOf, scroll relativo ao conteúdo, decisor de dwell com clock injetado.
- Roteiro manual: `docs/ANALYTICS-VALIDACAO.md`.
