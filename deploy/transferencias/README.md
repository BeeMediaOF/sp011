# Módulo "Transferências" — go-live por blog

Cadastro **manual** de possíveis transferências (rumores de mercado): um módulo
no painel de cada blog, um bloco na home e a página pública `/transferencias`.

O código vem na imagem, então o módulo **existe em todo blog** assim que a
imagem sobe — inclusive no credito.vc e no pontofarma, onde ninguém vai usá-lo.
O que decide se ele aparece no site é o operador: **sem nenhum rumor ativo, o
bloco simplesmente não é renderizado** e o `/api/site` manda `"transfers":[]`.

PRD: [`docs/PRD-TRANSFERENCIAS-RUMORES.md`](../../docs/PRD-TRANSFERENCIAS-RUMORES.md).

---

## 0. Pré-requisito — a imagem

Mexe em `api` **e** `web`, então exige **bump** de `BLOG_IMAGE_VERSION`
(CLAUDE.md §6 — o bump tagueia as duas imagens; `up -d web` sem o api dispara
um build implícito no meio do `up`).

```bash
cd /opt/sp011
git pull
V=$(grep -m1 '^BLOG_IMAGE_VERSION=' .env | cut -d= -f2); N="v$((${V#v}+1))"
sed -i "s|^BLOG_IMAGE_VERSION=.*|BLOG_IMAGE_VERSION=$N|" .env
grep '^BLOG_IMAGE_VERSION=' .env
docker compose build api web
docker compose up -d api web
```

Depois o canário (**oleysports**) e só então o laço paralelo dos demais, como no
§6 do CLAUDE.md.

---

## 1. Catálogo de clubes (SQL, blog a blog)

96 clubes — Brasil, Europa, Argentina, Arábia, MLS e México — com **nome e
país**. Idempotente: rodar de novo não duplica nem sobrescreve o que o operador
já ajustou.

```bash
cd /opt/sp011
for b in ksports esporteagora resenhavip oleysports beeesportes \
         apostaganha recebabet; do
  ok=$(docker compose exec -T pg-blogs psql -U postgres -tAc \
         "SELECT 1 FROM pg_database WHERE datname='$b'" 2>&1)
  case "$ok" in
    1) ;;
    *recovery*|*FATAL*|*failed*)
      echo "!!! pg-blogs indisponivel ($b) -- ABORTANDO"; break ;;
    *) echo "=== $b: banco nao existe, pulado ==="; continue ;;
  esac
  echo "=== $b ==="
  docker compose exec -T pg-blogs psql -U postgres -d "$b" \
    -v ON_ERROR_STOP=1 < deploy/transferencias/clubes_seed.sql
done
```

`clubes_depois` tem que ser ≥ 96 e `ids_duplicados` tem que ser **0**.

> O sp011 fica de fora do laço porque o banco dele é o Supabase, não o
> `pg-blogs` (CLAUDE.md §3) — e porque ele não é blog de esporte. Para rodar
> lá, use a `SUPABASE_DATABASE_URL` do `.env` raiz (§12).

**O seed não traz escudo, de propósito.** Escudo de clube é marca de terceiro,
e 96 imagens no repo não se justificam para um recurso que 4 dos 11 blogs nunca
vão usar. Enquanto o escudo não existe, o site desenha um **monograma** com as
iniciais do clube na cor de destaque do blog — o bloco nunca fica com buraco.

---

## 2. Permissões

Duas chaves novas, no grupo **Conteúdo**:

| Chave | O que libera |
|---|---|
| `transfers.view` | ver o módulo no menu do painel e ler a lista |
| `transfers.manage` | cadastrar, editar e excluir rumores e clubes |

Admin passa direto nas duas (por design). Editor não recebe nenhuma por padrão:
libere em **Usuários → (usuário) → Permissões**.

⚠️ **Upload é permissão separada** (`upload.images`). Um editor com
`transfers.manage` e **sem** `upload.images` toma 403 ao subir a foto do
jogador — o formulário trata isso: troca o botão de upload por um campo "URL da
imagem" e explica o motivo, em vez de mostrar um erro genérico.

---

## 3. Escudos dos clubes que você realmente usar

Painel → **Transferências** → aba **Clubes** → *Enviar escudo*. Meia dúzia
resolve: só os clubes que aparecem nos rumores publicados.

O arquivo vai para `/data/uploads` (volume `api_data`) como qualquer imagem do
painel, e o `<img>` do site pede `?w=40&q=82` — a rota `/api/uploads/:filename`
redimensiona e converte para WebP.

---

## 4. Bloco na home

Painel → **Home + menu** → *Adicionar bloco* → **Transferências**. O painel do
bloco tem:

- **Quantidade de itens** — quantas linhas o bloco exibe (o mock usa 5);
- **Texto do link do rodapé** — vazio usa o padrão do idioma do site;
- **Cor** — o padrão vem das settings do blog (`footerAccentColor`).

⚠️ **Aplicar um template apaga o bloco**, como acontece com qualquer bloco da
home (CLAUDE.md §8): o template substitui `homeBlocks` inteiro. Se você aplicar
um template depois, adicione o bloco de novo.

A página `/transferencias` **não** entra no menu de propósito: a porta de
entrada é o link do rodapé do bloco. Colocá-la no menu obrigaria a acrescentá-la
aos seis `template_final.sql` e aos dois starters do código — foi o custo que a
aba Top News teve.

---

## 5. Conferência em produção

```bash
# 1. o payload público traz os ativos, ordenados por data
curl -s https://oleysports.com.br/api/site | grep -o '"transfers":\[[^]]*' | head -c 300

# 2. o bloco veio do SSR (sem JavaScript nenhum) — é ISTO que prova o SSR
curl -s https://oleysports.com.br/ | grep -c 'POSS.VEIS TRANSFER'

# 3. a página existe
curl -s -o /dev/null -w '%{http_code}\n' https://oleysports.com.br/transferencias

# 4. e NÃO entrou no sitemap como editoria
curl -s https://oleysports.com.br/api/sitemap.xml | grep -c transferencias

# 5. blog que não usa o módulo segue com payload vazio
curl -s https://credito.vc/api/site | grep -c '"transfers":\[\]'
```

Esperado: (1) array com os rumores · (2) ≥ 1 · (3) `200` · (4) `0` · (5) `1`.

---

## 6. Limites e o que NÃO está aqui

- **200 rumores** e **300 clubes** por blog; o `/api/site` publica no máximo
  **30**. Os dados moram em duas chaves da tabela `settings`, e o blob é
  reescrito inteiro a cada edição — o teto é o que o mantém barato.
- Rumor cujo clube foi apagado **some do site** (o `publicRumors` descarta o
  órfão) mas **continua no cadastro**, marcado "fora do site" na lista do
  painel, para o operador escolher outro clube sem perder o texto.
- Fora de escopo: importação automática de rumores (Transfermarkt, Fabrizio
  Romano), página individual por transferência, arte social do rumor e
  histórico da variação da probabilidade.
