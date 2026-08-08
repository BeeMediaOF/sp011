# STATUS — Auditoria de Precisão do Analytics (rede sp011)

> Persistência incremental obrigatória (regra do `PRD_ANALYTICS_PLANEJAMENTO_v2.md` +
> ajuste 9): este arquivo é gravado ANTES e DEPOIS de cada fase, para retomada segura
> após queda de sessão ou compactação de contexto. Entregáveis em `analytics-audit/`
> (decisão do usuário — não `docs/prd/`). Nenhum código de produção é alterado.

## Fase atual

**COMPLETO E REVISADO — Fases 0.1, 0.2, 1 e 2 entregues, revisadas e validadas com
dados reais** (2026-07-23). Os 12 PRDs + inventário + auditoria + ROADMAP estão no disco
em `analytics-audit/`, revisados individualmente, com consistência cruzada e com a §9
(Anexo A executado) integrada. Pronto para aprovação e implementação.

### Método
- PRDs 01–10: escritos por workflow; PRDs 11, 12 e ROADMAP diretamente (molde 04/05/08).
- **Revisão individual** dos 12: rodada (PRD 01–11 no 1º workflow, 42 correções; PRD 12
  no 2º passe, veredito APROVADO COM CORREÇÕES).
- **Consistência cruzada** (ajuste 6): rodada — série coerente, sem correções necessárias
  (nomes canônicos, janelas de dedup, margens e severidades batem entre PRDs).
- **Anexo A (dados reais)**: executado; §9 da auditoria integrada nos PRDs 04, 05 e 02.

### Resultado da Fase 0.2 (28 agentes; 18 claims verificados adversarialmente, 0 refutados)

- 25 itens: **11 OK · 6 Parcial (6, 15, 17, 18, 23, 25) · 8 Bug (3, 4, 11, 14, 19,
  20, 21, 24)** — todos "Confirmado no código" com arquivos reabertos.
- **Problema 1 — causa nuclear NOVA**: `upsertDailyStat` sem UNIQUE em
  `(ad_id,date)` → INSERT sempre + UPDATE em todas as linhas (inflação
  ~quadrática, `ads.ts:36-50`), somado à assimetria estrutural (impressão sem gate
  LGPD, sem marcação interna server-side, sem dedup server). `adDailyChart` tem
  defeito próprio de sobrescrita (`analytics.ts:658-661`).
- **Problema 2**: 8 claims confirmados — `paidClick` pela mera presença de
  gclid/fbclid (`analyticsClient.ts:23`) com precedência máxima
  (`analyticsShared.ts:126`) e persistência permanente do canal; hipótese
  principal: fbclid de cliques ORGÂNICOS do Meta vindos da própria automação
  social da rede.
- Correções de inventário aplicadas/registradas em `00-inventario.md` §8.
- Anexo A da auditoria: SQLs prontos para a VPS (fecham a lacuna de dados).

## Artefatos

| Artefato | Estado |
|---|---|
| `00-inventario.md` | ✅ concluído (2026-07-22); correções da 0.2 aplicadas (§8) |
| `00-auditoria-estado-atual.md` | ✅ concluído (2026-07-23); integridade reconferida — §§1–8 na ordem original + §9 (dados reais); nenhum revisor editou o arquivo indevidamente |
| PRD 01–10 | ✅ escritos (rascunho 1ª mão) |
| PRD 11, 12 | ✅ escritos (rascunho 1ª mão) |
| `ROADMAP.md` (Fase 2) | ✅ escrito |
| Revisão individual (PRD 01–11) | ✅ 11 revisados, 42 correções aplicadas (workflow 2026-07-23) |
| Revisão do PRD 12 | ✅ **VEREDITO: APROVADO COM CORREÇÕES** (2026-07-23). 41 achados dos 3 revisores; materiais aplicados no corpo (RF2/CA2 do `setInterval`, tautologia do `--assert`, oráculos "agregação" com tráfego interno, guarda do `DELETE ads`, Anexo A executado); menores no §16; 3 rejeitados. Nota de cabeçalho registra o passe |
| Consistência cruzada (ajuste 6) | ✅ **COERENTE, sem correções** (2026-07-23). Nomes canônicos batem (ads_reliable_since/adsReliableSince = SQL/JS; 7 ids de regra; PaidCampaign; PAID_RULE_SINCE); janelas de dedup (30min/10s) idênticas 03↔04; `adMargin` 3→1.5 e severidade warning→critical idênticos 04/11/12 |
| **Anexo A executado com dados reais** | ✅ **2026-07-23 — resultados na §9 da auditoria** |
| Integração da §9 no **PRD 04** | ✅ concluída (2026-07-23) — estimador validado (65=65), fatores reais por blog, rótulos promovidos a "Confirmado com dados" |
| Integração da §9 no **PRD 05** | ✅ concluída (2026-07-23) — gate liberado; RF5 corrigido (UTM antes do host); c9 e cabeçalho promovidos a "Confirmado com dados" |
| Integração da §9 no **PRD 02** | ✅ concluída (2026-07-23) — pré-diagnóstico obrigatório no RF2 (`behavior_events` vazia na rede; causas candidatas no código; prova via script do PRD 12) |

## Checkpoint acordado

Ao concluir a 0.1: **parar e mostrar o `00-inventario.md` ao usuário**. A Fase 0.2 só
começa com o OK dele.

## Fronteiras entre PRDs (ajuste 5 — decididas no plano aprovado, antes da Fase 1)

