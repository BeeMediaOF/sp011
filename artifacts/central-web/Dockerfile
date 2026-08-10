# syntax=docker/dockerfile:1
# Painel Central (React/Vite) — build estático servido via `vite preview`.
# Imagem glibc/x86_64 (não alpine), mesmo padrão do frontend do blog.

# ---- build ----
FROM --platform=linux/amd64 node:24-bookworm-slim AS build
RUN npm install -g pnpm@10.15.1
WORKDIR /app

# 1) Só os manifestos do workspace (camada cacheável). Mesmo padrão do
#    Dockerfile do blog e do api-server: com `COPY . .` antes do install,
#    QUALQUER mudança de código invalidava a camada e o monorepo inteiro era
#    reinstalado a cada build (95 s medidos na VPS em 2026-08-10).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY artifacts/api-server/package.json     artifacts/api-server/
COPY artifacts/brasilia-agora/package.json artifacts/brasilia-agora/
COPY artifacts/central-hub/package.json    artifacts/central-hub/
COPY artifacts/central-web/package.json    artifacts/central-web/
COPY artifacts/mockup-sandbox/package.json artifacts/mockup-sandbox/
COPY lib/api-client-react/package.json     lib/api-client-react/
COPY lib/api-spec/package.json             lib/api-spec/
COPY lib/api-zod/package.json              lib/api-zod/
COPY lib/central-db/package.json           lib/central-db/
COPY lib/db/package.json                   lib/db/
COPY lib/news-engine/package.json          lib/news-engine/
COPY lib/social-template/package.json      lib/social-template/
COPY scripts/package.json                  scripts/

# 2) Dependências (cacheado enquanto os manifestos não mudarem).
RUN pnpm install --frozen-lockfile

# 3) Código-fonte + build (só esta parte re-roda quando o código muda).
COPY . .
RUN pnpm --filter @workspace/central-web run build

# ---- runtime ----
FROM --platform=linux/amd64 node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV TZ=America/Sao_Paulo
RUN npm install -g pnpm@10.15.1
WORKDIR /app
# PRD-07: non-root (uid 1000). Serve estático, sem volume. O dono vem embutido
# na própria cópia: um `RUN chown -R /app` depois toca todos os arquivos e, no
# overlayfs, DUPLICA o /app inteiro numa camada nova — 307 s dos 1182 s do build
# na VPS (2026-08-10), a etapa mais cara de todas. Mesma correção que o
# Dockerfile do blog já tinha recebido.
COPY --from=build --chown=node:node /app /app
WORKDIR /app/artifacts/central-web
EXPOSE 3001
USER node
CMD ["pnpm", "run", "start"]
