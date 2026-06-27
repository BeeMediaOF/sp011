# SBC Agora — Visão Técnica Completa

> Portal de notícias brasileiro. Monorepo pnpm com frontend React/Vite e API Express 5 + PostgreSQL.
> Última atualização: junho 2026.

---

## 1. Estrutura do Monorepo

```
/
├── artifacts/
│   ├── brasilia-agora/      # Frontend React + Vite (@workspace/sbc-agora)
│   └── api-server/          # Backend Express 5 (@workspace/api-server)
├── lib/
│   ├── db/                  # Schema Drizzle + cliente Postgres (@workspace/db)
│   ├── api-spec/            # Spec OpenAPI + config Orval (@workspace/api-spec)
│   ├── api-client-react/    # React Query hooks gerados por Orval (@workspace/api-client-react)
│   └── api-zod/             # Schemas Zod gerados por Orval (@workspace/api-zod)
├── scripts/                 # Utilitários de linha de comando (@workspace/scripts)
├── pnpm-workspace.yaml      # Catalog de versões e overrides
├── tsconfig.base.json       # Defaults TypeScript strict compartilhados
└── tsconfig.json            # Solution file para libs compostas
```

### Proxy de roteamento (path-based)

| Caminho | Serviço | Porta local |
|---------|---------|-------------|
| `/api`  | API Server | 8080 |
| `/`     | Frontend (Vite / static em produção) | 22613 |

---

## 2. Stack Tecnológico

### Backend (`artifacts/api-server`)
| Camada | Tecnologia |
|--------|-----------|
| Runtime | Node.js 24, TypeScript 5.9 |
| Framework | Express 5 |
| ORM | Drizzle ORM |
| Banco | PostgreSQL (Supabase) |
| Logger | Pino + pino-http (estruturado JSON) |
| Auth | HMAC-SHA256 bearer token (scrypt para senhas) |
| 2FA | TOTP via otplib v13 |
| AI | Google Gemini (`@google/genai`) com rodízio de chaves |
| RSS | `rss-parser` + `cheerio` |
| Imagens | `sharp` (resize + WebP/AVIF) |
| Push | Web Push VAPID (`web-push`) |
| Social | Meta Graph API (Facebook/Instagram) |
| Cron | `node-cron` |
| Upload | `multer` → Supabase Storage (REST API) / fallback disco (dev) |
| Build | esbuild (bundle CJS → `dist/index.mjs`) |

### Frontend (`artifacts/brasilia-agora`)
| Camada | Tecnologia |
|--------|-----------|
| Framework | React 18 + Vite 7 |
| Roteamento | Wouter 3 |
| Estado remoto | TanStack Query v5 |
| UI base | Radix UI (primitivos acessíveis) |
| Estilização | Tailwind CSS 4 + tw-animate-css |
| Editor rich text | Tiptap 2 (StarterKit, Link, Image, YouTube, Placeholder) |
| Formulários | React Hook Form + Zod |
| Gráficos | Recharts |
| Fontes | Merriweather (títulos serif) + Inter (corpo) |
| Paleta | `#1a1a1a` (texto) · `#c8102e` (vermelho SBC) · `#0b3d91` (azul) |

---

## 3. Banco de Dados

### Tabelas e campos principais

#### `articles`
```
id (PK text) · title · subtitle · content (HTML) · category · tag
imageUrl · author · publishedAt · status (draft|published)
origin (manual|rss|perplexity) · rssSourceId · rssSourceName · rssSourceUrl
aiRewritten · slug · keywords · draftReason · canonicalUrl
createdAt · updatedAt
```
Índices: `slug`, `status`, `category`, `publishedAt`

#### `users`
```
id (PK serial) · name · email (unique) · passwordHash (scrypt)
role (admin|editor) · twoFactorSecret · twoFactorEnabled
failedLoginAttempts · lockedUntil · mustChangePassword
avatarBase64 · lastLogin · lastSeenAt · createdAt · updatedAt
```

#### `ads`
```
id · name · imageBase64 · imageUrl · link · active
clicks · impressions · targetDevices · expiresAt · createdAt
```

#### `rss_sources`
```
id · name · url · category · active
scheduleHours · fetchLimit · giveCredit
autoMode (none|draft|published) · lastFetchedAt · customPrompt
```

