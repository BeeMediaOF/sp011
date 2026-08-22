# PRD de Implementação — Crédito.vc: prioridades restantes

> **Status:** Etapas 1, 2 e 3 **executadas em 22/08** e validadas em produção
> (§1, "Depois"). Etapas 4 a 8 pendentes — são de painel/Cloudflare.
> **Data:** 2026-08-22 · **Versão:** 1
>
> **Referência de análise:** `docs/PRD-SEO-CREDITOVC-CRUZAMENTO-OLEYSPORTS.md`
> (auditoria e matriz de findings). Este documento **não reabre a análise** —
> ele especifica a execução.
>
> **Ordem de autoridade:** runtime confirmado > código atual > dados atuais >
> PRD de análise.
>
> **Estado medido em 2026-08-22**, produção `credito.vc`, imagem ≥ `v98`.
> Nenhuma alteração foi feita na produção durante a redação.

---

## 0. Escopo

### 0.1 O que este PRD executa

Oito etapas, **todas de dados ou configuração**. Nenhuma exige build, deploy ou
alteração no repositório de código.

| Etapa | O que | Onde | Finding | Estado |
|---|---|---|---|---|
| 1 | Blocos da home apontando para categoria inexistente e para categoria repetida | SQL · `site_settings.homeBlocks` | `CVC-04` | ✔ 22/08 |
| 2 | Menu que não alcança o acervo | SQL · `menu_items` | `CVC-01` | ✔ 22/08 |
| 3 | Rodapé com link 404 e três rótulos para a mesma URL | SQL · `site_settings.footerConfig` | `CVC-06`, `CVC-14` | ✔ 22/08 |
| 4 | Capas hotlinkadas de terceiros | Painel, artigo a artigo | `CVC-02` | pendente |
| 5 | `robots.txt` bloqueando IA | Painel do Cloudflare | `CVC-05` | pendente |
| 6 | Três editorias vazias na navegação | Decisão editorial + SQL | `CVC-07` | pendente |
| 7 | Segundo `<h1>` na home | Painel · bloco HTML | `CVC-12` | pendente |
| 8 | Autoria genérica | Painel · colunistas | `CVC-11` | pendente |

### 0.2 O que ficou de fora, e por quê

- **Tagline e meta descrição** (`CVC-03`) — já executadas em 22/08 para os 11
  blogs. Ver `docs/IDENTIDADE-SEO-REDE.md`.
- **Os 8 defeitos de código compartilhado** (`CVC-08`, `CVC-09`, `CVC-10`,
  `CVC-13`, `CVC-16`, `CVC-17`, `CVC-18` e o resíduo de `CVC-04`) — são o **P1
  do OleySports**, na imagem compartilhada. Especificados na §11 deste
  documento apenas no que o Crédito.vc acrescenta; a execução sai de lá, para
  os 11 blogs de uma vez.
- **Hubs, funil e CTAs** (`CVC-14`) — projeto editorial, não de engenharia. Só
  a parte barata entra aqui (§5.2).

### 0.3 Invariantes a não quebrar

Herdadas do P0 entregue na v98 (`CLAUDE.md §17`). Qualquer etapa que as viole
deve ser revertida:

1. Buscador e navegador recebem o mesmo HTML.
2. Nenhuma URL publicada no sitemap responde 301, 404 ou `noindex`.
3. Nenhuma página pública linka rota que não existe.
4. Editoria declarada e vazia → 200 + `noindex`. Rota nem declarada nem com
   conteúdo → 404.
5. Falha de infraestrutura nunca vira ausência (503, nunca 404).

---

## 1. Baseline — rodar ANTES de qualquer etapa

```bash
cd /tmp
echo "== home: links x unicos ==" && curl -s https://credito.vc/ -o cvc0.html \
  && echo "links=$(grep -o 'href=\"/artigo/' cvc0.html | wc -l) unicos=$(grep -o 'href=\"/artigo/[a-z0-9-]*\"' cvc0.html | sort -u | wc -l)"
echo "== sitemap ==" && curl -s https://credito.vc/api/sitemap.xml -o cvc0.xml \
  && echo "locs=$(grep -c '<loc>' cvc0.xml) artigos=$(grep -c '/artigo/' cvc0.xml)"
echo "== total publicado ==" && curl -s "https://credito.vc/api/articles?limit=1" | grep -o '"total":[0-9]*'
echo "== h1 na home ==" && grep -o '<h1' cvc0.html | wc -l
```

**Baseline registrado em 22/08:** `links=22 unicos=11`, `locs=234 artigos=223`,
`"total":223`, `h1=2`.

**Depois das Etapas 1, 2 e 3 (22/08, medido 6 min após aplicar):**
`links=30 unicos=21`, `blocos_mortos=0`, `outros=0`, `sitemap=223`, `h1=2`
(a Etapa 7 é de painel e não foi feita). As 6 editorias do menu em `200` com
`noindex=0`. Não-regressão: `googlebot=166632` e `navegador=166632` bytes —
idênticos; `/rota-inventada-xyz` em `404`.