- Dedup de impressão server-side → **PRD 04**; PRD 03 fica com filtros genéricos de ingest e referencia o 04.
- Contadores `droppedBot` para ads/behavior: incremento nas rotas → **PRD 03**; exposição/alerta → **PRD 08**.
- `is_internal` em `behavior_events` (e eventual dimensão interna em `ad_daily_stats`): coluna (Drizzle+ensureSchema) → **PRD 01**; lógica de marcação no ingest → **PRD 03** (e 04 para ads).
- Gate de consentimento da newsletter → **PRD 02**; PRD 03 apenas anota que o servidor não distingue.

Fronteiras ADICIONAIS (achados novos da 0.2, decididas antes da Fase 1):
- UNIQUE `(ad_id,date)` + upsert atômico + **reparo dos dados históricos inflados** de `ad_daily_stats` → **PRD 04** (o padrão de migração Drizzle+ensureSchema é definido no PRD 01).
- Defeitos de agregação do `/stats` (item 3 ordenação `analytics.ts:589`; item 6 EXISTS sem `is_internal`/`type`; item 17 byDow sem normalização; item 18 chave do scroll) → **PRD 06**; `adDailyChart` (sobrescrita, ad-specific) → **PRD 04**.
- Exibição/cálculo no frontend (item 14 chips % `Analytics.tsx:350/:793-795`; barra do Dashboard `:343-344`; exibição do item 24) → **PRD 10**; totais NÃO truncados de comportamento servidos pelo backend (hoje soma top-15/top-10) → **PRD 07**.
- Dedup do evento `category` no ingest (escapa do 15s) → **PRD 03**; cobertura do `link_click` (mailto:/tel:, links fora do corpo) → **PRD 02**.

## Lacuna declarada (ajuste 4)

Validação contra dados reais do banco **não executada nesta sessão — MCP Supabase não
conectado**. Todo critério de aceite que dependa de query fica marcado "pendente de
execução", nunca como atendido. A Fase 0.2 entregará um anexo de SQLs prontos (padrão
§12 do CLAUDE.md) para o usuário rodar na VPS.

## Achados da validação com dados reais (Anexo A, 2026-07-23) — ver §9 da auditoria

1. **Inflação do upsert CONFIRMADA COM DADOS** e o estimador de reparo do PRD 04
   **validado exatamente**: no esporteagora, `MAX−1` somado dia a dia = **65**, batendo
   com o contador all-time correto (`ads.impressions` = 65) contra 1052 armazenadas
   (16,2×). Padrão `{N+1,…,2}` literal no sp011 (17 linhas do mesmo par em 07-17).
2. **Hipótese c9 CONFIRMADA**: ksports com **110 sessões "pago"** vindas de
   facebook.com/m.facebook.com **sem nenhuma UTM** → só pode ser `fbclid` de clique
   ORGÂNICO. Agravante novo: sp011/oleysports/beeesportes têm `utm_medium=social`
   (marcado pela própria automação da rede) **sobrescrito para "pago"** pelo fbclid.
3. **GATE DO PRD 05 LIBERADO**: zero Google Ads real no histórico → o remap total do
   legado (RF5) está validado. **PORÉM exige 1 ajuste**: o remap deve consultar
   `utm_medium`/`utm_source` ANTES do fallback por host (há linha social com
   `ref_host` nulo que viraria "desconhecido").
4. **Assimetria de consentimento sustentada**: dias com dezenas de impressões REAIS e
   ZERO pageviews não-internos em 4 blogs.
5. **Achado novo**: `behavior_events` vazia em toda a rede (zero `link_click` e
   `newsletter` em todos os blogs) — verificar instrumentação no PRD 02 (Hipótese).
6. Marcação interna funcionando (item 25 sem bug); violações de `clicks > impressions`
   já presentes no dado bruto (provam a regra R1 do PRD 11).

## Próxima ação

**Fase de planejamento COMPLETA.** Não há mais pendência de método nem de conteúdo:
todos os 12 PRDs revisados, o PRD 12 com veredito, consistência cruzada rodada (coerente),
e a §9 (dados reais) integrada nos 3 PRDs afetados (04/05/02). Todos os critérios de
aceite que a §9 fechou estão promovidos a "Confirmado com dados"; o que continua
dependendo de query pós-rollout segue "pendente de execução" (correto).

**Único passo restante: aprovação do usuário** e então implementação PRD a PRD, na ordem
do `ROADMAP.md` §1 (04/05 → 01/02/03 → 06/07 → 08/09/10; 11 contínuo; 12 como gate).
Nada foi commitado (untracked, como o `security-audit/`); nenhum código de produção
tocado. Ao implementar, cada PRD é autocontido e traz seu próprio bloco de rollout §6.

_Última atualização: 2026-07-24 — **planejamento APROVADO pelo usuário**. `ROADMAP.md`
sincronizado com este STATUS (cabeçalho/estado, "Lacuna de dados", §8 Anexo A e §9 fecho
estavam congelados no estado de 1ª mão; agora refletem revisão feita + consistência
cruzada rodada + Anexo A executado). Início da fase de implementação: **PRD 01 primeiro**
(base/migração), depois Onda A (04/05), na ordem do ROADMAP §1 — código de produção por
PRD, com gate/rollout §6 a cada etapa._

_2026-07-23 23:30 — fechamento concluído manualmente (sem workflow): veredito do PRD 12,
consistência cruzada e integração da §9 nos PRDs 05 e 02. `_PENDENTE-revisao-prd12.md`
aplicado e removido._
