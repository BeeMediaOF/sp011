# Instruções para o Agente (Replit) — Projeto SBC Agora / BeeNews

> **Leia este arquivo inteiro antes de escrever qualquer linha de código.**
> Ele descreve **como trabalhar neste repositório sem quebrar nada** e **como
> preservar a performance** que já foi cuidadosamente otimizada aqui.
> Quando este documento conflitar com um hábito "genérico" seu, **este documento vence.**

Documentos complementares que valem como fonte de verdade:
- [`TECHNICAL_OVERVIEW.md`](TECHNICAL_OVERVIEW.md) — mapa completo de rotas, tabelas, módulos e fluxos.
- [`replit.md`](replit.md) — comandos de run e stack.
- [`.env.example`](.env.example) — fonte de verdade das variáveis de ambiente.

---

## 0. Regra número zero — NÃO QUEBRE O QUE JÁ FUNCIONA

Este é um portal de notícias **em produção**, com automação de coleta, IA,
publicação social e SEO. Muitas otimizações são invisíveis num "olhar rápido"
mas críticas. Antes de mudar algo:

1. **Entenda antes de editar.** Leia o arquivo inteiro e quem o chama. Nunca
   reescreva um módulo do zero se um patch cirúrgico resolve.
2. **Faça a menor mudança possível** que resolve a tarefa. Escopo pequeno = risco pequeno.
3. **Preserve o comportamento existente.** Se um trecho parece estranho, provavelmente
   é uma correção proposital (há comentários explicando o "porquê" — leia-os).
4. **Nunca remova um comentário que explica uma decisão de performance/segurança**
   sem entender a consequência. Esses comentários são o "porquê", não ruído.
5. Em caso de dúvida sobre um comportamento arriscado (deploy, migração destrutiva,
   troca de segredo, exclusão em massa), **pare e pergunte** em vez de adivinhar.

---

## 1. O que é o projeto (contexto mínimo)

- Portal de notícias brasileiro. **Monorepo pnpm** (workspaces).
- **Deploy de produção:** Docker em VPS Hostinger (api + web + Caddy). Banco e
  storage no **Supabase** (PostgreSQL). Workflow é **commit direto na `main`** (dev solo, sem PRs).
- O app lê `process.env` **direto** (sem `dotenv`); em produção o `.env` é injetado
  via `node --env-file=.env`.

### Estrutura

```
/
├── artifacts/
│   ├── brasilia-agora/   # Frontend React 18 + Vite 7  (@workspace/sbc-agora)
│   └── api-server/       # Backend Express 5            (@workspace/api-server)
├── lib/
│   ├── db/               # Schema Drizzle + cliente Postgres   (@workspace/db)
│   ├── social-template/  # Fonte única do template social      (@workspace/social-template)
│   ├── api-spec/         # OpenAPI + Orval config              (@workspace/api-spec)
│   ├── api-client-react/ # React Query hooks gerados por Orval (@workspace/api-client-react)
│   └── api-zod/          # Schemas Zod gerados por Orval       (@workspace/api-zod)
├── scripts/              # Utilitários CLI
├── pnpm-workspace.yaml   # Catalog de versões + overrides de plataforma
└── tsconfig.base.json    # TypeScript strict compartilhado
```

### Stack resumida

- **Runtime:** Node.js 24, TypeScript 5.9 (strict), **pnpm** (obrigatório).
- **Backend:** Express 5, Drizzle ORM, Pino (logs JSON), Zod. Build: esbuild → `dist/index.mjs`.
- **Frontend:** React 18, Vite 7, Wouter (rotas), TanStack Query v5, Radix UI, Tailwind CSS 4, Tiptap 2. Build: Vite (client + SSR da home).
- **IA:** Google Gemini (`@google/genai`) com rodízio de chaves; fallback Perplexity.
- **Social:** Meta Graph API; arte gerada por Playwright (Chromium headless).

---

## 2. Como trabalhar — o ciclo obrigatório

### Antes de começar
- [ ] Ler a tarefa e **localizar** os arquivos envolvidos (use busca, leia o
      `TECHNICAL_OVERVIEW.md` para achar a rota/tabela/módulo certos).
- [ ] Confirmar **em qual pacote** a mudança pertence (frontend? api? lib compartilhada?).
- [ ] Verificar se já existe função/hook/util que faz o que você precisa — **reuse antes de criar.**

### Durante
- [ ] Seguir os padrões do arquivo vizinho: nomes, estilo, densidade de comentários, idioma dos comentários (**PT-BR**).
- [ ] Manter tipos **estritos** (nada de `any` gratuito; o projeto é `strict`).
- [ ] Validar toda entrada externa (request body, params) com **Zod**.
- [ ] Comentar **o porquê**, não o óbvio — especialmente escolhas de performance.