Os 21 únicos superaram a projeção de ~19 do §2.4: os blocos reapontados caíram
em editorias grandes o bastante para encher a cota sem reaproveitar artigo já
exibido.

```bash
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d creditovc -At -c \
"SELECT category, count(*) FILTER (WHERE status = 'published') FROM articles GROUP BY category ORDER BY 2 DESC;"
```

Essa contagem é **pré-requisito das Etapas 1, 2 e 6** — sem ela não dá para
saber quais editorias sustentam um bloco.

**Medido em 22/08:** `investimentos` 140, `credito` 39, `sair-das-dividas` 17,
`organizar-financas` 13, `renda-extra` 7, `planejar-o-futuro` 7 — soma 223,
igual ao sitemap. `score` **não aparece: zero artigos**. Os três destinos da
Etapa 1 ficaram muito acima do piso de 4.

Fora do escopo desta rodada, mas escancarado pela contagem: `investimentos` é
**63% do portal** num blog cuja proposta é crédito e finanças pessoais. O
`deploy/creditovc/reclassifica_investimentos.sql` existe para isso e ainda não
foi rodado.

### 1.1 Backup

```bash
cd /opt/sp011
BK=/opt/backup_creditovc_$(date +%F_%H%M)
mkdir -p $BK
docker compose exec -T pg-blogs psql -U postgres -d creditovc -At -c \
"SELECT value FROM settings WHERE key='menu_items';" > $BK/menu_items.json
docker compose exec -T pg-blogs psql -U postgres -d creditovc -At -c \
"SELECT (value::jsonb->'homeBlocks')::text FROM settings WHERE key='site_settings';" > $BK/homeBlocks.json
docker compose exec -T pg-blogs psql -U postgres -d creditovc -At -c \
"SELECT (value::jsonb->'footerConfig')::text FROM settings WHERE key='site_settings';" > $BK/footerConfig.json
wc -c $BK/*.json && echo "backup em: $BK"
```

Os três arquivos são JSON puro, **sem segredo** — `homeBlocks`, `menu_items` e
`footerConfig` não estão em `SECRET_FIELDS` (`store.ts:38-46`).

---

## 2. Etapa 1 — Blocos da home

### 2.1 O defeito, medido

A repetição na home **não é** (só) ausência de deduplicação entre blocos. Três
blocos estão configurados errado:

| # | Nome do bloco | `category` | Existe? | Efeito medido |
|---|---|---|---|---|
| 0 | Hero — Boas-vindas + Destaques | `geral` / `source: latest` | — | 3 mais recentes |
| 2 | Mais Recentes | `geral` / `source: latest` | — | 5 mais recentes → **repete os 3 do hero** |
| 3 | SAINDO DAS DÍVIDAS | `sair-das-dividas` | ✔ | ok |
| 4 | **HOME EQUITY** | `home-equity` | ✘ | **cabeçalho renderizado com zero artigos** |
| 5 | RENDA EXTRA | `renda-extra` | ✔ | 5 artigos |
| 6 | **MICROCRÉDITO** | **`renda-extra`** | ✔ | **repete os 5 do bloco 5, inteiros** |
| 7 | **CRÉDITO PESSOAL** | `credito-pessoal` | ✘ | **cabeçalho renderizado com zero artigos** |

E **cinco editorias declaradas não têm bloco nenhum na home**: `credito`,
`score`, `organizar-financas`, `planejar-o-futuro` e `investimentos` — sendo
`investimentos` a maior do portal (página de 223 KB).

Resultado: 22 links, 11 destinos, 11 de 223 artigos expostos, e duas seções
visivelmente vazias na página.

### 2.2 A correção

Reapontar os três blocos para editorias que existem e têm conteúdo. A escolha
abaixo respeita o vocabulário do portal e a contagem por categoria do §1
(**conferir antes de rodar**; se alguma tiver menos de 4 artigos publicados,
trocar o destino):

| Bloco | De | Para | Novo nome |
|---|---|---|---|
| HOME EQUITY | `home-equity` (inexistente) | `credito` | `CRÉDITO` |
| MICROCRÉDITO | `renda-extra` (duplicado) | `organizar-financas` | `ORGANIZAR FINANÇAS` |
| CRÉDITO PESSOAL | `credito-pessoal` (inexistente) | `investimentos` | `INVESTIMENTOS` |

`planejar-o-futuro` e `score` ficam de fora nesta etapa: `score` está vazia
(Etapa 6) e `planejar-o-futuro` só entra se a contagem justificar um bloco
próprio.

### 2.3 SQL — `deploy/creditovc/home_blocos.sql`

