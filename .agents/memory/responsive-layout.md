---
name: Layout responsivo do portal
description: Breakpoints e grid usados no layout do portal
---

**Breakpoints:**
- Mobile: < 640px (1 coluna)
- Tablet: 640-1024px (2 colunas)
- Desktop: > 1024px (4 colunas)

**Hero:**
- Desktop: 62% principal + 38% secundárias
- Mobile: Stack vertical 100%

**Mais Lidas:**
- Desktop: 5 colunas
- Tablet: 3 colunas
- Mobile: 1 coluna

**Seções:** Grid de 4 colunas (1/2/4)

**Why:** Padrão consistente com portais de notícias brasileiros (G1, Estadão).
**How to apply:** Usar `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` em todas as grades de cards.
