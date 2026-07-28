# PRD-PERF-03 — 234 KB de PNG de identidade servidos crus + preloads que roubam banda do LCP

## Objetivo

`/api/site-asset/:key` devolve o binário das logos exatamente como o admin subiu:
o logo do cabeçalho é um PNG de **818×288 / 81.530 B** exibido com 48 px de
altura, e o avatar de assinatura é um PNG de **1080×1080 / 82.957 B** exibido em
16×16. Além disso, o React 19 emite `<link rel=preload as=image>` para toda
`<img>` não-lazy do SSR — inclusive a **logo do rodapé** (69.534 B, fora da
dobra), que passa a disputar banda com a imagem do LCP. Este PRD faz o
`/api/site-asset` reusar o pipeline sharp que já existe e corta o preload
indevido.

## Métrica(s) alvo

| Métrica | Antes (medido 2026-07-27) | Meta deste PRD | Como medir |
|---|---|---|---|
| `/api/site-asset/logo` | 81.530 B PNG | ≤ 10.000 B WebP | `curl -s -o /dev/null -w '%{size_download} %{content_type}'` |
| `/api/site-asset/footer-logo` | 69.534 B PNG | ≤ 8.000 B WebP | idem |
| `/api/site-asset/byline-logo` | 82.957 B PNG | ≤ 4.000 B WebP | idem |
| `/api/site-asset/favicon` | 33.166 B PNG | ≤ 4.000 B | idem |
| Bytes de imagem na home | 310 KB (15 req) | ≤ 130 KB | Resource Timing `initiatorType: img` |
| Preloads `as=image` no `<head>` da home | 3 (logo, hero, footer-logo) | **1** (só o hero/LCP) | `curl -s https://<blog>/ \| grep -c 'preload" as="image'` |
| LCP na home (Slow-4G, CPU 4×) | 2.572 ms | ≤ 2.000 ms | script de medição |

## Contexto / evidência

`01-diagnostico.md` §1.1 **Cadeia C**.

**Backend.** `artifacts/api-server/src/routes/site.ts:10-18`:

```ts
router.get("/site-asset/:key", (req, res) => {
  const field = SITE_ASSET_FIELDS[...];
  const m = /^data:([-\w.+/]+);base64,(.+)$/s.exec(value);
  res.setHeader("Content-Type", m[1]!);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.end(Buffer.from(m[2]!, "base64"));   // ← binário cru, sem resize
});
```

O pipeline que faz o trabalho certo já existe e é compartilhado:
`artifacts/api-server/src/lib/imageTransform.ts` (`resolveImage`, `cacheKey`,
`memGet`, sharp → WebP/AVIF, cache em memória + disco, coalescing), usado por
`routes/image.ts` e `routes/uploads.ts`. O `/api/site-asset` simplesmente não o
usa.

Medição em produção (`https://sp011.com.br`):

| Asset | Intrínseco | Bytes | Exibido em |
|---|---|---:|---|
| `logo` | 818×288 PNG | 81.530 | `Header.tsx:270-272`, altura 48 px |
| `byline-logo` | 1080×1080 PNG | 82.957 | `NewsCard.tsx:59` (16×16), `HeroSection.tsx:78`, `SectionBlockFeatured.tsx:30`, `Artigo.tsx:642` — 12 ocorrências no HTML da home |
| `footer-logo` | 818×288 PNG | 69.534 | `Footer.tsx:159` e `:227`, altura ~40 px, abaixo da dobra |
| `favicon` | 321×138 PNG | 33.166 | `<link rel=icon>` |

**Preloads.** O HTML SSR da home traz:

```html
<link rel="preload" as="image" href="/api/site-asset/logo?v=15f61d3a53">
<link rel="preload" as="image" imageSrcSet="/api/image?...480w, ...768w, ..." fetchPriority="high">
<link rel="preload" as="image" href="/api/site-asset/footer-logo?v=b57a707fa2">
```