Reescreve o array preservando a ordem, casando por `name` (não por índice, que
muda quando alguém edita a home no painel):

```sql
UPDATE settings
SET value = jsonb_set(
      value::jsonb,
      '{homeBlocks}',
      (SELECT jsonb_agg(
                CASE
                  WHEN b->>'name' = 'HOME EQUITY'
                    THEN jsonb_set(jsonb_set(b,'{category}','"credito"'),'{name}','"CRÉDITO"')
                  WHEN b->>'name' = 'MICROCRÉDITO'
                    THEN jsonb_set(jsonb_set(b,'{category}','"organizar-financas"'),'{name}','"ORGANIZAR FINANÇAS"')
                  WHEN b->>'name' = 'CRÉDITO PESSOAL'
                    THEN jsonb_set(jsonb_set(b,'{category}','"investimentos"'),'{name}','"INVESTIMENTOS"')
                  ELSE b
                END ORDER BY ord)
       FROM jsonb_array_elements((value::jsonb)->'homeBlocks') WITH ORDINALITY AS t(b, ord))
    )::text,
    updated_at = now()
WHERE key = 'site_settings';
```

```sql
-- Conferência (mesma transação não é necessária; rodar depois)
SELECT b->>'name' AS bloco, b->>'category' AS categoria
FROM settings, jsonb_array_elements((value::jsonb)->'homeBlocks') b
WHERE key='site_settings' AND b->>'blockType' = 'content'
ORDER BY (b->>'order')::int;
```

Execução:

```bash
cd /opt/sp011
docker compose exec -T -e PGCLIENTENCODING=UTF8 pg-blogs \
  psql -U postgres -d creditovc -v ON_ERROR_STOP=1 < deploy/creditovc/home_blocos.sql
```

### 2.4 Critério de aceite

- Nenhum bloco `content` visível com `category` fora de `settings.categories`.
- Nenhuma categoria usada por dois blocos.
- Na home servida: **0 ocorrências** de "HOME EQUITY", "MICROCRÉDITO" e
  "CRÉDITO PESSOAL"; presença de "CRÉDITO", "ORGANIZAR FINANÇAS" e
  "INVESTIMENTOS".
- `links` × `unicos` do §1: esperado subir de `22/11` para **~30/19**. A
  diferença residual (hero × Mais Recentes, e a sobreposição de
  `sair-das-dividas` com os mais recentes) **só fecha com o P1 de código** —
  ver §11.1. Não tratar como falha desta etapa.

---

## 3. Etapa 2 — Menu

### 3.1 O defeito, medido

`GET /api/site` → chave `menu_items`:

| Rótulo | `path` | Filhos |
|---|---|---|
| Pra você | `"/"` | Cartões de Crédito → `/cartoes-de-credito` |
| Para quem trabalha | `"/"` | Consignado Público → `/consignado-publico` |
| Para aposentados | `"/"` | — |
| Garantias e Patrimônio | `""` | — |
| Saindo das Dívidas | `""` | — |
| Organizar Finanças | `/organizar-financas` | — |

Três itens levam à home. Dois não levam a lugar nenhum (renderizam sem `href`).
Um funciona. As seis editorias com conteúdo só são alcançáveis pelo rodapé.

**Regra que o menu tem que passar a respeitar:** todo item ou tem `path` que
resolve, ou tem filhos e serve de cabeçalho de submenu. Item com `path:"/"` e
sem filhos é um link para a home ocupando o lugar mais nobre da página.

### 3.2 Duas variantes

**Variante A — editorial plana (recomendada, executável hoje).** Cada item é uma
editoria com conteúdo. Garante que todo item resolve e que toda editoria
indexável está no menu.

```
Sair das Dívidas   → /sair-das-dividas
Crédito            → /credito
Organizar Finanças → /organizar-financas
Renda Extra        → /renda-extra
Planejar o Futuro  → /planejar-o-futuro
Investimentos      → /investimentos
```

**Variante B — personas preservadas.** Mantém a arquitetura por público que o
menu atual tenta expressar, com os pais virando cabeçalhos de submenu
(`path: ""` **com** filhos) e as editorias reais penduradas neles.

```
Pra você (sem link)          → Crédito, Score, Cartões de Crédito
Para quem trabalha (sem link)→ Consignado Público, Renda Extra
Garantias e Patrimônio (—)   → Investimentos, Planejar o Futuro
Saindo das Dívidas           → /sair-das-dividas
Organizar Finanças           → /organizar-financas
```

**Condição da Variante B:** ela expõe `/score`, `/cartoes-de-credito` e
`/consignado-publico`, que hoje respondem **200 + `noindex`** por estarem
vazias. Só rodar a Variante B **depois** da Etapa 6. "Para aposentados" sai:
não há editoria correspondente.

