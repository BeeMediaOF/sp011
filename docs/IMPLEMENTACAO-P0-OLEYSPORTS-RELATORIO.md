# Relatório de implementação — P0 OleySports (indexação, URL e sitemap)

> **Status:** implementação local **concluída**, validada por typecheck e testes.
> **Nenhum deploy de produção foi realizado.**
>
> **Data:** 2026-08-20 · **Branch:** `main` · **Base:** `b555965` · **HEAD:** `da19dc4`
> **Referência de implementação:** `docs/PRD-P0-OLEYSPORTS-INDEXACAO-URL-SITEMAP-V2.md`

---

## 1. Commits (9, um por etapa)

| # | SHA | Título |
|---|---|---|
| 1 | `1bc16a5` | Separa crawler de busca do pre-render social (Googlebot recebe o site) |
| 2 | `ec1ef11` | Superficie de editorias por blog: existir, aparecer no menu e indexar sao coisas diferentes |
| 3 | `f355c5e` | Nenhuma pagina publica link para rota que nao existe |
| 4 | `b6b086d` | Falha de infraestrutura nunca vira ausencia: fetch tri-estado e 503 com Retry-After |
| 5 | `e29052a` | Vocabulario de resposta: 404 para o que nao existe, noindex para editoria vazia, 404 para arquivo |
| 6 | `f23957c` | UUID de artigo redireciona 301 para o slug |
| 7 | `c3647b3` | Sitemap geral passa a publicar o acervo real do blog |
| 8 | `47a66a6` | Coloca o vite.config.ts no typecheck (ele deixou de ser configuracao) |
| 9 | `da19dc4` | Editoria por conteudo so resolve em slug canonico (senao /FUTEBOL duplica /futebol) |

Cada commit é revertível sozinho, na ordem inversa. Os commits 8 e 9 são
correções descobertas **durante** a implementação (§5) — não estavam no PRD.

---

## 2. Arquivos alterados

**Novos (funções puras + testes):**

| Path | O que é |
|---|---|
| `brasilia-agora/src/lib/crawlerUa.ts` (+ `.test.ts`) | `isSocialCrawler` — quem recebe o card e quem recebe o site |
| `brasilia-agora/src/lib/routeDecision.ts` (+ `.test.ts`) | `decideArticle`, `decideCategory`, `decideUnavailable`, `canonicalArticlePath` |
| `brasilia-agora/src/lib/staticPath.ts` (+ `.test.ts`) | `safeRelative`, `isStaticCandidate` |
| `api-server/src/lib/sitemapXml.ts` (+ `test/sitemapXml.test.ts`) | montagem do XML, sem banco e sem Express |

**Modificados:**

| Path | Mudança |
|---|---|
| `brasilia-agora/vite.config.ts` | fetch tri-estado, `Outcome`, cascata stale/503, 404, 301, `noindex`, `staticExistsPlugin`, `/sitemap.xml`, shell compartilhado, contadores e logs |
| `brasilia-agora/src/lib/categoryRoutes.ts` | `blogCategorySurface`, `categoryRouteForSlug`, `STATIC_PAGE_PATHS`, 3º parâmetro de `resolveCategoryRoute` |
| `brasilia-agora/src/lib/ssrRoutes.ts` | novos `kind` `static` e `unknown` (linha da barra final **intacta**) |
| `brasilia-agora/src/lib/homeBlocks.ts` | `categoryHref` — destino validado contra a superfície |
| `brasilia-agora/src/App.tsx` | remoção das 13 rotas fixas; `DynamicCategory` com `categories` + semente |
| `brasilia-agora/src/pages/CategoryArchivePage.tsx` | `isEmpty`; placeholder deixa de ter id de artigo |
| `brasilia-agora/src/components/CategoryPage.tsx` | estado vazio sem `<Link>` |
| `brasilia-agora/src/pages/Home.tsx` + 6 `SectionBlock*.tsx` + `PortalZoneBlocks.tsx` | `href` opcional; "Ver mais" some quando o destino não existe |
| `brasilia-agora/tsconfig.json` | `vite.config.ts` entra no typecheck |
| `api-server/src/routes/sitemap.ts` | consulta ao banco, editorias do acervo, `Cache-Control`, teto de 50k |
| `api-server/src/lib/store.ts` | stub `getArticles` **apagado** |

