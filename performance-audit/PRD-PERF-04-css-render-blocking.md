# PRD-PERF-04 — CSS render-blocking de 197 KB com as classes do painel admin

## Objetivo

O site público baixa **um único** `index-*.css` de **197.582 B** que contém as
classes das 30 telas do painel admin e dos 55 wrappers `components/ui/*` — dos
quais só 13 são importados em qualquer lugar. Ele é `<link rel=stylesheet>` no
`<head>`, ou seja, **render-blocking em toda rota pública**. Este PRD escopa o
CSS do site público ao que o site público usa.

## Métrica(s) alvo

| Métrica | Antes (medido 2026-07-27) | Meta deste PRD | Como medir |
|---|---|---|---|
| CSS público *decoded* | 197.582 B | ≤ 95.000 B | `curl -s -o /dev/null -w '%{size_download}' https://<blog>/assets/index-*.css` |
| CSS público *transfer* (gzip) | 30.677 B | ≤ 17.000 B | idem com `-H 'Accept-Encoding: gzip'` |
| Arquivos em `components/ui/` | 55 | ≤ 20 | `ls artifacts/brasilia-agora/src/components/ui \| wc -l` |
| FCP na home (Slow-4G, CPU 4×) | 2.564 ms | ≤ 2.100 ms | script de medição |
| CSS do admin | (no mesmo arquivo) | chunk próprio, carregado só em `/admin` | inspecionar `<link>` em `/` vs `/admin/login` |

## Contexto / evidência

`01-diagnostico.md` §1.1 **Cadeia D** e §1.5 (*Unused CSS 246 KiB*).

- `artifacts/brasilia-agora/src/index.css:39-41` —
  `@import "tailwindcss"; @import "tw-animate-css"; @plugin "@tailwindcss/typography";`
- Tailwind **4.3.0** (`pnpm-workspace.yaml` catalog `^4.1.14`; instalado 4.3.0)
  sem `tailwind.config`: a detecção automática de fontes varre o projeto a partir
  do diretório do CSS até a raiz do git, respeitando `.gitignore`. Ou seja,
  `src/pages/admin/**` (30 arquivos) e `src/components/admin/**` entram na mesma
  folha.
- `src/entry-client.tsx:10` faz `import "./index.css"` → o CSS vira dependência
  do chunk de entrada, presente em **todas** as rotas.
- `components/ui/` tem 55 arquivos. Importados (`@/components/ui/*`):
  `button, card, dialog, input, label, separator, sheet, skeleton, textarea,
  toast, toaster, toggle, tooltip` — 13. Os 42 restantes são código morto que
  ainda paga custo em CSS (as classes deles são varridas pelo Tailwind).

**Hipótese (confiança média):** a maior fatia dos 197 KB vem das telas admin +
dos `ui/*` mortos. **O item 1 do escopo é medir isso antes de escolher a
técnica** — se o corte dos `ui/*` já resolver, não mexer no `@source`.

## Pré-condições

- [ ] PRD-PERF-02 concluído (mexem no mesmo `vite.config.ts`; evita conflito)
- [ ] Branch: `git checkout -b perf/prd-04-css`
- [ ] Baseline: salvar tamanho do CSS e um screenshot de referência de
      `/`, `/politica`, `/artigo/<slug>`, `/admin/login`, `/admin`,
      `/admin/configuracoes`, `/admin/home-blocos` em
      `performance-audit/baseline-prd04/`
- [ ] Ler obrigatoriamente:
  - `artifacts/brasilia-agora/src/index.css`
  - `artifacts/brasilia-agora/src/entry-client.tsx`
  - `artifacts/brasilia-agora/src/components/admin/AdminLayout.tsx`
  - `artifacts/brasilia-agora/src/lib/adminTheme.ts` e `adminDarkMode.ts`
  - `artifacts/brasilia-agora/vite.config.ts` (`build.cssCodeSplit`)

## Escopo (ações em ordem)

### 1. Medir de onde vem o peso (antes de mexer)

Na VPS (o build do Vite não roda no Windows — CLAUDE.md §14):

```bash
cd /opt/sp011
# a) baseline do CSS atual
docker compose build web && docker compose up -d web
curl -s -o /dev/null -w 'CSS atual: %{size_download}\n' https://<blog>/assets/index-<hash>.css

# b) quanto vem dos ui/* mortos: mover temporariamente e rebuildar
```

Registrar os dois números no `STATUS.md`. Se o corte dos `ui/*` sozinho já levar
o CSS a ≤ 95.000 B, **parar no item 2** e não fazer o item 3.

### 2. Remover os `components/ui/*` não usados

Calcular o fecho transitivo dos importados (um `ui/*` pode importar outro):

