# PRD-02 — Cabeçalho robusto a conteúdo dinâmico (overflow "Mais ▾")

**Alvo:** `web` (frontend). **Sem schema, sem settings novos, sem API.**
**Deploy:** rollout de imagem §6 (build `api web`, bump, loop dos blogs, **sem
canário**). Validação **visual** em prod.

## Problema — uma causa raiz, quatro sintomas

Causa raiz única: **o nav não tem estratégia de overflow**. Quando o conteúdo
(menu longo, rótulos EN, banner/CTA, botão push) é mais largo que o espaço, cada
estilo falha do seu jeito:

| Estilo / modo | Sítio | O que quebra |
|---|---|---|
| standard `attached` | [Header.tsx:632-654](../artifacts/brasilia-agora/src/components/Header.tsx#L632-L654) | `navOverflow = hasDropdowns ? "flex-wrap" : "overflow-x-auto no-scrollbar"`. **flex-wrap** → cresce em altura, itens vazam sob o banner/CTA (incidente PontoFarma, comentado em [363-365](../artifacts/brasilia-agora/src/components/Header.tsx#L363-L365)). **overflow-x-auto** → itens somem **sem barra/afordância** no desktop. |
| compact `attached` | [Header.tsx:461-484](../artifacts/brasilia-agora/src/components/Header.tsx#L461-L484) | Igual, na linha `h-11` (mais apertada). |
| centered | [Header.tsx:558-583](../artifacts/brasilia-agora/src/components/Header.tsx#L558-L583) | Nav `justify-center` **sem overflow/wrap** → menu longo **estoura horizontal** → viola a invariante "o body nunca rola horizontal". |
| `bar` (faixa) | [Header.tsx:395-414](../artifacts/brasilia-agora/src/components/Header.tsx#L395-L414) | Nav `overflow-x-visible flex-1` → menu longo **invade a área da busca** (`shrink-0`) e sobrepõe. |
| banner do logo | [Header.tsx:378-390](../artifacts/brasilia-agora/src/components/Header.tsx#L378-L390) | No `attached` é `shrink-0` e disputa a linha com o nav `flex-1` → aperto. |

**Combinações que disparam:** menu ≥7 itens com rótulos longos (creditovc:
`Sair das Dívidas`, `Organizar Finanças`, `Planejar o Futuro`…; pontofarma:
`Fiscal/Tributário`, `Legislação`…); site EN (rótulos maiores); banner/CTA ligado
+ push ligado; desktop estreito (~1024–1200px) antes de cair no mobile.

## Objetivo

Menu longo / idioma / CTA **nunca embola**: os itens que não cabem vão para um
dropdown **"Mais ▾"** ao final do nav; nada some silenciosamente; nada estoura
horizontal. Vale para os 3 estilos + modo faixa.

## Abordagem

### 1. `components/OverflowNav.tsx` + hook `useOverflowItems`

Mecanismo reutilizável que mede a largura disponível e decide quantos itens
cabem; o excedente vira itens do "Mais ▾".

- **JS é necessário aqui** (medição). CSS-only ("priority+" com container query)
  é frágil com rótulos de largura variável (idioma, fonte configurável). Recomendo
  o medidor.
- `useOverflowItems(containerRef, itemRefs, deps)` com **ResizeObserver** no
  container; recalcula quando muda largura, `menuItems`, `menuFontSize`, idioma.
  Retorna `{ visibleCount }`. Os itens `> visibleCount` renderizam dentro do
  `NavDropdown` (já existe, [52-63](../artifacts/brasilia-agora/src/components/Header.tsx#L52-L63))
  disparado por um botão "Mais ▾".
- **Item com submenu dentro do "Mais":** vira **acordeão** (como o MobileNav,
  [208-230](../artifacts/brasilia-agora/src/components/Header.tsx#L208-L230)) para
  não empilhar dropdown-dentro-de-dropdown.

### 2. Aplicar nos 4 sítios

- standard/compact `attached`: `OverflowNav` substitui o nav `flex-1`; **remove**
  a lógica `hasDropdowns ? flex-wrap : overflow-x-auto` — não é mais necessária.
- centered: envolve o nav da barra escura; "Mais ▾" em texto claro sobre a barra.
- `bar`: idem na faixa; a busca `shrink-0` continua à direita, agora sem invasão.

### 3. Orçamento de espaço (a "verificação de fundo" — liga ao PRD-01)

Ordem de prioridade fixa na linha do cabeçalho, com os `min-w-0`/`shrink`
corretos para o flex calcular o overflow:

1. **logo** — encolhe até um mínimo (`min-w-0 shrink`, já existe).
2. **ícones** (push + busca) — `shrink-0` (nunca somem).
3. **banner/CTA** — ganha `max-w` + `min-w-0` para **não sufocar** o nav
   (hoje `shrink-0` sem teto).
4. **nav** — absorve o resto, com overflow "Mais ▾".

Esse orçamento é o que permite a busca do PRD-01 expandir sem embolar: a linha
sabe ceder espaço (nav colapsa no "Mais") antes de estourar.

### 4. Mobile

Mantém a gaveta `MobileNav` (já robusta). O "Mais ▾" é **só desktop (`lg+`)**.

### 5. Preservar

Cores/tamanho/peso do menu (`navItemStyle`), item ativo, ícone `House` no `/`,
dropdowns de submenu, `menuActiveColor`/faixa escura do Centralizado.

## Arquivos

- **novo** `components/OverflowNav.tsx` (+ hook `useOverflowItems`, no mesmo
  arquivo ou em `hooks/`).
- `components/Header.tsx`: 4 sítios de nav passam a usar `OverflowNav`; remover
  `navOverflow`/`hasDropdowns` ([366-367](../artifacts/brasilia-agora/src/components/Header.tsx#L366-L367));
  ajustar o banner (max-w/min-w-0).
- Sem settings/schema/API.

## Riscos / gotchas (o ponto delicado é SSR + medição)

- **SSR só da home** + medição client-side: no 1º paint (server) não há como
  medir. Estado inicial deve renderizar **seguro** — nav com `overflow-hidden`
  no container para **nunca vazar** enquanto o cliente mede; após montar, o
  ResizeObserver ajusta `visibleCount`. Aceitar um reflow mínimo no cliente;
  **não** usar `visibility:hidden` global (CLS/flash). Garantir hidratação sem
  divergência (server e cliente começam com o mesmo `visibleCount` inicial —
  ex.: "todos", e o cliente reduz).
- **Invariante:** o body nunca rola horizontal — o `overflow-hidden` do container
  do nav é a rede de segurança mesmo antes da medição.
- **Não hardcodar** nada por blog (imagem compartilhada).
- **Regex/unicode:** n/a aqui, mas manter a regra do repo (`\uXXXX`).

## Verificação

1. Local: `pnpm run typecheck` dentro de `artifacts/brasilia-agora`. Build vite
   **só no Docker da VPS**. (Opcional: `node --test` do `useOverflowItems` com
   larguras fake, limitado sem DOM real.)
2. Deploy §6 (sem canário).
3. Prod (visual, sem DevTools): blog de menu longo (**creditovc**/**pontofarma**)
   e um **EN** (ksports), nos 3 estilos + faixa, em desktop largo/estreito e
   mobile. Conferir: itens excedentes no "Mais ▾", nenhum item some, **nenhum
   domínio rola horizontal**, banner/CTA convive com o menu. Checagem rápida por
   domínio de que o `/api/site` devolve o `siteName` certo (não misturar blogs).

## Sequência

Base para o PRD-01 (orçamento de espaço). Implementar **antes** ou junto; deploys
podem ser separados.
