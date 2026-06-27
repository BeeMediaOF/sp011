# syntax=docker/dockerfile:1
# Frontend (React/Vite) — build estático (→ dist/public) e execução via
# `vite preview`, necessário para o prerender de Open Graph (preview de links
# no WhatsApp/Facebook). Imagem glibc/x86_64 (não alpine).

# ---- build ----
FROM --platform=linux/amd64 node:24-bookworm-slim AS build
RUN npm install -g pnpm@10.15.1
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# PORT e BASE_PATH são exigidos pelo vite.config.ts já no build.
RUN BASE_PATH=/ PORT=3000 API_URL=http://api:8080 \
    pnpm --filter @workspace/sbc-agora run build

# ---- runtime ----
FROM --platform=linux/amd64 node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV BASE_PATH=/
ENV API_URL=http://api:8080
RUN npm install -g pnpm@10.15.1
WORKDIR /app
COPY --from=build /app /app
WORKDIR /app/artifacts/brasilia-agora
EXPOSE 3000
# `serve` = vite preview --host 0.0.0.0 (lê PORT/BASE_PATH/API_URL do ambiente)
CMD ["pnpm", "run", "serve"]