**Não tocados, de propósito:** `Caddyfile`, `compose.yml`, `.env`, qualquer
arquivo de infraestrutura, `articleService.getArticle` (continua resolvendo por
id **ou** slug), `ssrRoutes.ts:35` (barra final) e seu teste,
`lib/categoryRoute.ts` (singular, breadcrumb — P1-3), componentes mock.

---

## 3. Baseline (Etapa 0, capturado antes de qualquer mudança)

`pnpm exec tsc -b` limpo · `typecheck` limpo nos dois pacotes · **156** testes em
`brasilia-agora`, **284** em `api-server`.

Produção em 20/08/2026, somente GET (confirma o PRD ponto a ponto):

| Verificação | Baseline |
|---|---|
| `/artigo/<slug>` navegador | 200 · 88.636 B · **2** `ld+json` |
| `/artigo/<slug>` **Googlebot** | 200 · **3.053 B** · **0** `ld+json` |
| `/artigo/<slug>` bingbot | 200 · 3.053 B · 0 `ld+json` |
| `/artigo/<slug>` `Google-InspectionTool` | 200 · **88.636 B** — confirma a armadilha do §12.2 |
| `/artigo/<uuid>` | 200 · 88.596 B (sem redirect) |
| `/artigo/__placeholder__`, `/artigo/nao-existe-abc` | **200** shell |
| `/politica`, `/geral`, `/rota-inventada-xyz` no Oley | **200** |
| `/copa-do-mundo` (86 artigos) | 200 · 7.873 B — **shell, sem página** |
| `/sitemap.xml`, `/sitemap_index.xml`, `/nada.xml`, `/wp-login.php`, `/assets/inexistente.js` | **200 `text/html`** (6.588 B) |
| `/api/sitemap.xml` | 200 · 1.929 B · **0 artigos** |
| sp011 `/politica`, `/geral`, `/seguranca` | 200 SSR (205–208 KB) |

**Dados (API pública do Oley):** 644 publicados · **0** sem slug · **0** slugs
duplicados · **E-3 respondido: 0 artigos com `canonicalUrl`** (nenhum canonical
externo ou no domínio antigo — a pré-condição de conteúdo do sitemap está
satisfeita) · categorias: `futebol` 311, `copa-do-mundo` 86, `f1` 46, `tenis` 45,
`futebol-americano` 42, `volei` 42, **`tebol` 39**, `e-sports` 17, `outros` 13,
**`copa-do-mndo` 2**, **`otros` 1**.

**Configuração confirmada:** Oley = 9 editorias declaradas (uma com
`visible:false`) + 7 no menu; sp011 = **nenhuma** editoria declarada + 9 no menu.
Em nenhum dos dois a tabela das 13 fixas se aplica — exatamente o previsto no
§13.5 do PRD.

Saída completa em `scratchpad/baseline/` (`baseline-routes.txt`,
`baseline-retry.txt`, `baseline-ua.txt`, `baseline-dados.txt`,
`baseline-site.txt`).

---

## 4. Decisões implementadas

1. **Buscador sai do pré-render social.** `Googlebot`, `bingbot`, `Applebot` e
   `W3C_Validator` deixam de casar o regex; os nove crawlers de compartilhamento
   ficam. O plugin passou a exigir GET/HEAD (X-19).
2. **Superfície de editorias por blog.** `settings.categories` (**inclusive as
   `visible:false`**) ∪ menu interno; tabela fixa só quando o blog não declara
   nada. Rótulo e cor das editorias clássicas continuam vindo da tabela — o H1 do
   sp011 não perde o acento de "SEGURANÇA".
3. **Quatro classes**, na função pura `decideCategory`: declarada com conteúdo →
   200; declarada e vazia → 200 + `noindex`; **não declarada com conteúdo → 200
   indexável**; não declarada e vazia → 404. Slug corrompido (`tebol`) é servido
   como Classe 3 até a higiene de dados — nenhuma tentativa de detectar
   corrupção em código.
4. **Nenhum link interno para URL que responde 404**: fim do
   `/artigo/__placeholder__` e "Ver mais" validado contra a superfície.