**Recomendação:** rodar a **A** agora e migrar para a **B** quando a Etapa 6
fechar. A é reversível em segundos e não deixa nenhum estado ruim publicado.

### 3.3 SQL — `deploy/creditovc/menu_final.sql` (Variante A)

`menu_items` é uma **chave própria** da tabela `settings` (não vive dentro de
`site_settings`), e o valor é um array JSON:

```sql
UPDATE settings
SET value = '[
  {"id":"cvc-menu-dividas","path":"/sair-das-dividas","label":"Sair das Dívidas","order":0,"visible":true},
  {"id":"cvc-menu-credito","path":"/credito","label":"Crédito","order":1,"visible":true},
  {"id":"cvc-menu-organizar","path":"/organizar-financas","label":"Organizar Finanças","order":2,"visible":true},
  {"id":"cvc-menu-renda","path":"/renda-extra","label":"Renda Extra","order":3,"visible":true},
  {"id":"cvc-menu-futuro","path":"/planejar-o-futuro","label":"Planejar o Futuro","order":4,"visible":true},
  {"id":"cvc-menu-invest","path":"/investimentos","label":"Investimentos","order":5,"visible":true}
]',
    updated_at = now()
WHERE key = 'menu_items';
```

```sql
SELECT jsonb_array_length(value::jsonb) AS itens FROM settings WHERE key='menu_items';
```

### 3.4 Efeito colateral obrigatório de conhecer

A superfície de editorias de um blog é `settings.categories` ∪ menu
(`CLAUDE.md §17`). `cartoes-de-credito` e `consignado-publico` existem **só**
como item de menu — não estão em `settings.categories`. Portanto, ao removê-los
do menu, **as duas rotas passam a responder 404**.

Isso é correto e seguro: as duas têm **zero artigos**, respondem `noindex` hoje
e **não estão em nenhum sitemap** — não há URL indexada a perder. Se a Etapa 6
decidir dar conteúdo a elas, o caminho certo é **declará-las em
`settings.categories`** (painel → Categorias), não devolvê-las ao menu como
rota fantasma.

### 3.5 Critério de aceite

- `V-1`: nenhum item com `path` igual a `"/"` ou `""` sem filhos.
- `V-2`: toda rota linkada pela home responde 200 e não é `noindex`.
- As 6 editorias do sitemap aparecem no `<nav>` do HTML servido.

---

## 4. Etapa 3 — Rodapé

### 4.1 O defeito, medido

`site_settings.footerConfig.columns`, coluna "Mais Temas":

```json
{"id":"cvc-f-outros","href":"/outros","label":"Outros"}
```

`GET /outros` → **404**. É a **única URL 404 que o site publica** — resíduo da
remoção da categoria `outros` em 18/08 (`CLAUDE.md §4`).

Na coluna "Institucional", três rótulos distintos apontam para a mesma URL:
"Sobre o Crédito.vc", "Anuncie Conosco" e "Fale Conosco" → todos `/contato`.

### 4.2 SQL — `deploy/creditovc/rodape_limpeza.sql`

Remove o link morto e consolida os três rótulos em um, preservando o resto:

```sql
UPDATE settings
SET value = jsonb_set(
      value::jsonb,
      '{footerConfig,columns}',
      (SELECT jsonb_agg(
                jsonb_set(c, '{links}',
                  (SELECT coalesce(jsonb_agg(l ORDER BY lord), '[]'::jsonb)
                   FROM jsonb_array_elements(c->'links') WITH ORDINALITY AS u(l, lord)
                   WHERE l->>'id' NOT IN ('cvc-f-outros','cvc-f-anuncie','cvc-f-sobre'))
                ) ORDER BY ord)
       FROM jsonb_array_elements((value::jsonb)->'footerConfig'->'columns') WITH ORDINALITY AS t(c, ord))
    )::text,
    updated_at = now()
WHERE key = 'site_settings';
```

```sql
SELECT c->>'title' AS coluna, l->>'label' AS link, l->>'href' AS href
FROM settings,
     jsonb_array_elements((value::jsonb)->'footerConfig'->'columns') c,
     jsonb_array_elements(c->'links') l
WHERE key='site_settings';
```

**Decisão embutida:** "Sobre o Crédito.vc" e "Anuncie Conosco" saem porque
prometem páginas que não existem. Se a Etapa 5.2 criar `/sobre`, o link volta —
apontando para `/sobre`, não para `/contato`.

### 4.3 Critério de aceite

- `grep 'href="/outros"'` na home servida → **0 ocorrências**.
- Todo `href` do rodapé responde 200.

---

## 5. Etapa 4 — Capas de terceiros

### 5.1 Inventário fechado

Levantamento de 22/08, 209 dos 223 artigos publicados:

| Origem | Artigos | % |
|---|---|---|
| `central.midia.run` (terceiro re-hospedado) | 173 | 82,8% |
| `credito.vc` (24 uploads próprios + 3 OG genérico) | 27 | 12,9% |
| **Servidor do veículo (hotlink direto)** | **9** | **4,3%** |

