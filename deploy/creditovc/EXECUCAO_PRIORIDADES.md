# Crédito.vc — execução das prioridades (PRD-IMPL)

> Runbook do `docs/PRD-IMPL-CREDITOVC-PRIORIDADES.md`. Todo bloco é completo e
> auto-suficiente — colar inteiro na VPS, na ordem. Nenhuma etapa exige build,
> deploy ou bump de `BLOG_IMAGE_TAG`.
>
> **Ordem da sessão:** §1 baseline → §2 backup → §3 contagem → §4 aplicar →
> §5 conferência SQL → (6 min) → §6 conferência HTTP → §7 não-regressão.
>
> **Por que esperar 6 minutos:** o `api` relê `site_settings`/`menu_items` a
> cada **15 s**, mas o `web` guarda a identidade do blog por **5 min**
> (`makeSiteMetaResolver`) e o HTML do SSR por **30 s** (home) / **60 s**
> (páginas). Conferir antes disso mede o cache, não a mudança.

---

## 1. Baseline — antes de qualquer coisa

```bash
cd /tmp
curl -s https://credito.vc/ -o cvc0.html
echo "links=$(grep -o 'href="/artigo/' cvc0.html | wc -l) unicos=$(grep -o 'href="/artigo/[a-z0-9-]*"' cvc0.html | sort -u | wc -l)"
echo "h1=$(grep -o '<h1' cvc0.html | wc -l)"
curl -s https://credito.vc/api/sitemap.xml -o cvc0.xml
echo "locs=$(grep -c '<loc>' cvc0.xml) artigos=$(grep -c '/artigo/' cvc0.xml)"
echo "total=$(curl -s 'https://credito.vc/api/articles?limit=1' | grep -o '"total":[0-9]*')"
echo "outros_no_rodape=$(grep -c 'href="/outros"' cvc0.html)"
```

Registrado em 22/08: `links=22 unicos=11`, `h1=2`, `locs=234 artigos=223`,
`total=223`, `outros_no_rodape=1`.

---

## 2. Backup — mesma sessão do §4, sem intervalo

```bash
cd /opt/sp011
BK=/opt/backup_creditovc_$(date +%F_%H%M)
mkdir -p $BK
docker compose exec -T pg-blogs psql -U postgres -d creditovc -At -c "SELECT value FROM settings WHERE key='menu_items';" > $BK/menu_items.json
docker compose exec -T pg-blogs psql -U postgres -d creditovc -At -c "SELECT (value::jsonb->'homeBlocks')::text FROM settings WHERE key='site_settings';" > $BK/homeBlocks.json
docker compose exec -T pg-blogs psql -U postgres -d creditovc -At -c "SELECT (value::jsonb->'footerConfig')::text FROM settings WHERE key='site_settings';" > $BK/footerConfig.json
wc -c $BK/*.json
echo "BACKUP EM: $BK   <-- anotar, o parag. 8 precisa deste caminho"
```

Os três arquivos são JSON puro, sem segredo — `homeBlocks`, `menu_items` e
`footerConfig` não estão em `SECRET_FIELDS` (`store.ts:38-46`).

---

## 3. Contagem por categoria — pré-requisito das Etapas 1, 2 e 6

```bash
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d creditovc -c "SELECT category, count(*) FILTER (WHERE status = 'published') AS publicados FROM articles GROUP BY category ORDER BY 2 DESC;"
```

**Regra de decisão:** se `credito`, `organizar-financas` ou `investimentos`
tiver **menos de 4 artigos publicados**, trocar o destino do bloco
correspondente em `deploy/creditovc/home_blocos.sql` **antes** de rodar o §4 —
senão a home ganha uma seção quase vazia no lugar de uma vazia.

---

## 4. Aplicar as Etapas 1, 2 e 3

Os três scripts são transacionais e têm guarda: se a condição não casar, a
transação inteira é desfeita e o `psql` sai com erro. `ON_ERROR_STOP=1` impede
que o bloco continue depois de uma falha.

```bash
cd /opt/sp011
git pull
docker compose exec -T -e PGCLIENTENCODING=UTF8 pg-blogs psql -U postgres -d creditovc -v ON_ERROR_STOP=1 < deploy/creditovc/home_blocos.sql
docker compose exec -T -e PGCLIENTENCODING=UTF8 pg-blogs psql -U postgres -d creditovc -v ON_ERROR_STOP=1 < deploy/creditovc/rodape_limpeza.sql
docker compose exec -T -e PGCLIENTENCODING=UTF8 pg-blogs psql -U postgres -d creditovc -v ON_ERROR_STOP=1 < deploy/creditovc/menu_final.sql
```

---

## 5. Conferência no banco — imediata