### Antes de terminar (checklist de "não quebrei nada")
Rode, na raiz do repo:

```bash
pnpm run typecheck        # typecheck de TUDO (libs compostas + artifacts)
```

Se mexeu numa lib composta (`lib/*`), pode ser preciso buildá-la antes:

```bash
pnpm exec tsc -b lib/social-template     # exemplo: recompila a lib antes do typecheck
```

Validação por pacote:

```bash
pnpm --filter @workspace/api-server run typecheck     # backend (builda no Windows)
pnpm --filter @workspace/sbc-agora   run typecheck     # frontend (SÓ typecheck no Windows — ver Armadilhas)
```

- [ ] `pnpm run typecheck` passa **sem erros**.
- [ ] Nenhuma variável de ambiente nova sem documentar no `.env.example`.
- [ ] Nenhuma mudança de schema sem seguir a seção **Banco de Dados** abaixo.
- [ ] Testou o fluxo afetado (ou descreveu como testar) — não confie só no typecheck.



---

## 3. PRESERVAÇÃO DE PERFORMANCE (o foco desta tarefa)

O projeto foi otimizado para Core Web Vitals e para custo de servidor. **Não
regrida essas otimizações.** Abaixo, o que existe e as regras para manter.

### 3.1 Frontend — carregamento e bundle

- **Code-splitting por rota já existe** em [`App.tsx`](artifacts/brasilia-agora/src/App.tsx):
  só `Home` e os guards de auth são **eager**; todas as outras páginas (públicas e
  admin) são `lazy(() => import(...))` sob `<Suspense>`.
  → **Regra:** ao adicionar uma página nova, **importe-a com `lazy()`**, nunca com
  import estático no topo. Páginas de admin **jamais** devem entrar no bundle inicial do visitante.
- **UI não-crítica é lazy** (Toaster, LGPDConsent carregam depois do conteúdo). Mantenha esse padrão para widgets secundários.
- **`manualChunks`** em [`vite.config.ts`](artifacts/brasilia-agora/vite.config.ts) separa vendors
  pesados (`vendor-react`, `vendor-query`, `vendor-motion`, `vendor-charts`,
  `vendor-icons`, `vendor-editor`, `vendor-radix`).
  → **Regra:** ao introduzir uma dependência pesada nova (gráfico, editor, animação),
  avalie adicioná-la a um chunk dedicado. **Não** importe libs gigantes na Home.
- **Ícones:** use `lucide-react` (já em chunk próprio) e importe **só o ícone usado**.
  Nunca `import * as Icons`.
- **Imagens:** use o componente `LazyImage` (lazy + skeleton + fallback). Sempre
  passe `width`/`height` ou aspect-ratio para **manter CLS = 0**. Os `AdBanner` têm
  skeleton exatamente por isso — não remova.
- **TanStack Query** está configurado com `staleTime: 60s`, `gcTime: 5min`,
  `refetchOnWindowFocus: false`. Não baixe esses valores nem force refetch agressivo
  sem motivo — isso multiplica chamadas de API.

### 3.2 Frontend — SSR da Home e cache HTTP

- A **home (`/`) tem SSR** com **cache em memória de ~30s** (`ssrHomePlugin` no
  `vite.config.ts`). Isso derruba o TTFB/LCP. **Não desative nem quebre** esse plugin.
- O `__SSR_DATA__` inline **remove propositalmente** campos base64 pesados
  (`logoBase64`, `faviconBase64`, `ogImageBase64`, ...) e limita artigos a 100.
  → **Regra:** **nunca** inline base64 grande no HTML/SSR data. Campos base64
  pesados devem ser rebuscados no cliente após hidratar.
- **Política de cache HTTP** (`staticCachePlugin`): `/assets/*` e fontes = imutável
  por 1 ano (têm hash no nome); HTML = `no-store`. **Não** cacheie HTML e **não**
  sirva asset com nome sem hash pretendendo imutável.

### 3.3 Backend — caches em memória

Vários serviços mantêm **cache em memória** que é **invalidado (bust) em toda escrita**:
- `articleService` — cache de artigos ~30s, bustado em create/update/delete.
- `store.ts` — settings em memória (**texto puro** em memória; ver Segurança).
- Cache de permissões (TTL curto) nos middlewares.

→ **Regras:**
- Se você **escrever** num recurso cacheado, **invalide o cache** correspondente
  (siga o padrão já existente na função de escrita vizinha). Cache desatualizado = bug silencioso.
- **Não** adicione um `SELECT` pesado dentro de loop/handler quente sem cache.
- Prefira **uma** query com `where`/índice a N queries em laço (N+1).

### 3.4 Backend — proxy de imagens (`/api/image`)