**Contagem autoritativa antes de executar** (o HTTP amostrou 209 de 223):

```bash
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d creditovc -c \
"SELECT slug, image_url FROM articles WHERE status = 'published' AND image_url !~ '^https?://(credito\.vc|central\.midia\.run)/' ORDER BY slug;"
```

### 5.2 Ordem de execução

Painel → Artigos → editar capa. Nesta ordem, que é a de risco decrescente:

1. **`b3-regime-facil-captou-milhoes`** — capa em `http://files.sunoresearch.com.br/...`
   dentro de página `https://`. É *mixed content*: o navegador bloqueia e
   scrapers sociais recusam o `og:image`. **Quebra sozinha, sem depender de
   terceiro.**
2. **Os 8 hotlinks diretos restantes** — `infomoney.com.br` (2),
   `classic.exame.com` (2), `s2-g1.glbimg.com` (1), `moneytimes.com.br` (1),
   `seudinheiro.com` (2). O HTML nomeia o titular do direito, consome banda
   dele e pode ser desligado a qualquer momento.
3. **As capas que são o card de marca "SUNO NOTÍCIAS"** — verificado
   visualmente em `casas-bahia-pede-recuperacao-judicial…`, que é o **destaque
   principal da home**. Localizar as demais:

```bash
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d creditovc -At -c \
"SELECT image_url, count(*) FROM articles WHERE status = 'published' GROUP BY image_url HAVING count(*) > 1 ORDER BY 2 DESC;"
```

Capa repetida em vários artigos é a assinatura de um card institucional de
veículo. Conferir uma a uma antes de trocar.

4. **Os 3 artigos sem capa** (caem em `/api/site-asset/og-image`) — P3.

### 5.3 Regra inegociável

**Nunca editar a imagem do veículo para apagar a marca.** Ou se substitui o
arquivo por arte própria / banco licenciado, ou se troca a foto. Apagar a marca
converte um problema de licença em ato deliberado. Esta é a única recomendação
do PDF de origem que este PRD reforça como **proibição**.

### 5.4 Critério de aceite

```bash
cd /tmp
curl -s https://credito.vc/api/sitemap.xml | grep -o '<loc>[^<]*/artigo/[^<]*</loc>' \
  | sed 's/<loc>//;s|</loc>||' > u.txt
cat u.txt | xargs -P 6 -I{} sh -c 'curl -s --max-time 20 "{}" | grep -o "<meta property=\"og:image\" content=\"[^\"]*\"" | head -1 | sed "s/.*content=\"//;s/\"//"' > o.txt
echo "http:// (tem que dar 0): $(grep -c '^http://' o.txt)"
sed -E 's|^(https?)://([^/]+)/.*|\2|' o.txt | sort | uniq -c | sort -rn
```

Critério: **0** em `http://` e **0** em domínio fora de `credito.vc` /
`central.midia.run`.

---

## 6. Etapa 5 — `robots.txt` no Cloudflare

### 6.1 O defeito, e por que não é código

O `robots.txt` que a origem serve tem **152 bytes** — as 6 linhas de
`buildRobotsTxt()` (`vite.config.ts:1369-1382`), que liberam tudo menos
`/admin` e anunciam os dois sitemaps. **Não bloqueia IA nenhuma.**

O que o público recebe tem ~2 KB porque o Cloudflare **prepende** um bloco
próprio, delimitado por `# BEGIN Cloudflare Managed content` /
`# END Cloudflare Managed Content`, com `Content-Signal:
search=yes,ai-train=no,use=reference` e `Disallow: /` para: `Amazonbot`,
`Applebot-Extended`, `Bytespider`, `CCBot`, `ClaudeBot`,
`CloudflareBrowserRenderingCrawler`, `Google-Extended`, `GPTBot`,
`meta-externalagent`.

`credito.vc` é o **único blog da rede atrás do Cloudflare** (`CLAUDE.md §3`).
Nenhum outro domínio tem esse comportamento.

### 6.2 Correções de leitura, para a decisão ser informada

- **`OAI-SearchBot` NÃO está bloqueado.** É o agente que alimenta *citação em
  busca* do ChatGPT — ele já pode rastrear o site hoje. O PDF de origem errou
  nesse ponto.
- **`Google-Extended` bloqueado não afeta ranqueamento nem indexação** no Google
  Search. Ele governa treino e grounding do Gemini. Mantê-lo bloqueado é
  escolha editorial defensável, não defeito.
- **Efeito colateral silencioso:** a concatenação cria **dois grupos
  `User-agent: *`**. Rastreadores que seguem a especificação fundem as regras;
  parsers que só honram o primeiro grupo passam a **ignorar o
  `Disallow: /admin`**. Isso some junto com o bloco gerenciado.