#### `analytics_events`
```
id (serial) · path · title · category · articleId · sessionId
duration · scrollDepth · platform · ua · referrer
city · region · ts
```

#### `push_subscriptions`
```
id · endpoint (unique) · p256dh · auth · createdAt
```

#### `social_accounts`
```
id · name · metaAppId · metaAppSecret
pageId · pageName · instagramId · instagramName
accessToken · tokenExpiresAt · isActive · createdAt
```

#### `social_publication_queue`
```
id · articleId · socialAccountId · templateId
type (feed|story|reel) · status (pending|published|failed)
caption · scheduledAt · publishedAt · metaPostId
errorMessage · retryCount · createdAt
```

#### Outras tabelas
- `login_attempts` — log de tentativas de login por IP
- `permissions` — permissões granulares por editor
- `contact_messages` — mensagens do formulário de contato
- `rss_event_logs` — histórico de fetches RSS por fonte
- `endpoint_rate_limits` — estado de rate limiting por endpoint/IP
- `article_views` — contagem de views por artigo
- `category_views` — views agregadas por categoria
- `geo_stats` — estatísticas geográficas de acesso
- `perplexity_topics` — tópicos agendados para busca Perplexity
- `social_templates` — templates de publicação social
- `ad_daily_stats` — impressões/clicks diários por anúncio
- `behavior_events` — eventos de comportamento (scroll, tempo na página)
- `settings` — configurações globais do portal (JSON)

---

## 4. API Server — Rotas

Todas as rotas vivem sob o prefixo `/api`. Auth via `Authorization: Bearer <token>`.

### Autenticação (`/api/admin`)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/admin/login` | — | Login com e-mail + senha; retorna token 8h ou flag `requires2fa` |
| POST | `/admin/2fa/login` | — | Segunda etapa TOTP; retorna token 8h |
| POST | `/admin/2fa/setup` | ✓ | Gera secret TOTP + QR code |
| POST | `/admin/2fa/verify` | ✓ | Ativa 2FA após verificar código |
| POST | `/admin/2fa/disable` | ✓ | Desativa 2FA |
| GET  | `/admin/2fa/status` | ✓ | Retorna se 2FA está ativo |
| GET  | `/admin/me` | ✓ | Perfil do usuário autenticado |
| PUT  | `/admin/me` | ✓ | Atualiza nome/avatar/senha do perfil |
| POST | `/admin/logout` | ✓ | Invalida sessão |

### Artigos — Admin (`/api/admin/articles`)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET  | `/admin/articles` | ✓ | Lista todos os artigos (sem filtro de status) |
| GET  | `/admin/articles/:id` | ✓ | Artigo por ID ou slug |
| POST | `/admin/articles` | ✓ | Cria artigo |
| PUT  | `/admin/articles/:id` | ✓ | Atualiza artigo |
| DELETE | `/admin/articles/:id` | ✓ | Exclui artigo |
| POST | `/admin/articles/:id/rewrite` | ✓ | Enfileira reescrita IA |
| POST | `/admin/articles/autofill` | ✓ | Extrai artigo de URL externa + reescreve via IA |
| POST | `/admin/articles/article-from-url` | ✓ | Cria artigo a partir de URL |
| POST | `/admin/publish/:id` | ✓ | Publica artigo específico |
| POST | `/admin/bulk-publish` | ✓ | Publica todos os drafts |
| POST | `/admin/articles/repair-content` | ✓ | Repara conteúdo ilegível |
| POST | `/admin/articles/delete-invalid` | ✓ | Exclui artigos com conteúdo inválido |
| POST | `/admin/articles/migrate-json-content` | ✓ | Repara blobs JSON/fence em massa |
| POST | `/admin/ai-seo` | ✓ | Gera metadados SEO via IA |

### Artigos — Público (`/api/articles`)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/articles` | Lista artigos publicados (com filtros: category, limit, offset, q) |
| GET | `/articles/categories` | Contagem por categoria |
| GET | `/articles/:id` | Artigo por ID ou slug |
| GET | `/articles/:id/relacionados` | Artigos relacionados |

