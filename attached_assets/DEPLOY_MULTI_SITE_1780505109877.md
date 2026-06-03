# Guia Replit (Frontend): estrutura compatível com o backend/API deste modelo

## Objetivo
Padronizar como os projetos de frontend (gerados via Replit) devem ser estruturados para serem 100% compatíveis com o backend/API que já desenvolvemos neste modelo de portal.

Este guia é apenas para o **frontend** (não cobre o deploy do backend).

## Regras de compatibilidade (importante)
- O frontend deve consumir a API sempre por **caminho relativo**: `/api/...`
- Não hardcode URL do backend no código (ex.: `https://api...`), porque em produção o `/api` será roteado via proxy.
- O build deve gerar arquivos estáticos para Nginx servir como SPA (fallback para `index.html`).

## Endpoints que o frontend precisa usar (padrão)
- Site settings (logo/nome do site):
  - `GET /api/site`
- Artigos públicos:
  - `GET /api/articles`
  - `GET /api/articles/:id`
- Ads (publicidades):
  - `GET /api/ads` (depende do componente; no modelo atual já está integrado via hook)
- Saúde da API (para debug):
  - `GET /api/health` ou `GET /api/healthz`

## Configuração do Vite (dev e build)
### Proxy em desenvolvimento
No `vite.config.ts`, configure o proxy para encaminhar `/api` para o backend durante desenvolvimento.

Recomendação:
- `API_URL` (apenas dev): URL do backend local/remoto para o Vite usar como proxy
- Em produção: o frontend continua chamando `/api`, mas quem resolve é o Nginx/Proxy reverso

Exemplo de proxy:

```ts
server: {
  proxy: {
    "/api": {
      target: process.env.API_URL ?? "http://localhost:5000",
      changeOrigin: true,
    },
  },
}
```

### Base path (opcional)
Se o portal for servido em subpasta (ex.: `/portal/`), use `BASE_PATH`. Para domínio raiz, deixe `/`.

## Estrutura de build esperada (para Nginx)
O build deve gerar um `index.html` e assets estáticos.

No modelo atual, o Vite está configurado com:
- `build.outDir = dist/public`

Então, para servir em Nginx, a pasta correta é:
- `dist/public`

## Replit: variáveis e comandos
### Variáveis (Replit Secrets)
Use apenas o necessário para desenvolvimento:
- `API_URL` (ex.: `http://localhost:5001` ou a URL da API de staging)
- `WEB_PORT` (opcional; padrão 5173)
- `BASE_PATH` (normalmente `/`)

### Scripts
Padrão (Vite):
- Dev: `npm run dev`
- Build: `npm run build`

## Requisitos do frontend para funcionar com o backend do modelo
- Rotas SPA funcionando (wouter/react-router):
  - O servidor estático precisa cair em `index.html` para qualquer rota (ex.: `/artigo/:id`, `/admin/...`)
- Todas as chamadas devem ser para `/api/*`
- O frontend não deve depender de dados mockados em produção

## Checklist de validação (antes de entregar o frontend)
- `GET /api/site` está sendo chamado e não quebra o header (logo/nome)
- Home carrega artigos reais via `GET /api/articles`
- Página de artigo abre via `GET /api/articles/:id`
- Em dev, o proxy do Vite para `/api` está funcionando (sem CORS manual)
