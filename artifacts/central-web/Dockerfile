# syntax=docker/dockerfile:1
# Painel Central (React/Vite) — build estático servido via `vite preview`.
# Imagem glibc/x86_64 (não alpine), mesmo padrão do frontend do blog.

# ---- build ----
FROM --platform=linux/amd64 node:24-bookworm-slim AS build
RUN npm install -g pnpm@10.15.1
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/central-web run build

# ---- runtime ----
FROM --platform=linux/amd64 node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV TZ=America/Sao_Paulo
RUN npm install -g pnpm@10.15.1
WORKDIR /app
COPY --from=build /app /app
WORKDIR /app/artifacts/central-web
EXPOSE 3001
# PRD-07: non-root (uid 1000). Serve estático, sem volume.
RUN chown -R node:node /app
USER node
CMD ["pnpm", "run", "start"]