5. **Tri-estado da API.** Só o 404 explícito é autoritativo; 5xx, 503, 429,
   timeout e ECONNREFUSED são indisponibilidade. Cascata: stale (≤10 min) → 503
   com `Retry-After: 60` e `no-store`. **Nunca 404, nunca 200 vazio.**
6. **Vocabulário completo**: 200, 200+`noindex`, 301, 404, 503. O 404 leva
   `noindex` e **não** leva canonical; `applyHead` substitui a tag `robots` do
   template em vez de acrescentar uma segunda.
7. **Arquivo inexistente responde 404** (`staticExistsPlugin`, registrado por
   último). `/sitemap.xml` → **301** para `/api/sitemap.xml`;
   `/sitemap_index.xml` → **404**.
8. **301 de UUID para slug**, decidido antes de renderizar, comparando valores
   **decodificados** (sem laço por encoding) e preservando a query.
9. **Sitemap** lê o banco, usa o slug, exclui canonical de outro host, publica as
   editorias **com conteúdo**, `lastmod` = `publishedAt`, `Cache-Control:
   public, max-age=900`, teto de 50k com aviso em log.

---

## 5. Diferenças em relação ao PRD (e por quê)

| # | PRD | O que foi feito | Motivo |
|---|---|---|---|
| 1 | §19.1: contadores expostos em `/__ssr-stats`, *"não roteado pelo Caddy"* | **Endpoint não criado.** Contadores em memória + log amostrado (`apiUnavailable` e `staleServed` em `warn`) | A premissa é falsa: o snippet `(blog)` tem `handle { reverse_proxy <id>-web:3000 }` como catch-all, então `/__ssr-stats` seria **público**. Criar superfície pública nova não estava no escopo |
| 2 | §12.1: `W3C_Validator` sai "opcional" (D-4) | **Saiu** | A constante se chama `SOCIAL_CRAWLER_RE`; um validador não é preview de compartilhamento. Reversível em uma linha |
| 3 | §14.1 item 9: editorias do sitemap via `blogCategorySurface` + contagem | Editorias vêm do **próprio acervo** (`GROUP BY category`, mais a tag slugificada dos artigos legados sem categoria) | `api-server` não importa do pacote do frontend. O conjunto é o mesmo **e** ganha uma garantia extra: o sitemap nunca publica editoria com zero artigos. Efeito aceito: editoria Classe 2 fica de fora (correto) |
| 4 | §13.5: superfície = menu ∪ categorias | Item de **menu** com `visible:false` não entra na superfície; **editoria declarada** com `visible:false` entra | O teste existente *"item oculto do menu não vira página"* é contrato anterior e o PRD não pediu para mudá-lo. O caso que o PRD exige (`copa-do-mundo`) vem de `settings.categories` e está coberto; editoria oculta no menu **com conteúdo** continua protegida pela Classe 3 |
| 5 | — | **`vite.config.ts` entrou no typecheck** (commit 8) | Ele não era typechecado (`include: ["src/**/*"]`) e o `vite build` usa esbuild, que apaga tipos. Uma `Promise<Outcome>` sem `return` foi escrita e compilou; em produção viraria `undefined.kind`. Junto foi o único erro preexistente revelado (`manualChunks` sem retorno em todos os caminhos), registrado e corrigido com `return undefined` — comportamento idêntico |
| 6 | — | **Slug canônico obrigatório na sonda de conteúdo** (commit 9) | A sonda da Classe 3 criaria conteúdo duplicado: `?category=` normaliza para minúsculas, então `/FUTEBOL` acharia os 307 artigos de `/futebol` e serviria uma segunda página com canonical próprio. Atende I-29 |
| 7 | §22: "Ver mais" só em `Home.tsx` | `href` virou opcional também nos 6 `SectionBlock*.tsx`, no `SectionHeaderClassic` e no `PortalZoneBlocks` | Esses componentes recebiam `href: string` e renderizavam o link incondicionalmente; sem isso o destino inválido continuaria publicado |
| 8 | §21.2 A-11 | `Location` do 301 é **relativo** (`/artigo/<slug>`) e a query é recolocada na resposta, não no valor cacheado | A chave de cache não inclui a query; guardar o `Location` com query devolveria o utm de outra visita. `Location` relativo é válido (RFC 7231) e evita adivinhar proto/host |
| 9 | §17.1 | A cascata stale→503 é executada pelo cache do `handleSsr`; a REGRA está em `decideUnavailable`, usada também por `decideArticle` e `decideCategory` | Uma implementação só da regra, testada; o cache é quem sabe se existe stale |

