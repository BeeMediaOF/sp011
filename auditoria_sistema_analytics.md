# Auditoria do Sistema de Analytics — 03/07/2026

> **STATUS (03/07/2026): TODOS os itens abaixo foram corrigidos no código** (críticos C1-C5,
> altos A1-A6 e médios M1-M7 — exceto a troca do provedor de geolocalização, ver nota em A2).
> A limpeza do histórico foi executada no banco: **918 eventos do painel admin** (metade do
> total!), **54 pageviews duplicados** de artigo e a tabela `geo_stats` (74 "views" sem
> significado) foram removidos — de 1.846 eventos restaram 874 legítimos.
> Script rerunnável: `node lib/db/scripts/cleanup-analytics-history.mjs`
> (rodar de novo após o deploy remove duplicados criados pelo código antigo no intervalo).

Verificação completa do pipeline: coleta no navegador (`useAnalytics.ts`) → ingestão (`/api/analytics/*`) → armazenamento (Postgres + store em memória) → exibição (Analytics.tsx, Dashboard.tsx, realtime-stats).

**Veredito geral:** a arquitetura é sólida (buffer em lote, consentimento LGPD, sendBeacon, índices corretos), mas hoje **os números exibidos NÃO são confiáveis**. Há percentuais literalmente inventados no código, pageviews de artigo contados em dobro, tráfego do próprio painel admin misturado ao do site, e métricas com rótulo diferente do que calculam.

---

## 🔴 CRÍTICOS — números errados ou falsos exibidos hoje

### C1. Percentuais de tendência são FAKE (hardcoded)
Os "vs últimos 30 dias / vs ontem / vs semana passada" nunca são calculados — são strings fixas:

- `Analytics.tsx:261-297` — `+14,3%`, `+12,7%`, `+8,6%`, `-6,2%`
- `Dashboard.tsx:112-141` — `+12,4%`, `+8,7%`, `+14,3% vs ontem`, `+9,8% vs semana passada`
- `Dashboard.tsx:373-375` — anúncios: `+16,4%`, `+9,5%`, `+1,1%`

**Impacto:** o gestor toma decisão achando que o tráfego cresce 14% — número inventado.
**Correção:** calcular no `/stats` (comparar janela atual vs anterior) ou remover os badges.

### C2. Pageview DUPLICADO em toda página de artigo
- `App.tsx:163` — `useAnalytics()` envia pageview genérico em **toda** navegação.
- `Artigo.tsx:101-106` — `trackArticle()` envia um **segundo** pageview do mesmo hit (com articleId).

**Impacto em cascata:**
- Hoje/Semana/Mês/Total inflados (~2× no tráfego de artigos, que é a maior parte de um portal).
- **Taxa de rejeição irreal:** quem entra direto num artigo e sai gera 2 pageviews → nunca conta como rejeição. A métrica fica artificialmente baixa.
- Gráficos diário/por hora/dispositivos/origem inflados na mesma proporção.
- `store.trackArticleView` conta 1× (correto), então "views do artigo" ≠ soma dos pageviews — os números não fecham entre si.

**Correção sugerida:** no `useAnalytics`, suprimir o pageview genérico quando a rota é `/artigo/:slug` (o `trackArticle` já envia o pageview completo com título/categoria/articleId). Os dados históricos ficam inflados — ver seção "Limpeza de histórico".

### C3. Um evento malformado TRAVA a gravação de analytics para sempre
`analytics.ts:133-164` — o `type` é aceito sem validar contra o enum do Postgres (`type as AnalyticsEvent["type"]`); `duration`/`scrollDepth` sem validação numérica; strings sem limite de tamanho.

O flush é em lote único (`analytics.ts:34-64`): se **um** evento do lote for inválido, o INSERT inteiro falha, o catch devolve o lote ao buffer, e **todo flush seguinte falha de novo** → a coleta para silenciosamente até o próximo deploy, descartando tudo que passar de 500 eventos.

Qualquer pessoa derruba a coleta com um comando:
```
curl -X POST https://site/api/analytics/event -H 'Content-Type: application/json' \
  -d '{"type":"xxx","path":"/","sessionId":"a"}'
```

**Correção:** validar/normalizar na entrada (enum whitelist, `Number.isFinite` + clamp, `slice` nas strings) **e** no catch do flush inserir um-a-um descartando o evento que falhar.

### C4. Top artigos/categorias misturam ALL-TIME com 30 dias (e contam duplicado)
- `analytics.ts:310-319` — `views: disk?.views ?? mem?.views`: para qualquer artigo já persistido (todos com ≥1 view), exibe a contagem **desde sempre** num dashboard rotulado "últimos 30 dias".
- `analytics.ts:321-325` — `topCategories.clicks` = contador persistido (all-time, que **já inclui** os últimos 30 dias) **+** eventos dos últimos 30 dias → **os 30 dias recentes contam 2×**.

