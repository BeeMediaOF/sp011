# PontoFarma — go-live

Portal **B2B do setor farmacêutico** (pt-BR): gestão, fiscal/tributário,
legislação, mercado, vendas, equipe, tecnologia e categorias de produto.
Nicho novo na rede — fontes próprias (proposta Bee Media), **sem backfill**
(o histórico da central é todo de esporte; o catálogo nasce da coleta).

Todos os comandos são completos, prontos para copiar e colar na VPS.
Tempo estimado: ~20 min + primeira coleta (~minutos após ativar as fontes).

| Item | Valor |
|---|---|
| BLOG_ID / banco / bucket | `pontofarma` |
| Domínio | `pontofarma.com` (zona própria — precisa de registro A) ou `pontofarma.midia.run` (provisório, wildcard já resolve). **Defina na variável `DOMAIN` no topo de cada bloco.** |
| Idioma / fuso | pt-BR / America/Sao_Paulo (padrão — não mexer) |
| Categorias (slugs) | `gestao`, `fiscal-tributario`, `legislacao`, `mercado`, `vendas`, `equipe`, `tecnologia`, `saude-categorias`, `outros` |
| Identidade | verde `#18a957` / verde escuro `#0c8b46` + navy `#0e2341`, rodapé `#0c1630`, wordmark "Ponto**Farma**", tagline "conteúdo que gera resultado" |
| Matcher SQL do blog | `name ILIKE '%farma%' OR domain ILIKE '%pontofarma%'` |

## 0) Pré-requisito: DNS

```bash
DOMAIN='pontofarma.midia.run'
dig +short $DOMAIN
```

Deve devolver o IP da VPS. Subdomínio `.midia.run` já resolve pelo wildcard.
Zona própria (`pontofarma.com`): crie o registro **A do apex → IP da VPS**
no provedor do domínio ANTES de tudo (o Caddy emite o certificado sozinho
quando o DNS propagar).

## 1) Cadastro no painel central

Blogs → Novo:
- Nome: **PontoFarma** · Domínio: o escolhido acima ·
  API URL: `https://<dominio>`
- Idioma: **pt-BR** (padrão). **Exigir aprovação: ON** — nicho novo, revise
  as primeiras entregas antes de soltar.
- **Teto diário: obrigatório** (sugestão: 20/dia, 30 min entre posts) — blog
  sem teto nunca deixa o portão de economia da central fechar.
- **Copiar o segredo de integração** — é exibido UMA única vez (vira o
  `CENTRAL_INGEST_SECRET` no passo 3).

## 2) Banco no pg-blogs

```bash
cd /opt/sp011
PASS=$(openssl rand -hex 16); echo "SENHA DO BANCO (anote): $PASS"
docker compose exec -T pg-blogs psql -U postgres -c "CREATE ROLE pontofarma_user LOGIN PASSWORD '$PASS';"
docker compose exec -T pg-blogs psql -U postgres -c "CREATE DATABASE pontofarma OWNER pontofarma_user;"
docker compose exec -T pg-blogs psql -U postgres -c "REVOKE CONNECT ON DATABASE pontofarma FROM PUBLIC;"
```

Storage: no projeto Supabase dedicado a Storage, criar **bucket público
`pontofarma`**.

## 3) Scaffold do blog

Primeiro, o segredo de integração do passo 1 e o domínio:

```bash
INGEST='COLE_AQUI_O_SEGREDO_DO_PASSO_1'
DOMAIN='pontofarma.midia.run'
```

Depois cole o bloco inteiro (usa a mesma tag de imagem do ksports e gera os
segredos sozinho):

```bash
TAG=$(grep -m1 '^BLOG_IMAGE_TAG=' /opt/blogs/ksports/.env | cut -d= -f2-)
mkdir -p /opt/blogs/pontofarma && cd /opt/blogs/pontofarma
cp /opt/sp011/deploy/blog-template/compose.yml .
cp /opt/sp011/deploy/blog-template/.env.example .env
sed -i "s|^BLOG_ID=.*|BLOG_ID=pontofarma|" .env
sed -i "s|^COMPOSE_PROJECT_NAME=.*|COMPOSE_PROJECT_NAME=blog-pontofarma|" .env
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
DOMAIN='pontofarma.midia.run'
cd /opt/blogs/pontofarma
docker compose up -d
printf '%s {\n\timport blog pontofarma\n}\n' "$DOMAIN" > /opt/sp011/caddy/sites/pontofarma.caddy
docker compose -f /opt/sp011/docker-compose.yml exec caddy caddy reload --config /etc/caddy/Caddyfile
docker compose logs --tail 100 api | grep -i "setup token"
```