---

## 6. Testes executados e resultados

```
pnpm exec tsc -b                                    OK
artifacts/api-server      pnpm run typecheck        OK
artifacts/api-server      pnpm test                 297 pass / 0 fail   (baseline 284)
artifacts/api-server      pnpm run build (esbuild)  OK
artifacts/brasilia-agora  pnpm run typecheck        OK  (agora inclui vite.config.ts)
artifacts/brasilia-agora  npx tsx --test src/**     205 pass / 0 fail   (baseline 156)
```

**62 casos novos** (mínimo exigido pelo PRD: 45). Cobertura por seção:

| Seção do PRD | Arquivo | Casos |
|---|---|---|
| 21.2 `decideArticle` | `routeDecision.test.ts` | A-1 … A-12 + encoding inválido + canônico |
| 21.3 `decideCategory` | `routeDecision.test.ts` | C-1 … C-9 |
| 21.4 `blogCategorySurface` | `categoryRoutes.test.ts` | S-1 … S-8 + Classe 3 + I-29 |
| 21.5 `classifySsrPath` | `ssrRoutes.test.ts` | P-1 … P-10 |
| 21.6 `staticPath` | `staticPath.test.ts` | T-1 … T-8 + travessia e byte nulo |
| 21.7 `isSocialCrawler` | `crawlerUa.test.ts` | U-1 … U-9 |
| 21.8 "Ver mais" | `homeBlocks.test.ts` | V-1 … V-5 |
| 21.9 sitemap | `sitemapXml.test.ts` | M-1 … M-10 + XML válido + host |

Os dois contratos que o PRD manda preservar continuam verdes: *"o painel NUNCA é
renderizado no servidor"* e *"barra final fica com a SPA"*.

---

## 7. Itens não executáveis localmente

| Item | Por quê | Onde se resolve |
|---|---|---|
| `vite build` e a cadeia de middlewares em execução | O build do frontend não roda no Windows (`CLAUDE.md §14`) | Build na VPS; a cadeia foi verificada por typecheck (agora cobrindo o `vite.config.ts`) e pelas funções puras |
| Tabela 21.10 (35 verificações de integração por `curl`) | Exige o código no ar | §11 deste relatório, depois do rollout |
| 21.11 (parar o `api` e conferir stale/503) | Exige ambiente com container | Ambiente de teste, **nunca em produção** |
| Sharing Debugger (Facebook) e Post Inspector (LinkedIn) | Ferramentas externas | Pós-deploy (NR-11) |
| Search Console | Externo | Pós-deploy |

---

## 8. Riscos residuais

| # | Risco | Mitigação já no código | O que observar |
|---|---|---|---|
| R-1 | `staticExistsPlugin` responder 404 em arquivo que existe | `fs.existsSync` sobre `dist/public`; travessia recusada na função pura; `BASE_PATH` diferente de "/" tratado; **conferido que todo arquivo referenciado existe em `public/`** (`favicon.jpg`, `fonts/*`, `robots.txt`, `llms.txt`, `sw.js`, `opengraph.jpg`, `meta-auth-complete.html`) | `curl -sI $D/favicon.jpg` e o login do Meta (`/meta-auth-complete.html`) |
| R-2 | Home responder **503** em blog com wizard incompleto | É a decisão do PRD (X-9): `/admin/setup` continua 200 porque o shell dele não depende da API | Só afeta blog sem instalação concluída |
| R-3 | A sonda da Classe 3 gera **1 consulta extra** por path de um segmento inventado | Cache de "não existe" por 60 s, com teto próprio de 50 entradas | `ssr.notFound` no log do `web` |
| R-4 | `/api/sitemap.xml` passa de 1.929 B para ~650 URLs | `Cache-Control: public, max-age=900`; `select` de 4 colunas | Tempo de resposta do endpoint |
| R-5 | Editoria declarada **só no menu** e vazia vira 404 | Nenhum blog da rede está nessa situação hoje (Oley e sp011 conferidos) | **NR-12** nos 11 domínios |
| R-6 | Navegação SPA para editoria Classe 3 (clique dentro do site) cai em "não encontrado" | Comportamento **igual ao de hoje**; entrada direta e buscador recebem 200 com conteúdo, e nenhum link interno aponta para Classe 3 | P1: expor a Classe 3 ao cliente sem depender da semente |
| R-7 | 42 artigos em slugs corrompidos continuam servidos | Decisão explícita do PRD §13.4 | Higiene de dados (P1-8); depois dela viram 404 sem código novo |
| R-8 | `fetch` sem timeout no middleware | **Preexistente**, não alterado | Se a `api` travar sem fechar a conexão, a requisição espera — como antes |
| R-9 | Analytics conta pageview em resposta 404 | Preexistente (a SPA hidrata e dispara o evento) | Volume de pageviews em rota inexistente |