**Correção:** decidir a semântica (recomendo: eventos de 30 dias como fonte única para o ranking; manter o contador persistido só como "total histórico" rotulado assim).

### C5. Navegação no painel admin conta como tráfego do site
`App.tsx:285` — `<AnalyticsProvider />` roda para todas as rotas, incluindo `/admin/*`. Editor com consentimento aceito navegando no painel gera pageviews, sessões, devices e horários que entram nas métricas do portal.

**Correção:** no `useAnalytics`, retornar cedo quando `location.startsWith("/admin")`. Opcional: limpar histórico (`DELETE FROM analytics_events WHERE path LIKE '/admin%'`).

---

## 🟠 ALTOS — métricas enganosas ou frágeis

### A1. CTR de anúncios sem base real — só o AdBanner registra impressão
- `AdBanner.tsx:67-74` registra impressão; **AdSlot, AdInFeed, AdSidebar, AdCentral e DestaquesListaBadge registram clique mas NUNCA impressão**.
- Resultado: anúncios nesses formatos têm cliques com 0 impressões → CTR exibido `0%` (guard em `AdsManager.tsx:24-27`) ou distorcido; os KPIs somados (`adKpis`) misturam formatos com e sem impressão.
- A impressão do AdBanner dispara no **mount**, sem checagem de visibilidade — banner abaixo da dobra que ninguém viu conta impressão (padrão IAB: 50% visível por ≥1s, via IntersectionObserver).

### A2. Geografia (Top Cidades/Estados) não mede o que diz
`analytics.ts:97-130`:
- `geo_stats.views` incrementa **1× por IP não-cacheado por processo** — não é pageview nem visitante único; a cada restart do container o mesmo IP conta de novo. O número cresce para sempre sem janela de tempo (o dashboard exibe como se fosse "views").
- O IP usado vem do **primeiro** valor de `x-forwarded-for` (`analytics.ts:141`) — forjável pelo cliente (`curl -H "X-Forwarded-For: 8.8.8.8"`). O Express já tem `trust proxy: 1` correto (`app.ts:103`); basta usar `req.ip`.
- A primeira visita de um IP não recebe city/region no evento (lookup assíncrono ainda em voo) — as colunas `city/region` de `analytics_events` ficam nulas na maioria e hoje nem são usadas pelo `/stats`.
- `ip-api.com` gratuito: HTTP puro, 45 req/min, e os termos **proíbem uso comercial**. Para um portal com anúncios, considerar ipinfo/ipdata pagos ou GeoLite2 local (MaxMind, sem chamada externa).

### A3. Fuso horário: tudo em UTC, público em Brasília (UTC-3)
Sem `TZ` no docker-compose; `toISOString()`/`getHours()`/`getDay()` rodam em UTC:
- "Pico por hora" deslocado 3h (pico real às 20h aparece às 23h).
- Acessos de 21h-00h caem no **dia seguinte** no gráfico diário e no dia da semana.
- `ads.ts:8-10` — o "dia" das estatísticas diárias de anúncio vira às 21h de Brasília.

**Correção:** converter para `America/Sao_Paulo` na agregação (ou definir `TZ=America/Sao_Paulo` no container e padronizar).

### A4. Perda de eventos a cada deploy/restart
Buffer em memória com flush a cada 60s (`analytics.ts:29-71`) e **sem flush no shutdown** → até 60s/500 eventos somem em todo deploy (e o projeto faz deploy frequente). No erro de flush, o re-enfileiramento trunca para caber em 500 (`analytics.ts:59`), descartando o excedente.

**Correção:** handler de `SIGTERM`/`beforeExit` chamando `flushBuffer()`; reduzir intervalo para ~15s.

### A5. Rótulos não batem com o que é calculado
| Onde | Rótulo | O que realmente é |
|---|---|---|
| Analytics/Dashboard | "Hoje" / "Views hoje" | Janela móvel de 24h, não o dia calendário |
| Analytics.tsx:269 | "Usuários únicos" | Sessões (sessionStorage **por aba**, 30 dias) — 2 abas = 2 "usuários" |
| Analytics.tsx:279 | "Tempo médio de sessão" | Média de tempo **por página** (evento `read`), incluindo home/categorias |
| Analytics.tsx:1081 | "Newsletters enviadas" | São **inscrições** (`newsletterSignups`), não envios — o form do rodapé (Footer.tsx:57) emite o evento corretamente; só o rótulo estava errado |
| Analytics.tsx:69 | busca → "Google" | Inclui Bing/Yahoo/DuckDuckGo/Baidu |
| Analytics.tsx:71 | classe "rss" | Nunca é produzida pelo `classifyReferrer` — entrada morta |