```bash
cd artifacts/brasilia-agora/src
# sementes
grep -rhoE '(@/components/ui|\.\./ui|\./ui)/[a-z-]+' --include=*.tsx . \
  | sed 's|.*/||' | sort -u > /tmp/ui-usados.txt
# arestas internas de components/ui/*
grep -rnoE 'from "\.\/[a-z-]+"' components/ui/*.tsx
```

Repetir até estabilizar. Então **apagar** os arquivos `components/ui/*.tsx` que
não estiverem no fecho.

- `components/ui/chart.tsx` está entre eles — é o arquivo que importa `recharts`
  e nunca é importado (ver `PRD-PERF-02`).
- Depois de apagar, rodar `pnpm run typecheck` — qualquer import quebrado
  aparece aqui.
- Remover do `package.json` do frontend as dependências que ficarem sem nenhum
  importador (`cmdk`, `input-otp`, `react-day-picker`, `vaul`,
  `react-resizable-panels`, `embla-carousel-react`, `react-icons`,
  `next-themes`, `@radix-ui/*` órfãos…). **Verificar caso a caso com `grep`;
  não remover em bloco.** `recharts` e `@tiptap/*` **permanecem** (admin usa).

### 3. (Condicional) Separar o CSS público do CSS do admin

Só se o item 2 não bastar. Tailwind 4.3 suporta escopo explícito de fontes:

**`src/index.css`** (público):
```css
@import "tailwindcss" source(none);
@source "./components";
@source not "./components/admin";
@source "./pages";
@source not "./pages/admin";
@source "./lib";
@source "./App.tsx";
@source "./entry-client.tsx";
@source "./entry-server.tsx";
@source "../index.html";
```

**`src/admin.css`** (novo, só o admin):
```css
@import "tailwindcss" source(none);
@source "./pages/admin";
@source "./components/admin";
@source "./lib/adminTheme.ts";
@source "./lib/adminDarkMode.ts";
@source "./lib/adminI18n.ts";
```
importado **uma única vez** em `src/components/admin/AdminLayout.tsx` (que já é
`lazy()` no `App.tsx:59`). Com `cssCodeSplit: true` (já ativo,
`vite.config.ts:588`), o Vite emite um CSS separado carregado só quando o chunk
do admin entra.

**Cuidados obrigatórios:**
- `src/pages/admin/Login.tsx` e `Setup.tsx` **não** passam pelo `AdminShell`
  (`App.tsx:236` exclui `/admin/login` e `/admin/setup` da área admin). Ou eles
  também importam `admin.css`, ou vão parecer sem estilo. **Testar as duas
  telas.**
- Componentes compartilhados entre público e admin (`components/ui/*`,
  `SEOHead`, `LazyImage`) precisam continuar em `@source` do CSS público.
- 93 ocorrências de `className={\`…${…}\`}` fora do admin: são composições de
  classes **literais** por condicional (verificado por amostragem), não
  construção de nome de classe por interpolação — seguras para o Tailwind. Ainda
  assim, a verificação visual do item 4 é obrigatória.
- `@theme inline`, as variáveis de `:root`/`.dark`, os `@font-face` e o bloco
  `.article-body` **ficam no `index.css`** (o público usa todos).

### 4. Verificação visual (obrigatória)

Comparar screenshot antes/depois nas 7 rotas do baseline. Qualquer diferença
visual = classe perdida = reverter ou ajustar o `@source`.

### 5. Limpeza de assets mortos (baixo risco, alto ganho de repo)

- `src/components/CategoryPage.tsx:6-8` importa `avatar1/2/3.png`
  (1,3 MB cada) e **não os usa** no JSX — remover os 3 imports.
- `src/components/BottomSection.tsx` não é importado por ninguém — remover o
  arquivo (leva mais 3 imports de avatar junto).
- Depois disso, conferir quais PNGs de `src/assets/images/` (43 MB em 37
  arquivos) ficaram sem nenhum importador e removê-los do repositório —
  encolhe o contexto de build do Docker, que é rebuildado a cada deploy.
  **Manter** os `.webp` usados por `HeroSection` e os 2 logos PNG de 33 KB.

## Fora de escopo

- Não fazer critical CSS inline (ganho marginal depois deste corte; e o SSR já
  entrega HTML pintado na home).
- Não trocar Tailwind por outra coisa, não introduzir CSS modules.
- Não redesenhar nada — este PRD é **byte-neutro visualmente**.
- Não mexer em JS/chunking (PRD-02) nem em imagens (PRD-03).
- `components/MostRead.tsx` contém 5 notícias de exemplo hardcoded sobre
  Brasília/DF com links mortos (`/artigo/pol-2`). Está inativo na configuração
  atual do sp011 (o bloco `mais-lidas` usa `area: "sidebar"` e cai no renderer
  de zona), mas renderiza em qualquer blog que use o bloco no fluxo clássico.
  **Não corrigir aqui** — é conteúdo, não performance; registrar no `STATUS.md`
  para o dono decidir.