### Configurações do Portal (`/api/admin`)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET  | `/admin/settings` | Configurações globais |
| PUT  | `/admin/settings` | Atualiza configurações (Gemini keys, VAPID, etc.) |
| GET  | `/admin/ai-quota` | Status de quota IA (tokens restantes) |
| POST | `/admin/logo` | Upload de logotipo (base64) |
| GET/PUT | `/admin/menu` | Menu de navegação do portal |
| GET/PUT | `/admin/contact` | Configurações da página de contato |

### RSS (`/api/admin/rss`)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET  | `/admin/rss` | Lista fontes RSS |
| POST | `/admin/rss` | Adiciona fonte |
| PUT  | `/admin/rss/:id` | Atualiza fonte |
| DELETE | `/admin/rss/:id` | Remove fonte |
| POST | `/admin/rss/:id/fetch` | Fetch imediato de uma fonte |
| POST | `/admin/rss/fetch-all` | Fetch de todas as fontes ativas |

### Fila de Reescrita (`/api/admin/queue`)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET  | `/admin/queue/status` | Status da fila (tamanho, pausada, histórico) |
| POST | `/admin/queue/pause` | Pausa processamento |
| POST | `/admin/queue/resume` | Retoma processamento |
| POST | `/admin/queue/process-drafts` | Força varredura de drafts pendentes |

### Usuários e Permissões (`/api/admin/users`, `/api/admin/permissions`)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST | `/admin/users` | Lista / cria usuário |
| GET/PUT/DELETE | `/admin/users/:id` | Lê / atualiza / exclui |
| PUT  | `/admin/users/:id/password` | Redefine senha |
| GET  | `/admin/permissions` | Lista permissões granulares |
| GET  | `/admin/permissions/me` | Permissões do usuário atual |
| PUT  | `/admin/permissions/:key` | Atualiza permissão |

### Social Media (`/api/admin/social`)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET  | `/admin/social/config` | Configurações globais de social |
| POST | `/admin/social/config` | Salva configurações |
| POST | `/admin/social/publish/:articleId` | Publica artigo em redes sociais |
| GET/POST/PUT/DELETE | `/admin/social/accounts` | CRUD de contas Meta/Instagram |
| POST | `/admin/social/accounts/:id/test` | Testa conexão da conta |
| GET/POST/PUT/DELETE | `/admin/social/templates` | CRUD de templates de post |
| POST | `/admin/social/templates/:id/preview` | Preview de template |
| GET  | `/admin/social/image/:token` | Imagem de arte gerada para post social |

### Anúncios — Admin (`/api/admin/ads`)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST | `/admin/ads` | Lista / cria anúncio |
| GET/PUT/DELETE | `/admin/ads/:id` | Lê / atualiza / exclui |

### Anúncios — Público (`/api/ads`)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/ads` | Lista anúncios ativos |
| GET | `/ads/:id/image` | Imagem do anúncio |
| POST | `/ads/:id/click` | Registra clique |
| POST | `/ads/:id/impression` | Registra impressão |

### Perplexity IA (`/api/admin/perplexity`)

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/admin/perplexity/search` | Busca + extrai artigo via Perplexity |
| POST | `/admin/perplexity/rewrite` | Reescreve via Gemini |
| POST | `/admin/perplexity/publish` | Publica artigo Perplexity |
| GET/POST | `/admin/perplexity/topics` | CRUD de tópicos agendados |
| PATCH/DELETE | `/admin/perplexity/topics/:id` | Atualiza / remove tópico |
| POST | `/admin/perplexity/topics/:id/run` | Executa tópico imediatamente |

### Web Push (`/api/push`)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET  | `/push/vapid-public-key` | Chave pública VAPID |
| POST | `/push/subscribe` | Registra subscription |
| DELETE | `/push/unsubscribe` | Remove subscription |

### Analytics (`/api/analytics`)

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/analytics/event` | Registra pageview |
| POST | `/analytics/behavior` | Registra evento de comportamento (scroll, tempo) |
| GET  | `/analytics/stats` | Estatísticas agregadas (admin) |
| GET  | `/admin/realtime-stats` | Stats em tempo real |