Anote o setup token AGORA (regenera a cada boot da api).

## 5) Wizard `/admin/setup`

Se ainda estiver na mesma sessão do passo 2, imprima a connection string
pronta:

```bash
echo "postgresql://pontofarma_user:$PASS@pg-blogs:5432/pontofarma"
```

Em `https://<dominio>/admin/setup`:
- Token do passo 4.
- Connection string acima (se fechou o terminal, monte com a senha anotada:
  `postgresql://pontofarma_user:<senha do passo 2>@pg-blogs:5432/pontofarma`) ·
  SSL: **disable** (rede interna).
- Storage: URL + `service_role` do projeto de Storage + bucket `pontofarma`.
- Primeiro admin → Aplicar (a api sai com exit 0 e o Docker religa).

Depois: painel central → Blogs → **Testar conexão** → "online".

## 6) Fontes + regras na central

```bash
cd /opt/sp011 && git pull
DBURL=$(grep -m1 '^CENTRAL_DATABASE_URL=' .env.central | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 < deploy/pontofarma/sources_farma.sql
```

O script cadastra as 10 fontes da tabela da proposta: 8 do setor (category
`farmacia` — categoria de fonte NOVA, não cruza com os blogs de esporte) +
G1 Economia e Agência Brasil Economia (category `financas`, compartilhadas
com o Crédito.vc — upsert deduplica). Também grava idioma/taxonomia do
blog, cria 2 regras (setor farmacêutico com IA + pautas tributárias por
palavra-chave dos feeds de economia) e **blinda o catch-all do sp011**
(exclui `farmacia` e `financas`). ICTQ e Portal Contábeis nascem INATIVAS
("validar endpoint" na proposta) — teste os feeds e ative no painel
central.

## 7) Template + identidade

```bash
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d pontofarma -v ON_ERROR_STOP=1 < deploy/pontofarma/template_final.sql
```

Em `https://<dominio>/admin` (o template aparece em Home + menu → aba
Templates → "Meus templates" em ≤15s, sem restart):

1. Aplicar **"PontoFarma - Final"** — layout próprio do mock da proposta
   (NÃO é o da família de esporte): hero de boas-vindas + Destaques, Mais
   Recentes, Temas em Destaque (ícones), Leitura Essencial, Escolha do
   Editor, lateral com Mais Lidas + CTA navy + Últimas, Negócios & Operação
   | Compliance & Regulação, faixa de newsletter; header e rodapé CLAROS,
   idioma pt-BR + fuso SP. O script também cria o `site_settings` com os
   defaults quando o blog é recém-instalado (não precisa salvar
   Configurações antes).
2. **Configurações → Informações**: nome "PontoFarma", tagline "conteúdo
   que gera resultado", **upload das logos** (horizontal p/ header,
   monograma "P" p/ favicon), autor padrão (ex.: "Redação PontoFarma").
   Nunca reaproveitar caminho `/api/uploads/` de outro blog — bucket é por
   blog.

## 8) Primeiras notícias (sem backfill)

Não existe backfill para este nicho (o histórico da central é de esporte).
O fluxo é orgânico: fontes novas são coletadas já no primeiro ciclo do
coletor (tick de 1 min, janela BR), a reescrita entra na fila e as entregas
aparecem em Central → Entregas como `awaiting_approval` (aprovação ON).

- Aprove (ou use **Publicar agora**) nas primeiras entregas para conferir
  título, categoria e imagem.
- Quando estiver confiante, desligue "Exigir aprovação" no cadastro do blog.
- NUNCA publicar em massa entregas `awaiting_localization` (idioma errado).

## 9) Verificação

```bash
DOMAIN='pontofarma.midia.run'
curl -sI https://$DOMAIN
curl -s https://$DOMAIN/api/setup
curl -s https://$DOMAIN/ | grep -o '<html lang="[^"]*"'
curl -s https://$DOMAIN/api/site | grep -o '"siteName":"[^"]*"'
docker compose -f /opt/blogs/pontofarma/compose.yml logs --tail 50
```

- 1º curl: `200` com TLS (ACME leva 10–60s; zona própria depende do DNS).
- 2º curl: `{"setupRequired":false}`.
- 3º curl: `<html lang="pt-BR"`.
- 4º curl: `"siteName":"PontoFarma"` (diagnóstico anti-mistura de blogs).

Pendências pós-go-live: artes sociais (`social_templates.sql`) ainda não
geradas para este blog — pedir quando for conectar Instagram/redes.

Rollback: seção "Remover um blog" do `deploy/README.md`.
