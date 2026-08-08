# ROADMAP — Auditoria de precisão do Analytics (rede sp011)

> **O que é este documento.** Fase 2 do `PRD_ANALYTICS_PLANEJAMENTO_v2.md`: sequência
> de implementação por dependência, plano de rollout multi-blog, Definition of Done e a
> matriz que amarra cada um dos 25 itens da checklist e cada regra do PRD 11 a um PRD
> dono. Fontes: os 12 PRDs em `analytics-audit/`, `00-auditoria-estado-atual.md`,
> `00-inventario.md`, `STATUS.md` (fronteiras) e CLAUDE.md §§5, 6, 12, 14, 17.
>
> **Princípio geral:** volume baixo NÃO é bug — os blogs são novos. Este roadmap não
> existe para os números subirem, e sim para cada métrica refletir a realidade com
> exatidão, por menor que seja o volume.
>
> **Estado (2026-07-24):** os 12 PRDs estão escritos, **revisados individualmente**
> (PRD 01–11 no 1º workflow, 42 correções; PRD 12 no 2º passe — veredito **APROVADO COM
> CORREÇÕES**) e submetidos ao **passe de consistência cruzada** (série coerente, sem
> correções). O **Anexo A foi executado com dados reais** e a §9 da auditoria integrada
> nos PRDs 04/05/02 — ver STATUS.md. **Planejamento aprovado; nada de código de produção
> foi alterado.** A implementação vem depois, PRD por PRD, com aprovação a cada rollout.
>
> **Lacuna de dados — o que fechou e o que resta:** o Anexo A (7 blocos SQL) foi rodado
> na VPS e confirmou a inflação do upsert (estimador do PRD 04 validado 65=65), o "pago"
> fantasma por `fbclid` orgânico (110 sessões no ksports) e liberou o gate do PRD 05
> (zero Google Ads real). Os números de diagnóstico já estão na §9 de
> `00-auditoria-estado-atual.md`; apenas os critérios de aceite que dependem de query
> **pós-rollout** seguem "pendente de execução" (correto).

---

## 1. Sequência de implementação (ondas por dependência)

