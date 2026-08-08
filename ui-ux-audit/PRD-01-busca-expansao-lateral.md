# PRD-01 — Busca com expansão lateral animada

**Alvo:** `web` (frontend). **Sem schema, sem settings novos, sem API.**
**Deploy:** rollout de imagem §6 (build `api web`, bump `BLOG_IMAGE_VERSION`,
loop dos blogs, **sem canário**). Validação **visual** em prod (busca é
client-side; não dá para conferir por `curl`).

## Problema

Ao clicar na lupa:

- **Centralizado** (`headerStyle:"centered"`) abre a busca numa **linha
  full-width abaixo** do cabeçalho — [Header.tsx:586-602](../artifacts/brasilia-agora/src/components/Header.tsx#L586-L602).
  É o "abre abaixo dele" do print (o seletor estava em Centralizado).
- **Padrão / Compacto / faixa** já abrem lateral, mas por **troca seca**
  (`searchOpen ? <input> : <button>`), sem transição: some o botão, aparece o
  input. Sem fluidez.
- A busca está **duplicada em 4 sítios** com CSS ligeiramente diferente:
  - standard/attached — [Header.tsx:662-697](../artifacts/brasilia-agora/src/components/Header.tsx#L662-L697)
  - compact/attached — [Header.tsx:491-511](../artifacts/brasilia-agora/src/components/Header.tsx#L491-L511)
  - menuBar (modo `bar`, desktop) — [Header.tsx:416-436](../artifacts/brasilia-agora/src/components/Header.tsx#L416-L436)
  - centered (botão [546-552] + linha abaixo [586-602])

## Objetivo

Transição fluida: a barra **expande lateralmente a partir do próprio botão**,
sem empurrar o conteúdo. Comportamento idêntico nos 3 estilos. Quando não há
espaço lateral (mobile ou cabeçalho cheio), **overlay sobre a linha** (decisão
do usuário) — nunca mais a linha abaixo.

## Viabilidade (resposta à pergunta do briefing)

**CSS puro resolve a animação; não precisa de JS para reposicionar.** Requisito:
o `<input>` fica **sempre montado** (não pode transicionar `display`/render
condicional). Anima-se `width` (0 → alvo) + `opacity` num wrapper com
`overflow-hidden`. O flex da linha absorve o crescimento (inline) e o overlay é
`position:absolute` (não afeta o fluxo). JS só para foco/Escape (já existe).

## Abordagem

### 1. Extrair `components/HeaderSearch.tsx` (unificação)

Um componente único usado pelos 4 sítios, eliminando a duplicação. Props:

```ts
type HeaderSearchProps = {
  variant: "light" | "onDark";   // fundo claro (Padrão/Compacto) vs barra escura (faixa/Centralizado)
  anchor: "inline" | "overlay";  // inline no desktop; overlay no mobile/estreito
  onSubmit: (q: string) => void; // reusa submitSearch já existente
  size?: "sm" | "md";
};
```

Estado `open`/`query` sobe para o `Header` OU fica interno (com callback de
navegação injetado) — preferir interno, expondo só `onSubmit`, para o `Header`
não repetir 4× o mesmo estado. `submitSearch`/`handleSearchKey`/`trackSearch`
([Header.tsx:308-318](../artifacts/brasilia-agora/src/components/Header.tsx#L308-L318))
migram para dentro (ou recebidos por prop).

### 2. Animação lateral (inline)

- Wrapper `overflow-hidden` com `transition: width .25s ease, opacity .2s`.
- `open` → largura alvo (`w-[150px] sm:w-[200px]` como hoje); fechado → `w-0`
  + `opacity-0` + `pointer-events-none`.
- A lupa permanece como botão-adorno; ao abrir, foco via `ref.focus()` num
  `useEffect([open])` (trocar o `autoFocus`, que só dispara na montagem — agora
  o input vive sempre no DOM).
- Fechar: Escape (handler já existe), botão ✕, e **clique fora** (novo listener
  opcional).

### 3. Fallback overlay (mobile / sem espaço)

- `anchor:"overlay"` → o input abre em `position:absolute`, ancorado à direita
  da linha (`right: headerPadX`), à altura da linha do cabeçalho, cobrindo o
  menu/logo com um fundo sólido (herda `headerBgColor`/cor da faixa). Expande da
  direita para a esquerda (anima `width`, `right` fixo).
- Regra de escolha inline vs overlay: **desktop (`lg+`) = inline; mobile = overlay.**
  No **Centralizado**, o botão é absoluto no canto ([546-552]) → usar overlay
  sobre a linha do logo também no desktop (a linha é centrada, não há trilho
  inline natural). **Remover** a linha-abaixo [586-602].

### 4. Acessibilidade e SSR

- `role="search"` no form; manter `aria-label` (`search.open/close/submit/site`).
- `prefers-reduced-motion: reduce` → sem transição de `width` (aparece/some
  direto), preservando a função.
- SSR só da home: input sempre montado é seguro (sem datas/format); começar
  `open=false` no server e no cliente (sem divergência de hidratação).
- i18n: reusa as chaves `search.*` de [i18n.ts](../artifacts/brasilia-agora/src/lib/i18n.ts). Nenhuma nova.

## Arquivos

- **novo** `components/HeaderSearch.tsx`.
- `components/Header.tsx`: trocar os 4 blocos de busca por `<HeaderSearch>`;
  remover a linha-abaixo do Centralizado; remover estado `searchOpen/searchQuery`
  se migrar para o componente.
- Sem mudanças em settings/useSite/adminApi/schema.

## Riscos / gotchas

- **Foco:** `autoFocus` → `ref.focus()` no efeito de abertura (senão o input
  sempre-montado rouba foco no load).
- **Overlay z-index:** garantir que cobre o menu mas não o drawer mobile
  (`z-40`/`z-50` já usados) nem os dropdowns (`z-50`).
- **Não regredir** o rastreio `trackSearch` nem a rota `/arquivo?q=`.

## Verificação

1. Local: `pnpm run typecheck` dentro de `artifacts/brasilia-agora`
   (Windows: por pacote). Build vite **só no Docker da VPS**.
2. Deploy §6 (sem canário).
3. Prod (visual, sem DevTools): em 1 blog de cada estilo — Padrão (sp011),
   Centralizado (o do print), faixa (ksports/EA) — abrir/fechar a busca em
   desktop e mobile; confirmar expansão lateral fluida, overlay no mobile, busca
   navega para `/arquivo?q=`. Confirmar que o Centralizado **não** abre mais
   linha abaixo.

## Sequência

Independente do PRD-02, mas o overlay/inline se beneficia do orçamento de
espaço do PRD-02. Recomendo **PRD-02 primeiro** (ou juntos); podem ir em
deploys separados.
