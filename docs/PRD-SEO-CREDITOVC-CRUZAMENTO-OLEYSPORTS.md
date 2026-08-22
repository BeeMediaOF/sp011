# PRD Técnico — Crédito.vc (cruzamento com a auditoria OleySports)

> **Status:** Proposto · **Data:** 2026-08-22 · **Versão:** 1
>
> **Origem:** cruzamento do PDF *"Análise de SEO, Descoberta por IAs e Conteúdo —
> Crédito.vc"* com `docs/PRD-SEO-TECHNICAL-OLEYSPORTS-V2.md`,
> `docs/PRD-P0-OLEYSPORTS-INDEXACAO-URL-SITEMAP-V2.md` e
> `docs/IMPLEMENTACAO-P0-OLEYSPORTS-RELATORIO.md`, **revalidado contra o runtime
> de produção de `credito.vc` em 2026-08-22**.
>
> **Ordem de autoridade aplicada:** runtime confirmado > código atual >
> dados/configuração atual > git history > PDF > inferência.
>
> **Estado do repositório na redação:** branch `main`, HEAD `1f36bc7`.
> Produção confirmada como **≥ v98** (o P0 do OleySports está no ar: paridade de
> User-Agent, 404 real e sitemap do acervo, todos medidos abaixo).
>
> **Nenhuma linha de código, banco, configuração ou infraestrutura foi alterada
> na produção deste documento.** Todas as 300+ requisições foram `GET`.

---

## 1. Método

O PDF é um *snapshot* externo, sem acesso ao código nem ao banco. Ele foi
produzido **antes do rollout da v98** (a captura de tela nele mostra a home em
20/08/2026; a v98 entrou em 21/08). Metade dos P0 dele descreve um site que não
existe mais.

Por isso o documento não repete o PDF: **cada afirmação foi remedida**. O que
sobreviveu virou finding com número; o que caiu está na §5 com a evidência que o
derruba; o que ninguém tinha visto está na §6.

Foram 4 fontes de evidência:

| Fonte | O que produziu |
|---|---|
| `curl` em `credito.vc` (produção, read-only) | status, bytes, headers, meta tags, JSON-LD, menu servido, 223 artigos varridos |
| Inspeção visual de capas baixadas | prova do card de marca de terceiro na capa de destaque |
| `GET /api/site` | `tagline`, `categories`, `menuItems` reais |
| Código do repo (`main` @ `1f36bc7`) | causa-raiz de cada defeito e o arquivo exato a mudar |

---

## 2. Resumo executivo

### 2.1 A conclusão que muda o plano

> **Nenhum problema confirmado do Crédito.vc exige código novo que o backlog P1
> do OleySports já não cubra. E tudo o que é urgente e exclusivo do Crédito.vc é
> *dado* ou *configuração* — corrigível hoje, no painel e no Cloudflare, sem um
> único deploy.**

Isso inverte a leitura do PDF, que tratou os itens como um backlog de
engenharia. O caminho crítico do Crédito.vc não passa por release nenhuma.

### 2.2 O P0 do OleySports já consertou o Crédito.vc

O código é a imagem compartilhada da rede. A v98 entregou o P0 nos 11 blogs, e
no `credito.vc` ele está funcionando — medido em 22/08:

| Achado do PDF | Estado medido hoje |
|---|---|
| *"Sitemap ignora os artigos e lista `/politica`, `/esportes`"* | **234 `<loc>`, 223 deles de artigo — 100% do acervo publicado** (`/api/articles` devolve `"total":223`). Editorias listadas são as 6 reais do blog. `Cache-Control: public, max-age=900` |
| *"URLs do menu retornam 404"* | `/credito`, `/sair-das-dividas`, `/organizar-financas`, `/renda-extra`, `/planejar-o-futuro`, `/investimentos` → **200 + `index, follow`**. `/score` → 200 + `noindex` (declarada e vazia — comportamento correto do P0) |
| *(não visto pelo PDF)* | `/rota-inventada-xyz`, `/wp-login.php`, `/sobre`, `/ferramentas` → **404 real** |
| *(não visto pelo PDF)* | Googlebot, bingbot e GPTBot recebem **99.004 bytes, 2 JSON-LD, 1 `<h1>` — byte a byte o mesmo do Chrome**. Só `facebookexternalhit` recebe o stub de 2.824 B, que é o desenho |
| *(não visto pelo PDF)* | `/sitemap.xml` → 301 para `/api/sitemap.xml` |

**Consequência prática:** o único item do PDF marcado "Crítica (P0)" que era de
engenharia — Sitemap — está fechado. E o item "Arquitetura (P0)" estava com o
diagnóstico invertido (§5.2).

### 2.3 Os cinco problemas reais, em ordem de gravidade

1. **O menu não alcança o acervo.** (`CVC-01`) De 6 itens do menu, **3 apontam
   para `/`** e **2 têm o path vazio** — inclusive "Saindo das Dívidas", rótulo
   da editoria com mais conteúdo do portal. Um único item (`Organizar Finanças`)
   chega a uma editoria de verdade. Os 223 artigos indexáveis vivem em 6
   editorias que **só existem no rodapé**.
2. **82,8% das capas são de terceiros, e 4,3% são hotlink direto do servidor do
   veículo.** (`CVC-02`) 9 artigos carregam a imagem de `infomoney.com.br`,
   `classic.exame.com`, `s2-g1.glbimg.com`, `moneytimes.com.br`,
   `seudinheiro.com` e `files.sunoresearch.com.br` — **um deles em `http://`
   dentro de página `https://`**. E a capa do destaque principal é o **card de
   marca do "Suno Notícias"**, verificado visualmente.
3. **A identidade do portal é a de outro blog.** (`CVC-03`) `tagline` =
   `"Notícia. Agora. Sempre."` — que vira o `<title>` da home, a `description`
   da home **e a `description` idêntica das 7 editorias**. O portal de educação
   financeira se anuncia ao Google como portal de notícias genérico.
4. **A home mostra 11 artigos de 223, e metade em duplicata.** (`CVC-04`) 22
   links de artigo, **11 únicos**; três artigos aparecem **3×** cada.
5. **O `robots.txt` bloqueia IA — e a causa é o Cloudflare, não o código.**
   (`CVC-05`) O bloco de `Disallow` vem entre os marcadores
   `# BEGIN Cloudflare Managed content` / `# END Cloudflare Managed Content`. O
   `robots.txt` que o app serve libera tudo. Nenhuma linha de código muda isso.

