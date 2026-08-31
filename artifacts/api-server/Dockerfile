# syntax=docker/dockerfile:1
# API (Express) — build com esbuild (→ dist/index.mjs), runtime Node 24.
# Imagem glibc (Debian "bookworm-slim"), NÃO alpine: o pnpm-workspace.yaml
# exclui os binários musl (rollup/lightningcss/@tailwindcss/oxide) e mantém
# apenas linux-x64 glibc. Em alpine o build/runtime quebraria.
#
# O renderizador de arte social usa Playwright (Chromium headless) para gerar
# as imagens 1080×N a partir do HTML do template. O Chromium é baixado no build
# (em /ms-playwright) e copiado para o runtime, onde instalamos as dependências
# de SO + fontes de fallback.
#
# Cache de camadas, a regra dos DOIS stages: tudo que não depende do código vem
# antes do código. No build são os manifestos (package.json/lockfile) ANTES do
# `pnpm install` + `playwright install`; no runtime é o `apt-get` das libs de SO
# ANTES do `COPY /app`. Assim, mudança só de código não reinstala dependência,
# não re-baixa o Chromium (~113 MB) e não refaz o apt (846 s medidos).

# ---- build ----
FROM --platform=linux/amd64 node:24-bookworm-slim AS build
RUN npm install -g pnpm@10.15.1
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# 1) Só os manifestos do workspace (camada cacheável).
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

# 2) Dependências + Chromium (cacheado enquanto os manifestos não mudarem).
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-server exec playwright install chromium

# 3) Código-fonte + build (só esta parte re-roda quando o código muda).
COPY . .
RUN pnpm --filter @workspace/api-server run build

# ---- runtime ----
FROM --platform=linux/amd64 node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=8080
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# ── Tudo que NÃO depende do código vem primeiro (prefixo cacheável) ──────────
#
# Estas duas camadas ficavam DEPOIS do `COPY /app`, e por isso eram refeitas a
# cada commit: só o apt-get custava 846 s por build (medido em 2026-08-31). Uma
# camada RUN herda o cache da anterior, então bastava um caractere mudar no
# código para reinstalar as libs do Chromium do zero. Subindo-as para cá, elas
# passam a depender só da imagem base e da VERSÃO do Playwright — e um build de
# código puro nunca mais paga por elas.
#
# A versão é FIXA de propósito: o `install-deps` precisa do CLI do Playwright, e
# antes ele vinha do /app (que muda a cada commit — era essa a amarra). Aqui o
# CLI é baixado pelo npx, então esta linha TEM que acompanhar o `playwright` de
# artifacts/api-server/package.json (hoje 1.61.1, travado no pnpm-lock.yaml).
# Versão errada aqui instala a lista de libs de outra release: o container sobe
# e só a arte social quebra, em runtime.
RUN apt-get update \
  && npx --yes playwright@1.61.1 install-deps chromium \
  && apt-get install -y --no-install-recommends fonts-liberation fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/* /root/.npm

# PRD-07: roda como non-root (uid 1000, usuário `node` da imagem base) para
# reduzir o raio de escape (AP-11). /data (uploads + db-config.enc) e /app
# precisam pertencer ao node. Volumes /data PREEXISTENTES (root) exigem um
# `chown -R node:node /data` único na VPS ANTES do 1o up non-root.
# /app já vem com o dono certo do COPY --chown abaixo; aqui é só o /data, que é
# um diretório vazio na imagem (o volume monta por cima em runtime).
RUN mkdir -p /data && chown node:node /data

# ── Daqui para baixo é o que muda a cada commit ──────────────────────────────
# Copia o workspace já buildado (inclui node_modules com sharp/playwright e os
# pacotes externalizados pelo esbuild, resolvidos via symlinks do pnpm). O dono
# vem embutido na cópia: um `RUN chown -R /app` depois toca todos os arquivos e,
# no overlayfs, DUPLICA o /app inteiro numa camada nova (medido no web em
# 2026-07-28: 650 s de build e a imagem inflada para 2,47 GB).
#
# `--link` cria a camada SEM depender do estado do sistema de arquivos anterior:
# ela não precisa ser rebaseada quando algo acima muda, pode ser construída em
# paralelo com o stage de build e é reaproveitada quando o conteúdo não mudou.
# O `--chown` vai NUMÉRICO por causa dele: sem depender da imagem base, não há
# /etc/passwd para resolver o nome "node" — e 1000:1000 É o node desta base, o
# mesmo uid do `USER node` abaixo.
COPY --from=build --link --chown=1000:1000 /app /app
# O Chromium só muda quando a versão do Playwright muda: com --link esta camada
# é reaproveitada inteira entre builds.
COPY --from=build --link /ms-playwright /ms-playwright
WORKDIR /app/artifacts/api-server
EXPOSE 8080
USER node
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
