# O Comandante News — go-live

Portal de **notícias gerais em pt-BR**. Nasce **vazio de propósito**: sem
fontes na central, sem regras de distribuição e sem backfill — só a casca
(site, admin, identidade) e as **duas homes** prontas para escolher.

Todos os comandos são completos, prontos para copiar e colar na VPS.
Tempo estimado: ~20 min.

| Item | Valor |
|---|---|
| BLOG_ID / banco / bucket | `ocomandante` |
| Domínio | `ocomandante.midia.run` (wildcard já resolve) ou zona própria — **defina na variável `DOMAIN` no topo de cada bloco** |
| Idioma / fuso | pt-BR / America/Sao_Paulo |
| Editorias (slugs) | `politica`, `brasil`, `mundo`, `economia`, `seguranca`, `esportes`, `tecnologia`, `cultura`, `geral` — as **clássicas** do blog engine (resolvem por rota fixa, não dependem de taxonomia cadastrada) |
| Identidade (logos) | navy `#14265e` (wordmark) · azul royal `#1657d0` (emblema) · azul claro `#4d8dff` (acento sobre fundo escuro) · vermelho `#d81f26` (o bloco "NEWS" — botões, sempre com tinta branca) · navy profundo `#0a1740` (top bar/menu) · rodapé `#060e26` |
| Matcher SQL do blog | `name ILIKE '%comandante%' OR domain ILIKE '%ocomandante%'` |

## As duas homes

O `template_final.sql` instala **os dois templates de uma vez**; aplicar é
escolha no admin, e "Desfazer" volta atrás.

| Template | Layout | Quando usar |
|---|---|---|
| **O Comandante - Portal** | 22 blocos, família "KSports - Final" (a mesma dos blogs de aposta): top bar escura, hero portal com sidebar Mais Lidas + Últimas, faixa de anúncio, recentes, 4 colunas por editoria, seção horizontal, "mais notícias" | Portal denso, muita manchete na primeira dobra |
| **O Comandante - Revista** | 20 blocos, layout do mock Bee Media (o mesmo do Crédito.vc): fundo claro, hero de boas-vindas com busca, cards revista, grade de editorias com ícones, Escolha do Editor, newsletter em cartão | Leitura calma, poucas matérias por vez |

O Revista exige imagem `blog-api`/`blog-web` com os layouts `hero`/`mini`
(≥ v85) — o passo 3 já pega a imagem mais recente do sp011, então não há o que
fazer, é só não fixar uma tag antiga à mão.

> As editorias acima são um ponto de partida seguro (funcionam sem cadastro de
> categoria). Quando as definitivas forem decididas, troque rótulo/slug em
> **Home + menu** e em **Categorias** no admin — ou peça um template novo.

## 0) Pré-requisito: DNS

```bash
DOMAIN='ocomandante.midia.run'
dig +short $DOMAIN
```

Deve devolver o IP da VPS. Subdomínio `.midia.run` já resolve pelo wildcard.
Zona própria: crie o **registro A do apex → IP da VPS** no provedor ANTES de
tudo (o Caddy emite o certificado sozinho quando o DNS propagar).

## 1) Cadastro no painel central

Blogs → Novo:
- Nome: **O Comandante News** · Domínio: o escolhido acima ·
  API URL: `https://<dominio>`
- Idioma: **pt-BR**. **Exigir aprovação: ON**.
- **Teto diário: obrigatório** (sugestão: 20/dia, 30 min entre posts) — blog
  ativo sem teto nunca deixa o portão de economia da central fechar.
- **NÃO criar regra de distribuição agora.** Sem regra, a central não entrega
  nada e o blog fica vazio, que é o combinado. O cadastro serve para gerar o
  segredo e deixar o blog pronto para quando as editorias forem decididas.
- **Copiar o segredo de integração** — é exibido UMA única vez (vira o
  `CENTRAL_INGEST_SECRET` no passo 3).

## 2) Banco no pg-blogs

```bash
cd /opt/sp011
PASS=$(openssl rand -hex 16); echo "SENHA DO BANCO (anote): $PASS"
docker compose exec -T pg-blogs psql -U postgres -c "CREATE ROLE ocomandante_user LOGIN PASSWORD '$PASS';"
docker compose exec -T pg-blogs psql -U postgres -c "CREATE DATABASE ocomandante OWNER ocomandante_user;"
docker compose exec -T pg-blogs psql -U postgres -c "REVOKE CONNECT ON DATABASE ocomandante FROM PUBLIC;"
```

Storage: no projeto Supabase dedicado a Storage, criar **bucket público
`ocomandante`**.

## 3) Scaffold do blog

Primeiro, o segredo de integração do passo 1 e o domínio:

```bash
INGEST='COLE_AQUI_O_SEGREDO_DO_PASSO_1'
DOMAIN='ocomandante.midia.run'
```

Depois cole o bloco inteiro (usa a imagem mais recente já buildada no sp011 e
gera os segredos sozinho):