### 6.3 Procedimento

Painel do Cloudflare → zona `credito.vc` → a feature que gerencia `robots.txt`
/ bloqueio de bots de IA. **A decisão é do dono do conteúdo.** Recomendação
registrada: liberar `GPTBot` e `ClaudeBot` (descoberta e citação) e manter, se
desejado, a restrição de treino via `Content-Signal: ai-train=no`.

**Este PRD não decide por você.** Ele registra que o bloqueio atual veio de um
default do Cloudflare, não de uma escolha deliberada.

### 6.4 Critério de aceite

```bash
curl -s https://credito.vc/robots.txt
```

- O bloco `# BEGIN Cloudflare Managed content` sumiu, **ou** permaneceu sem
  `GPTBot` e `ClaudeBot` — conforme a decisão.
- Continua havendo **exatamente um** grupo `User-agent: *`.
- As duas linhas `Sitemap:` seguem presentes.

---

## 7. Etapa 6 — Editorias vazias

### 7.1 O estado

| Rota | Declarada em `categories`? | No menu? | HTTP | No sitemap? |
|---|---|---|---|---|
| `/score` | **sim** | não | 200 + `noindex` | não |
| `/cartoes-de-credito` | não | sim | 200 + `noindex` | não |
| `/consignado-publico` | não | sim | 200 + `noindex` | não |

O comportamento está **correto** — é o vocabulário de resposta do P0. O problema
é editorial: três rotas existem sem sustentar conteúdo, e uma delas (`score`) é
um dos três termos da nova identidade do portal
(`Crédito.vc — Crédito, score e finanças pessoais`).

### 7.2 Decisão a tomar (uma por rota)

| Rota | Opção 1 | Opção 2 |
|---|---|---|
| `/score` | **Publicar pauta** — é termo da tagline e do título. Recomendada | Tirar de `settings.categories` → passa a 404 |
| `/cartoes-de-credito` | Declarar em `settings.categories` **e** publicar pauta | Sair do menu (Etapa 2 já faz) → 404 |
| `/consignado-publico` | idem | idem |

**Depois da Etapa 2 (Variante A), as duas últimas já saem do menu e viram 404
automaticamente.** Nada a fazer, a menos que se decida dar conteúdo a elas.

Para `/score`, o caminho recomendado é conteúdo, não remoção — inclusive porque
a central já classifica para essa editoria e as regras de `rules_keywords.sql`
têm `score` com prioridade 28.

### 7.3 Critério de aceite

- Nenhuma rota `noindex` alcançável a partir de um link publicado no site.
- Se `/score` receber conteúdo: passa a 200 + `index, follow` e **entra no
  sitemap sozinho** (ele sai do banco — `CLAUDE.md §17`).

---

## 8. Etapa 7 — O segundo `<h1>` da home

### 8.1 O defeito

A home tem **2 `<h1>`**:

1. `<h1 class="sr-only">` com nome do site + tagline — é o do app, correto.
2. `<h1 class="ticker-heading-title">Indicadores` — vem do bloco **"HTML
   Personalizado"** (`blockType: "html"`, ordem 8, **15.012 caracteres** de HTML
   autoral com `<style>` embutido), que renderiza o ticker de indicadores
   econômicos.

Não é código: é conteúdo digitado no painel.

### 8.2 Correção

Painel → *Home + menu* → bloco "HTML Personalizado" → trocar
`<h1 class="ticker-heading-title">` por `<h2 class="ticker-heading-title">`
(e o `</h1>` correspondente por `</h2>`). O CSS casa por classe, então o visual
não muda.

**Não fazer por SQL.** O HTML tem 15 KB com aspas, `<style>` e escapes — um
`jsonb_set` mal formado corrompe o bloco inteiro. A edição no painel é mais
segura e leva menos tempo.

### 8.3 Critério de aceite

```bash
curl -s https://credito.vc/ | grep -o '<h1' | wc -l
```

Esperado: **1**.

---

## 9. Etapa 8 — Autoria

### 9.1 O defeito

JSON-LD do artigo:

```json
"author": {"@type":"Person","name":"Crédito.vc"}
```

Uma organização declarada como pessoa. Não há assinatura visível no corpo do
artigo (`Por …` não aparece no HTML), nem `author.url`, nem `publisher.url`.

### 9.2 Limite explícito desta etapa

**Não inventar jornalistas.** Nome fictício de autor com página de perfil é
fabricação de sinal de E-E-A-T e é exatamente o padrão que alimenta
classificação de conteúdo enganoso — risco concreto numa rede que já teve um
domínio marcado como "Páginas enganosas" (`CLAUDE.md §19.3`).

Dois caminhos legítimos:

- **Pessoa real.** O mecanismo já existe e é só cadastro: `settings.columnists`
  + `articles.columnist_id` + perfil `columnist` (`CLAUDE.md §13`). Um usuário
  Colunista sempre tem perfil em `settings.columnists`, criado junto pelo
  `POST /users`. Autor não-genérico vence a assinatura padrão.
- **Redação.** Assinar "Redação Crédito.vc" e corrigir o `@type` para
  `Organization`.

### 9.3 O que é dado e o que é código

| Parte | Onde |
|---|---|
| Cadastrar autor real e vincular aos artigos | **Painel** — esta etapa |
| `@type` correto, `author.url`, `publisher.url`, `publisher.logo` real | **Código** — P1 do OleySports (`P1-4`) |

---

## 10. Ordem, dependências e paralelismo

```
Etapa 1 (blocos da home)  ─┐
Etapa 3 (rodapé)          ─┼─ independentes entre si, podem ir juntas
Etapa 7 (h1 do ticker)    ─┘

Etapa 2 (menu) ──────────── depende da contagem por categoria (§1)
   └── Etapa 6 (editorias vazias) ── habilita a Variante B do menu

Etapa 4 (capas) ─────────── independente, é a mais longa
Etapa 5 (Cloudflare) ────── independente, exige decisão do dono
Etapa 8 (autoria) ───────── independente
```

**Sequência recomendada em uma sessão:** §1 baseline → §1.1 backup → Etapa 1 →
Etapa 3 → Etapa 2 (Variante A) → conferência HTTP → Etapa 7 → Etapa 5. As
Etapas 4, 6 e 8 são trabalho contínuo e não bloqueiam nada.

**Propagação:** o api relê `site_settings` e `menu_items` do banco a cada
**15 s** (`startSettingsSync`, `store.ts:786`) — nenhum restart é necessário. O
`web` guarda a identidade do blog por **5 min** (`makeSiteMetaResolver`,
`vite.config.ts:81`) e o HTML do SSR por **30 s** (home) / **60 s** (páginas).
Conferir pelo HTTP **6 minutos** depois, não antes.

---

## 11. O que fica para o P1 do OleySports

Não abrir release exclusiva do Crédito.vc para nada abaixo. São defeitos da
imagem compartilhada e saem para os 11 blogs de uma vez.

### 11.1 Deduplicação residual da home

Depois da Etapa 1, sobra a sobreposição que **nenhuma configuração resolve**:
hero e "Mais Recentes" usam a mesma fonte (`source: latest`), e um bloco
editorial pode repetir um artigo que já saiu nos mais recentes.

Especificação para quando o P1 for implementado:

1. Conjunto de ids já exibidos, montado na ordem dos blocos da home.
2. Cada bloco filtra o que já saiu **antes** de aplicar o seu `itemsLimit`.
3. **Piso obrigatório:** se a exclusão deixar um bloco editorial abaixo do
   mínimo do layout, o bloco volta a poder repetir. Sem isso, blogs com poucas
   matérias por editoria perdem seções inteiras — e a mudança sai para os 11.
4. Precedência: destaque principal > blocos editoriais na ordem da home >
   "mais recentes".
5. Teste dedicado em `homeBlocks.test.ts`, **incluindo o caso do piso**.

### 11.2 Os demais

| Finding | Item | Equivalente no Oley |
|---|---|---|
| `CVC-08` | Breadcrumb com fonte única de path (apagar `lib/categoryRoute.ts`) — **223/223 artigos do Crédito.vc apontam para a home** | `P1-3` |
| `CVC-09` | Metadata por rota: description própria das 7 editorias | `P1-1` |
| `CVC-10` | SSR + canonical + `<title>` próprio das institucionais (`/contato`, `/privacidade`, `/termos`, `/arquivo` — as quatro estão no sitemap com o `<title>` da home) | `P1-1`, `P1-2` |
| `CVC-09` | `WebSite`/`Organization` na home; `CollectionPage`/`ItemList` na editoria | `P1-4` |
| `CVC-11`, `CVC-13` | `@type` do autor, `author.url`, `publisher.url`, `publisher.logo` real | `P1-5` |
| `CVC-16` | `dateModified` condicionado à semântica de `updatedAt` | `P1-5` |
| `CVC-17` | `twitter:site` = `@brasiliaagora` no stub social | `P2-3` |
| `CVC-18` | `/credito/` → 200 `index, follow` sem canonical | `P2-6` |

---

## 12. Critérios de aceite consolidados

