# PRD-PERF-06 — `llms.txt` e `robots.txt` são estáticos da imagem e falam de outro portal

## Objetivo

`public/llms.txt` e `public/robots.txt` são buildados dentro da imagem
`blog-web` e servidos **idênticos nos 8 blogs da rede**. Em produção, o sp011
serve um `llms.txt` que se apresenta como *"SBC Agora … São Bernardo do Campo e
região do Grande ABC"* e um `robots.txt` cujo `Sitemap:` aponta para um host
morto. Este PRD passa a gerá-los por blog, a partir das settings, no formato
recomendado — fechando o *Agentic Browsing 2/3* e o sitemap quebrado.

## Métrica(s) alvo

| Métrica | Antes (medido 2026-07-27) | Meta deste PRD | Como medir |
|---|---|---|---|
| Agentic Browsing | 2/3 (llms.txt não segue as recomendações) | 3/3 | Lighthouse |
| `llms.txt` com a marca do blog | não (diz "SBC Agora" em todos) | sim, em cada blog | `curl -s https://<blog>/llms.txt \| head -3` |
| `Sitemap:` do `robots.txt` | `https://brasilia-agora.replit.app/api/sitemap.xml` (host morto) | host do próprio blog, 200 | `curl -sI $(curl -s https://<blog>/robots.txt \| grep -i '^sitemap:' \| cut -d' ' -f2)` |
| SEO / Best Practices | 100 / 100 | **não regredir** | Lighthouse |

Este é o único PRD da série que **não** tem alvo em Core Web Vitals.

## Contexto / evidência

`01-diagnostico.md` §1.1 **Cadeia F**.

Conteúdo servido hoje por `https://sp011.com.br`:

```
$ curl -s https://sp011.com.br/llms.txt | head -3
# SBC Agora

SBC Agora é um portal de jornalismo independente focado na cobertura de São
Bernardo do Campo e da região do Grande ABC. …

$ curl -s https://sp011.com.br/robots.txt
User-agent: *
Allow: /

Sitemap: https://brasilia-agora.replit.app/api/sitemap.xml
```

- Arquivos: `artifacts/brasilia-agora/public/llms.txt` (1.519 B) e
  `public/robots.txt` (87 B) — copiados para `dist/public/` no build e servidos
  pelo `vite preview`.
- O sitemap real existe e é por blog:
  `artifacts/api-server/src/routes/sitemap.ts:33` (`GET /api/sitemap.xml`) e
  `sitemap-news.ts:19` (`GET /api/sitemap-news.xml`).
- O `llms.txt` atual lista seções como `- Política: /politica`: sem links
  markdown, sem URLs absolutas e sem o bloco `>` de resumo — que é justamente o
  que a recomendação de `llms.txt` pede e o que o Lighthouse verifica.
- CLAUDE.md §13: *"nunca hardcodar conteúdo por blog na imagem compartilhada
  (usar settings)"*. Estes dois arquivos violam a invariante.

## Pré-condições

- [ ] Branch: `git checkout -b perf/prd-06-llms-robots`
- [ ] Baseline:
      ```bash
      for d in sp011.com.br ksports.midia.run resenhavip.midia.run; do
        echo "--- $d"; curl -s "https://$d/llms.txt" | head -3; curl -s "https://$d/robots.txt"
      done
      ```
- [ ] Ler obrigatoriamente:
  - `artifacts/brasilia-agora/vite.config.ts` (padrão do `spaHeadPlugin`,
    linhas 511-550 — é o molde deste plugin)
  - `artifacts/brasilia-agora/public/llms.txt` e `public/robots.txt`
  - `artifacts/api-server/src/routes/site.ts` (campos públicos disponíveis)
  - `artifacts/api-server/src/routes/sitemap.ts`

## Escopo (ações em ordem)

### 1. Novo plugin `seoTextPlugin(apiBase)` em `vite.config.ts`

Mesmo molde do `spaHeadPlugin`: middleware em `configurePreviewServer`,
registrado **antes** do estático. Intercepta exatamente dois paths:
`/llms.txt` e `/robots.txt`.

- Reusa `makeSiteMetaResolver` (já existe, `vite.config.ts:66-90`) e busca
  `/api/site` para pegar `siteName`, `tagline`, `seoDescription`,
  `siteLanguage` e `menuItems`.
- Host: `x-forwarded-proto` + `req.headers.host` (mesmo padrão das linhas
  531-532).
- Cache em memória de **1 h** por (host, path).
- `Content-Type: text/plain; charset=utf-8`,
  `Cache-Control: public, max-age=3600`.
- **Qualquer falha → `next()`**, caindo no arquivo estático de `public/`
  (que permanece no repositório como fallback).

### 2. Formato do `llms.txt`

```
# <siteName>

> <seoDescription ou tagline, uma linha>

<1 parágrafo curto: o que o portal cobre, derivado das editorias visíveis>

## Seções

- [<label do menuItem>](https://<host><path>): notícias de <label>
- …

## Recursos

- [Mapa do site](https://<host>/api/sitemap.xml): índice completo de URLs
- [Mapa de notícias](https://<host>/api/sitemap-news.xml): publicações recentes
- [Contato](https://<host>/contato): equipe editorial e canais de contato
- [Política de Privacidade](https://<host>/privacidade)
- [Termos de Uso](https://<host>/termos)
```

Regras:
- Só `menuItems` com `visible !== false`, respeitando a ordem; incluir submenus
  de 1 nível achatados.
- Texto em **pt-BR ou EN conforme `siteLanguage`** (CLAUDE.md §15) — os rótulos
  fixos ("Seções", "Recursos", "Mapa do site"…) precisam dos dois idiomas.
  Reaproveitar o dicionário só se for trivial; caso contrário, um objeto local
  com as ~8 chaves, comentado.
