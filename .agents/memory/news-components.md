---
name: Componentes de notícia
description: Padrão de componentes reutilizáveis para o portal de notícias
---

**Componentes criados:**
- `TopBar` — Faixa fina com data e últimas notícias
- `Header` — Logo, busca, botão Assine
- `NavBar` — Navegação sticky com editorias coloridas
- `HeroSection` — Manchete principal (~60%) + 3 secundárias (~38%)
- `NewsCard` — Card padrão: imagem, chapéu, título, resumo, autor/hora
- `SectionBlock` — Wrapper de seção com título colorido e grid de NewsCards
- `MostRead` — Ranking 1-5 com números destacados
- `VideoSection` — Thumbnails com overlay de play e duração
- `Footer` — 4 colunas, redes sociais, newsletter, copyright

**Why:** Componentes separados permitem manutenção isolada e reutilização nas páginas de editoria.
**How to apply:** Novas seções de editoria devem usar `SectionBlock` + dados de `mockData.ts`.
