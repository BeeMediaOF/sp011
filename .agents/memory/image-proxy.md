---
name: Proxy de imagens /api/image
description: Rota Express que busca, redimensiona (sharp) e serve WebP/AVIF com cache LRU+disco. Allowlist de domínios obrigatória.
---

## Regra principal

O metroimg usa **imgproxy com hash HMAC que cobre o path completo** (incluindo parâmetros de resize). O hash NÃO cobre apenas a URL-fonte. Por isso é impossível gerar variantes de tamanho do frontend sem a chave de assinatura → frontend não pode fazer resize direto no CDN.

**Por:** Tentativas de substituir dimensões na URL `i.metroimg.com/HASH/rs:fill:W:H:...` resultam em 403. Verificado empiricamente.

**Solução:** Backend proxy em `GET /api/image?url=...&w=...&q=...` usando `sharp`.

## Arquivos

- Backend: `artifacts/api-server/src/routes/image.ts` + registrado em `routes/index.ts`
- Frontend: `artifacts/brasilia-agora/src/lib/newsImage.ts` — `buildSrcSet()` e `proxyUrl()`

## Regra de sincronização das allowlists

`PROXY_HOSTS` em `newsImage.ts` **deve sempre espelhar** `ALLOWED_HOSTS` em `image.ts`.

Se adicionar domínio numa, adicionar na outra também. Os dois conjuntos têm que ser idênticos porque:
- Frontend usa PROXY_HOSTS para decidir se gera srcset (se não gera, nenhum request chega ao proxy)
- Backend usa ALLOWED_HOSTS para validar requests que chegam

## Domínios em produção (verificado 2026-06-25)

```
i.metroimg.com          — CDN principal (50 de 100 artigos)
imagens.ebc.com.br      — EBC / Agência Brasil
media.investnews.com.br
www.cartacapital.com.br
www.brasildefato.com.br
medias.revistaoeste.com
uploads.finsidersbrasil.com.br
finsidersbrasil.com.br
cdn.jornaldebrasilia.com.br
media-manager.noticiasaominuto.com.br
```

## Reduções de payload medidas (imagem 1200px original = 186 KB)

| Largura via proxy | Tamanho WebP q=82 | Redução |
|---|---|---|
| 320px | 14 KB | 92% |
| 480px | 31 KB | 83% |
| 768px | 70 KB | 62% |
| 1280px | 173 KB | 7% |

## Cache em três camadas

1. **Browser**: `Cache-Control: public, max-age=31536000, immutable` + ETag → zero requests repetidos
2. **Memória (LRU 100 entradas)**: Map com evicção FIFO → sub-ms
3. **Disco `/tmp/img-proxy-cache/`**: persistente pelo lifetime do processo

## Widths de srcset por contexto

```
CARD_WIDTHS  = [320, 480, 640, 960]   — thumbnails e cards
HERO_WIDTHS  = [480, 768, 1024, 1280] — hero e destaque grande
THUMB_WIDTHS = [120, 240, 360]        — sidebar e strip
```