```bash
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d creditovc -c "SELECT b->>'name' AS bloco, b->>'category' AS categoria FROM settings, jsonb_array_elements((value::jsonb)->'homeBlocks') b WHERE key='site_settings' AND b ? 'category' ORDER BY (b->>'order')::int;"
docker compose exec -T pg-blogs psql -U postgres -d creditovc -c "SELECT i->>'label' AS rotulo, i->>'path' AS path FROM settings, jsonb_array_elements(value::jsonb) i WHERE key='menu_items' ORDER BY (i->>'order')::int;"
docker compose exec -T pg-blogs psql -U postgres -d creditovc -c "SELECT c->>'title' AS coluna, l->>'label' AS link, l->>'href' AS href FROM settings, jsonb_array_elements((value::jsonb)->'footerConfig'->'columns') c, jsonb_array_elements(c->'links') l WHERE key='site_settings';"
```

Esperado: nenhum bloco com `home-equity` ou `credito-pessoal`; 6 itens de menu,
todos com `path` de editoria; nenhum `href` `/outros`; um único `/contato`.

---

## 6. Conferência por HTTP — **6 minutos depois**

```bash
cd /tmp
curl -s https://credito.vc/ -o cvc1.html
echo "links=$(grep -o 'href="/artigo/' cvc1.html | wc -l) unicos=$(grep -o 'href="/artigo/[a-z0-9-]*"' cvc1.html | sort -u | wc -l)"
echo "blocos_mortos=$(grep -c 'HOME EQUITY\|MICROCR\|PESSOAL' cvc1.html)"
echo "outros=$(grep -c 'href="/outros"' cvc1.html)"
echo "h1=$(grep -o '<h1' cvc1.html | wc -l)"
for p in /sair-das-dividas /credito /organizar-financas /renda-extra /planejar-o-futuro /investimentos; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://credito.vc$p")
  idx=$(curl -s "https://credito.vc$p" | grep -c 'noindex')
  echo "$p -> HTTP $code  noindex=$idx"
done
```

Critérios: `unicos` sobe de **11 para ~19**; `blocos_mortos=0`; `outros=0`; as
6 editorias em **200** com **`noindex=0`**. O `h1` continua **2** até a Etapa 7
ser feita no painel.

As duas rotas que saíram do menu passam a 404 — é o efeito desejado do §3.4 do
PRD (zero artigos, `noindex`, fora de todo sitemap):

```bash
for p in /cartoes-de-credito /consignado-publico; do
  echo "$p -> HTTP $(curl -s -o /dev/null -w '%{http_code}' "https://credito.vc$p")"
done
```

Esperado: **404** nas duas.

---

## 7. Não-regressão — roda depois de CADA etapa, sem exceção

```bash
cd /tmp
echo "googlebot_bytes=$(curl -s -A 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' https://credito.vc/ | wc -c)"
echo "navegador_bytes=$(curl -s -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' https://credito.vc/ | wc -c)"
echo "rota_inventada=$(curl -s -o /dev/null -w '%{http_code}' https://credito.vc/rota-inventada-xyz)"
echo "wp_login=$(curl -s -o /dev/null -w '%{http_code}' https://credito.vc/wp-login.php)"
echo "sitemap_artigos=$(curl -s https://credito.vc/api/sitemap.xml | grep -c '/artigo/')"
```

Esperado: os dois `bytes` na mesma ordem de grandeza (o stub social tinha 3 KB —
divergência por User-Agent é o achado F-26, fechado na v98), `404` nas duas
rotas e **223** artigos no sitemap.

---

## 8. Rollback

Trocar `BK=` pelo caminho anotado no §2. O SQL vai por **stdin**, não por
`psql -c`: só assim o psql interpola `:'var'` (o `-c` manda a string crua para
o servidor e o `:` vira erro de sintaxe).

```bash
cd /opt/sp011
BK=/opt/backup_creditovc_COLE_AQUI
HB=$(cat $BK/homeBlocks.json); FC=$(cat $BK/footerConfig.json); MI=$(cat $BK/menu_items.json)
printf '%s\n' "UPDATE settings SET value = jsonb_set(value::jsonb,'{homeBlocks}', :'hb'::jsonb)::text, updated_at = now() WHERE key='site_settings';" | docker compose exec -T -e PGCLIENTENCODING=UTF8 pg-blogs psql -U postgres -d creditovc -v ON_ERROR_STOP=1 -v hb="$HB"
printf '%s\n' "UPDATE settings SET value = jsonb_set(value::jsonb,'{footerConfig}', :'fc'::jsonb)::text, updated_at = now() WHERE key='site_settings';" | docker compose exec -T -e PGCLIENTENCODING=UTF8 pg-blogs psql -U postgres -d creditovc -v ON_ERROR_STOP=1 -v fc="$FC"
printf '%s\n' "UPDATE settings SET value = :'mi', updated_at = now() WHERE key='menu_items';" | docker compose exec -T -e PGCLIENTENCODING=UTF8 pg-blogs psql -U postgres -d creditovc -v ON_ERROR_STOP=1 -v mi="$MI"
```