| # | Critério | Como medir |
|---|---|---|
| 1 | Nenhum bloco da home aponta para categoria inexistente | SQL da §2.3 |
| 2 | Nenhuma categoria alimenta dois blocos | SQL da §2.3 |
| 3 | Artigos únicos na home ≥ 19 (de 11) | §1 |
| 4 | Nenhum item de menu com `path` `"/"` ou `""` sem filhos | `V-1` |
| 5 | Zero 404 entre as rotas linkadas pela home | `V-2` |
| 6 | Zero `noindex` entre as rotas linkadas pela home | `V-2` |
| 7 | Zero capas em `http://` | §5.4 |
| 8 | Zero capas em domínio de terceiro | §5.4 |
| 9 | `robots.txt` reflete a decisão da Etapa 5 | §6.4 |
| 10 | Exatamente 1 `<h1>` na home | §8.3 |
| 11 | **Não-regressão:** Googlebot e navegador com os mesmos bytes; `/rota-inventada-xyz` e `/wp-login.php` em 404; sitemap com 223 artigos | `V-6` do PRD de análise |

O critério 11 roda **depois de cada etapa**, sem exceção.

---

## 13. Rollback

Por etapa, do mais barato ao mais caro:

| Etapa | Rollback |
|---|---|
| 1, 3 | `UPDATE settings SET value = jsonb_set(value::jsonb,'{homeBlocks}', <conteúdo de $BK/homeBlocks.json>)::text WHERE key='site_settings';` — idem para `footerConfig` |
| 2 | `UPDATE settings SET value = <conteúdo de $BK/menu_items.json> WHERE key='menu_items';` |
| 4 | Recolocar a URL antiga no campo de capa do artigo (o arquivo de origem não foi apagado) |
| 5 | Reverter o toggle no painel do Cloudflare |
| 6 | Redeclarar a categoria em `settings.categories` |
| 7 | Reeditar o bloco HTML no painel |
| 8 | Desvincular o colunista do artigo |

Nenhuma etapa exige rollback de imagem. Se algo em §11 for implementado, aí sim
vale o procedimento padrão do `CLAUDE.md §6` (voltar `BLOG_IMAGE_TAG`).

---

## 14. Riscos

| # | Risco | Mitigação |
|---|---|---|
| R-1 | O `jsonb_set` da Etapa 1 casa por `name`; se alguém renomear o bloco no painel antes de rodar, o UPDATE não acha nada e vira no-op silencioso | Rodar a conferência da §2.3 **depois** e comparar; `UPDATE 1` não garante que a condição casou |
| R-2 | Reescrever `menu_items` inteiro apaga qualquer item criado no painel entre o backup e a execução | Rodar backup e UPDATE na mesma sessão; conferir `jsonb_array_length` |
| R-3 | Remover `cartoes-de-credito`/`consignado-publico` do menu transforma as rotas em 404 | Aceito e desejado: 0 artigos, `noindex`, fora de todo sitemap. §3.4 |
| R-4 | Trocar capa invalida o `og:image` já cacheado pelas redes sociais | Repassar Facebook Sharing Debugger / LinkedIn Post Inspector nos artigos alterados |
| R-5 | `value::jsonb` falha se o blob estiver corrompido | `ON_ERROR_STOP=1` aborta antes de gravar; o backup da §1.1 é a rede de segurança |
| R-6 | Conferir pelo HTTP antes dos 6 min e concluir que a etapa falhou | §10 — o `web` cacheia identidade por 5 min |

---

## 15. Definição de pronto

**As oito etapas estão fechadas quando:**

1. Os 11 critérios da §12 passam.
2. O baseline da §1 foi recapturado e registrado neste documento como
   "depois".
3. A decisão da Etapa 5 (Cloudflare) está registrada por escrito — inclusive se
   for "manter como está".
4. As decisões da Etapa 6 (três editorias) estão registradas, uma por rota.
5. Nenhum item do §11 foi implementado por aqui — se algum for necessário, ele
   entra pelo P1 do OleySports, com rollout para os 11 blogs.

---

## 16. Documentos relacionados

- `deploy/creditovc/EXECUCAO_PRIORIDADES.md` — **runbook de execução**: os
  blocos prontos para colar na VPS (baseline, backup, aplicação, conferência,
  não-regressão, rollback) e o procedimento das etapas de painel.
- `docs/PRD-SEO-CREDITOVC-CRUZAMENTO-OLEYSPORTS.md` — análise, matriz de
  findings e plano de validação (`V-0` a `V-7`).
- `docs/IDENTIDADE-SEO-REDE.md` — tagline e meta descrição dos 11 blogs
  (executado em 22/08).
- `docs/PRD-SEO-TECHNICAL-OLEYSPORTS-V2.md` — roadmap P1/P2 do código
  compartilhado.
- `docs/IMPLEMENTACAO-P0-OLEYSPORTS-RELATORIO.md` — o que a v98 entregou.
- `CLAUDE.md §3` (Cloudflare), `§4` (editorias), `§8` (templates de home),
  `§12` (acesso aos bancos), `§17` (invariantes).
- `deploy/creditovc/` — `rules_keywords.sql`, `limpeza_intrusas.sql`,
  `limpeza_mercado.sql`, `reclassifica_investimentos.sql`.
