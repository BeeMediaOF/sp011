# UI/UX do blog engine — rodada "busca + cabeçalho" (2026-07-31)

> Docs de planejamento (NÃO commitar — mesmo padrão de `analytics-audit/` e
> `security-audit/`). Entrega desta sessão: PRDs com plano de implementação.
> **Nenhum código foi alterado.**

## O achado que muda tudo: cabeçalho é UM componente, não N

Não existe cabeçalho "por blog". Todo blog da rede roda a MESMA imagem e o
MESMO [Header.tsx](../artifacts/brasilia-agora/src/components/Header.tsx). O que
varia entre blogs é **configuração** (`settings`), não código:

- `headerStyle`: `standard` | `compact` | `centered` (= Padrão / Compacto /
  Centralizado do painel — aba **Cabeçalho** do HomeBlocksManager).
- `menuBarStyle`: `attached` (menu na linha do logo) | `bar` (faixa colorida
  full-width abaixo do logo). Ortogonal ao `headerStyle`.
- Conteúdo dinâmico que estressa o layout: `menuItems` (quantidade + tamanho
  dos rótulos), `headerBannerHtml` (o CTA "Receber conteúdos"), `showPushButton`,
  `siteLanguage` (rótulos EN vs PT), logo larga.

Logo: o "layout construído manualmente por blog" na prática é **um componente
com ramos** dirigidos por settings. Isso decide o agrupamento dos PRDs (abaixo).

## Como as duas frentes se conectam (a "verificação de fundo")

A busca e o menu **dividem a mesma linha flex** nos estilos Padrão/Compacto
(`attached`). A causa raiz do "embolado" é a mesma que limita a animação da
busca: **o cabeçalho não tem um orçamento de espaço** — os filhos (logo, nav,
banner, push, busca) competem por largura sem prioridade nem estratégia de
overflow. Animar a busca expandindo lateralmente **aumenta** essa pressão. Por
isso os dois PRDs compartilham a mesma regra de espaço, e o PRD-02 (que a
formaliza) deve vir antes ou junto do PRD-01.

## Divisão escolhida e justificativa

| PRD | Escopo | Por que separado |
|---|---|---|
| **[PRD-01](PRD-01-busca-expansao-lateral.md)** | Busca: expansão lateral animada em todos os estilos; fim do "abre abaixo" no Centralizado; fallback overlay | Concern isolado (interação/animação), pequeno, entrega e valida sozinho. Toca o mesmo componente, mas é independente da lógica de menu. |
| **[PRD-02](PRD-02-cabecalho-robusto.md)** | Cabeçalho robusto: overflow "Mais ▾", orçamento de espaço, corrige estouro do Centralizado e do modo faixa | Mudança **estrutural** do nav. É UMA causa raiz num componente compartilhado → **um** PRD com sub-tarefas por estilo, não quatro PRDs (que duplicariam o mesmo mecanismo). |

**Por que o cabeçalho NÃO virou 4 PRDs (um por estilo):** os 4 sítios de nav
(standard/compact/centered/bar) têm a MESMA causa raiz — ausência de estratégia
de overflow — e a correção é UM mecanismo reutilizável (`OverflowNav`) aplicado
nos 4 pontos. Não são "layouts distintos com causas distintas"; são ramos de um
componente. Fatiar por estilo criaria coordenação e código repetido sem ganho.

## Decisões do usuário (2026-07-31)

1. **Overflow do menu:** menu **"Mais ▾"** (itens que não cabem colapsam num
   dropdown; nada some, tudo em 1 linha).
2. **Busca sem espaço:** **overlay sobre a linha** (barra desliza por cima, não
   empurra logo/menu).
3. **WhatsApp (imagem "03"):** **fora do escopo** — o ícone já é configurável
   nos ícones do cabeçalho/barra do topo (`showTopBarSocial`/`showPushButton`).
   Não há widget flutuante novo a construir nesta rodada.

## Fora de escopo desta rodada

- Widget flutuante de WhatsApp desativado-por-padrão + campo de número (recurso
  novo; reabrir como PRD próprio se desejado).
- Reestruturação do sistema de blocos da home (o header lê `settings`, não
  `homeBlocks`; a única ligação é a aba "Cabeçalho" agrupar os toggles portal).