### 2.4 Nível de urgência

**Médio-alto, e barato.** O que resta não é uma falha de indexação — essa foi
resolvida. É o portal apontando o Google para si mesmo com a navegação errada, a
identidade errada e a capa dos concorrentes. Os quatro primeiros itens da §2.3
são edição no painel; o quinto é um toggle no Cloudflare.

**Não há sinal de penalidade.** O `credito.vc` não apresenta nenhum indício de
alerta de Safe Browsing nesta auditoria (isso exigiria o GSC — ver `E-1`).

---

## 3. Cruzamento — o que os dois relatórios têm em comum

Esta é a tabela que responde à pergunta central. "Comum" aqui significa: **o
mesmo defeito, na mesma linha de código compartilhada, confirmado nos dois
domínios.**

| Defeito | OleySports | Crédito.vc (medido 22/08) | Onde mora | Status |
|---|---|---|---|---|
| **Breadcrumb aponta para a home** | `F-15` · 640/640 artigos · **P1** | **223/223** · `position 2 item = https://credito.vc/` | `src/lib/categoryRoute.ts` — `ROUTE_MAP` só tem editorias do sp011 | **Comum · aberto** |
| **Description de editoria = a do site** | `F-06` · todas com `Notícia. Agora. Sempre.` · **P1** | **idêntico**, nas 7 editorias | metadata por rota no SSR | **Comum · aberto** |
| **Home e editorias sem JSON-LD** | `F-07` · 0 `ld+json` · **P1** | **0 `ld+json`** em `/`, `/credito`, `/investimentos`, `/score` | `Home.tsx` / `CategoryPage.tsx` | **Comum · aberto** |
| **Institucionais CSR-only** | `F-08` · 7.866–7.871 B · **P1** | **6.645–6.650 B, 0 `<h1>`, 0 canonical**, `<title>` igual ao da home | `ssrRoutes.ts` (`kind: "static"`) | **Comum · aberto (agravado, §6.5)** |
| **`publisher.logo` = asset da imagem compartilhada** | `F-18` · **P1** | `https://credito.vc/favicon.jpg` | `Artigo.tsx` | **Comum · aberto** |
| **`dateModified` == `datePublished`** | `F-19` · **P2** | ambos `2026-08-19T08:42:22.355Z` | `Artigo.tsx` + semântica de `updatedAt` | **Comum · aberto** |
| **`twitter:site` fixo de outro blog** | `F-27` · **P2** | **`@brasiliaagora`** no stub social | `vite.config.ts:241` | **Comum · aberto** |
| **Barra final vira shell indexável** | `P2-6` · 7.868 B sem canonical | `/credito/` → **200, 6.647 B, `index, follow`, sem canonical** | `ssrRoutes.ts:35` | **Comum · aberto (pior, §6.8)** |
| **Autoria genérica no schema** | não levantado no Oley | `author = {"@type":"Person","name":"Crédito.vc"}` | `Artigo.tsx` | **Só o PDF · confirmado** |
| Sitemap sem artigos | `F-01` · **P0** | **RESOLVIDO** — 223/223 | — | **Fechado na v98** |
| Nada responde 404 | `F-02`/`F-20` · **P0** | **RESOLVIDO** | — | **Fechado na v98** |
| Googlebot recebe stub | `F-26` · **P0** | **RESOLVIDO** — 99.004 B para os dois | — | **Fechado na v98** |
| Link `/artigo/__placeholder__` | `F-03`/`F-04` · **P0** | **RESOLVIDO** — 0 ocorrências na home | — | **Fechado na v98** |

**Leitura:** 8 defeitos comuns continuam abertos, e **todos os 8 já estão no
roadmap P1/P2 do OleySports**. Fazer o P1 do Oley entrega os 8 nos 11 blogs de
uma vez — é o mesmo binário. Nenhum deles justifica uma release exclusiva do
Crédito.vc.

### 3.1 O que é exclusivo do Crédito.vc

| Item | Por que não aparece no Oley |
|---|---|
| `robots.txt` com bloqueio de IA | **É o único blog da rede atrás do Cloudflare** (`CLAUDE.md §3`) |
| Menu que não alcança o acervo | Menu é `settings`, editado no painel deste blog |
| Capas de terceiros / hotlink direto | Nicho novo, sem backfill do Esporte Agora — o catálogo nasceu da coleta orgânica de veículos financeiros |
| `tagline` de outro portal | `settings` deste blog |
| Pauta fora do nicho | O `credito.vc` não tem balde `outros` (`CLAUDE.md §4`) |

---

## 4. Matriz consolidada de findings

Veredito: `C` = confirmado por código · `R` = confirmado por runtime · `C+R` =
ambos · `V` = confirmado visualmente.