### A6. Endpoints públicos sem proteção contra inflação artificial
`/api/analytics/event`, `/api/analytics/behavior`, `/api/ads/:id/impression`, `/api/ads/:id/click` — sem rate limit (o `endpointRateLimit` existe mas só protege `/api/publish`) e sem filtro de user-agent de bot. Qualquer script infla pageviews, impressões e cliques de anúncio (este último afeta cobrança de anunciante).
Mitigação natural que já existe: o gate de consentimento impede que bots que executam JS enviem eventos pela UI — mas a API direta é livre.

---

## 🟡 MÉDIOS

1. **Duração de leitura sem teto** (`useAnalytics.ts:62-85`): aba esquecida aberta → `read` de horas entra na média. Capar em ~30min no servidor. Edge: após `pagehide` + volta via bfcache, o mesmo período pode ser contado 2×.
2. **`/stats` não escala** (`analytics.ts:199-224`): carrega TODAS as linhas de 30 dias em memória (select sem projeção) e agrega em JS, a cada 30s por aba de admin aberta. Com 20k pv/dia ≈ >1M linhas/mês. Migrar agregações para SQL (`date_trunc`, `count(*) group by`) quando o tráfego crescer.
3. **Scroll depth usa `slug` como articleId** (`Artigo.tsx:98`) enquanto pageview/read usam `article.id` → impossível cruzar por artigo. Páginas mais curtas que a viewport nunca disparam 100% → "Leram 100%" subestimado.
4. **Origem (referrer) atribuída por pageview, não por sessão**: `document.referrer` não muda em navegação SPA → visitante do Google lendo 10 páginas = 10 hits "busca". O padrão de mercado atribui a origem na entrada da sessão.
5. **realtime-stats** lê eventos recentes só do DB → até 60s de atraso (não inclui o buffer).
6. **Impressão aceita anúncio inativo/expirado** (`ads.ts:142-161` só checa existência; o click checa `active`).
7. **`behavior.value` sem cap no servidor** (cliente limita 200/500 chars, mas a API aceita até 512kb).

---

## ✅ O que está correto (e deve ser mantido)

- **Consentimento LGPD** gate em todos os envios (`useAnalytics.ts:28,107`) — inclusive impede a maioria dos bots de sujar os dados.
- **`sendBeacon` + keepalive** para não perder evento na saída da página.
- **Buffer em lote** no servidor: abordagem certa para escala (só precisa da validação do C3 + flush no shutdown).
- **`trust proxy: 1`** correto no Express (`app.ts:103`) — falta só o analytics usar `req.ip`.
- **Índices** de `analytics_events` adequados (ts, type+ts, session, article).
- **Merge do buffer no `/stats`** — números aparecem em tempo real mesmo antes do flush.
- **Dedup de milestones de scroll** por página; **upsert de ad_daily_stats** correto.
- Detecção de dispositivo por UA: simples mas adequada.

---

## Ordem de correção recomendada

| # | Item | Esforço | Efeito |
|---|---|---|---|
| 1 | C1 — remover/calcular os % fake | Baixo | Elimina informação falsa imediatamente |
| 2 | C2 — deduplicar pageview de artigo | Baixo | Conserta totais, bounce rate e gráficos daqui pra frente |
| 3 | C3 — validar payload + flush resiliente | Baixo | Garante que a coleta nunca trava |
| 4 | C5 — excluir `/admin` do tracking | Trivial | Dados só de visitantes reais |
| 5 | C4 — semântica única (30d) nos rankings | Médio | Rankings consistentes |
| 6 | A5 — corrigir rótulos (ou métricas) | Baixo | O que se lê = o que se mede |
| 7 | A3 — fuso America/Sao_Paulo | Baixo | Pico por hora/dia corretos |
| 8 | A1 — impressão via IntersectionObserver em todos os formatos | Médio | CTR real |
| 9 | A2 — `req.ip` + repensar geo (GeoLite2 local) | Médio | Cidades/estados com significado |
| 10 | A4 — flush no SIGTERM | Baixo | Sem perda no deploy |
| 11 | A6 — rate limit leve nos endpoints públicos | Médio | Resiliência a inflação artificial |

### Limpeza de histórico (opcional, após corrigir C2/C5)
```sql
-- Remove tráfego do painel admin
DELETE FROM analytics_events WHERE path LIKE '/admin%';

-- Remove o pageview genérico duplicado dos artigos
-- (mesma sessão+path, sem articleId, a ≤10s de um pageview com articleId)
DELETE FROM analytics_events a
USING analytics_events b
WHERE a.type='pageview' AND b.type='pageview'
  AND a.article_id IS NULL AND b.article_id IS NOT NULL
  AND a.session_id = b.session_id AND a.path = b.path
  AND abs(extract(epoch from (a.ts - b.ts))) <= 10;
```
Sem a limpeza, os totais históricos ("desde o início") permanecem inflados e a comparação com períodos futuros (pós-correção) mostrará queda artificial.
