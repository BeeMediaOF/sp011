# PRD — Módulo "Transferências" (rumores) + bloco na home

> Escrito em 2026-08-31. Cadastro **manual** de possíveis transferências de
> jogadores: um módulo novo no painel de cada blog e um bloco novo na home.
> Este documento é o plano de implementação — nenhuma linha de código foi
> escrita ainda. Referências de arquivo apontam para o estado do repo em
> `48e5463`.

---

## 0. Sumário executivo

| | |
|---|---|
| **O que entrega** | Módulo `/admin/transferencias`, bloco de home `transfers`, página pública `/transferencias` |
| **Onde os dados moram** | Duas chaves novas em `settings` (`transfer_rumors`, `transfer_clubs`) — **sem tabela nova** |
| **Quem consome** | O `/api/site`, que já é buscado pelo SSR — o bloco nasce no HTML do servidor |
| **Serviços afetados** | `api` **e** `web` → bump de `BLOG_IMAGE_VERSION` obrigatório (§6 do CLAUDE.md) |
| **Central** | Não é tocada. É um módulo por blog, sem coleta e sem IA |
| **Frentes paralelas** | A (trava) → B, C, D, E em paralelo → F |

---

## 1. Contexto e objetivo

Os sete blogs de esporte da rede publicam notícia de mercado de transferências
o tempo todo, mas não têm onde registrar o **rumor** em si — a informação
estruturada de que um jogador pode sair do clube X para o clube Y, com uma
probabilidade estimada. Hoje isso só existe dentro do corpo dos artigos, e some
do site assim que a notícia rola para baixo.

O objetivo é dar ao operador um cadastro manual desses rumores e um bloco de
home que os exibe como painel permanente — o formato consagrado dos portais de
mercado da bola.

Duas restrições estruturais valem desde a primeira linha:

1. **A imagem é UMA para os 11 blogs.** O módulo existe em todo blog assim que a
   imagem sobe; quem decide se ele aparece no site é o operador, adicionando o
   bloco. Mesma mecânica da aba Top News (§17 do CLAUDE.md).
2. **Nada de conteúdo de blog embutido na imagem** (§13). Nem clube, nem escudo,
   nem exemplo — o catálogo de clubes chega por SQL, blog a blog.

---

## 2. Decisões fechadas

### 2.1 Os dados moram em `settings`, não em tabela nova

Colunistas são exatamente este caso e já resolvem assim: `store.getColumnists()`
lê uma **linha própria** da tabela `settings` (chave `columnists`), que entra no
`SYNCED_KEYS` e é reidratada a cada 15 s em todos os processos, sem restart.