É um dos caminhos mais quentes. Ele já tem: **LRU em memória + cache em disco**,
**request coalescing** (requisições simultâneas à mesma URL compartilham um único
fetch), **`effort: 1` no sharp** (latência ~50ms vs ~200ms), **fallback SVG→WebP**
(nunca retorna 502) e **pré-aquecimento no boot**.
→ **Regra:** não mexa nesse arquivo sem necessidade. Se mexer, **preserve** coalescing,
os limites (`w` máx. 1200), o fallback e o `effort:1`. Não troque `effort` para o padrão 4.

### 3.5 Backend — renderização social (Playwright)

A arte social é gerada por **Chromium headless "quente" (reutilizado)** em
`lib/social/renderTemplate.ts`. **Não** abra/feche um browser por request —
reutilize a instância existente. O render espera `document.fonts.ready` antes do screenshot.
- **Fonte única de verdade do template:** pacote `@workspace/social-template`. O
  editor (browser) e o renderer (servidor) consomem **o mesmo CSS/HTML** → o preview
  é exatamente a imagem postada (WYSIWYG). **Nunca** duplique/diverja essa lógica
  entre editor e servidor: mude **no pacote compartilhado**.

### 3.6 Backend — IA, filas e cron

- **Nada é publicado sem passar pela reescrita de IA.** Não crie atalho que publique conteúdo cru.
- **Rodízio de chaves Gemini** (`getGeminiKeys`/`pickKey`/`callGeminiWithRotation`) —
  use-o; não chame a API com uma chave fixa hard-coded.
- A **fila de reescrita** tem concorrência/limites propositais (`MAX_CONCURRENCY`,
  `MAX_ATTEMPTS`, intervalos). Não aumente concorrência sem entender o custo de quota.
- Cron (`node-cron`): toda verificação deve ser **idempotente e tolerante a falha**
  (uma falha não pode derrubar o processo nem travar o lote). Envolva em `try/catch` e logue.

### 3.7 Regra geral de performance
Ao adicionar qualquer coisa, pergunte: **"isso entra no caminho quente (boot, home,
proxy de imagem, request por artigo, cron)? isso incha o bundle inicial? isso adiciona
uma query por item?"** Se sim, meça e otimize (cache, lazy, batch, índice) — ou não faça.

---

## 4. Banco de Dados e migrações (padrão específico deste repo)

O schema Drizzle vive em [`lib/db/src/schema/`](lib/db/src/schema/). Migrações
são aplicadas via `drizzle-kit push` **manual** — porém há um mecanismo automático
para colunas/tabelas **novas e opcionais**:

- [`artifacts/api-server/src/lib/ensureSchema.ts`](artifacts/api-server/src/lib/ensureSchema.ts)
  roda **no boot** e faz `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`
  **antes de qualquer SELECT**. Assim um rebuild do container já cria a estrutura,
  sem passo manual.

→ **Regras ao mexer no schema:**
1. **Toda coluna nova deve ser opcional/nullable** (ou ter DEFAULT) e o app deve
   **degradar com segurança** se ela estiver ausente. O Drizzle gera `SELECT col`
   assim que a coluna entra no schema — se o banco ainda não a tiver, **quebra**.
2. **Adicione o `ADD COLUMN IF NOT EXISTS` correspondente ao `ensureSchema.ts`**
   ao introduzir coluna/tabela nova, para que produção se auto-atualize no deploy.
3. **Nunca** rode migração **destrutiva** (drop de coluna/tabela, mudança de tipo
   que perde dados) sem confirmação explícita. Prefira aditivo.
4. **Drizzle `.set()`/insert usa nomes de propriedade JS (camelCase), NÃO snake_case.**
   Passar chave snake_case é **silenciosamente ignorado** (já foi um bug real aqui).
   Ex.: `.set({ pageId: x })` ✅ — `.set({ page_id: x })` ❌ (ignorado).

---

## 5. Segurança — o que NÃO tocar

- **NÃO troque `SESSION_SECRET`** (nem `SETTINGS_ENCRYPTION_KEY` se definido).
  A chave de criptografia dos segredos at-rest é derivada dele. Trocar =
  **todos os segredos salvos ficam ilegíveis** (Gemini keys, tokens Meta, etc.),
  exigindo recadastro manual.
- **Segredos são criptografados em repouso** (AES-256-GCM) via `crypto.ts`
  (`encryptSecret`/`decryptSecret`, envelope `enc:v1:` + base64(iv|tag|ciphertext)).
  Ao **salvar** um segredo novo no banco → **criptografe**. Ao **usar** → **descriptografe**.
  Ao **exibir** para o admin → **mascare** (`••••••••`), nunca devolva o valor cru.
  O cache em memória guarda **texto puro**, então o resto do app não muda.
- **Senhas:** scrypt (N=16384, r=8, p=1, keylen=64) + salt. **Tokens:** HMAC-SHA256
  sobre `userId:role:exp`, TTL 8h. Não invente esquema de auth próprio; use o middleware existente.