| ID | Finding | Veredito | Evidência decisiva | Impacto | Esforço | Onde se corrige | Prior. |
|---|---|---|---|---|---|---|---|
| **CVC-01** | Menu não alcança nenhuma das 6 editorias com conteúdo | `R` | `/api/site`: 3 itens com `path:"/"`, 2 com `path:""` | **Alto** | Baixo | **Painel** | **P0** |
| **CVC-02** | 9 capas em hotlink direto de terceiro; 1 em `http://`; card de marca do Suno no destaque | `R+V` | 173/209 `central.midia.run`, 9 de domínio do veículo | **Alto** | Médio | **Painel + central** | **P0** |
| **CVC-03** | `tagline` de outro portal contamina `<title>` e todas as `description` | `C+R` | `"Notícia. Agora. Sempre."` em `/api/site` e nas 7 editorias | **Alto** | **Trivial** | **Painel** | **P0** |
| **CVC-04** | Home repete 50% dos links e expõe 11 de 223 artigos | `C+R` | 22 links / 11 únicos; 3 artigos 3× | Médio-Alto | Médio | **Código** (+painel) | **P0** |
| **CVC-05** | `robots.txt` do Cloudflare bloqueia GPTBot, ClaudeBot e 7 outros | `R` | bloco `# BEGIN Cloudflare Managed content` | Médio-Alto | **Trivial** | **Cloudflare** | **P0** |
| **CVC-06** | Rodapé publica `/outros`, que responde **404** | `R` | `<a href="/outros">` no rodapé; `GET /outros` → 404 | Médio | **Trivial** | **Painel** | **P0** |
| **CVC-07** | 3 editorias vazias expostas na navegação (`/score`, `/cartoes-de-credito`, `/consignado-publico`) | `R` | 200 + `noindex`, fora do sitemap | Médio | Baixo | **Painel** (ou pauta) | **P1** |
| **CVC-08** | Breadcrumb aponta para a home em **223/223** artigos | `C+R` | `ROUTE_MAP` sem os 7 slugs → `?? "/"` | Médio | Baixo | **Código** (= Oley P1-3) | **P1** |
| **CVC-09** | Home e editorias sem JSON-LD | `C+R` | 0 `ld+json` | Médio | Médio | **Código** (= Oley P1-4) | **P1** |
| **CVC-10** | Institucionais CSR-only **e dentro do sitemap** | `C+R` | 6.646 B, 0 `<h1>`, 0 canonical, `<title>` da home | Médio | Médio | **Código** (= Oley P1-1/P1-2) | **P1** |
| **CVC-11** | `author` é uma organização declarada como `Person`; sem `author.url`/`publisher.url` | `C+R` | JSON-LD do artigo | Médio | Baixo | **Código + painel** | **P1** |
| **CVC-12** | Dois `<h1>` na home (o segundo vem de bloco custom) | `R` | `<h1 class="ticker-heading-title">` | Baixo-Médio | **Trivial** | **Painel** (HTML do bloco) | **P1** |
| **CVC-13** | `publisher.logo` = `favicon.jpg` da imagem compartilhada | `C+R` | JSON-LD do artigo | Baixo-Médio | Baixo | **Código** (= Oley P1-5) | **P1** |
| **CVC-14** | Sem funil: não existem `/sobre`, `/ferramentas`, nem hub nenhum; 3 rótulos distintos apontam para `/contato` | `R` | 404 nos dois; `Sobre o Crédito.vc`/`Anuncie Conosco`/`Fale Conosco` → `/contato` | Médio | **Alto** | **Conteúdo** | **P2** |
| **CVC-15** | Pauta fora do nicho (Star Wars, Starship, Apollo 11, estoicismo) | `R` | 4 artigos identificados na varredura | Médio | Médio | **Central (regras)** | **P2** |
| **CVC-16** | `dateModified` == `datePublished` | `C+R` | JSON-LD | Baixo | Baixo | **Código** (= Oley P1-5) | **P2** |
| **CVC-17** | `twitter:site` = `@brasiliaagora` | `C+R` | stub social | Baixo | Baixo | **Código** (= Oley P2-3) | **P2** |
| **CVC-18** | `/credito/` (barra final) → 200 `index, follow` sem canonical | `R` | 6.647 B | Baixo-Médio | Baixo | **Código** (= Oley P2-6) | **P2** |
| **CVC-19** | 3 artigos sem capa própria caem no OG genérico do site | `R` | `og-image?v=71af0ae7fd` em 3 artigos | Baixo | Baixo | **Painel** | **P3** |

**Contagem:** 19 findings · 6 P0 · 7 P1 · 5 P2 · 1 P3. **Dos 6 P0, cinco não
tocam em código.**

---

## 5. O que o PDF errou (e a evidência que derruba)

Está aqui para que ninguém reabra esses pontos.

### 5.1 "Sitemap desalinhado, lista `/politica` e `/esportes`, ignora os artigos"

**Refutado — corrigido pela v98.** `GET /api/sitemap.xml`: 234 `<loc>`, **223 de
artigo**, e `GET /api/articles` devolve `"total":223`. Cobertura **100%**. As
outras 11 URLs são a home, as 6 editorias com conteúdo e 4 institucionais.
Nenhuma menção a `/politica` ou `/esportes`. `Cache-Control: public,
max-age=900`.

### 5.2 "Navegação aponta para `/credito`, `/score` e `/sair-das-dividas`, mas as URLs retornaram 404"

**Invertido.** As URLs respondem 200 e são indexáveis. **Quem não aponta para
elas é o menu** (`CVC-01`). O PDF leu o sintoma pelo lado errado: mediu um
soft-404 de cliente (o scaffold do Vite, `F-17` do Oley) num site que, na época
da coleta, ainda respondia 200 para tudo.

O que de fato responde 404 hoje e está publicado numa página: **`/outros`, no
rodapé** (`CVC-06`).

### 5.3 "O `robots.txt` bloqueia OAI-SearchBot"

**Falso, e a diferença importa.** A lista real injetada pelo Cloudflare é:
`Amazonbot`, `Applebot-Extended`, `Bytespider`, `CCBot`, `ClaudeBot`,
`CloudflareBrowserRenderingCrawler`, `Google-Extended`, `GPTBot`,
`meta-externalagent`. **`OAI-SearchBot` não está bloqueado** — ou seja, o
mecanismo que gera *citação em busca* do ChatGPT já pode rastrear o site hoje.

Vale a mesma correção sobre `Google-Extended`: ele **não** afeta ranqueamento nem
indexação no Google Search — só treino/grounding do Gemini. Mantê-lo bloqueado é
uma escolha editorial defensável, não um defeito.

### 5.4 "Preencher `alt`; definir `width`/`height` para evitar CLS"

**Já satisfeito, em boa parte.** Na home: **27 `<img>`, 0 com `alt=""`, 21 com
`width` **e** `height` explícitos, 22 com `loading="lazy"`.** Os 6 sem dimensão
são logo e imagens `eager` do topo. Não é um item de backlog.

### 5.5 "Bloquear a indexação de páginas de busca interna"

**Sem objeto.** `GET /busca?q=credito` → **404**. Não existe rota de busca
indexável. `/?page=2` serve a home com `canonical` para `/`, e `?utm_source=`
mantém o canonical limpo.

### 5.6 "Indexabilidade: manter"

**Correto** — e agora com uma camada a mais que o PDF não pôde ver: o vocabulário
de resposta do P0 (200 / 200+`noindex` / 404) está funcionando exatamente como
especificado, inclusive na distinção entre editoria declarada-e-vazia (`/score`,
`noindex`) e rota inexistente (`/sobre`, 404).

---

## 6. Findings que precisam de explicação

### 6.1 · CVC-01 · O menu não alcança o acervo

`GET /api/site` devolve, literalmente:

| Rótulo | `path` | Filhos | Para onde leva de fato |
|---|---|---|---|
| Pra você | `/` | Cartões de Crédito → `/cartoes-de-credito` | home · filho vazio `noindex` |
| Para quem trabalha | `/` | Consignado Público → `/consignado-publico` | home · filho vazio `noindex` |
| Para aposentados | `/` | — | home |
| Garantias e Patrimônio | `""` | — | **lugar nenhum** (renderiza sem `href`) |
| Saindo das Dívidas | `""` | — | **lugar nenhum** |
| Organizar Finanças | `/organizar-financas` | — | editoria real |