- [store.ts:1137-1160](../artifacts/api-server/src/lib/store.ts#L1137-L1160) — o CRUD a espelhar
- [store.ts:753](../artifacts/api-server/src/lib/store.ts#L753) — `SYNCED_KEYS`

Duas chaves novas:

| Chave | Conteúdo |
|---|---|
| `transfer_rumors` | os rumores, em todos os status |
| `transfer_clubs` | catálogo de clubes reutilizáveis (nome, país, escudo) |

**Por que não uma tabela**: nada aqui é consulta. É uma lista curada de dezenas
de itens, lida inteira a cada render. Uma tabela custaria schema no `lib/db`,
entrada no `ensureSchema.ts`, e não compraria nada. **Guarda de tamanho**: teto
de 200 rumores e 300 clubes por blog, recusado no servidor com 409 — o blob de
settings é reescrito inteiro a cada edição, e é isso que o mantém barato.

### 2.2 O `/api/site` carrega só os rumores ATIVOS

Isso dá SSR de graça. O [`renderHome`](../artifacts/brasilia-agora/vite.config.ts#L754)
já busca `/api/site` e entrega o payload inteiro ao render — o bloco sai no HTML
do servidor, sem fetch no cliente, sem CLS, sem o "pisca" que o bloco de playlist
tem. O payload público leva a lista **já filtrada, já ordenada e já com o teto
aplicado**; o painel lê a lista completa por `/api/admin/transfers`.

Blog que não usa o módulo manda `"transfers":[]` — custo zero nos outros dez.

### 2.3 Clubes: catálogo pré-carregado **e** criação no formulário

*(decidido com o usuário em 2026-08-31)*

As duas coisas, porque resolvem problemas diferentes:

- **Pré-carregado** por SQL (`deploy/transferencias/clubes_seed.sql`): ~100
  clubes — os do futebol brasileiro e os grandes do mundo — para o operador não
  começar de uma tela vazia.
- **Criação inline**: a busca do formulário que não acha nada oferece
  `➕ Cadastrar «Vasco da Gama»`, com nome + país + escudo ali mesmo. Sem isso,
  todo clube fora da lista viraria pedido de suporte.

**O seed NÃO vai na imagem, vai por SQL.** É a lição das 25 fontes RSS do sp011
(§13): a imagem não sabe qual blog está rodando, então instalar o catálogo nela
o colocaria também no credito.vc, no pontofarma e no ocomandante — três blogs
que não falam de futebol. SQL por blog, rodado no go-live do módulo.

**O seed não traz escudo.** Escudo de clube é marca de terceiro, e 100 imagens
commitadas engordariam o repo para um recurso que a maioria dos blogs não usa.
O operador sobe o escudo **só dos clubes que realmente usar** — meia dúzia, na
prática. Enquanto não subir, o bloco desenha um **monograma**: círculo na cor de
destaque do blog com as iniciais do clube. O bloco nunca fica com buraco.

### 2.4 Ordem no bloco: data da informação, mais recente primeiro

*(decidido com o usuário em 2026-08-31 — difere do mock, que está ordenado por
probabilidade)*

O bloco é um painel de **últimos rumores**, não de "mais prováveis". A
probabilidade continua exibida à direita, com o mesmo peso visual do mock; ela
só não é mais a chave de ordenação.

Consequência que o desenho precisa absorver: **`infoDate` vira o campo que
ordena a home**. Portanto:

- o campo nasce preenchido com **hoje** (é o que o mock já mostra: `25/05/2025`);
- rumor salvo sem data cai para o `updatedAt` na ordenação — nunca vai para o
  fim da fila em silêncio;
- editar um rumor antigo **não** o traz de volta ao topo (o critério é a data da
  informação, não a da edição) — o que é o comportamento correto para corrigir
  um erro de digitação sem republicar o rumor.

Desempate: `infoDate` desc → `updatedAt` desc → `id` (estável, para o SSR e o
cliente pintarem na mesma ordem).

### 2.5 Moeda: seletor por rumor

Cada rumor guarda a sua (`EUR` | `USD` | `BRL` | `GBP`). Um rumor da Premier
League sai em libras e um do Brasileirão em reais, no mesmo bloco.

O valor é **numérico**, e a formatação é feita por um helper próprio —
**sem `Intl`**. Motivo: o ICU do Node e o do navegador podem divergir, e
divergência entre SSR e hidratação é o React #418, que já custou o LCP da home
uma vez (§17). Helper puro, testado, byte-idêntico dos dois lados.

### 2.6 Posição é enum, não texto livre

"Atacante"/"Meio-campista" digitados aparecem em português no ksports, que é o
blog EN. Guarda-se a chave (`forward`, `midfielder`…) e o rótulo sai do i18n
público — a mesma regra que vale para todo texto da imagem compartilhada (§15).

Nacionalidade continua texto livre (o mock pede "Ex: Brasil").

### 2.7 A página `/transferencias` entra nesta entrega

*(decidido com o usuário em 2026-08-31)*

O rodapé do bloco no mock diz "Ver todas as possíveis transferências" — o link
precisa de destino. Path em português nos sete blogs, inclusive no ksports (EN),
onde o rótulo sai "TRANSFERS" pelo i18n: **o rótulo é dado, o path é código**,
a mesma regra do `/top-news`. A diferença de idioma em relação àquele é
deliberada — "transferências" é o termo de busca real em 6 dos 7 blogs, e essa
página tem valor de SEO que a de mais-lidas não tem.

**A página não entra no menu.** A porta de entrada é o link do bloco, como no
mock. Colocar no menu reabriria o efeito colateral de "Aplicar template apaga o
menu" (§8), que na entrega da aba Top News custou seis `template_final.sql` e
dois starters de código.

---

## 3. Modelo de dados

### 3.1 Tipos

```ts
export type TransferPosition =
  | "goalkeeper" | "defender" | "fullback" | "midfielder"
  | "attacking_mid" | "winger" | "forward" | "coach";

/** Só "active" aparece no site. Os outros três são o ciclo de vida do rumor. */
export type TransferStatus = "active" | "draft" | "done" | "dropped";

export type TransferCurrency = "EUR" | "USD" | "BRL" | "GBP";

export interface TransferClub {
  id: string;            // slug determinístico do nome — é o que torna o seed idempotente
  name: string;
  country?: string;
  crestUrl?: string;     // /api/uploads/... ; vazio = monograma
  createdAt: string;
}

export interface TransferRumor {
  id: string;
  playerName: string;
  playerPhotoUrl?: string;     // /api/uploads/...
  position: TransferPosition;
  nationality?: string;
  age?: number;                // 14–60
  marketValue?: number;
  fromClubId: string;
  toClubId: string;
  probability: number;         // 0–100, inteiro
  transferValue?: number;
  currency?: TransferCurrency;
  source?: string;             // "Jornal Marca, Fabrizio Romano"
  infoDate?: string;           // ISO date (só data) — CHAVE DE ORDENAÇÃO
  notes?: string;
  status: TransferStatus;
  createdAt: string;
  updatedAt: string;
}
```

O tipo fica **espelhado em dois arquivos** — é a convenção do repo, a mesma de
`HomeBlock`, que vive em [store.ts:117](../artifacts/api-server/src/lib/store.ts#L117)
e em [homeBlocks.ts:64](../artifacts/brasilia-agora/src/lib/homeBlocks.ts#L64):

- `artifacts/api-server/src/lib/transfers.ts`
- `artifacts/brasilia-agora/src/lib/transfers.ts`

**Mudar nos DOIS.**

### 3.2 Integridade referencial sem banco relacional

O rumor guarda `fromClubId`/`toClubId`; o clube pode ser apagado. Duas defesas:

1. **No painel**: excluir um clube em uso pede confirmação e diz quantos rumores
   o referenciam.
2. **No servidor**: `publicRumors()` **descarta** o rumor cujo clube não existe
   mais, em vez de renderizar "undefined → Manchester City". O rumor continua no
   cadastro (o operador conserta), mas não vai ao ar quebrado.

---

## 4. Frentes de trabalho

```
Frente A (contratos + libs puras)  ── 1ª, curta, trava as demais
        │
        ├── Frente B  backend         ─┐
        ├── Frente C  módulo do admin  │  as quatro em PARALELO
        ├── Frente D  bloco da home    │
        └── Frente E  página pública  ─┘
                                        └── Frente F  seed + deploy + docs
```

A é pequena (dois arquivos puros + os tipos) e é o que impede B/C/D/E de
brigarem pelo mesmo contrato. Depois dela as quatro tocam arquivos quase
disjuntos — o único compartilhado é `homeBlocks.ts`, entre D e E, e em pontos
diferentes do arquivo.

---

### Frente A — contratos e libs puras *(bloqueia as demais)*

**`artifacts/brasilia-agora/src/lib/transfers.ts`** (novo) — tipos + apresentação:

| Função | O que faz |
|---|---|
| `formatMoney(v, currency, lang)` | agrupamento próprio, sem `Intl` (§2.5) |
| `positionLabel(pos, t)` | chave do enum → rótulo do i18n |
| `clubMonogram(name)` | iniciais para o círculo de fallback do escudo |

**`artifacts/api-server/src/lib/transfers.ts`** (novo) — validação e ordenação:

| Função | O que faz |
|---|---|
| `normalizeRumor(input)` | recorta `probability` a 0–100 e `age` a 14–60, apara strings, exige os dois clubes, carimba `updatedAt` |
| `normalizeClub(input)` | deriva o `id` slug do nome; nome duplicado (normalizado) devolve o clube existente em vez de criar outro |
| `publicRumors(rumors, clubs, limit)` | filtra `status === "active"`, resolve clubes por id, **descarta órfãos**, ordena por `infoDate` desc → `updatedAt` desc → `id`, corta no `limit` |
| `MAX_RUMORS` / `MAX_CLUBS` | 200 / 300 |

**Testes** — `node --test`, que é o runner do repo (vitest não roda no Windows, §14):

- `artifacts/api-server/test/transfers.test.ts` — recortes de faixa; ordenação
  estável com datas iguais; rumor sem `infoDate` cai no `updatedAt`; clube órfão
  é descartado sem derrubar a lista; slug de clube com acento e com "F.C.".
- `artifacts/brasilia-agora/src/lib/transfers.test.ts` — dinheiro em pt-BR e en,
  as quatro moedas, zero, ausente, valor de 9 dígitos; monograma de nome de uma
  palavra e de nome com preposição ("Borussia Dortmund" → "BD", "Real Madrid" → "RM").

---

### Frente B — backend

| Arquivo | Mudança |
|---|---|
| [store.ts](../artifacts/api-server/src/lib/store.ts) | `transferRumors`/`transferClubs` no `StoreCache` (:564), na hidratação do boot (:679 e :773), nas `SYNCED_KEYS` (:753) e o CRUD espelhando `createColumnist`/`updateColumnist`/`deleteColumnist` (:1137-1160) |
| `artifacts/api-server/src/routes/transfers.ts` **(novo)** | `GET/POST/PUT/DELETE` de `/admin/transfers` e `/admin/transfers/clubs`. Escritas com `requirePermission("transfers.manage")`, no molde de [admin.ts:1157-1185](../artifacts/api-server/src/routes/admin.ts#L1157) |
| [routes/index.ts](../artifacts/api-server/src/routes/index.ts) | `router.use("/admin/transfers", transfersRouter)` |
| [routes/site.ts:127](../artifacts/api-server/src/routes/site.ts#L127) | `transfers: publicRumors(...)` no payload público — só ativos, ordenados, teto de 30 |
| [routes/permissions.ts:25](../artifacts/api-server/src/routes/permissions.ts#L25) | `transfers.view` e `transfers.manage` no `ALL_PERMISSIONS`, grupo "Conteúdo" |

Auditoria: toda escrita passa por `logAudit` como as demais rotas do admin.

---

### Frente C — módulo do painel

**`artifacts/brasilia-agora/src/pages/admin/TransfersManager.tsx`** (novo).

Duas telas no mesmo arquivo:

- **Lista** — tabela dos rumores com foto, jogador, origem → destino,
  probabilidade, data, status; filtro por status; botão "Cadastro manual".
- **Formulário** — fiel à 1ª imagem: breadcrumb `Transferências › Cadastro
  manual`, e quatro cartões: **Dados do jogador** (foto, nome*, posição*,
  nacionalidade, idade, valor de mercado), **Times envolvidos** (busca de origem*
  → busca de destino*, com o card de confirmação mostrando escudo e país),
  **Informações da transferência** (slider de probabilidade acoplado ao input
  numérico, valor estimado, fonte, data, observações), **Status**. Rodapé com
  Cancelar / Salvar e a caixa de Dicas.

A busca de clube **não precisa de endpoint**: o catálogo inteiro chega numa
requisição (~100 itens) e é filtrado no cliente, sem acento e sem caixa. O item
`➕ Cadastrar «X»` no fim da lista abre o mini-formulário de clube inline.

Pontos de registro:

| Arquivo | Onde |
|---|---|
| [App.tsx:79](../artifacts/brasilia-agora/src/App.tsx#L79) | `lazyWithPreload` + `<Route path="/admin/transferencias">` dentro de `RequirePermission perm="transfers.view"` |
| [AdminLayout.tsx:31](../artifacts/brasilia-agora/src/components/admin/AdminLayout.tsx#L31) | item `nav.transfers` no `NAV_MAIN`, ícone `ArrowLeftRight`, depois de Colunistas |
| [adminI18n.ts:24](../artifacts/brasilia-agora/src/lib/adminI18n.ts#L24) | `"nav.transfers"` nos **dois** dicionários |
| [adminApi.ts:185](../artifacts/brasilia-agora/src/lib/adminApi.ts#L185) | bloco `// Transfers`, espelhando o de colunistas |

⚠️ **Pegadinha de permissão**: `POST /api/uploads/image` exige `upload.images`
([uploads.ts:144](../artifacts/api-server/src/routes/uploads.ts#L144)). Um editor
com `transfers.manage` e sem `upload.images` toma 403 ao subir a foto do jogador.
O formulário trata: 403 no upload cai para um campo "URL da imagem", com o aviso
de que o administrador não liberou upload — em vez de um erro genérico.

---

### Frente D — bloco da home

Tipo de bloco novo: `transfers`. O `playlist` é o precedente recente e dá o mapa
completo dos pontos de registro (§17 do CLAUDE.md: "renderer + case + painel +
tipos nos dois stores").

| Arquivo | O que entra |
|---|---|
| [homeBlocks.ts:20](../artifacts/brasilia-agora/src/lib/homeBlocks.ts#L20) | `"transfers"` na união `HomeBlockType`, na lista de tipos especiais (:173) e no `format` padrão (:193) |
| [store.ts:117](../artifacts/api-server/src/lib/store.ts#L117) | o espelho do tipo no api-server |
| [HomeCustomBlocks.tsx](../artifacts/brasilia-agora/src/components/blocks/HomeCustomBlocks.tsx) | `export function TransfersBlock` — o cartão da 2ª imagem |
| [Home.tsx:569](../artifacts/brasilia-agora/src/pages/Home.tsx#L569) | `case "transfers":` no switch do `CustomBlock` |
| [HomeBlocksManager.tsx:82](../artifacts/brasilia-agora/src/pages/admin/HomeBlocksManager.tsx#L82) | cartão na paleta "Adicionar bloco" + `<option>` (:993) + painel do bloco (quantos itens, rótulo do link) |
| [HomeBlocksManager.tsx:631](../artifacts/brasilia-agora/src/pages/admin/HomeBlocksManager.tsx#L631) | `"transfers"` na condição do `itemsLimit` — hoje só `ARTICLE_TYPES` grava o campo, e sem isso a quantidade escolhida não persiste |
| [i18n.ts](../artifacts/brasilia-agora/src/lib/i18n.ts) | `transfers.title`, `transfers.probability`, `transfers.seeAll`, `transfers.empty` e os 8 rótulos de posição — pt **e** en |

**Render** (fiel à 2ª imagem): barra vertical de destaque + título
"POSSÍVEIS TRANSFERÊNCIAS"; por linha, foto circular de 64 px, nome em negrito,
posição em cinza, escudo + nome da origem → seta → escudo + nome do destino, e à
direita o selo com o percentual sobre fundo `accent` claro, com "Probabilidade"
abaixo; separador de 1 px entre linhas; rodapé com o link para `/transferencias`.

Cores saem das settings do blog (`footerAccentColor` / `menuBarBgColor`), **nunca
hardcoded** — a imagem é a mesma para os 11 blogs.

**Imagens**: as fotos vêm de `/api/uploads/...`, então o `<img>` pede
`?w=128&q=82` e o do escudo `?w=64`. A rota já redimensiona e converte para WebP
([uploads.ts:215](../artifacts/api-server/src/routes/uploads.ts#L215)) — é o mesmo
desperdício de 252 KiB que o [htmlUploadImages.ts](../artifacts/api-server/src/lib/htmlUploadImages.ts)
conserta para HTML solto, só que aqui o `<img>` é nosso e nasce certo.
`width`/`height` explícitos nos dois, para não haver CLS.

**Sem rumor ativo o bloco some** (`return null`); no preview do admin, mostra o
`BlockPlaceholder` com a dica de cadastrar. Cartão vazio na home é pior que
cartão nenhum.

---

### Frente E — página pública `/transferencias`

**`artifacts/brasilia-agora/src/pages/Transfers.tsx`** (novo). Cliente puro,
alimentada pelo `useSite()` que a página já carrega — **nenhum fetch extra**.
Lista completa dos ativos, com filtro por clube e busca por jogador.

As cinco amarras, idênticas às da aba Top News (§17):

1. `<Route path="/transferencias">` em [App.tsx:241](../artifacts/brasilia-agora/src/App.tsx#L241), **antes** do `/:slug`.
2. `/transferencias` em `STATIC_PAGE_PATHS` ([categoryRoutes.ts](../artifacts/brasilia-agora/src/lib/categoryRoutes.ts)) — faz **duas** coisas: o middleware de SSR classifica como `static` (nunca 404 de "editoria sem conteúdo") e o `RESERVED_PATHS` impede que o path vire editoria vazia com `noindex`.
3. `/transferencias` em `RESERVED_SLUGS` do [sitemapXml.ts](../artifacts/api-server/src/lib/sitemapXml.ts).
4. Teste em [ssrRoutes.test.ts:37](../artifacts/brasilia-agora/src/lib/ssrRoutes.test.ts#L37) — a página tem que classificar como `static`.
5. Teste em [categoryRoutes.test.ts:156](../artifacts/brasilia-agora/src/lib/categoryRoutes.test.ts#L156) — `resolveCategoryRoute("/transferencias", menu)` tem que ser `null`.

---

### Frente F — seed, deploy e documentação

- `deploy/transferencias/clubes_seed.sql` — o catálogo (§6 deste PRD).
- `deploy/transferencias/README.md` — runbook: rodar o seed, subir os escudos dos
  clubes usados, adicionar o bloco na home. Comandos completos para colar, `cd`
  no início, `grep` de conferência no fim, sem heredoc (§18).
- CLAUDE.md §17 — bullet do módulo: as duas chaves de settings, o payload
  só-ativos, a ordenação por `infoDate`, o enum de posição, o formatador sem
  `Intl` e as cinco amarras da página.

---

## 5. Arquivos tocados (consolidado)

**Backend (`api`)** — `lib/transfers.ts` (novo), `lib/store.ts`,
`routes/transfers.ts` (novo), `routes/index.ts`, `routes/site.ts`,
`routes/permissions.ts`, `test/transfers.test.ts` (novo).

**Frontend (`web`)** — `lib/transfers.ts` (novo), `lib/transfers.test.ts` (novo),
`lib/homeBlocks.ts`, `lib/categoryRoutes.ts`, `lib/i18n.ts`, `lib/adminI18n.ts`,
`lib/adminApi.ts`, `lib/ssrRoutes.test.ts`, `lib/categoryRoutes.test.ts`,
`components/blocks/HomeCustomBlocks.tsx`, `components/admin/AdminLayout.tsx`,
`pages/Home.tsx`, `pages/Transfers.tsx` (novo),
`pages/admin/TransfersManager.tsx` (novo),
`pages/admin/HomeBlocksManager.tsx`, `App.tsx`.

**Deploy/docs** — `deploy/transferencias/clubes_seed.sql` (novo),
`deploy/transferencias/README.md` (novo), `CLAUDE.md`.

**Sem schema novo**: nada em `lib/db`, nada no `ensureSchema.ts`.

---

## 6. Seed de clubes

`deploy/transferencias/clubes_seed.sql` — roda no banco **do blog**, idempotente,
no molde do [menu_top_news.sql](../deploy/top-news/menu_top_news.sql): faz o
`UPDATE` da chave `transfer_clubs` mesclando por `id` (slug do nome), então rodar
duas vezes não duplica e **não sobrescreve escudo já enviado pelo operador**.

Composição alvo (~100 clubes, nome + país, `crestUrl` vazio):

| Bloco | Aprox. |
|---|---|
| Brasil — Série A + grandes da Série B | 26 |
| Inglaterra — Premier League | 20 |
| Espanha — La Liga (principais) | 10 |
| Itália — Serie A (principais) | 10 |
| Alemanha — Bundesliga (principais) | 8 |
| França — Ligue 1 (principais) | 6 |
| Portugal, Países Baixos | 6 |
| Argentina | 4 |
| Arábia Saudita, MLS, México | 6 |

Rodado nos sete blogs de esporte com o mesmo laço de guarda de três casos do
`menu_top_news.sql` — o que distingue "banco não existe" de "pg-blogs em
recovery" e **aborta** no segundo caso em vez de anunciar que o banco sumiu.

---

## 7. Verificação

**Local** (§14 — o filtro da raiz não casa no Windows):

```
pnpm run typecheck   # dentro de artifacts/api-server E de artifacts/brasilia-agora
node --test          # nos dois pacotes
node ./build.mjs     # no api-server
```

`vite build` não roda no Windows — build real é na VPS.

**Produção** (depois do rollout §6 do CLAUDE.md):

| # | Comando | Esperado |
|---|---|---|
| 1 | `curl -s https://oleysports.com.br/api/site \| grep -o '"transfers":\[[^]]*' \| head -c 300` | array com os ativos, ordenado por data desc |
| 2 | `curl -s https://oleysports.com.br/ \| grep -c 'POSS.VEIS TRANSFER'` | ≥ 1 — **sem JavaScript**; é isto que prova que o bloco veio do SSR |
| 3 | `curl -s -o /dev/null -w '%{http_code}\n' https://oleysports.com.br/transferencias` | `200` |
| 4 | `curl -s https://oleysports.com.br/api/sitemap.xml \| grep -c transferencias` | `0` — a página não pode entrar como editoria |
| 5 | `curl -s https://credito.vc/api/site \| grep -c '"transfers":\[\]'` | `1` — blog que não usa segue com payload vazio |

---

## 8. Riscos e pegadinhas

| Risco | Mitigação |
|---|---|
| **Blob de settings crescendo sem limite** | teto de 200 rumores / 300 clubes recusado com 409 no servidor; payload público cortado em 30 |
| **Escudo faltando deixa buraco no bloco** | monograma com as iniciais na cor do blog (§2.3) |
| **Clube apagado deixa rumor órfão** | `publicRumors` descarta o rumor; o painel avisa quantos rumores usam o clube antes de excluir |
| **Editor sem `upload.images`** | o formulário cai para "URL da imagem" com aviso explícito (Frente C) |
| **Hidratação divergente no valor em dinheiro** | formatador próprio, sem `Intl`, testado nos dois lados (§2.5) |
| **Ordenação por data com data vazia** | fallback para `updatedAt`; o campo nasce preenchido com hoje |
| **Foto de 250 KiB na home** | `?w=128&q=82` no `<img>`, `width`/`height` explícitos |
| **Aplicar template apagar o bloco** | o bloco vive em `homeBlocks`, que o template substitui — igual a qualquer outro bloco. Por isso a página **não** entra no menu (§2.7): assim a entrega não obriga a mexer nos seis `template_final.sql` |

---

## 9. Fora de escopo

- **Importação automática de rumores** (Fabrizio Romano, Transfermarkt, feeds de
  mercado). O pedido é cadastro manual; a central não é tocada.
- **Aba no menu do site** — o link do bloco é a porta de entrada (§2.7).
- **Página individual por transferência** (`/transferencias/:slug`) e schema.org
  de evento esportivo.
- **Arte social do rumor** (o card pronto para o Instagram) — usa o pipeline do
  `@workspace/social-template`, que é outro trabalho.
- **Histórico da variação da probabilidade** ao longo do tempo.
- **Escudos no seed** — imagem de terceiro no repo (§2.3).

---

## 10. Deploy

Mexe em `api` **e** `web`, então **bump obrigatório** de `BLOG_IMAGE_VERSION`
(§6 do CLAUDE.md — bump sempre builda os dois juntos, senão o `up -d web`
dispara um build implícito do api no meio):

```bash
cd /opt/sp011
git pull
V=$(grep -m1 '^BLOG_IMAGE_VERSION=' .env | cut -d= -f2); N="v$((${V#v}+1))"
sed -i "s|^BLOG_IMAGE_VERSION=.*|BLOG_IMAGE_VERSION=$N|" .env
grep '^BLOG_IMAGE_VERSION=' .env
docker compose build api web
docker compose up -d api web
```

Canário no **oleysports** (é o blog da parceria e o que tem mais uso de bloco
novo), conferência pelos comandos do §7, e só então o laço paralelo dos demais.

⚠️ O build está custando ~32 min em condição normal e chegou a 65 min sob o
throttle da Hostinger (§19, item 15) — programar a janela.