## Comandos de verificação

```bash
# 1) Tamanho do CSS público
CSS=$(curl -s https://<blog>/ | grep -o '/assets/index-[A-Za-z0-9_-]*\.css')
curl -s -o /dev/null -w 'bruto: %{size_download}\n' "https://<blog>$CSS"
curl -s -o /dev/null -H 'Accept-Encoding: gzip' -w 'gzip: %{size_download}\n' "https://<blog>$CSS"

# 2) O admin tem CSS próprio (se o item 3 foi aplicado)
curl -s https://<blog>/          | grep -o '<link rel="stylesheet"[^>]*>'
curl -s https://<blog>/admin/login | grep -o '<link rel="stylesheet"[^>]*>'

# 3) Contagem de wrappers ui
ls artifacts/brasilia-agora/src/components/ui | wc -l

# 4) Tipos e testes
cd artifacts/brasilia-agora && pnpm run typecheck && pnpm test

# 5) Build real
cd /opt/sp011 && docker compose build web && docker compose up -d web
```

**Verificação de não-regressão (a mais importante deste PRD):**
- Screenshots idênticos em `/`, `/politica`, `/artigo/<slug>`, `/arquivo`,
  `/contato` — **em 2 blogs** (sp011 e um blog de layout "revista", ex.:
  esporteagora)
- Screenshots idênticos em `/admin/login`, `/admin/setup`, `/admin`,
  `/admin/configuracoes`, `/admin/home-blocos`, `/admin/analytics`,
  `/admin/artigos/novo`
- Modo escuro do admin continua funcionando (`adminDarkMode.ts`)
- Preview ao vivo da home dentro do admin (`?adminPreview=1`) continua estilizado
- CLS = 0 · Accessibility ≥ 93 · SEO = 100 · Best Practices = 100

## Critérios de aceite

- [ ] CSS público ≤ 95.000 B bruto e ≤ 17.000 B gzip
- [ ] `components/ui/` com ≤ 20 arquivos e `pnpm run typecheck` verde
- [ ] Nenhuma diferença visual nas 7 rotas do baseline, em 2 blogs
- [ ] FCP na home ≤ 2.100 ms no perfil de medição
- [ ] Se o item 3 foi aplicado: `/` e `/admin/login` carregam folhas diferentes,
      e `/admin/login` está estilizado
- [ ] `pnpm test` verde

## Invariantes preservadas

- **CLS = 0** — remover CSS usado por engano causa reflow; a verificação visual
  é o gate.
- Accessibility ≥ 93 (contraste e foco vêm do CSS — reconferir), SEO = 100,
  Best Practices = 100
- **Multi-blog:** blogs com layout "revista" (pontofarma/creditovc) usam classes
  que o sp011 não usa (`sectionStyle:"revista"`, cards com tempo de leitura).
  Esses layouts vêm de componentes React versionados, não de HTML do banco —
  mas os blocos `html`/`headerBannerHtml` das settings **podem** conter classes
  Tailwind. Verificar: `curl -s https://<blog>/api/site | grep -o 'class="[^"]*"' | sort -u`
  em pelo menos 3 blogs; se houver classes Tailwind em HTML do banco, elas
  **não** são varridas pelo Tailwind nem hoje — registrar como risco preexistente
  e não piorar.
- CLAUDE.md §17: `.cv-auto` (`index.css:250-253`) e `.article-body` são
  essenciais — não remover.

## Dependências de outros PRDs

Depende do **PRD-PERF-02** (mesmo `vite.config.ts`). Independente dos demais.

## Estimativa de esforço

**M/G** — a mudança é pequena, a verificação (14 screenshots × 2 blogs) é o custo.

## Plano de rollback

```bash
git revert HEAD
cd /opt/sp011 && git pull && docker compose build web && docker compose up -d web
```

Reverter é seguro: nada aqui persiste em banco.

## Notas de execução para o agente

- Trabalhe apenas neste PRD; não expanda escopo.
- **Meça antes de escolher a técnica** (item 1). Se o item 2 bastar, não faça o
  item 3 — menos superfície, menos risco.
- Screenshot antes/depois não é opcional: é o único critério que detecta classe
  perdida.
- O build do Vite só roda na VPS (CLAUDE.md §14).
- Ao concluir: atualize `performance-audit/STATUS.md` com os dois números de CSS.