### Outras Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| GET  | `/healthz` | Health check |
| GET  | `/sitemap.xml` | Sitemap geral |
| GET  | `/sitemap-news.xml` | Google News sitemap (últimas 48h) |
| GET  | `/amp/artigos/:slug` | Versão AMP do artigo |
| GET  | `/image` | Proxy de imagens (sharp + LRU + cache disco) |
| POST | `/uploads/image` | Upload de imagem (admin) |
| POST | `/uploads/media` | Upload de mídia (admin) |
| GET  | `/uploads/:filename` | Serve arquivo enviado |
| POST | `/publish` | Webhook de publicação via chave de API |
| POST | `/publish/:id` | Webhook de publicação de artigo específico |
| GET  | `/admin/webhook-key` | Chave de webhook |
| PUT  | `/admin/webhook-key` | Rotaciona chave de webhook |
| GET  | `/quotes` | Cotações financeiras (BRL/USD, BRL/EUR, Ibovespa, BTC) |
| POST | `/messages` | Formulário de contato (público) |
| GET  | `/messages/admin` | Lista mensagens recebidas (admin) |
| PUT  | `/messages/admin/:id/read` | Marca mensagem como lida |
| GET  | `/admin/logs` | Logs de eventos do sistema (admin) |
| GET  | `/admin/rss-logs` | Log de eventos RSS (admin) |
| GET  | `/columnists` | Lista colunistas (público) |
| GET  | `/columnists/:id` | Colunista por ID (público) |
| GET  | `/admin/columnists` | Lista colunistas (admin) |
| POST/PUT/DELETE | `/admin/columnists` | CRUD de colunistas |

---

## 5. Módulos da API (lib/)

### `lib/rewriteQueue.ts` — Fila de reescrita IA

Gerencia a reescrita assíncrona de artigos com Google Gemini.