Nenhum deles existe no `index.html` nem em componente algum
(`grep -rn preload src/` só encontra o `lazyWithPreload` do admin). São emitidos
pelo **React 19.1** no `renderToString`, que hoisteia preload para toda `<img>`
sem `loading="lazy"`. `Footer.tsx:159/:227` não têm `loading`, por isso a logo do
rodapé — que está a 15 mil pixels da dobra — entra no `<head>` com prioridade de
recurso crítico. A 1,6 Mbps isso são ~0,35 s de banda tomada do LCP.

**Fato (confiança alta)** para tudo acima: bytes e dimensões medidos por `curl`
+ leitura do cabeçalho PNG; HTML baixado de produção.

## Pré-condições

- [ ] Branch: `git checkout -b perf/prd-03-imagens-identidade`
- [ ] Baseline:
      ```bash
      for k in logo footer-logo byline-logo favicon login-logo admin-logo og-image; do
        echo -n "$k: "; curl -s -o /dev/null -w '%{size_download} %{content_type}\n' \
          "https://<blog>/api/site-asset/$k?v=1"
      done
      curl -s https://<blog>/ | grep -o '<link rel="preload" as="image"[^>]*>'
      ```
- [ ] Ler obrigatoriamente:
  - `artifacts/api-server/src/routes/site.ts`
  - `artifacts/api-server/src/lib/imageTransform.ts`
  - `artifacts/api-server/src/routes/image.ts` (padrão de resposta/ETag)
  - `artifacts/api-server/src/lib/store.ts:802-882` (`SITE_ASSET_FIELDS`,
    `assetUrl`, guarda do `updateSettings`)
  - `artifacts/brasilia-agora/src/components/{Header,Footer,NewsCard,HeroSection,SectionBlockFeatured}.tsx`

## Escopo (ações em ordem)

### 1. `/api/site-asset/:key` passa a redimensionar

Em `artifacts/api-server/src/routes/site.ts`, aceitar query params opcionais,
espelhando `routes/image.ts`:

| Param | Default | Limites |
|---|---|---|
| `w` | **sem resize** (comportamento atual) | 1–1600 |
| `q` | 82 | 1–100 |
| `f` | `webp` quando `w` vier; senão nenhum | `webp` \| `avif` |

- Quando `w` estiver presente: pipeline via `resolveImage()`/`cacheKey()` do
  `lib/imageTransform.ts` (mesmo cache em memória/disco e coalescing).
- **Sem `w`, o comportamento continua idêntico ao de hoje** — retrocompatível
  para qualquer URL antiga em cache de navegador ou colada em algum lugar.
- Manter `Cache-Control: public, max-age=31536000, immutable` e **adicionar
  `ETag`** derivado de `cacheKey` (como em `image.ts:255`), com resposta 304.
- SVG: se o data URI for `image/svg+xml`, **não** passar pelo sharp — devolver
  cru (vetor já é pequeno e o resize não faz sentido).
- Preservar a ordem dos params na URL gerada por `assetUrl`
  (`store.ts:823-831`): `?v=<hash>` primeiro. A guarda de
  `updateSettings` (`store.ts:875-878`) usa `startsWith(SITE_ASSET_PREFIX)` e
  continua válida — **confirmar com teste**.

### 2. `assetUrl` ganha largura por campo

Em `store.ts`, `getPublicSettings()` monta as URLs. Adicionar um mapa de largura
padrão por campo e concatenar `&w=` na URL publicada:

| Campo | `w` |
|---|---|
| `logoBase64`, `logoMobileBase64` | 320 |
| `footerLogoBase64` | 320 |
| `bylineLogoBase64` | 64 |
| `faviconBase64` | 64 |
| `adminLogoBase64`, `loginLogoBase64` | 320 |
| `ogImageBase64` | **sem `w`** — o OG precisa de 1200×630 e é consumido por crawler |

O hash `?v=` continua sendo do data URI original, então trocar a imagem no admin
continua invalidando o cache.

### 3. Logo do rodapé sai do preload

