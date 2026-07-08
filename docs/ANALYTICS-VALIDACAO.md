# Analytics — roteiro de validação manual

Objetivo: comparar **evento bruto → linha no banco → número no painel** para
cada métrica, num ambiente controlado. Rode após cada deploy que tocar o
pipeline de analytics.

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

## Conferência final

Para cada item: o número no PAINEL = agregação do `/stats` = linhas em
`analytics_events`/`ad_daily_stats`. Qualquer divergência fora do skew de 30s
do buffer é bug — abrir investigação, não aceitar o número.