---

## 9. Checklist de rollout (**não executado**)

> **Release única.** Sitemap e resolução de URL vão juntos: separados, 11 das 14
> URLs do sitemap atual virariam 404 na janela entre deploys.
> **Bump de `BLOG_IMAGE_VERSION` builda `api` E `web` juntos** (`CLAUDE.md §6`).

- [ ] `git push origin main` (9 commits + este relatório)
- [ ] Build + sp011:

```bash
cd /opt/sp011
git pull
V=$(grep -m1 '^BLOG_IMAGE_VERSION=' .env | cut -d= -f2); N="v$((${V#v}+1))"
sed -i "s|^BLOG_IMAGE_VERSION=.*|BLOG_IMAGE_VERSION=$N|" .env
grep '^BLOG_IMAGE_VERSION=' .env
docker compose build api web
docker compose up -d api web
```

- [ ] **Canário 1 — sp011** (a taxonomia mais divergente da rede: valida a Classe
      3 e a rede de segurança da tabela fixa). Só seguir se tudo passar:

```bash
S=https://sp011.com.br
for p in / /politica /geral /seguranca; do
  printf '%-14s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 $S$p)"
done
curl -s --max-time 60 $S/seguranca | grep -c '<h1'        # >= 1
curl -s --max-time 60 $S/seguranca | grep -c 'noindex'    # 0
```

- [ ] **Canário 2 — oleysports** (`/opt/blogs/oleysports`, individualmente):

```bash
N=$(grep -m1 '^BLOG_IMAGE_VERSION=' /opt/sp011/.env | cut -d= -f2)
cd /opt/blogs/oleysports
sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=$N|" .env
docker compose up -d
curl -s https://oleysports.com.br/api/site | grep -o '"siteName":"[^"]*"'
```

- [ ] Rodar a verificação do §11 no Oley e no sp011
- [ ] Demais 9 blogs, em paralelo:

```bash
N=$(grep -m1 '^BLOG_IMAGE_VERSION=' /opt/sp011/.env | cut -d= -f2)
for b in ksports esporteagora resenhavip beeesportes apostaganha recebabet \
         pontofarma creditovc ocomandante; do
  [ -d "/opt/blogs/$b" ] || continue
  ( cd "/opt/blogs/$b" \
    && sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=$N|" .env \
    && docker compose up -d ) &
done
wait
cd /opt/sp011
```

- [ ] **NR-12 nos 11 domínios** (nenhum item de menu pode responder 404)
- [ ] NR-11: preview social nos 5 UAs + Sharing Debugger com "Scrape again"
- [ ] GSC: reenviar `/api/sitemap.xml`; **validar o Googlebot por `curl -A`, nunca
      pelo "Testar URL ativa"** (§12.2 do PRD)
- [ ] Acompanhar "Não encontrada (404)" por 30 dias — **aumento é sinal de
      sucesso**, desde que nenhuma URL listada seja artigo ou editoria real

---

## 10. Checklist de rollback

**Gatilhos:** 404 em artigo real ou em editoria com conteúdo · qualquer item de
menu em 404 (NR-12) · preview social quebrado · 5xx no `web` que não seja o 503
esperado da RN-1 · queda de pageviews no Analytics.

- [ ] **Um blog só, imediato** (a imagem anterior continua no host — não há registry):