E `settings.categories` tem os 7 slugs certos: `sair-das-dividas, credito, score,
organizar-financas, renda-extra, planejar-o-futuro, investimentos`.

O caso mais caro é "Saindo das Dívidas": o rótulo está no menu, a editoria
`/sair-das-dividas` responde 200 com 120.715 bytes e está no sitemap — **e o
item de menu que deveria ligar os dois tem o path vazio.**

Depois do P0 isso não derruba mais a página (a superfície vem de
`settings.categories` ∪ menu — `CLAUDE.md §17`), mas destrói o link building
interno: o Google chega às editorias só pelo rodapé e pelos "Ver todos →" de dois
blocos.

**Correção:** painel → Home + menu → Menu. Zero deploy. Efeito em ≤ 90 s (o app
relê `site_settings` a cada 15 s).

**Cuidado:** trocar `path` de item de menu muda a superfície de editorias. Um
`path` novo que não seja um dos 7 slugs cria uma página `noindex` vazia
(`CVC-07`); apagar um item cujo slug **não** esteja em `settings.categories` faz
a rota virar 404. Os 7 slugs estão declarados, então mexer no menu é seguro para
eles.

### 6.2 · CVC-02 · As capas

Varredura dos **223** artigos do sitemap (209 responderam `og:image` na janela):

| Origem da capa | Artigos | % |
|---|---|---|
| `central.midia.run` (imagem de terceiro re-hospedada) | 173 | 82,8% |
| `credito.vc` (24 uploads próprios + 3 OG genérico) | 27 | 12,9% |
| **Servidor do próprio veículo (hotlink direto)** | **9** | **4,3%** |

Os 9 hotlinks diretos:

| Domínio | Artigo |
|---|---|
| `www.infomoney.com.br` | `gol-embraer-acordo-jatos` |
| `www.infomoney.com.br` | `adam-capital-ia-oportunidade` |
| `classic.exame.com` | `caneta-apollo11-leilao` |
| `classic.exame.com` | `sabre-de-luz-de-luke-skywalker-bate-recorde…` |
| `s2-g1.glbimg.com` | `spacex-adi-lancamento-starship` |
| `www.moneytimes.com.br` | `bolsafamilia-caixapagamento2026` |
| `www.seudinheiro.com` | `virtudes-estoicas-investimentos-bolsa` |
| `www.seudinheiro.com` | `eql-resgata-tesouro-ipca` |
| `files.sunoresearch.com.br` (**`http://`**) | `b3-regime-facil-captou-milhoes` |

Três problemas distintos, em ordem de gravidade:

1. **`http://` em página `https://`** — `b3-regime-facil-captou-milhoes`. O
   navegador bloqueia a imagem e vários scrapers sociais recusam o `og:image`.
   É o único que quebra hoje, sem depender de terceiro.
2. **Hotlink direto** — o HTML nomeia o titular do direito, consome banda dele e
   pode ser desligado (ou trocado por uma imagem de protesto) a qualquer momento
   pelo veículo. É o que expõe juridicamente.
3. **Card de marca do veículo como capa.** Verificado visualmente: a capa de
   `casas-bahia-pede-recuperacao-judicial…` é o cartão institucional **"SUNO
   NOTÍCIAS"** — e esse artigo é justamente o que aparece **3×** na home
   (`CVC-04`), no destaque principal. O leitor abre um portal de educação
   financeira e a primeira marca que enxerga é a de outro veículo.

**Sobre "remover a marca d'água":** o PDF já dá a orientação certa e ela fica
registrada aqui como **regra**: *nunca* editar a imagem para apagar a marca. Ou
se substitui o arquivo por fonte autorizada, ou se troca por arte própria. Editar
transforma um problema de licença em um problema deliberado.

**Correção:** os 9 hotlinks diretos e o card do Suno são troca de capa no painel,
artigo a artigo (11 artigos no total). O volume de 173 é decisão de política de
imagem (§8, `P2`), não tarefa de sprint.

### 6.3 · CVC-03 · A identidade

`/api/site` → `tagline: "Notícia. Agora. Sempre."`. Daí saem:

- `<title>Crédito.vc — Notícia. Agora. Sempre.</title>` na home;
- `<meta name="description" content="Notícia. Agora. Sempre.">` na home;
- **a mesma `description`, palavra por palavra, em `/credito`, `/investimentos`,
  `/score` e nas outras 4 editorias.**

O `CLAUDE.md §4` registra a tagline correta do blog — *"Educação financeira para
a vida real"* — e ela aparece no hero da home, mas como texto do bloco, não como
`tagline`. É um resíduo do provisionamento.

O PDF sugere `title` e `description` para a home; a sugestão é boa e está
absorvida no §8. Mas o defeito maior não é a home: são as **7 editorias com
description idêntica**, que é `F-06` do OleySports e exige código (metadata por
rota). A parte que se resolve hoje é a `tagline`.

### 6.4 · CVC-04 · A repetição na home

Medido: **22 links `/artigo/`, 11 destinos únicos.** Três artigos aparecem 3×,
cinco aparecem 2×. A home expõe **11 dos 223** artigos publicados.

Causa no código: cada bloco recebe `byCategory` — uma fatia própria da lista de
artigos (`Home.tsx:561-596`) — e **não existe estado compartilhado de "já
exibido"** entre blocos. O único `Set` de deduplicação em `homeBlocks.ts:393` é
para *slugs de categoria* no bloco Categorias, não para artigos.

O PDF propõe a regra certa (excluir do bloco seguinte o que já foi exibido). Ela
é uma mudança na imagem compartilhada e afeta os 11 blogs, então precisa de
desenho explícito — está no §8 como `P0-4`, com a ressalva de que blocos
editoriais de categoria **não** podem ficar vazios por causa da exclusão
(um blog com poucas matérias numa editoria perderia a seção inteira).

### 6.5 · CVC-10 · As institucionais estão no sitemap

`F-08` do Oley dizia "institucionais servidas sem SSR". No Crédito.vc é a mesma
coisa — `/contato`, `/privacidade`, `/termos`, `/arquivo`: **6.645–6.650 bytes,
0 `<h1>`, 0 `canonical`, `<title>` idêntico ao da home** — mas com um agravante
que o Oley não tinha registrado: **as quatro estão publicadas no
`/api/sitemap.xml`**.