```bash
TAG=$(grep -m1 '^BLOG_IMAGE_VERSION=' /opt/sp011/.env | cut -d= -f2-)
mkdir -p /opt/blogs/ocomandante && cd /opt/blogs/ocomandante
cp /opt/sp011/deploy/blog-template/compose.yml .
cp /opt/sp011/deploy/blog-template/.env.example .env
sed -i "s|^BLOG_ID=.*|BLOG_ID=ocomandante|" .env
sed -i "s|^COMPOSE_PROJECT_NAME=.*|COMPOSE_PROJECT_NAME=blog-ocomandante|" .env
sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=$TAG|" .env
sed -i "s|^APP_URL=.*|APP_URL=https://$DOMAIN|" .env
sed -i "s|^SITE_URL=.*|SITE_URL=https://$DOMAIN|" .env
sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=https://$DOMAIN|" .env
sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|^SETTINGS_ENCRYPTION_KEY=.*|SETTINGS_ENCRYPTION_KEY=$(openssl rand -hex 32)|" .env
sed -i "s|^CENTRAL_INGEST_SECRET=.*|CENTRAL_INGEST_SECRET=$INGEST|" .env
grep -E '^(BLOG_ID|COMPOSE_PROJECT_NAME|BLOG_IMAGE_TAG|APP_URL|CENTRAL_INGEST_SECRET)=' .env
```

O `grep` final é a conferência — os 5 valores devem sair preenchidos.
`SUPABASE_DATABASE_URL` fica comentado (o wizard configura o banco).

## 4) Subir + rota no Caddy

```bash
DOMAIN='ocomandante.midia.run'
cd /opt/blogs/ocomandante
docker compose up -d
printf '%s {\n\timport blog ocomandante\n}\n' "$DOMAIN" > /opt/sp011/caddy/sites/ocomandante.caddy
docker compose -f /opt/sp011/docker-compose.yml exec caddy caddy reload --config /etc/caddy/Caddyfile
docker compose logs --tail 100 api | grep -i "setup token"
```

Anote o setup token AGORA (regenera a cada boot da api).

## 5) Wizard `/admin/setup`

Se ainda estiver na mesma sessão do passo 2, imprima a connection string
pronta:

```bash
echo "postgresql://ocomandante_user:$PASS@pg-blogs:5432/ocomandante"
```

Em `https://<dominio>/admin/setup`:
- Token do passo 4.
- Connection string acima (se fechou o terminal, monte com a senha anotada:
  `postgresql://ocomandante_user:<senha do passo 2>@pg-blogs:5432/ocomandante`) ·
  SSL: **disable** (rede interna).
- Storage: URL + `service_role` do projeto de Storage + bucket `ocomandante`.
- Primeiro admin → Aplicar (a api sai com exit 0 e o Docker religa).

Depois: painel central → Blogs → **Testar conexão** → "online".

## 6) Templates + identidade

```bash
cd /opt/sp011 && git pull
docker compose exec -T pg-blogs psql -U postgres -d ocomandante -v ON_ERROR_STOP=1 < deploy/ocomandante/template_final.sql
```

O `\echo` no fim lista o que ficou salvo — devem aparecer as duas linhas
(`tpl-ocomandante-portal` com 22 blocos, `tpl-ocomandante-revista` com 20).

Em `https://<dominio>/admin` (aparecem em Home + menu → aba Templates →
"Meus templates" em ≤15s, sem restart):

1. Aplicar **um dos dois** — instala blocos, menu, rodapé, cores, idioma
   pt-BR e fuso SP de uma vez. Ver o site, aplicar o outro, comparar; o botão
   **Desfazer** restaura o estado anterior.
2. **Configurações → Informações**: nome "O Comandante News", tagline,
   **upload das logos** (a horizontal para o header, a quadrada para o
   favicon), autor padrão (ex.: "Redação O Comandante"). Nunca reaproveitar
   caminho `/api/uploads/` de outro blog — bucket é por blog.

Com o blog ainda sem artigos, as seções por editoria aparecem vazias — é o
esperado. A home ganha corpo quando entrar conteúdo (manual pelo admin ou
pela central, quando houver regra).

## 7) Verificação

```bash
DOMAIN='ocomandante.midia.run'
curl -sI https://$DOMAIN
curl -s https://$DOMAIN/api/setup
curl -s https://$DOMAIN/ | grep -o '<html lang="[^"]*"'
curl -s https://$DOMAIN/api/site | grep -o '"siteName":"[^"]*"'
docker compose -f /opt/blogs/ocomandante/compose.yml logs --tail 50
```

- 1º curl: `200` com TLS (ACME leva 10–60s).
- 2º curl: `{"setupRequired":false}`.
- 3º curl: `<html lang="pt-BR"`.
- 4º curl: **`O Comandante News`** — se sair o nome de outro blog, é mistura
  de aliases na rede `blogs_shared` (§3 do CLAUDE.md).

Rollback: seção "Remover um blog" do `deploy/README.md`.

## O que ficou de fora (de propósito)

Combinado com o usuário — o blog sobe vazio até as editorias definitivas
serem decididas:

- **Fontes e regras na central** (não existe `sources_*.sql` para este blog).
  Enquanto não houver regra de distribuição, nada é entregue.
- **Backfill.** O histórico da central é de esporte; despejá-lo aqui traria
  conteúdo fora do nicho e duplicado com 6 outros domínios.
- **Artes sociais** (`social_templates.sql`). Peça quando for conectar
  Instagram/Facebook — a arte usa a logo de `/api/site-asset/logo`, então o
  upload do passo 6.2 precisa vir antes, em versão clara para contrastar com
  o bloco escuro do canto.

Quando as editorias forem definidas, o caminho é: cadastrar em
**Categorias** no admin → ajustar menu e blocos (ou pedir um template novo) →
criar as fontes + regras no banco central, no modelo de
`deploy/creditovc/sources_financas.sql` (categoria de fonte própria, para não
cruzar com os blogs de esporte).