```bash
cd /opt/blogs/oleysports
sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=<tag-anterior>|" .env
docker compose up -d
curl -s https://oleysports.com.br/api/site | grep -o '"siteName":"[^"]*"'
```

- [ ] **Rede inteira** — reverter e rebuildar (bump obrigatório: a versão tagueia
      `api` e `web`):

```bash
cd /opt/sp011
git revert --no-edit da19dc4 47a66a6 c3647b3 f23957c e29052a b6b086d f355c5e ec1ef11 1bc16a5
git push
V=$(grep -m1 '^BLOG_IMAGE_VERSION=' .env | cut -d= -f2); N="v$((${V#v}+1))"
sed -i "s|^BLOG_IMAGE_VERSION=.*|BLOG_IMAGE_VERSION=$N|" .env
docker compose build api web && docker compose up -d api web
```

- [ ] **Reversão parcial:** cada etapa é independente; a ordem só importa em
      5 → 6 → 7 (o 301 e o sitemap dependem do vocabulário de status).
- [ ] **Não** rodar `docker image prune` enquanto o canário não estabilizar.
      **Nunca** `docker system prune --volumes`.

---

## 11. Validação pós-deploy — comandos read-only

```bash
D=https://oleysports.com.br
S=https://sp011.com.br
SLUG=serie-b-2026-athletic-club-recebe-crb-em-duelo-direto-por-aproximacao-do-g-4
UUID=ce9ce8e2-68be-4ecf-8c7f-88d1e476607f
GB='Googlebot/2.1 (+http://www.google.com/bot.html)'
```

**Status esperado por rota** — nenhuma linha pode divergir:

```bash
for r in "/ 200" "/futebol 200" "/copa-do-mundo 200" "/basquete 200" \
         "/politica 404" "/geral 404" "/rota-inventada-xyz 404" "/a/b/c 404" \
         "/artigo/$SLUG 200" "/artigo/$UUID 301" "/artigo/__placeholder__ 404" \
         "/artigo/nao-existe-abc 404" "/contato 200" "/termos 200" \
         "/privacidade 200" "/arquivo 200" "/sitemap.xml 301" \
         "/sitemap_index.xml 404" "/nada.xml 404" "/wp-login.php 404" \
         "/assets/inexistente.js 404" "/favicon.jpg 200" "/robots.txt 200" \
         "/llms.txt 200" "/api/sitemap.xml 200" "/tebol 200" "/FUTEBOL 404" \
         "/futebol/ 200"; do
  set -- $r
  got=$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 "$D$1")
  [ "$got" = "$2" ] && s=OK || s="*** DIVERGIU ***"
  printf '%-28s esperado=%s obtido=%s %s\n' "$1" "$2" "$got" "$s"
done
```

**F-26 — buscador e navegador na mesma URL** (critério do §12.3):

```bash
for ua in "Mozilla/5.0 Chrome/120" "$GB"; do
  b=$(curl -s --max-time 60 -A "$ua" "$D/artigo/$SLUG")
  printf '%-14s bytes=%s ldjson=%s h1=%s %s\n' \
    "$(echo "$ua" | cut -c1-13)" \
    "$(printf '%s' "$b" | wc -c)" \
    "$(printf '%s' "$b" | grep -o 'application/ld+json' | wc -l)" \
    "$(printf '%s' "$b" | grep -o '<h1' | wc -l)" \
    "$(printf '%s' "$b" | grep -o 'rel="canonical" href="[^"]*"' | head -1)"
done
# esperado: bytes do Googlebot >= 95% do navegador, ldjson=2 nos DOIS,
# mesmo <h1> e mesmo canonical.
```

**301 de UUID, inclusive para o buscador, com query preservada, e HEAD:**

```bash
curl -sI --max-time 60 "$D/artigo/$UUID" | grep -i '^HTTP/\|^location:'
curl -sI --max-time 60 -A "$GB" "$D/artigo/$UUID" | grep -i '^HTTP/\|^location:'
curl -sI --max-time 60 "$D/artigo/$UUID?utm_source=x" | grep -i '^location:'
curl -sI --max-time 60 "$D/artigo/nao-existe-abc" | head -1
```

**Preview social intacto (NR-11):**