Não viola a invariante do P0 (elas respondem 200 e são indexáveis, não 301/404/
`noindex`). Mas o efeito é o portal entregar ao Google 4 URLs com o **mesmo
`<title>`** da home e sem canonical — que é exatamente o item *"garantir título
único e meta description dedicada em todas as URLs indexáveis"* do checklist do
PDF.

### 6.6 · CVC-05 · O `robots.txt` é do Cloudflare

O corpo servido pela origem tem `Content-Length: 152` — são as 6 linhas de
`buildRobotsTxt()` (`vite.config.ts:1369-1382`): `User-agent: *`, `Allow: /`,
`Disallow: /admin`, mais os dois `Sitemap:`. **Não bloqueia IA nenhuma.**

O que o público recebe tem ~2 KB, porque o Cloudflare **prepende** um bloco
próprio, delimitado por `# BEGIN Cloudflare Managed content` / `# END Cloudflare
Managed Content`, com `Content-Signal: search=yes,ai-train=no,use=reference` e os
9 `Disallow`.

Duas consequências:

1. **Nenhuma alteração no repositório muda esse arquivo.** O ajuste é no painel
   do Cloudflare da zona `credito.vc` (a feature que gerencia `robots.txt` /
   bloqueio de bots de IA). Isso é da §8 `P0-5`.
2. **A concatenação cria dois grupos `User-agent: *`.** Rastreadores que seguem a
   especificação fundem as regras (resultado: `Allow: /` + `Disallow: /admin`),
   mas parsers que só honram o primeiro grupo passam a **ignorar o
   `Disallow: /admin`**. É um efeito colateral silencioso de misturar as duas
   fontes, e some junto com o bloco gerenciado.

**Recomendação, não decisão:** liberar `GPTBot` e `ClaudeBot` (descoberta e
citação) e manter, se o usuário quiser, a restrição de treino via
`Content-Signal: ai-train=no`. `Google-Extended` bloqueado não custa tráfego de
busca. **A escolha é do dono do conteúdo** — este PRD só registra que o bloqueio
atual é involuntário: veio de um default do Cloudflare, não de uma decisão.

### 6.7 · CVC-15 · Pauta fora do nicho

A varredura das capas expôs, de lambuja, quatro artigos que não são de crédito
nem de finanças pessoais: **sabre de luz do Luke Skywalker em leilão**, **caneta
da Apollo 11**, **lançamento da Starship** e **virtudes estoicas**. Todos entraram
pelas regras de distribuição da central.

Isso conversa direto com o `CLAUDE.md §4`: o `credito.vc` **não tem balde
`outros`** desde 18/08, e quem barra pauta alheia são as regras — todas com
`targetCategory` fixo e catch-all desligado. Esses quatro são resíduo anterior à
limpeza, ou vazamento de regra por keyword. É trabalho na **central**, não no
blog, e já existe precedente do que fazer:
`deploy/creditovc/limpeza_intrusas.sql` e `limpeza_mercado.sql`.

### 6.8 · CVC-18 · A barra final ficou pior aqui

No Oley, `/futebol/` devolvia 7.868 B sem canonical. No Crédito.vc, `/credito/`
devolve **6.647 B, sem canonical, e com `<meta name="robots" content="index,
follow">`**. É um shell vazio explicitamente marcado como indexável — um
duplicado magro de `/credito` para cada uma das 7 editorias.

Continua `P2` pelos mesmos três motivos da §10.2 do PRD do Oley (não é
duplicação de conteúdo, não vem de finding P0, e contradiz a decisão deliberada
e testada de `ssrRoutes.ts:35`). Mas o `index, follow` medido aqui é informação
nova e sobe a confiança de que vale fazer.

---

## 7. Escopo: o que é deste blog e o que é da rede

`CLAUDE.md §13`: não existe `blogId` no app. A imagem é uma só.

| Camada | Findings | Alcance de uma correção |
|---|---|---|
| **Dados do blog** (`settings`, artigos) | CVC-01, CVC-02, CVC-03, CVC-06, CVC-07, CVC-12, CVC-19 | Só o `credito.vc`. Sem deploy. Efeito em ≤ 90 s |
| **Cloudflare** | CVC-05 | Só o `credito.vc` (único blog atrás do CF) |
| **Central** | CVC-15 | A regra é por blog; o vazamento pode existir nos irmãos |
| **Imagem compartilhada** | CVC-04, CVC-08, CVC-09, CVC-10, CVC-11, CVC-13, CVC-16, CVC-17, CVC-18 | **Os 11 blogs**, no rollout de uma tag nova |
| **Conteúdo** | CVC-14 | Só o `credito.vc` |

**Consequência de planejamento:** os 9 findings de código **não** devem virar
uma release do Crédito.vc. Eles são o P1 do OleySports, que já está escrito,
priorizado e dependente do P0 entregue. Entrar por aqui duplicaria o trabalho e
faria o mesmo binário ser validado duas vezes.

---

## 8. Roadmap

### P0 — sem deploy (pode ser feito hoje)

Cinco dos seis itens P0 não passam por build. A ordem abaixo é a de maior
retorno por minuto.

#### **P0-1 · Reconstruir o menu** — `CVC-01`, `CVC-07`
Painel → *Home + menu* → aba **Menu**.

- Todo item de topo precisa de um `path` que exista, ou de deixar de ser link.
- "Saindo das Dívidas" → `/sair-das-dividas`; "Garantias e Patrimônio" → decidir
  entre apontar para uma editoria existente ou sair do menu.
- Itens de persona ("Pra você", "Para quem trabalha", "Para aposentados") só
  fazem sentido como **pais de submenu**; enquanto o path deles for `/`, cada um
  é um link para a home no lugar mais nobre da página.
- As 6 editorias com conteúdo têm que estar alcançáveis pelo menu, não só pelo
  rodapé.
- **Não** criar item novo cujo path não seja um dos 7 slugs declarados: isso
  publica uma página vazia `noindex` na navegação.

**Validação:** `V-1` e `V-2` (§10).

#### **P0-2 · Corrigir a identidade** — `CVC-03`
Painel → *Configurações* → `tagline`.

Trocar `"Notícia. Agora. Sempre."` por uma linha do próprio portal. Sugestão do
PDF, adaptada ao que o site já diz no hero:

- **tagline:** `Educação financeira para a vida real`
- resultado no `<title>` da home: `Crédito.vc — Educação financeira para a vida
  real`