`Footer.tsx:159` e `Footer.tsx:227`: acrescentar `loading="lazy"` e
`decoding="async"` às duas `<img>` de logo. É isso que impede o React 19 de
hoistear o `<link rel=preload as=image>`.

Fazer a mesma varredura nas demais `<img>` renderizadas no SSR **abaixo da
dobra** que ainda não tenham `loading="lazy"`:

```bash
grep -rn "<img" artifacts/brasilia-agora/src/components artifacts/brasilia-agora/src/pages/Home.tsx \
  | grep -v 'loading=' | grep -v pages/admin
```

Regra: **exatamente uma** imagem da home pode ficar sem `loading="lazy"` — a do
hero/LCP (`Home.tsx:460`, que já tem `fetchPriority="high"`). A logo do
cabeçalho (`Header.tsx:270-272`) fica **sem** lazy (está na dobra) mas passa a
pesar ~6 KB depois do item 2, o que torna o preload dela aceitável.

### 4. `srcset` para as logos de identidade

Onde a logo aparece com altura conhecida, usar 1× e 2×:

```tsx
<img src={`${logoSrc}&w=320`} srcSet={`${logoSrc}&w=320 1x, ${logoSrc}&w=640 2x`} ... />
```

Aplicar em `Header.tsx` (HeaderLogo), `Footer.tsx` e no byline
(`NewsCard.tsx:59`, `HeroSection.tsx:78`, `SectionBlockFeatured.tsx:30`,
`Artigo.tsx:642`) — nestes últimos, `w=32 1x, w=64 2x`.

**Cuidado:** esses componentes também recebem `logoBase64` como **data URI**
quando o payload vem do `localStorage` antigo ou de um blog ainda não migrado.
Criar um helper em `src/lib/newsImage.ts`:

```ts
/** Acrescenta &w= a uma URL /api/site-asset/…; devolve inalterado se for data URI/URL externa. */
export function siteAssetUrl(src: string, w: number): string
```

e usar o helper em **todos** os pontos acima — nunca concatenar string à mão.

### 5. Favicon

`index.html:100` aponta para `/favicon.jpg` (33 KB, estático da imagem
compartilhada). O favicon real por blog vem de
`SEOHead.tsx` via `/api/site-asset/favicon`. Após o item 2 ele já cai para
≤ 4 KB; nenhuma ação extra — apenas **verificar** que a aba do navegador
continua mostrando o ícone certo em 2 blogs diferentes.

## Fora de escopo

- Não mexer em `/api/image` (proxy de imagens de artigo) — já está correto.
- Não mexer no `srcset`/`sizes` das imagens de **artigo** da home.
- Não mexer nos anúncios (`/api/ads`), já corrigidos.
- Não converter os PNGs guardados nas settings: a fonte da verdade continua o
  data URI original; a conversão é só na entrega.
- Não mexer em `public/opengraph.jpg` nem no fluxo de OG.

## Comandos de verificação

```bash
# 1) Tamanho e formato dos assets de identidade
for k in logo footer-logo byline-logo favicon; do
  echo -n "$k sem w: "; curl -s -o /dev/null -w '%{size_download} %{content_type}\n' "https://<blog>/api/site-asset/$k?v=1"
  echo -n "$k w=320: "; curl -s -o /dev/null -w '%{size_download} %{content_type}\n' "https://<blog>/api/site-asset/$k?v=1&w=320"
done

# 2) ETag / 304
E=$(curl -sI "https://<blog>/api/site-asset/logo?v=1&w=320" | grep -i '^etag' | cut -d' ' -f2 | tr -d '\r')
curl -s -o /dev/null -w '%{http_code}\n' -H "If-None-Match: $E" "https://<blog>/api/site-asset/logo?v=1&w=320"  # 304

# 3) Preloads no HTML da home
curl -s https://<blog>/ | grep -o '<link rel="preload" as="image"[^>]*>'      # deve sobrar 1 (o hero)
curl -s https://<blog>/ | grep -c 'preload" as="image'                        # = 1

# 4) O que o HTML pede de logo
curl -s https://<blog>/ | grep -o '/api/site-asset/[a-z-]*?[^"]*' | sort -u

# 5) Tipos e testes
cd artifacts/api-server && pnpm run typecheck && pnpm run build && pnpm test
cd ../brasilia-agora    && pnpm run typecheck && pnpm test
```