- **Configuração:** `MAX_CONCURRENCY=9`, `MAX_ATTEMPTS=3`, `PROCESS_INTERVAL=7s`, `SWEEP_INTERVAL=5min`
- **`enqueueRewrite(item)`** — adiciona ao fim da fila
- **`enqueueRewriteFront(item)`** — prioridade máxima (adiciona ao início)
- **`getQueueStats()`** — status da fila (tamanho, histórico, quota IA)
- **`pauseQueue()` / `resumeQueue()`** — controle de processamento
- **Recovery pass:** após reescrita, se o conteúdo retornar como JSON bruto (blob com `{` ou `` ` ``), aplica `extractFromRawAI()` para recuperar `content_html` antes de salvar
- **Qualidade gate:** conteúdo ilegível após recuperação → artigo deletado automaticamente
- **`isContentRenderable(content)`** — verifica se o HTML é legível
- **Histórico:** mantém os últimos 30 resultados em memória

### `lib/rssProcessor.ts` — Processador RSS

- Busca e parseia feeds RSS via `rss-parser`
- Filtra por palavras-chave proibidas, duplicatas (título + URL + imagem)
- Cria artigo draft no banco e enfileira reescrita via `rewriteQueue`
- Suporta `autoMode`: `none` (só draft) · `draft` · `published`
- Mapeamento de categorias via `TAG_MAP`
- Rodízio de chaves Gemini: `getGeminiKeys()` + `pickKey()` + `callGeminiWithRotation()`
- Prompt padrão SEO jornalístico configurável por fonte

### `lib/scheduler.ts` — Agendador global

- **RSS check:** a cada 20 min, processa fontes com `scheduleHours` vencido
- **Perplexity check:** verifica tópicos agendados pendentes
- **Log retention cron:** limpa logs antigos periodicamente
- Cada verificação é idempotente e tolerante a falhas

### `lib/migrateJsonContent.ts` — Migração de startup

Executada automaticamente no boot, antes do cron social. Idempotente.

- Query direta no DB (sem cache, sem filtro de status)
- Detecta: conteúdo que após `.trim()` começa com `` ` ``\`\` `` ou `{`
- Remove cercas, tenta `JSON.parse`, fallback regex para JSON truncado
- Extrai: `content_html` / `contentHtml` / `content` + `title` / `subtitle` / `keywords` / `slug`
- Falha individual: loga o slug e **continua** (não deleta, não trava o lote)
- Log final: `Migration: JSON-content repair complete { fixed, failed, skipped, total, remainingBroken }`

### `lib/articleService.ts` — Serviço de artigos

- Cache em memória de 30s (bust automático em toda escrita)
- `getArticles()` — todos os artigos sem limite (ordered by `createdAt DESC`)
- `getPendingRewrites(limit=50)` — drafts sem `aiRewritten`
- `getArticle(idOrSlug)` — por ID ou slug
- `createArticle()` / `updateArticle()` / `deleteArticle()`
- `isDuplicateArticle(title, rssSourceUrl, imageUrl)` — deduplicação
- `migrateFromStore([])` — migração one-shot de legado `store.json` → DB

### `lib/social/queueProcessor.ts` — Publicação Social

- **`startSocialCron()`** — cron a cada 5 min processando a fila `social_publication_queue`
- **`processSocialQueue(limit=5)`** — publica artigos pendentes na Meta API
- **Arte de post:** imagem gerada com `sharp` + SVG (título, logo, categoria, chapéu colorido)
- **Templates:** substituição de variáveis `{{title}}`, `{{subtitle}}`, `{{url}}`
- **HMAC token:** `imageGenerator.ts` gera token seguro para servir a imagem temporária
- Suporte a Facebook Feed e Instagram (Graph API `/{page}/photos` e `/{ig}/media`)

### `lib/audit.ts` — Logs de auditoria

- Registra ações administrativas sensíveis com usuário, IP, timestamp e payload
- Consumido por `/api/admin/logs`

### `lib/store.ts` — Store persistida

- Configurações globais em PostgreSQL (tabela `settings`)
- `getSettings()` — lê configurações (Gemini keys, VAPID, social config, etc.)
- `saveSettings(partial)` — merge + persistência
- `seedDefaultRssSources()` — popula ~69 fontes RSS padrão se banco vazio

### `lib/seed.ts` — Seed de usuário admin

- Cria usuário `admin@sbcagora.com.br` se não existir
- Senha padrão via `ADMIN_DEFAULT_PASSWORD` env (fallback fraco com aviso em log)

### `lib/mailer.ts` — Envio de e-mail

- Integração com serviço de e-mail para notificações de contato

### `lib/brand.ts` — Configurações de marca

- Retorna nome, logo e cores do portal para uso nas rotas

### `lib/perplexitySearch.ts` — Busca Perplexity

- Integra com API Perplexity para geração de artigos a partir de tópicos

---

## 6. Middlewares

### `middlewares/auth.ts`

- **Algoritmo:** HMAC-SHA256 sobre payload `userId:role:exp` com `SESSION_SECRET`
- **TTL:** 8 horas por token
- **`authMiddleware`** — valida Bearer token; injeta `req.user = { id, role }`
- **Proteção de produção:** se `NODE_ENV=production` e `SESSION_SECRET` não configurado → crash imediato
- **Lockout:** após N tentativas falhas, conta bloqueada por `lockedUntil`
- **Senha:** scrypt (N=16384, r=8, p=1, keylen=64) + salt aleatório
- **CAPTCHA matemático:** ativado após 3 falhas consecutivas de login
- **Rate limiting de login:** via tabela `login_attempts`

### `middlewares/permissions.ts`

- **`requireAdmin`** — rejeita não-administradores
- **`requirePermission(key)`** — verifica permissão granular via tabela `permissions`
- Cache de permissões em memória com TTL curto

### `middlewares/endpointRateLimit.ts`

- Rate limiting por endpoint/IP via tabela `endpoint_rate_limits`
- Configurável por rota (publish webhook: mais restrito)

---

## 7. Proxy de Imagens (`/api/image`)

- **Parâmetros:** `url` (allowlisted), `w` (width, max 1200), `q` (quality 1-100), `f` (webp|avif)
- **Cache:** LRU em memória + disco (`/tmp/img-cache/`) com chave hash
- **Request coalescing:** múltiplas requisições simultâneas para a mesma URL compartilham um único fetch upstream
- **Headers por domínio:**
  - `agenciabrasil.ebc.com.br` / `imagens.ebc.com.br` → UA Googlebot + Referer EBC (fix 403)
  - Demais → `Mozilla/5.0 (compatible; SBCAgora/2.0)`
- **Fallback:** quando upstream falha (403, 404, timeout), retorna SVG placeholder "Imagem indisponível" convertido para WebP com cache de 5min (nunca retorna 502)
- **Pré-aquecimento:** no startup, processa as 40 imagens mais recentes em widths 480 e 768
- **effort:1** no sharp (latência ~50ms vs ~200ms com padrão 4, diferença de tamanho <5%)
- **HMAC de validação:** `metroimg` assina path completo da URL para evitar hotlink abuse

---

## 8. Frontend — Páginas Públicas

| Rota | Componente | Descrição |
|------|-----------|-----------|
| `/` | `Home.tsx` | Home com hero, destaques, blocos por editoria |
| `/artigo/:slug` | `Artigo.tsx` | Artigo completo com SEO, OG, AMP link, artigos relacionados |
| `/politica` | `Politica.tsx` | Editoria Política |
| `/cidade` | `Cidade.tsx` | Editoria Cidade |
| `/seguranca` | `Seguranca.tsx` | Editoria Segurança |
| `/transporte` | `Transporte.tsx` | Editoria Transporte |
| `/saude` | `Saude.tsx` | Editoria Saúde |
| `/educacao` | `Educacao.tsx` | Editoria Educação |
| `/cultura` | `Cultura.tsx` | Editoria Cultura |
| `/esportes` | `Esportes.tsx` | Editoria Esportes |
| `/economia` | `Economia.tsx` | Editoria Economia |
| `/tecnologia` | `Tecnologia.tsx` | Editoria Tecnologia |
| `/brasil` | `Brasil.tsx` | Editoria Brasil |
| `/mundo` | `Mundo.tsx` | Editoria Mundo |
| `/colunas` | `Colunas.tsx` | Colunistas |
| `/contato` | `Contato.tsx` | Formulário de contato |
| `/privacidade` | `Privacidade.tsx` | Política de privacidade |
| `/termos` | `Termos.tsx` | Termos de uso |

### Componentes de layout e conteúdo

| Componente | Função |
|-----------|--------|
| `Header.tsx` + `NavBar.tsx` + `TopBar.tsx` | Cabeçalho com menu, busca, ticker de cotações |
| `HeroSection.tsx` | Hero principal (60/38 split desktop) |
| `SectionBlock.tsx` e variantes | Blocos editoriais (manchete, duplo destaque, lista, cultura, featured) |
| `NewsCard.tsx` + `ArticleCard.tsx` | Cards de notícia com chapéu colorido por editoria |
| `ArtigosRelacionados.tsx` | Artigos relacionados na página de artigo |
| `LazyImage.tsx` | Imagens com lazy loading + skeleton + fallback |
| `SEOHead.tsx` | Injeção de meta tags, OG, Twitter Cards, canonical, hreflang |
| `Footer.tsx` | Rodapé com newsletter inline (input + botão OK) + 4 colunas de links |
| `AdBanner.tsx` e família | 8 slots de anúncio (sidebar, in-feed, in-content, sticky bottom, native, central, between) com skeleton para CLS = 0 |
| `PushSubscribeButton.tsx` | Inscrição em notificações Web Push |
| `LGPDConsent.tsx` | Banner LGPD |
| `CotacaoWidget.tsx` | Widget de cotações financeiras |
| `MaisLidasSection.tsx` | Seção de artigos mais lidos |

---

## 9. Admin Panel (`/admin`)

### Páginas

| Rota | Página | Função |
|------|--------|--------|
| `/admin` | `Dashboard.tsx` | Métricas, artigos recentes, status da fila |
| `/admin/artigos` | `Articles.tsx` | Listagem, busca, filtros, publicação em massa |
| `/admin/artigos/:id` | `ArticleEdit.tsx` | Editor completo (Tiptap) com autofill de URL |
| `/admin/artigos/novo` | `ArticleEdit.tsx` | Novo artigo |
| `/admin/rss` | `RSSManager.tsx` | Gerenciamento de fontes RSS |
| `/admin/maquina-artigos` | `MaquinaArtigos.tsx` | Fila de reescrita IA (status, pausa, histórico) |
| `/admin/social` | `SocialMedia.tsx` | Contas Meta/Instagram, templates, fila de publicação |
| `/admin/propagandas` | `AdsManager.tsx` | CRUD de anúncios, estatísticas de clicks/impressões |
| `/admin/analytics` | `Analytics.tsx` | Gráficos de pageviews, sessões, categorias, geografico |
| `/admin/colunistas` | `ColumnistsManager.tsx` | CRUD de colunistas |
| `/admin/usuarios` | `UsersManager.tsx` | CRUD de usuários e roles |
| `/admin/permissoes` | `EditorPermissions.tsx` | Permissões granulares por editor |
| `/admin/configuracoes` | `Settings.tsx` | Gemini keys, VAPID, configurações gerais |
| `/admin/settings` | `Settings.tsx` | Alias de configurações |
| `/admin/logo` | `LogoUpload.tsx` | Upload de logotipo |
| `/admin/home-blocos` | `HomeBlocksManager.tsx` | Ordenação dos blocos da homepage |
| `/admin/menu` | `MenuManager.tsx` | Estrutura do menu de navegação |
| `/admin/contato` | `ContactSettings.tsx` | Configurações da página de contato |
| `/admin/logs` | `Logs.tsx` | Logs de sistema e auditoria |
| `/admin/seguranca` | `SecurityCheckup.tsx` | Resumo de segurança, tentativas de login, audit trail |
| `/admin/2fa-setup` | `TwoFactorSetup.tsx` | Configuração TOTP 2FA com QR Code |
| `/admin/webhook` | `Webhook.tsx` | Chave de webhook, documentação da API |
| `/admin/login` | `Login.tsx` | Login com CAPTCHA matemático pós-3-falhas |
| `/admin/perplexity` | `PerplexitySearch.tsx` | Busca e publicação via Perplexity IA |

### Editor Rich Text

O editor de artigos usa **Tiptap 2** com extensões:
- StarterKit (bold, italic, headings, lists, blockquote, code)
- Link (com abertura em nova aba)
- Image (com upload direto)
- YouTube embed
- Placeholder

---

## 10. Fluxos Principais

### Fluxo RSS → Artigo Publicado

```
scheduler (20min)
  └─ rssProcessor.fetchSource(rssSource)
       ├─ rss-parser.parseURL()
       ├─ filtragem de duplicatas (isDuplicateArticle)
       ├─ articleService.createArticle({ status: "draft" })
       └─ rewriteQueue.enqueueRewrite(item)
            └─ rewriteQueue.processItem()
                 ├─ rssProcessor.rewriteWithAI(title, text, ...)
                 │    └─ callGeminiWithRotation(keys, model, prompt)
                 ├─ extractFromRawAI() ← recovery pass se JSON bruto
                 ├─ isContentRenderable() ← quality gate
                 ├─ articleService.updateArticle({ content, status })
                 └─ articleService.deleteArticle() ← se ilegível
```

### Fluxo de Publicação Social

```
admin → POST /admin/social/publish/:articleId
  └─ social_publication_queue INSERT (status: pending)
       └─ socialCron (5min)
            └─ processSocialQueue()
                 ├─ imageGenerator.generateSocialArt(article) → sharp+SVG → Buffer
                 ├─ saveTempImage(buf) → token HMAC
                 ├─ Meta Graph API → POST /{page}/photos
                 │    body: imageUrl = /admin/social/image/:token
                 └─ social_publication_queue UPDATE (status: published|failed)
```

### Migração de Conteúdo no Startup

```
index.ts (boot)
  └─ migrateJsonContent()
       ├─ db.select() ← sem cache, sem filtro
       ├─ para cada artigo:
       │    ├─ trim() → detecta ``` ou {
       │    ├─ stripFences() → remove cercas markdown
       │    ├─ JSON.parse() → extrai content_html, title, subtitle
       │    ├─ fallback regex → JSON truncado
       │    └─ db.update(articlesTable) .set({ content, title, ... })
       └─ logger.info({ fixed, failed, skipped, total, remainingBroken })
```

---

## 11. Segurança

| Mecanismo | Implementação |
|----------|--------------|
| Senhas | scrypt (N=16384, r=8, p=1, keylen=64) + salt 16 bytes |
| Tokens | HMAC-SHA256 (SESSION_SECRET) + payload `userId:role:exp` |
| TTL de token | 8 horas |
| 2FA | TOTP (RFC 6238) via otplib v13 — `generateSecret` + `verifySync` + `generateURI` |
| CAPTCHA | Matemático (a + b = ?) ativado após 3 falhas de login |
| Lockout | Conta bloqueada por `lockedUntil` após tentativas excessivas |
| Crash em produção | `SESSION_SECRET` não configurado → processo encerra imediatamente |
| Rate limiting | Por endpoint/IP, estado no PostgreSQL |
| Helmet | Headers HTTP de segurança (CSP, HSTS, X-Frame, etc.) |
| CORS | Configurado explicitamente |
| Uploads | Validação de MIME type + tamanho; Supabase Storage (REST) ou disco em dev |
| Webhook | Chave rotacionável; autenticação obrigatória |
| Logs | Auditoria de ações administrativas com usuário, IP e timestamp |

---

## 12. SEO e Indexação

| Feature | Implementação |
|---------|--------------|
| Meta tags | `SEOHead.tsx` — title, description, keywords, OG, Twitter Cards |
| OG dinâmico | `/api/site/og/:slug` — gera imagem OG com sharp+SVG |
| Canonical | Campo `canonicalUrl` no artigo; injetado no `<head>` |
| hreflang | `<link rel="alternate" hreflang="pt-BR">` em todos os artigos |
| AMP | `/amp/artigos/:slug` — versão AMP válida com estilos inline |
| Sitemap geral | `/sitemap.xml` — todos os artigos publicados |
| Google News Sitemap | `/sitemap-news.xml` — artigos das últimas 48h com `<news:news>` |

---

## 13. Variáveis de Ambiente

> Fonte de verdade: [`.env.example`](.env.example). O app lê `process.env` diretamente
> (**sem dotenv**) — na VPS, injete o arquivo via `node --env-file=.env`.

| Variável | Obrigatória | Descrição |
|----------|------------|-----------|
| `SUPABASE_DATABASE_URL` | ✅ | Connection string do Postgres no Supabase (Session Pooler). Tem prioridade sobre `DATABASE_URL`. |
| `DATABASE_URL` | — | Fallback da connection string, se `SUPABASE_DATABASE_URL` ausente |
| `SESSION_SECRET` | ✅ prod | Segredo HMAC para tokens (o app não sobe sem, em produção) |
| `PORT` | ✅ | Porta da API (8080) |
| `NODE_ENV` | — | `production` na VPS |
| `SUPABASE_URL` | ✅ prod | URL do projeto Supabase (uploads) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ prod | service_role key (uploads server-side); sem ela, uploads = 503 |
| `SUPABASE_STORAGE_BUCKET` | — | Bucket de uploads (default `uploads`) |
| `APP_URL` / `SITE_URL` | — | URL pública (links sociais, e-mails) |
| `ALLOWED_ORIGINS` | — | Origens permitidas no CORS (separadas por vírgula) |
| `GEMINI_API_KEY` | — | Chave Gemini direta (modo `gemini_direct`) |
| `PERPLEXITY_API_KEY` | — | Chave da API Perplexity |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | — | Web Push |
| `SMTP_HOST/PORT/USER/PASS/FROM` | — | Envio de e-mail |
| `ADMIN_DEFAULT_EMAIL` / `ADMIN_DEFAULT_PASSWORD` | — | Seed do admin inicial |
| `WEBHOOK_API_KEY` | — | Chave de webhook (complementa a key em settings) |

---

## 14. Comandos de Operação

```bash
# Desenvolvimento
pnpm --filter @workspace/api-server run dev      # API server (porta 8080)
pnpm --filter @workspace/sbc-agora run dev       # Frontend (porta 22613)

# Verificação de tipos
pnpm run typecheck                                # Full: libs + artifacts
pnpm run typecheck:libs                          # Só libs compostas
pnpm --filter @workspace/api-server run typecheck

# Build
pnpm run build                                   # typecheck + build todos
pnpm --filter @workspace/api-server run build    # Build API (esbuild → dist/)

# Banco de dados
pnpm --filter @workspace/db run push             # Aplica schema no banco dev
pnpm --filter @workspace/db run generate         # Gera migrations Drizzle

# Codegen OpenAPI
pnpm --filter @workspace/api-spec run codegen    # Regenera hooks React Query + Zod schemas
```

---

## 15. Libs Compartilhadas

| Pacote | Conteúdo |
|--------|---------|
| `@workspace/db` | Cliente Drizzle, schema de todas as tabelas, tipos inferidos |
| `@workspace/api-spec` | OpenAPI spec YAML + config Orval |
| `@workspace/api-client-react` | React Query hooks gerados (`useGetArticles`, `useGetAdminArticles`, etc.) |
| `@workspace/api-zod` | Schemas Zod gerados para validação de request/response |

---

*Gerado automaticamente a partir do estado do repositório em junho 2026.*