O PDF sugere `Crédito, Score e Finanças Pessoais | Crédito.vc` — melhor para
intenção de busca, mas o `<title>` da home é montado como `siteName — tagline`,
então a forma acima é a que o app consegue produzir hoje sem código. A versão do
PDF entra junto do `P1-2` (metadata por rota).

**Atenção:** a `description` das **editorias** continua errada depois disso — ela
é `F-06`/`CVC-09`, e é código.

#### **P0-3 · Tirar o `/outros` do rodapé** — `CVC-06`
Painel → *Home + menu* → **Rodapé**. Remover o link "Outros". Hoje ele é a única
URL 404 que o site publica.

#### **P0-4 · Trocar as 11 capas críticas** — `CVC-02`
Painel → Artigos → editar capa. Nesta ordem:

1. `b3-regime-facil-captou-milhoes` — capa em `http://` (quebra sozinha).
2. Os 8 hotlinks diretos restantes da tabela da §6.2.
3. `casas-bahia-pede-recuperacao-judicial…` e os outros que usam o card
   "SUNO NOTÍCIAS" — é a capa do destaque da home.
4. Os 3 artigos sem capa (`CVC-19`) — ficam para o P3.

Fonte da substituição: arte própria, banco de imagem licenciado ou ilustração
institucional. **Nunca** editar a imagem do veículo para apagar a marca.

#### **P0-5 · Decidir o `robots.txt` no Cloudflare** — `CVC-05`
Painel do Cloudflare, zona `credito.vc`, na feature que gerencia `robots.txt` /
bloqueio de bots de IA. É uma **decisão do dono do conteúdo**, não um bug a
corrigir sem consulta. Recomendação registrada na §6.6.

**Validação:** `V-3`. O bloco `# BEGIN Cloudflare Managed content` deve sumir da
resposta pública.

### P0 com código — entra pelo P1 do OleySports

#### **P0-6 · Deduplicação da home** — `CVC-04`
É o único P0 do PDF que exige a imagem compartilhada. **Não** abrir uma release
só dele: agrupar com o P1 do Oley.

Desenho mínimo, para quando for implementado:

1. Um conjunto de ids exibidos, montado na ordem dos blocos da home.
2. Cada bloco filtra o que já saiu **antes** de aplicar o seu `itemsLimit`.
3. **Piso obrigatório:** se a exclusão deixar um bloco editorial com menos itens
   que o mínimo do layout, o bloco volta a poder repetir — um blog com poucas
   matérias numa editoria não pode perder a seção. Sem esse piso, a mudança
   quebra os blogs pequenos da rede.
4. Ordem de precedência: destaque principal > blocos editoriais na ordem da
   home > "mais recentes".
5. Teste dedicado em `homeBlocks.test.ts`, incluindo o caso do piso.

### P1 — código compartilhado (é o P1 do OleySports)

| ID | Item | Findings | Equivalente no Oley |
|---|---|---|---|
| **P1-1** | Breadcrumb com fonte única de path (apagar `lib/categoryRoute.ts`) | CVC-08 | `P1-3` |
| **P1-2** | Metadata própria por rota (description de editoria + canonical/title das institucionais) | CVC-03, CVC-10 | `P1-1` |
| **P1-3** | SSR/prerender das institucionais | CVC-10 | `P1-2` |
| **P1-4** | `publisher.logo` real + `author`/`publisher` com `url` e `@type` correto | CVC-11, CVC-13 | `P1-5` |
| **P1-5** | `WebSite`/`Organization` na home; `CollectionPage`/`ItemList` na editoria | CVC-09 | `P1-4` |
| **P1-6** | Testes dedicados de SEO | todos | `P1-7` |

**`P1-4` merece uma nota:** o PDF pede autor pessoa física com página de perfil.
A plataforma já tem o mecanismo — `settings.columnists` + `articles.columnist_id`
+ o perfil `columnist` (`CLAUDE.md §13`). Não é desenvolvimento, é cadastro. Mas
o schema também está **semanticamente errado** hoje (`"@type":"Person"` com o
nome de uma empresa), e isso é código.

### P1 — dados deste blog

| ID | Item | Finding |
|---|---|---|
| **P1-7** | Tirar o `<h1>` do bloco custom do ticker (virar `<h2>` ou `<div>`) | CVC-12 |
| **P1-8** | Decidir o destino das 3 editorias vazias: publicar pauta, ou tirar da navegação | CVC-07 |

### P2 — conteúdo e central

| ID | Item | Finding |
|---|---|---|
| **P2-1** | Hubs permanentes (`/credito`, `/score`, `/sair-das-dividas` como páginas de hub, `/ferramentas`, `/sobre`) e CTAs contextuais | CVC-14 |
| **P2-2** | Limpar a pauta fora do nicho e apertar as regras na central | CVC-15 |
| **P2-3** | Política de imagem: reduzir a dependência dos 173 hotlinks do `central.midia.run` | CVC-02 |
| **P2-4** | `dateModified` condicionado à semântica de `updatedAt` | CVC-16 |
| **P2-5** | `twitter:site` a partir de settings, ou omitido | CVC-17 |
| **P2-6** | Barra final → 301 | CVC-18 |

**Sobre o `P2-1`:** o PDF acerta o diagnóstico estratégico (o topo de funil não
tem para onde levar), mas a solução dele é um projeto editorial de 60–90 dias,
não um item de PRD técnico. Fica registrado com escopo honesto: **é conteúdo, e
o gargalo é redação, não engenharia.** Uma exceção barata e imediata: hoje
"Sobre o Crédito.vc", "Anuncie Conosco" e "Fale Conosco" apontam todos para
`/contato` — três promessas, uma página.

### P3

| ID | Item | Finding |
|---|---|---|
| **P3-1** | Capa própria nos 3 artigos que caem no OG genérico | CVC-19 |

---

## 9. Matriz de prioridade