**Verificação de não-regressão:**
- CLS = 0 (as logos já têm altura fixa por `style={{height}}` — confirmar que
  continua)
- Accessibility ≥ 93 · SEO = 100 · Best Practices = 100
- **Em 2 blogs diferentes** (sp011 + resenhavip): logo do cabeçalho, logo do
  rodapé, avatar de assinatura e favicon aparecem, nítidos, sem serrilhado em
  tela 2×
- Trocar a logo no admin (`/admin/configuracoes`) e confirmar que o site atualiza
  em ≤ 90 s (o `?v=` mudou) — este teste valida que a guarda de `updateSettings`
  não gravou a URL por cima do base64
- Página de login e sidebar do admin continuam com a logo certa
  (`login-logo`, `admin-logo`)
- Preview de link no WhatsApp continua com a imagem OG correta (o `og-image`
  não recebeu `w`)

## Critérios de aceite

- [ ] Os 4 assets de identidade somam ≤ 26.000 B (hoje: 267.187 B)
- [ ] `content_type` = `image/webp` quando `w` é passado
- [ ] `If-None-Match` devolve 304
- [ ] Exatamente **1** `<link rel=preload as=image>` no `<head>` da home, e é o
      do hero (`fetchPriority="high"`)
- [ ] Bytes de imagem na home ≤ 130 KB
- [ ] LCP na home ≤ 2.000 ms no perfil de medição
- [ ] Troca de logo pelo admin continua propagando para o site
- [ ] `pnpm test` verde em `api-server` e `brasilia-agora`

## Invariantes preservadas

- **CLS = 0** — este é o PRD de maior risco de CLS da série (mexe em imagens
  visíveis). Toda `<img>` alterada precisa manter `width`/`height` ou altura
  explícita.
- Accessibility ≥ 93 (nenhum `alt` removido), SEO = 100, Best Practices = 100
- **Multi-blog:** cada blog tem logos próprias nas suas settings; a mudança é no
  transporte, não no conteúdo. Testar em pelo menos 2 blogs.
- CLAUDE.md §17: `/api/site` continua publicando os assets como **URL**
  (`/api/site-asset/:key`) e `updateSettings` continua ignorando valores que
  começam com esse prefixo — o acréscimo de `&w=` **não pode** quebrar essa
  guarda (teste explícito acima).
- CLAUDE.md §13: nada de segredo entra em log; o `imageTransform` já grava cache
  em disco dentro do container.

## Dependências de outros PRDs

Nenhuma técnica. Recomendado depois do **PRD-PERF-01** e do **02** para que a
medição de LCP da home fique estável.

## Estimativa de esforço

**M** (rota do backend + mapa de larguras + 6 pontos de consumo no frontend +
teste multi-blog).

## Plano de rollback

```bash
git revert HEAD
cd /opt/sp011 && git pull && docker compose build api web && docker compose up -d api web
```

Rollback parcial: remover o mapa de larguras do `assetUrl` (`store.ts`) faz as
URLs voltarem a não ter `w=` e a rota volta ao caminho legado, sem tocar no
frontend.

## Notas de execução para o agente

- Trabalhe apenas neste PRD; não expanda escopo.
- **Não** invente um segundo pipeline de imagem: use `lib/imageTransform.ts`.
- Teste a troca de logo pelo admin antes de declarar concluído — é o caminho em
  que uma URL derivada já causou incidente (comentário em `store.ts:870-878`).
- Meça ANTES e DEPOIS na home e registre na mensagem de commit.
- Ao concluir: atualize `performance-audit/STATUS.md`.