- URLs **sempre absolutas**.
- Sem inventar dados: nada de números de audiência, endereço ou CNPJ que não
  estejam nas settings.

### 3. Formato do `robots.txt`

```
User-agent: *
Allow: /
Disallow: /admin
Disallow: /admin/

Sitemap: https://<host>/api/sitemap.xml
Sitemap: https://<host>/api/sitemap-news.xml
```

O `Disallow: /admin` é acréscimo deliberado (o painel nunca deveria ser
rastreado). **Verificar que o Lighthouse SEO continua 100** — é o único ponto
deste PRD com risco de regressão de score.

### 4. Atualizar os arquivos estáticos de fallback

`public/llms.txt` e `public/robots.txt` continuam existindo, mas passam a ser
**neutros**: sem nome de portal, sem host. Ex.: `robots.txt` só com
`User-agent: * / Allow: / / Disallow: /admin` (sem linha `Sitemap:`, que só faz
sentido com host), e `llms.txt` com um texto mínimo genérico. Assim, mesmo o
caminho de falha para de anunciar a marca errada.

### 5. Registrar o plugin

Em `vite.config.ts`, na lista de `plugins`, inserir
`seoTextPlugin(process.env.API_URL ?? "http://localhost:8080")`
**antes** de `ssrHomePlugin` (paths com extensão nunca chegam nele, mas manter a
ordem explícita evita surpresa) e depois de `socialOgPlugin`.

## Fora de escopo

- Não mexer nas rotas de sitemap do `api-server`.
- Não mexer no `sitemap.xml` em si (conteúdo, frequência, prioridade).
- Não criar `llms-full.txt`.
- Não registrar a propriedade de domínio `midia.run` no Search Console
  (pendência operacional do CLAUDE.md §19.3 — assunto do dono, não deste PRD).
- Não tocar em nenhum outro arquivo de `public/`.

## Comandos de verificação

```bash
# 1) Cada blog anuncia a si mesmo
for d in sp011.com.br ksports.midia.run resenhavip.midia.run esporteagora.midia.run; do
  echo "=== $d"; curl -s "https://$d/llms.txt" | head -5; echo "---"; curl -s "https://$d/robots.txt"
done

# 2) Sitemaps anunciados respondem 200
for d in sp011.com.br ksports.midia.run; do
  curl -s "https://$d/robots.txt" | grep -i '^sitemap:' | cut -d' ' -f2 | tr -d '\r' \
    | xargs -I{} curl -s -o /dev/null -w "{} => %{http_code}\n" {}
done

# 3) Content-Type e cache
curl -sI https://sp011.com.br/llms.txt | grep -iE 'content-type|cache-control'

# 4) Idioma do ksports (EN)
curl -s https://ksports.midia.run/llms.txt | head -8

# 5) Fallback: derrubar a API não pode dar 500
#    (na VPS, com o blog de canário)  docker compose stop api && curl -s -o /dev/null -w '%{http_code}\n' https://<blog>/llms.txt

# 6) Tipos
cd artifacts/brasilia-agora && pnpm run typecheck
```

**Verificação de não-regressão:**
- SEO = 100 e Best Practices = 100 (o `Disallow: /admin` é o item a vigiar)
- Accessibility ≥ 93 · CLS = 0 (nada visual muda)
- `/admin` continua acessível para humanos (robots.txt não bloqueia navegação)
- Nenhuma outra rota `.txt`/`.xml` mudou de comportamento

## Critérios de aceite

- [ ] `curl https://<blog>/llms.txt` começa com `# <nome do próprio blog>` nos
      4 blogs testados
- [ ] O `llms.txt` tem bloco `>` de resumo e links markdown absolutos
- [ ] Os `Sitemap:` do `robots.txt` apontam para o próprio host e respondem 200
- [ ] `ksports` recebe o texto em inglês
- [ ] Com a `api` do blog parada, `/llms.txt` responde 200 (estático de fallback)
- [ ] Lighthouse: Agentic Browsing 3/3; SEO = 100; Best Practices = 100
- [ ] `pnpm run typecheck` verde

## Invariantes preservadas

- CLAUDE.md §13: nada de conteúdo por blog hardcoded na imagem compartilhada —
  este PRD **corrige** uma violação existente
- CLAUDE.md §15: texto no idioma de `settings.siteLanguage`
- **Multi-blog:** um único rollout de imagem (§6) resolve os 8 blogs; nenhum
  arquivo por blog, nenhuma mudança no `Caddyfile` (evita o gotcha de inode do
  CLAUDE.md §3)
- CLS = 0, Accessibility ≥ 93, SEO = 100, Best Practices = 100

## Dependências de outros PRDs

Nenhuma. Pode subir a qualquer momento — inclusive junto com o PRD-PERF-01,
já que ambos ficam prontos rápido.

## Estimativa de esforço

**P** (um plugin de ~80 linhas no molde de um que já existe + 2 arquivos
estáticos).

## Plano de rollback

```bash
git revert HEAD
cd /opt/sp011 && git pull && docker compose build web && docker compose up -d web
```

## Notas de execução para o agente

- Trabalhe apenas neste PRD; não expanda escopo.
- Não invente conteúdo institucional: tudo sai de `/api/site`
  (`siteName`, `tagline`, `seoDescription`, `menuItems`, `contact`).
- Teste em pelo menos um blog **EN** (ksports) — é o caso que pega texto
  hardcoded em pt-BR.
- Teste o caminho de falha (API parada) antes de declarar concluído.
- Ao concluir: atualize `performance-audit/STATUS.md`.