| ID | Item | Prior. | Impacto | Esforço | Deploy? | Confiança |
|---|---|---|---|---|---|---|
| P0-1 | Menu | **P0** | Alto | Baixo | Não | Alta |
| P0-2 | Tagline | **P0** | Alto | Trivial | Não | Alta |
| P0-3 | `/outros` no rodapé | **P0** | Médio | Trivial | Não | Alta |
| P0-4 | 11 capas críticas | **P0** | Alto | Médio | Não | Alta |
| P0-5 | Cloudflare `robots.txt` | **P0** | Médio-Alto | Trivial | Não | Alta |
| P0-6 | Dedup da home | **P0** | Médio-Alto | Médio | **Sim** | Alta |
| P1-1..6 | P1 do OleySports | P1 | Médio | Médio | **Sim** | Alta |
| P1-7 | `<h1>` do ticker | P1 | Baixo-Médio | Trivial | Não | Alta |
| P1-8 | Editorias vazias | P1 | Médio | Baixo | Não | Alta |
| P2-1 | Hubs e CTAs | P2 | Médio | **Alto** | Não | Média |
| P2-2 | Pauta fora do nicho | P2 | Médio | Médio | Não | Alta |
| P2-3 | Política de imagem | P2 | Médio | Alto | Não | Média |
| P2-4..6 | `dateModified`, `twitter:site`, barra final | P2 | Baixo | Baixo | **Sim** | Alta |
| P3-1 | 3 capas faltantes | P3 | Baixo | Baixo | Não | Alta |

---

## 10. Plano de validação

Comandos completos, prontos para colar. Todos read-only. Rodam de qualquer
máquina com `curl` — **não** precisam da VPS.

### V-0 · Baseline (rodar ANTES de mexer em qualquer coisa)

```bash
cd /tmp
echo "== sitemap ==" && curl -s https://credito.vc/api/sitemap.xml -o cvc_base.xml -w "http=%{http_code} bytes=%{size_download}\n"
echo "locs=$(grep -c '<loc>' cvc_base.xml) artigos=$(grep -c '/artigo/' cvc_base.xml)"
echo "== total publicado ==" && curl -s "https://credito.vc/api/articles?limit=1" | grep -o '"total":[0-9]*'
echo "== identidade ==" && curl -s https://credito.vc/ | grep -o '<title>[^<]*</title>' | head -1
```

Esperado hoje: `locs=234 artigos=223`, `"total":223`,
`<title>Crédito.vc — Notícia. Agora. Sempre.</title>`.

### V-1 · Menu (depois do P0-1)

```bash
curl -s https://credito.vc/api/site \
  | tr ',' '\n' | grep -A1 -E '"label"|"path"' | head -40
```

Critério: **nenhum** item de topo com `"path":"/"` ou `"path":""`, salvo os que
deixarem de ser link por serem só pais de submenu.

### V-2 · Toda rota publicada responde 200 e é indexável

```bash
cd /tmp
curl -s https://credito.vc/ -o cvc_home.html
grep -o 'href="/[a-z0-9-]*"' cvc_home.html | sed 's/href="//;s/"//' \
  | grep -v -E '^/(assets|fonts|favicon)' | sort -u > cvc_rotas.txt
while read -r p; do
  c=$(curl -s -o /tmp/r.html -w "%{http_code}" "https://credito.vc$p")
  r=$(grep -o '<meta name="robots" content="[^"]*"' /tmp/r.html | head -1 | sed 's/.*content="//;s/"//')
  printf '%-26s %s  %s\n' "$p" "$c" "$r"
done < cvc_rotas.txt
```

Critério: **zero 404** e **zero `noindex`** entre as rotas que a home publica.
Hoje falham `/outros` (404) e `/score`, `/cartoes-de-credito`,
`/consignado-publico` (`noindex`).

### V-3 · `robots.txt` (depois do P0-5)

```bash
curl -s https://credito.vc/robots.txt
```

Critério: o bloco `# BEGIN Cloudflare Managed content` não aparece mais, ou
aparece sem `GPTBot`/`ClaudeBot` — conforme a decisão tomada no P0-5. As duas
linhas `Sitemap:` continuam presentes.

### V-4 · Capas (depois do P0-4)

```bash
cd /tmp
curl -s https://credito.vc/api/sitemap.xml \
  | grep -o '<loc>[^<]*/artigo/[^<]*</loc>' | sed 's/<loc>//;s|</loc>||' > cvc_urls.txt
cat cvc_urls.txt | xargs -P 6 -I{} sh -c 'curl -s --max-time 20 "{}" | grep -o "<meta property=\"og:image\" content=\"[^\"]*\"" | head -1 | sed "s/.*content=\"//;s/\"//"' > cvc_ogs.txt
echo "== origem das capas ==" && sed -E 's|^(https?)://([^/]+)/.*|\1 \2|' cvc_ogs.txt | sort | uniq -c | sort -rn
echo "== em http:// (tem que dar 0) ==" && grep -c '^http://' cvc_ogs.txt
```

Critério: **0** em `http://` e **0** em domínio que não seja `credito.vc` ou
`central.midia.run`.

### V-5 · Repetição na home (depois do P0-6)

```bash
cd /tmp && curl -s https://credito.vc/ -o cvc_home.html
echo "links=$(grep -o 'href="/artigo/' cvc_home.html | wc -l) unicos=$(grep -o 'href="/artigo/[a-z0-9-]*"' cvc_home.html | sort -u | wc -l)"
```

Critério: `links == unicos`. Hoje: `links=22 unicos=11`.

### V-6 · Não-regressão do P0 do OleySports (rodar depois de QUALQUER mudança)

```bash
A="https://credito.vc/artigo/casas-bahia-pede-recuperacao-judicial-entenda-o-significado-e-processos"
for ua in "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120" "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"; do
  curl -s -A "$ua" "$A" -o /tmp/ua.html -w "%{http_code} "
  echo "bytes=$(wc -c < /tmp/ua.html) ldjson=$(grep -o 'application/ld+json' /tmp/ua.html | wc -l)"
done
curl -s -o /dev/null -w "rota inexistente: %{http_code}\n" https://credito.vc/rota-inventada-xyz
curl -s -o /dev/null -w "arquivo inexistente: %{http_code}\n" https://credito.vc/wp-login.php
```

Critério: os dois User-Agents com **os mesmos bytes** e `ldjson=2`; **404** nas
duas últimas linhas.

### V-7 · Consultas no banco (VPS) — para o que o HTTP não mostra

```bash
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d creditovc -v ON_ERROR_STOP=1 \
  -c "SELECT category, count(*) FILTER (WHERE published) AS publicados, count(*) AS total FROM articles GROUP BY category ORDER BY publicados DESC;"
```

```bash
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d creditovc -v ON_ERROR_STOP=1 \
  -c "SELECT count(*) AS capas_de_terceiros FROM articles WHERE published AND image_url !~ '^https?://(credito\.vc|central\.midia\.run)/';"
```

A primeira mostra se `/score`, `/cartoes-de-credito` e `/consignado-publico`
estão realmente vazias e quantos artigos cada editoria sustenta. A segunda é a
contagem autoritativa do `CVC-02` (a varredura HTTP amostrou 209 de 223).