```bash
for ua in facebookexternalhit/1.1 'WhatsApp/2.23' Twitterbot/1.0 \
          LinkedInBot/1.0 'TelegramBot (like TwitterBot)'; do
  n=$(curl -s --max-time 60 -A "$ua" "$D/artigo/$SLUG" \
      | grep -o 'og:title\|og:image\|og:description' | wc -l)
  printf '%-24s og=%s\n' "$(echo $ua | cut -c1-23)" "$n"   # >= 3 em todos
done
```

**Sitemap — conteúdo e coerência:**

```bash
curl -s --max-time 60 "$D/api/sitemap.xml" | grep -c '<loc>'
curl -s --max-time 60 "$D/api/sitemap.xml" | grep -c '/artigo/'   # ~644 publicados
curl -sI --max-time 60 "$D/api/sitemap.xml" | grep -i 'cache-control'
# nenhuma <loc> pode responder 301 ou 404 (amostra de 40):
curl -s --max-time 60 "$D/api/sitemap.xml" | grep -o '<loc>[^<]*' | sed 's/<loc>//' \
  | shuf | head -40 | while read -r u; do
      printf '%-72s %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$u")"
    done
```

**Editorias e não-regressão do sp011:**

```bash
curl -s --max-time 60 "$D/copa-do-mundo" | grep -c '<h1'          # >= 1
curl -s --max-time 60 "$D/copa-do-mundo" | grep -c 'noindex'      # 0
curl -s --max-time 60 "$D/basquete"      | grep -c 'noindex'      # 1 (declarada e vazia)
curl -s --max-time 60 "$D/basquete" | grep -o '<meta name="robots"[^>]*>' | wc -l  # 1
curl -s --max-time 60 "$S/seguranca"     | grep -c 'noindex'      # 0
curl -s --max-time 60 "$D/futebol"       | grep -c '__placeholder__'  # 0
curl -s --max-time 60 "$D/"              | grep -c 'href="/geral"'    # 0 no Oley
curl -s --max-time 60 "$S/"              | grep -c 'href="/geral"'    # >= 1 no sp011
curl -s --max-time 60 "$D/rota-inventada-xyz" | grep -c 'rel="canonical"'  # 0
curl -s --max-time 60 "$D/rota-inventada-xyz" | grep -o '<meta name="robots"[^>]*>' | wc -l  # 1
```

**NR-12 — nenhum item de menu em 404, nos 11 domínios:**

```bash
for d in sp011.com.br ksports.midia.run esporteagora.midia.run resenhavip.midia.run \
         oleysports.com.br beeesportes.midia.run apostaganha.midia.run \
         recebabet.midia.run pontofarma.com credito.vc ocomandantenews.com.br; do
  echo "== $d"
  curl -s --max-time 30 "https://$d/api/site" \
    | grep -oE '"path":"/[^"]*"' | sort -u | head -20 \
    | while read -r p; do
        u=$(echo "$p" | cut -d'"' -f4)
        printf '  %-24s %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "https://$d$u")"
      done
done
```

Qualquer `404` nessa saída é **regressão** e obriga rollback.

**Log de indisponibilidade (a trava da RN-1):**

```bash
cd /opt/blogs/oleysports && docker compose logs --tail=200 web | grep '\[ssr\]'
# ssr.apiUnavailable e ssr.staleServed saem em warn;
# notFound, redirect e staticNotFound são amostrados 1/50.
```

---

## 12. Definition of Done — estado

**Código:** todos os itens do §30 do PRD estão feitos, com as duas ressalvas
registradas no §5 (o `/__ssr-stats` não foi criado; as editorias do sitemap vêm
do acervo em vez da superfície).

**Testes:** 21.2 a 21.9 escritos e verdes; 62 casos novos; typecheck limpo nos
dois pacotes (agora incluindo o `vite.config.ts`); 21.11 pendente de ambiente de
teste.

**Deploy:** um commit por etapa, mensagens em pt-BR, na `main`. **Não executado.**

**Documentação:** este relatório. Pendentes para depois do rollout: atualizar o
`CLAUDE.md` com as invariantes novas (buscador e navegador recebem o mesmo HTML;
superfície de editorias por blog com as quatro classes; falha de infra nunca vira
404; arquivo inexistente responde 404) e marcar o P0 como entregue no
`docs/PRD-SEO-TECHNICAL-OLEYSPORTS-V2.md`.