Ordem imposta pelo doc v2 e pelas arestas reais entre os PRDs (§14 "Riscos e
dependências" de cada um):

```
ONDA A — CRÍTICOS (destravam a métrica de maior impacto; começam já):
  PRD 04 (impressões/cliques confiáveis)     ── depende de: 01 (padrão de migração), 03 (fronteira bots)
  PRD 05 (canal "pago" correto)              ── depende de: 01 (colunas/settings)

ONDA B — FUNDAÇÃO (modelo, coleta, ingest):
  PRD 01 (modelo de dados + taxonomia)       ── sem deps (é a base; 04/05 consomem)
  PRD 02 (tracking client + Quick Win LGPD)  ── depende de: 01
  PRD 03 (ingest, bots, dedup, is_internal)  ── depende de: 01

ONDA C — AGREGAÇÕES E COMPORTAMENTO (base limpa):
  PRD 06 (agregações/rollups)                ── depende de: 01/03; coordena com 05 (mesmo arquivo)
  PRD 07 (comportamento no site)             ── depende de: 01/03

ONDA D — SUPERFÍCIE E CONTRATOS:
  PRD 08 (saúde/alertas)                     ── depende de: 03, 04, 05, 11
  PRD 09 (APIs do dashboard)                 ── depende de: 06/07
  PRD 10 (frontend do dashboard)             ── depende de: 09

CONTÍNUO (desde o início da implementação):
  PRD 11 (validação cross-metric)            ── consome fórmulas de 04/05; roda por blog o tempo todo

GATE (antes de CADA rollout):
  PRD 12 (testes e validação)                ── testa todos; o gate §8.4 dele precede todo bump de imagem
```

**Nota de ordem prática (dependência circular aparente 01↔04/05):** o PRD 01
consolida o PADRÃO de migração Drizzle+ensureSchema e a taxonomia; 04 e 05 já trazem
seus statements idempotentes escritos nesse padrão (PRD 04 §6, PRD 05 "Modelo de
dados"). Implementar **01 primeiro** (mesmo que enxuto), depois 04/05, evita retrabalho
de nomes de coluna. Se por prioridade comercial 04/05 forem primeiro, o PRD 01 apenas
formaliza o que eles já criaram — sem conflito, porque os statements são idempotentes.

**Arestas de coordenação (mesmo arquivo — implementar em commits sequenciais):**
- PRD 05 e PRD 06 tocam `buildWindowAggregates`/`analyticsShared.ts` — sequenciar.
- PRD 04, 08 e 11 compartilham as fórmulas de sanidade (`checkAdSanity`/
  `checkClicksVsImpressions` em `analyticsShared.ts`, `evaluateHealthAlerts` em
  `healthAlerts.ts`, `evaluateSanity` em `analyticsSanity.ts`) — o PRD 11 §14 fixa a
  reconciliação: uma fórmula, três chamadores (04 define, 11 é dono canônico do
  catálogo, 08 é a superfície on-demand).

---

## 2. Quick Win — LGPD da newsletter (destacado)

**Dentro do PRD 02, mas priorizável isoladamente.** Os dois formulários de newsletter
(`web/components/Footer.tsx:62-76` e `web/components/blocks/HomeCustomBlocks.tsx:364-378`)
fazem `fetch` direto a `/api/analytics/behavior` **sem o gate de consentimento
`getConsent()` e sem a flag `internal`** (auditoria §4.6, Confirmado no código) — único
caminho de coleta que ignora o consentimento LGPD, e captura e-mail (dado pessoal). Como
parte da rede opera conteúdo político-adjacente, é exposição de conformidade, não só
falha de tracking. **Correção pequena e de baixo risco** (rotear os dois envios pelo
`sendBehavior` que já respeita o gate — `useAnalytics.ts:249-259`), candidata a ir junto
com a Onda A mesmo antes do resto do PRD 02.

---

## 3. Definition of Done (geral)

A série está DONE quando, para CADA blog da rede (independente do volume):

1. **Nenhuma regra do PRD 11 é violada** — `GET /api/analytics/sanity` devolve
   `violations: []` (ou só violações rastreadas a uma causa conhecida e aceita), em
   todos os blogs no ar.
2. **Os 8 itens Bug viram OK**: 3, 4, 11, 14, 19, 20, 21, 24 — verificados pelos
   critérios de aceite dos PRDs donos e pelo roteiro pós-rollout (PRD 12 RF4).
3. **Os 6 Parciais viram OK ou têm limitação documentada e aceita**: 6, 15, 17, 18,
   23, 25 (ex.: item 15/geo — a licença do ip-api é decisão de produto registrada em
   `docs/ANALYTICS.md`, não bug de código).
4. **Anexo A rodado** em produção fechando a lacuna de dados (composição das
   impressões; sinais crus do "pago") — nenhum critério dependente de banco fica
   "pendente de execução".
5. **Gate do PRD 12 verde** no rollout de cada PRD (L1+L2 no dev, L3 no canário).
6. **`docs/ANALYTICS.md` e `docs/ANALYTICS-VALIDACAO.md` atualizados** com as novas
   regras e oráculos.

---

## 4. Plano de rollout multi-blog (CLAUDE.md §6)

Todos os PRDs desta série tocam `artifacts/api-server` e/ou `artifacts/brasilia-agora`
e/ou `lib/db` — a imagem compartilhada dos 8 blogs. O padrão é sempre:

```bash
# 1) bump + build + sp011
cd /opt/sp011
git pull
V=$(grep -m1 '^BLOG_IMAGE_VERSION=' .env | cut -d= -f2); N="v$((${V#v}+1))"
sed -i "s|^BLOG_IMAGE_VERSION=.*|BLOG_IMAGE_VERSION=$N|" .env
grep '^BLOG_IMAGE_VERSION=' .env
docker compose build api web
docker compose up -d api web
```
```bash
# 2) canário resenhavip — rodar o GATE do PRD 12 (§8.4) ANTES de propagar
N=$(grep -m1 '^BLOG_IMAGE_VERSION=' /opt/sp011/.env | cut -d= -f2)
cd /opt/blogs/resenhavip
sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=$N|" .env
docker compose up -d
curl -s https://resenhavip.midia.run/api/site | grep -o '"siteName":"[^"]*"'   # deve devolver "Resenha VIP"
```
```bash
# 3) demais blogs (pula os que ainda não existem)
N=$(grep -m1 '^BLOG_IMAGE_VERSION=' /opt/sp011/.env | cut -d= -f2)
for b in ksports esporteagora oleysports beeesportes pontofarma creditovc; do
  [ -d "/opt/blogs/$b" ] || continue
  cd "/opt/blogs/$b"; sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=$N|" .env; docker compose up -d
done
cd /opt/sp011
```

Diagnóstico anti-mistura (incidente clássico): `curl -s https://<dominio>/api/site |
grep -o '"siteName":"[^"]*"'` em cada domínio deve devolver o próprio nome.

### 4.1 Cards a revalidar por PRD, por blog (após o rollout)

Blogs no ar: sp011.com.br, ksports.bebee.me, esporteagora.midia.run,
resenhavip.midia.run, oleysports.midia.run, beeesportes.midia.run (+ pontofarma e
creditovc quando provisionados). Cada PRD traz sua lista detalhada; resumo:

| PRD | Cards/observações a revalidar por blog |
|---|---|
| 04 | Propagandas (Dashboard) · KPIs/tabela/top-3 de anúncios (Analytics) · block-stats (AdsManager) · `adsReliableSince` no /health · zero par duplicado em `ad_daily_stats` |
| 05 | Fontes de tráfego (sem "Tráfego pago" em blog sem campanha) · `paidCampaigns` redigido do `/api/site` · KPIs sem regressão |
| 01 | Colunas novas criadas no boot (information_schema) · nenhuma regressão de shape |
| 02 | Newsletter passa pelo gate LGPD (Quick Win) · scroll/link_click sem dupla contagem · preview `?adminPreview=1` sem token não trackeia |
| 03 | Saúde: bots/descartes de ads e behavior visíveis · dedup do evento `category` |
| 06 | Top categorias (sem líder de zero acesso) · recorrentes/visitantes · pico por dia · geo |
| 07 | "Buscas"/"Cliques externos" = total (não top-N) · resumo de interações |
| 08 | Card Saúde com tabela por endpoint + faixa de alertas + "desde o boot" + filtros |
| 09 | Contratos/latência do dashboard sem regressão |
| 10 | Chips de % ≤ 100% (itens 3/14) · estados vazios/loading corretos |
| 11 | `GET /api/analytics/sanity` com as 7 regras coerentes com os espelhos SQL |
| 12 | Gate executado no canário; script sintético limpo (`publicos_synth=0`) |

---

## 5. Matriz de cobertura — 25 itens da checklist → PRD dono

Status vem da auditoria (Fase 0.2). "Dono" = PRD que corrige/valida; "Vigia" = PRD 11
(malha contínua) sempre que houver invariante aplicável.

| # | Item | Status atual | PRD dono | Co-responsáveis |
|---|---|---|---|---|
| 1 | Views hoje vs ontem | OK | 06 | 11 (vigia) |
| 2 | Views 7d vs 7 anteriores | OK | 06 | 11 |
| 3 | Top categorias "por acessos" (Dashboard) | **Bug** | 06 (ordenação) | 10 (barra), 11 (%>100) |
| 4 | Propagandas resumo (Ativas/Impr/Cliques/CTR) | **Bug** | 04 | 08 (alerta), 11 (regra) |
| 5 | Visualizações de página vs período | OK | 06 | 11 |
| 6 | Visitantes únicos (novos vs recorrentes) | Parcial | 06 (EXISTS) | 11 (sessões≥visitantes) |
| 7 | Sessões únicas | OK | 06 | 11 |
| 8 | Tempo médio por página (MAX) | OK | 06 | — |
| 9 | Taxa de rejeição | OK | 06 | — |
| 10 | Tráfego ao longo do tempo (30d) | OK | 06 | — |
| 11 | Fontes de tráfego | **Bug** | 05 | 08 (alerta), 11 (pago⇒campanha; soma=100) |
| 12 | Dispositivos/Navegadores/Sistemas | OK | 06 | — |
| 13 | Artigos com melhor desempenho | OK | 06 | — |
| 14 | Top categorias detalhado (%,cliques) | **Bug** | 06 (sort) | 10 (chips %), 11 (%>100) |
| 15 | Localização (Cidades/Estados) | Parcial | 06 (geo agg) | — (licença ip-api = decisão de produto, `docs/ANALYTICS.md`) |
| 16 | Pico por hora | OK | 06 | — |
| 17 | Pico por dia da semana | Parcial | 06 (normalização) | — |
| 18 | Profundidade de leitura (scroll) | Parcial | 06 (chave agg) | 02 (chave client), 10 (rótulo) |
| 19 | Propagandas detalhado (janela) | **Bug** | 04 | 08, 11 |
| 20 | Desempenho por anúncio (tabela) | **Bug** | 04 | 08, 11 |
| 21 | Impressões — top 3 (gráfico) | **Bug** | 04 (sobrescrita) | 09/10 (dataKey homônimo) |
| 22 | Termos mais buscados | OK | 07 | — |
| 23 | Links externos clicados | Parcial | 07 (backend) | 02 (cobertura/esquema client) |
| 24 | Resumo de interações + newsletter | **Bug** | 07 (totais) | 02 (gate LGPD — Quick Win), 10 (exibição) |
| 25 | Saúde da coleta | Parcial | 08 | 03 (contadores por endpoint) |

Transversais (não são "cards", mas cobrem a checklist inteira): **PRD 01** (modelo de
dados/taxonomia — base de todos), **PRD 09** (contratos das APIs de todos os cards),
**PRD 12** (testes/validação de todos). **Nenhum dos 25 itens fica sem dono.**

---

## 6. Matriz de cobertura — 7 regras do PRD 11 → onde nascem verdadeiras

| Regra (PRD 11) | Torna-se verdadeira por | Vigiada por (contínuo) | Superfície de alerta |
|---|---|---|---|
| R1 `clicks ≤ impressions` | PRD 04 (gravação exata + fórmula `checkClicksVsImpressions`) | PRD 11 | PRD 08 (`ad_clicks_gt_impressions`) |
| R2 `paid > 0% exige campanha` | PRD 05 (regra + cadastro `paidCampaigns`) | PRD 11 | PRD 08 (`paid_without_campaign`) |
| R3 `soma das fontes = 100%` | PRD 05/06 (classificação + agregação corretas) | PRD 11 (`sources_not_100`) | PRD 08 (via relatório /sanity) |
| R4 `views/categoria ≤ pageviews não-internos` | PRD 06 (agregação de categorias) | PRD 11 (`category_gt_pageviews`) | PRD 08 (via /sanity) |
| R5 `sessões ≥ visitantes únicos` | PRD 06 (EXISTS de recorrentes corrigido) | PRD 11 (`sessions_lt_visitors`) | PRD 08 (via /sanity) |
| R6 `impressões ≤ pageviews × slots × margem` | PRD 04 (dedup server + `checkAdSanity`) | PRD 11 | PRD 08 (`ad_sanity`) |
| R7 `% exibido nunca > 100%` | PRD 10 (normalização na origem) | PRD 11 (`percent_over_100`) | PRD 08 (via /sanity) |

**Nenhuma regra fica sem dono.** As fórmulas de anúncio (R1/R6) vivem em
`analyticsShared.ts` (PRD 04); o catálogo canônico das 7 regras vive em
`analyticsSanity.ts` (PRD 11); a superfície on-demand vive em `healthAlerts.ts`
(PRD 08) — reconciliação em PRD 11 §14 (uma fórmula, três chamadores).

---

## 7. Fronteiras entre PRDs (ajuste 5 — consolidadas)

Repetidas aqui do STATUS.md para leitura autônoma; cada PRD as cita em "Riscos e
dependências":

- **Dedup de impressão server-side → PRD 04**; PRD 03 fica com filtros genéricos de
  ingest e referencia o 04.
- **Contadores por endpoint (bots/rate/internos): incremento → PRD 03; exposição/
  alerta → PRD 08.**
- **`is_internal` em `behavior_events` / dimensão interna de `ad_daily_stats`: coluna
  → PRD 01; lógica de marcação no ingest → PRD 03 (e 04 para ads).**
- **Gate de consentimento da newsletter → PRD 02** (Quick Win); PRD 03 só anota que o
  servidor não distingue.
- **UNIQUE `(ad_id,date)` + upsert atômico + reparo dos dados históricos → PRD 04**
  (padrão de migração definido no PRD 01).
- **Defeitos de agregação do `/stats` (itens 3/6/17/18) → PRD 06**; `adDailyChart`
  (sobrescrita) → PRD 04.
- **Exibição/cálculo no frontend (itens 14/24; barra do Dashboard) → PRD 10**; totais
  não-truncados de comportamento (hoje soma top-15/top-10) → PRD 07.
- **Dedup do evento `category` no ingest → PRD 03**; cobertura do `link_click`
  (mailto:/tel:, fora do corpo) → PRD 02.
- **Regras de sanidade contínuas → PRD 11**; superfície de exposição/alerta → PRD 08.

---

## 8. Validação com dados reais (Anexo A) — EXECUTADA

Os 7 blocos SQL do Anexo A de `00-auditoria-estado-atual.md` **foram rodados na VPS**
(sp011 via `SUPABASE_DATABASE_URL`; replicados via `psql -U postgres -d <blog>`);
os resultados estão na **§9** daquele arquivo e já foram integrados aos PRDs 04/05/02.
O que cada bloco respondeu:

- **A1** composição das impressões (quais anúncios/dias somam o total; prova de pares
  duplicados no `ad_daily_stats` — confirma a causa nuclear do PRD 04).
- **A2/A3** pageviews não-internos por dia e razão impressões/pageviews (dia com
  impressão e zero pageview = assinatura da assimetria).
- **A4** sinais crus das linhas "pago" (facebook/instagram/NULL ⇒ fbclid orgânico,
  confirma a hipótese c9 do PRD 05; google.com + gclid ⇒ Google Ads real, que faria
  reavaliar o remap do PRD 05 RF5 ANTES de implementar).
- **A5** proporção interno/externo por tipo (a marcação `is_internal` está pegando?).
- **A6** o que existe em `behavior_events`.
- **A7** contadores all-time de `ads` (referência correta para medir a inflação do
  diário).

Resultado do A4 (gate do PRD 05): **zero Google Ads real no histórico** → o remap total
do legado (RF5) está liberado, com o ajuste que os dados exigiram — consultar
`utm_medium`/`utm_source` ANTES do fallback por host (há linha social com `ref_host`
nulo que, sem isso, viraria "desconhecido"). Confirmado com dados; ver PRD 05 §9.

---

## 9. Resumo executivo

A auditoria (Fases 0.1/0.2, 28 agentes, 18 claims verificados adversarialmente sem
refutação) confirmou no código **8 bugs, 6 parciais e 11 itens OK** entre os 25 do
dashboard. Os dois problemas relatados têm causa confirmada:

- **Problema 1 (impressões desproporcionais)**: causa nuclear é o `upsertDailyStat`
  de `ad_daily_stats` SEM constraint UNIQUE (`ads.ts:36-50`) — INSERT-sempre +
  UPDATE-em-todas-as-linhas, inflação ~quadrática — somada à assimetria de admissão
  (impressão sem gate LGPD, sem marcação interna server-side, sem dedup no servidor,
  enquanto pageview tem os três). **Dono: PRD 04.**
- **Problema 2 ("Tráfego pago" fantasma)**: `classifyChannel` atribui "pago" pela mera
  presença de `fbclid`/`gclid` (`analyticsClient.ts:23` → `analyticsShared.ts:126`),
  com precedência sobre "social", persistido para sempre na coluna `referrer`;
  hipótese principal = fbclid de cliques ORGÂNICOS do Meta vindos da automação social
  da própria rede. **Dono: PRD 05.**

Os 12 PRDs cobrem os 25 itens e as 7 regras de consistência sem lacuna de dono
(matrizes §5/§6). A implementação segue as ondas do §1 (04/05 → 01/02/03 → 06/07 →
08/09/10, com 11 contínuo e 12 como gate), sempre com rollout §6 (canário resenhavip
antes da rede); o Anexo A já foi rodado e fechou a lacuna de dados de diagnóstico.
**Planejamento aprovado (2026-07-24); nenhum código de produção alterado ainda —
próxima etapa é a implementação PRD a PRD, com aprovação a cada rollout.**
