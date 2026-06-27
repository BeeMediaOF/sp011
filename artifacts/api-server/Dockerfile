# syntax=docker/dockerfile:1
# API (Express) — build com esbuild (→ dist/index.mjs), runtime Node 24.
# Imagem glibc (Debian "bookworm-slim"), NÃO alpine: o pnpm-workspace.yaml
# exclui os binários musl (rollup/lightningcss/@tailwindcss/oxide) e mantém
# apenas linux-x64 glibc. Em alpine o build/runtime quebraria.

# ---- build ----
FROM --platform=linux/amd64 node:24-bookworm-slim AS build
RUN npm install -g pnpm@10.15.1
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-server run build

# ---- runtime ----
FROM --platform=linux/amd64 node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app
# Copia o workspace já buildado (inclui node_modules com sharp e os pacotes
# externalizados pelo esbuild, resolvidos via symlinks do pnpm).
COPY --from=build /app /app
WORKDIR /app/artifacts/api-server
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