---

## 9. Etapas que não são SQL

### 9.1 Etapa 4 — capas de terceiros (a mais longa)

Lista autoritativa do que trocar, em ordem de risco decrescente:

```bash
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d creditovc -c "SELECT slug, image_url FROM articles WHERE status = 'published' AND image_url !~ '^https?://(credito\.vc|central\.midia\.run)/' ORDER BY (image_url LIKE 'http://%') DESC, slug;"
docker compose exec -T pg-blogs psql -U postgres -d creditovc -c "SELECT image_url, count(*) FROM articles WHERE status = 'published' GROUP BY image_url HAVING count(*) > 1 ORDER BY 2 DESC;"
```

A primeira consulta traz os **9 hotlinks diretos**, com o de `http://` (mixed
content — quebra sozinho, sem depender de terceiro) no topo. A segunda encontra
os cards institucionais de veículo: capa repetida em vários artigos é a
assinatura de um.

Trocar no painel → Artigos → editar capa.

> **Proibição:** nunca editar a imagem do veículo para apagar a marca. Ou se
> substitui por arte própria / banco licenciado, ou se troca a foto. Apagar a
> marca converte um problema de licença em ato deliberado.

### 9.2 Etapa 5 — `robots.txt` no Cloudflare

O `robots.txt` da origem tem **152 bytes** e não bloqueia IA nenhuma. Os ~2 KB
que o público recebe vêm do bloco **gerenciado pelo Cloudflare**, prependido
entre `# BEGIN Cloudflare Managed content` e `# END Cloudflare Managed Content`.
`credito.vc` é o único blog da rede atrás do Cloudflare.

Painel do Cloudflare → zona `credito.vc` → a feature que gerencia `robots.txt` /
bloqueio de bots de IA. **A decisão é do dono do conteúdo** — registrar por
escrito, inclusive se for "manter como está".

```bash
curl -s https://credito.vc/robots.txt
```

Critério: o bloco gerenciado sumiu **ou** permaneceu sem `GPTBot`/`ClaudeBot`,
conforme a decisão; **exatamente um** grupo `User-agent: *` (dois grupos fazem
parsers que só honram o primeiro ignorarem o `Disallow: /admin`); as duas linhas
`Sitemap:` presentes.

### 9.3 Etapa 6 — `/score` vazia

`/cartoes-de-credito` e `/consignado-publico` já viram 404 pelo §4. Sobra
`/score`, declarada em `settings.categories` e sem artigo: responde 200 +
`noindex`. Recomendado dar conteúdo, não remover — `score` é termo da tagline e
do `<title>` novos, e as regras da central já classificam para ela
(`rules_keywords.sql`, prioridade 28).

### 9.4 Etapa 7 — o segundo `<h1>` da home

Painel → **Home + menu** → bloco **"HTML Personalizado"** (o ticker de
indicadores, ~15 KB) → trocar `<h1 class="ticker-heading-title">` por
`<h2 class="ticker-heading-title">` e o `</h1>` correspondente por `</h2>`.
O CSS casa por classe: o visual não muda.

**Não fazer por SQL** — 15 KB de HTML com aspas, `<style>` e escapes; um
`jsonb_set` mal formado corrompe o bloco inteiro.

```bash
curl -s https://credito.vc/ | grep -o '<h1' | wc -l
```

Esperado: **1**.

### 9.5 Etapa 8 — autoria

O JSON-LD declara `"author":{"@type":"Person","name":"Crédito.vc"}` — uma
organização declarada como pessoa. Dois caminhos legítimos, ambos no painel:
cadastrar **pessoa real** (`settings.columnists` + `articles.columnist_id`,
perfil `columnist`) ou assinar **"Redação Crédito.vc"**.

> **Limite:** não inventar jornalistas. Nome fictício com página de perfil é
> fabricação de sinal de E-E-A-T, e é o padrão que alimenta classificação de
> conteúdo enganoso — risco concreto numa rede que já teve um domínio marcado
> como "Páginas enganosas" (`CLAUDE.md §19.3`).

O `@type` correto, `author.url`, `publisher.url` e `publisher.logo` são
**código** — saem no P1 do OleySports, para os 11 blogs de uma vez.

---

## 10. O que NÃO fazer por aqui

Nada do §11 do PRD (dedup residual da home, breadcrumb, metadata por rota, SSR
das institucionais, schema.org, `twitter:site`, trailing slash). São defeitos da
**imagem compartilhada**: entram pelo P1 do OleySports e saem para os 11 blogs
juntos. Abrir release exclusiva do Crédito.vc para eles duplica o trabalho e
deixa a rede em duas versões.