- Em produção, sem `SESSION_SECRET` o processo **encerra de propósito** — não "conserte" isso.
- **Helmet, CORS, rate-limit por endpoint e lockout** já existem. Ao criar rota nova,
  **proteja-a** com o middleware de auth/permissão adequado (`authMiddleware`,
  `requireAdmin`, `requirePermission(key)`). Rota admin sem auth = falha grave.
- **Nunca** logue segredo, token, senha ou payload sensível. Nunca commite `.env`.

---

## 6. Contratos de API (Orval / OpenAPI)

- Os hooks React Query (`@workspace/api-client-react`) e os schemas Zod
  (`@workspace/api-zod`) são **gerados** a partir do spec OpenAPI em `lib/api-spec`.
- Se você mudar o contrato de uma rota que está no spec, **atualize o spec e regenere**:
  ```bash
  pnpm --filter @workspace/api-spec run codegen
  ```
- **Não edite à mão** arquivos gerados — eles são sobrescritos.

---

## 7. Dependências e ambiente

- **Use `pnpm`.** `npm`/`yarn` são bloqueados pelo `preinstall`. Adicione deps no
  pacote certo (`pnpm --filter <pkg> add <dep>`), não na raiz.
- **`minimumReleaseAge: 1440`** no `pnpm-workspace.yaml` é defesa contra ataque de
  supply-chain. **NÃO desative** nem zere. Versões precisam ter ≥1 dia de publicadas.
- Respeite o **catalog** de versões (`catalog:`); não fixe versões conflitantes de
  React/Vite/etc. `react`/`react-dom` estão **pinados** (exigência do Expo).
- **Toda env nova deve ir para o [`.env.example`](.env.example)** com descrição.
  O código lê `process.env` direto (sem dotenv) — trate ausência com fallback seguro.

---

## 8. Comandos essenciais

```bash
# Desenvolvimento
pnpm --filter @workspace/api-server run dev      # API (porta 8080) — builda e sobe
pnpm --filter @workspace/sbc-agora  run dev      # Frontend (Vite, porta via PORT)

# Verificação (rode antes de entregar)
pnpm run typecheck                                # tudo (libs + artifacts)
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/sbc-agora  run typecheck
pnpm exec tsc -b lib/social-template              # recompila uma lib composta

# Build
pnpm run build                                    # typecheck + build de todos
pnpm --filter @workspace/api-server run build     # esbuild → dist/index.mjs
pnpm --filter @workspace/sbc-agora  run build     # Vite client + SSR

# Banco (dev)
pnpm --filter @workspace/db run push              # aplica schema (cuidado em prod)
pnpm --filter @workspace/db run generate          # gera migrations Drizzle

# API codegen
pnpm --filter @workspace/api-spec run codegen     # regenera hooks + zod
```

---

## 9. Armadilhas conhecidas (leia — já morderam antes)

1. **O frontend (`@workspace/sbc-agora`) NÃO builda no Windows nativo** (o binário
   `rollup-win32` é excluído de propósito no `pnpm-workspace.yaml`). No Windows,
   valide o frontend **só com `typecheck`**; o build real acontece no Docker/Linux.
   O **api-server usa esbuild e builda no Windows** normalmente.
2. **Libs `lib/*` são `composite`.** Se o typecheck do api-server reclamar de tipos
   de uma lib, **rode `pnpm exec tsc -b lib/<nome>` primeiro**.
3. **Drizzle ignora chaves snake_case** em `.set()`/insert (use camelCase — ver §4.4).
4. **Não inline base64 grande** em HTML/SSR/response — mata o LCP e não comprime.
5. **Não abra um Chromium por request** no render social — reutilize o browser quente.
6. **Editor e renderer social compartilham o MESMO código** (`@workspace/social-template`).
   Mudou o visual? Mude no pacote, não num dos dois lados.
7. Campos novos do template social (`elements` JSONB) devem ser **opcionais** →
   assim não exigem migração.
8. **Não troque `SESSION_SECRET`** (ver §5) — quebra todos os segredos criptografados.

---

## 10. Quando pedir ajuda / parar

Pare e peça confirmação antes de:
- Rodar migração **destrutiva** ou `db push` que possa perder dados.
- Trocar/rotacionar segredos, chaves ou `SESSION_SECRET`.
- Exclusão em massa (artigos, usuários, uploads).
- Mudar deploy, Dockerfile, Caddyfile ou variáveis de produção.
- Qualquer coisa que você não entende **por que** está do jeito que está.

**Resumo de uma linha:** faça a menor mudança correta, valide com `typecheck`,
preserve os caches/lazy/SSR/criptografia existentes, e nunca publique conteúdo
sem IA nem quebre a criptografia de segredos.
