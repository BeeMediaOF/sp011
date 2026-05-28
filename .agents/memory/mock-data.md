---
name: Estrutura de dados mock
description: Organização dos dados mockados por editoria
---

**Arquivo:** `artifacts/brasilia-agora/src/data/mockData.ts`

**Estrutura:**
- `editoriaColors` — Mapa de nome da editoria → cor hexadecimal
- `brasilArticles` — 6 artigos
- `mundoArticles` — 6 artigos
- `politicaArticles` — 6 artigos
- `economiaArticles` — 6 artigos
- `esporteArticles` — 6 artigos
- `culturaArticles` — 6 artigos

**Why:** Centraliza dados em um único arquivo para facilitar futura substituição por API real.
**How to apply:** Novas editorias adicionam um novo array exportado e consomem em `SectionBlock` na Home.
