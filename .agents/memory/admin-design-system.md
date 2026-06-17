---
name: Admin design system completo
description: Tokens e estado final das páginas do painel administrativo SBC Agora
---

## Tokens do design system

- Background: `#F7F9FC`
- Surface (cards): `#FFFFFF`
- Primary: `#0B2A66`
- Accent red: `#E71D36`
- Card shadow: `0 8px 24px rgba(15,23,42,0.06)`
- Border radius: `rounded-2xl` (16px)
- Font: Inter
- Input focus ring: `focus:ring-[#0B2A66]/20 focus:border-[#0B2A66]`
- Button primary: `bg-[#0B2A66] hover:bg-[#0a2255]`
- Button danger: `bg-[#E71D36] hover:bg-[#c8102e]`

## Todas as páginas admin redesenhadas

Dashboard, Analytics, Articles, ArticleEdit, RSSManager, AdsManager, ColumnistsManager, MenuManager — full redesigns com cards de métricas, 2-colunas tabela+formulário.

LogoUpload, ContactSettings — full rewrites limpos.

Webhook, Settings, HomeBlocksManager, SocialMedia, PerplexitySearch, Login — cores atualizadas globalmente com sed (substituição #1a2448→#0B2A66, #243060→#0a2255, #c8102e→#E71D36 exceto onde são defaults de template de canvas no SocialMedia).

## Atenção

SocialMedia.tsx canvas template: `panelColor: "#1a2448"` é o default DO TEMPLATE de imagem social (não UI), deixar como está.
ContactSettings usa toast (useToast) em vez de `alert()`.
Settings.tsx preset "SBC Agora (padrão)": `sidebar: "#0B2A66", accent: "#E71D36"`.

**Why:** manter consistência do design system em todas as páginas admin sem quebrar a lógica de renderização de canvas do SocialMedia.