---

## 11. Riscos

| # | Risco | Mitigação |
|---|---|---|
| R-1 | Mexer no menu muda a superfície de editorias e pode transformar uma URL viva em 404 | Só usar os 7 slugs de `settings.categories`; rodar `V-2` logo depois; a mudança é reversível no painel em segundos |
| R-2 | Liberar bots de IA no Cloudflare aumenta o custo de banda e permite treino sem retorno | É decisão do dono do conteúdo; `Content-Signal: ai-train=no` permite liberar descoberta sem liberar treino |
| R-3 | A dedup da home (P0-6) esvazia blocos editoriais nos blogs pequenos da rede | O piso do §8 `P0-6` é **obrigatório**, com teste dedicado, antes do rollout |
| R-4 | Trocar capas em massa quebra o `og:image` já cacheado pelas redes sociais | Repassar Facebook Sharing Debugger / LinkedIn Post Inspector nos artigos alterados |
| R-5 | Corrigir a `tagline` sem corrigir a description das editorias deixa o problema pela metade | Registrado: `P0-2` resolve a home, `P1-2` resolve as editorias — não confundir "feito" com "fechado" |
| R-6 | O PDF será relido por terceiros e os itens já resolvidos voltarão à pauta | É para isso que existe a §5 |

---

## 12. Rollback

Os cinco P0 sem deploy são reversíveis sem procedimento especial:

- **Menu, rodapé, tagline, capas:** o painel guarda o estado anterior no banco;
  desfazer é reeditar. Se a mudança tiver vindo de "Aplicar template", o botão
  **Desfazer** restaura menu, rodapé, cores e idioma juntos (`CLAUDE.md §8`).
- **Cloudflare:** o toggle volta ao estado anterior no mesmo painel.
- **P0-6 e P1:** rollback de imagem, pelo procedimento padrão do `CLAUDE.md §6`
  (voltar `BLOG_IMAGE_TAG` do blog para a tag anterior e `docker compose up -d`).

---

## 13. Métricas de sucesso

| Métrica | Hoje | Meta |
|---|---|---|
| Editorias com conteúdo alcançáveis pelo menu | 1 de 6 | **6 de 6** |
| URLs 404 publicadas em página do site | 1 (`/outros`) | **0** |
| Rotas `noindex` publicadas na navegação | 3 | **0** |
| `<title>` únicos entre home e institucionais | 1 para 5 URLs | **5 de 5** |
| Artigos únicos na home | 11 de 22 links | **1 link por artigo** |
| Capas em `http://` | 1 | **0** |
| Capas em hotlink direto de terceiro | 9 | **0** |
| `robots.txt` bloqueando GPTBot/ClaudeBot | sim | conforme decisão do P0-5 |
| Cobertura do sitemap | 223/223 (**já ok**) | manter |
| Paridade Googlebot × navegador | 99.004 B nos dois (**já ok**) | manter |

Métricas de campo (GSC) ficam para depois da estabilização — ver `E-1`.

---

## 14. Definição de pronto

**P0 fechado quando:**

1. `V-1` sem item de menu apontando para `/` ou para vazio.
2. `V-2` com zero 404 e zero `noindex` entre as rotas publicadas.
3. `V-3` refletindo a decisão tomada sobre os bots de IA.
4. `V-4` com 0 capas em `http://` e 0 em domínio de terceiro.
5. `V-6` verde (não-regressão do P0 do OleySports).
6. `<title>` da home não contendo mais `Notícia. Agora. Sempre.`.

**`P0-6` fechado quando** `V-5` der `links == unicos` **e** o teste do piso
passar em `homeBlocks.test.ts` **e** a home dos 11 blogs continuar com todos os
blocos editoriais preenchidos.

---

## 15. O que este PRD deliberadamente NÃO faz

- **Não reabre o P0 do OleySports.** Ele está entregue e foi remedido aqui.
- **Não abre uma release exclusiva do Crédito.vc** para os 9 findings de código:
  eles são o P1 do Oley, na imagem compartilhada, e devem sair de uma vez para os
  11 blogs.
- **Não decide a política de bots de IA.** Registra o estado, a causa e a
  recomendação; a escolha é do dono do conteúdo.
- **Não transforma o plano editorial do PDF em backlog técnico.** Hubs, funil,
  CTAs e autores reais entram como `P2-1` com escopo honesto: é conteúdo.
- **Não propõe alterar imagem de terceiro para remover marca d'água.** É a única
  recomendação do PDF que este documento reforça como proibição.

---

## 16. Evidências externas necessárias

| ID | O que falta | Por quê |
|---|---|---|
| **E-1** | GSC da propriedade `credito.vc` | Cobertura real, "Não encontrada (404)", impressões por editoria, e confirmação de que não há alerta de Safe Browsing |
| **E-2** | Painel do Cloudflare da zona | Saber **qual** feature está injetando o bloco gerenciado e se há outras regras de bot |
| **E-3** | `V-7` no banco do blog | Contagem autoritativa por editoria e de capas de terceiros (o HTTP amostrou 209 de 223) |
| **E-4** | Decisão editorial sobre "Garantias e Patrimônio" e "Para aposentados" | São rótulos sem editoria correspondente; o menu não fecha sem essa decisão |
| **E-5** | CWV de campo | O PDF pede otimização de LCP/INP/CLS; sem dado de campo não há o que priorizar (mesma posição do `F-09` do Oley) |

---

## 17. Documentos relacionados

- `docs/PRD-SEO-TECHNICAL-OLEYSPORTS-V2.md` — auditoria que originou o P0 e o P1
  compartilhados.
- `docs/PRD-P0-OLEYSPORTS-INDEXACAO-URL-SITEMAP-V2.md` — especificação do P0
  entregue na v98.
- `docs/IMPLEMENTACAO-P0-OLEYSPORTS-RELATORIO.md` — o que foi de fato
  implementado e os desvios.
- `docs/REVALIDACAO-PRDS-OLEYSPORTS.md` — método da revalidação adversarial,
  reaplicado aqui.
- `CLAUDE.md §3` (Cloudflare), `§4` (editorias do credito.vc), `§13` (nada de
  marca na imagem), `§17` (invariantes de URL, indexação e sitemap).
- `deploy/creditovc/` — `limpeza_intrusas.sql`, `limpeza_mercado.sql`,
  `reclassifica_investimentos.sql`, `rules_keywords.sql`.
