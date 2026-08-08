# 07 — Perguntas em aberto (Fase 7)

Lacunas registradas como pergunta explícita (nunca preenchidas com suposição). Formato: **Pergunta** — **Por que importa** — **Bloqueia**.

---

## Decisões que mudam escopo

1. **Re-chaveamento da chave de envelope / `SESSION_SECRET`.**
   **Pergunta:** aceitar como risco arquitetural que não há caminho de rotação/revogação da chave-mãe, ou criar um **PRD-15** de re-chaveamento (re-encrypt de todos os segredos sob nova chave, com migração e invalidação de sessões)?
   **Por que importa:** hoje, se a chave-mãe vazar, não existe revogação de emergência — todo segredo cifrado deriva dela e a política proíbe trocá-la (CLAUDE.md §13).
   **Bloqueia:** a existência do PRD-15 e o item "resposta a vazamento de credencial" do domínio 4/11.

2. **Modelo de papéis do painel central (PRD-02).**
   **Pergunta:** além de `admin`, quais ações um papel operador de baixo privilégio pode executar (ver/publicar entregas? gerenciar fontes/regras?) — ou tudo que é sensível é admin-only?
   **Por que importa:** define a matriz de autorização do RBAC e evita lockout operacional.
   **Bloqueia:** o detalhamento do Escopo do PRD-02.

## Lacunas de verificação (runtime — não checável a partir do repo)

3. **Estado real da VPS.**
   **Pergunta:** o `docker-compose.override.yml` está ativo em produção agora (web:3000 publicado)? Existe firewall/UFW fechando as portas? Já há algum backup do pg-blogs?
   **Por que importa:** confirma se F10 é exposição viva e se F11 já está parcialmente mitigado.
   **Bloqueia:** a urgência real (Onda 0) de PRD-08 (override) e PRD-09.

4. **Chaves de criptografia em produção.**
   **Pergunta:** `SETTINGS_ENCRYPTION_KEY` (ou ao menos `SESSION_SECRET`) está definido em todos os ambientes, de modo que `crypto.ts` não caia no fallback de texto puro?
   **Por que importa:** determina se F16 é exposição atual (segredos em claro no banco) ou só risco latente.
   **Bloqueia:** a severidade efetiva do PRD-01b.

5. **VAPID em uso.**
   **Pergunta:** a `VAPID_PRIVATE_KEY` de `.replit` ainda é a chave ativa em produção?
   **Por que importa:** se sim, deve ser tratada como comprometida (qualquer leitor do repo forja push).
   **Bloqueia:** nada (assume-se comprometida e rotaciona-se de qualquer forma — PRD-01a), mas confirma o impacto.

6. **CVEs reais nas dependências.**
   **Pergunta:** resultado de `pnpm audit --json` num ambiente com registry.
   **Por que importa:** o reconhecimento não rodou o audit (read-only); pode haver CVEs abertos apesar dos overrides.
   **Bloqueia:** dimensionar F17 e a triagem do PRD-10.

## Lacunas de cobertura (declaradas, não bloqueantes)

7. Interior de `articleService.ts`, schemas Drizzle a fundo, `scrapeWithDiffbot`, services `collector/distributor/videoPublisher`, fluxo OAuth Meta/Buffer completo, rotas `analytics/push/queue/realtime-stats/dbConfigAdmin` — mapeados por nome, não linha-a-linha. *Confiança dos achados nessas áreas: Média.*

8. Robustez concreta dos bypasses de regex (F12) — avaliada por padrão, não testada com payloads reais (proibido testar exploit ativo). *A remediação (PRD-04a) usa lib canônica, o que torna o ponto discutível.*

## Preferência operacional

9. **Onde a implementação vai rodar (PRD com comandos de VPS).**
   **Pergunta:** PRDs de infra (07, 08, 09, 10) serão executados localmente (Windows) ou direto na VPS? Alguns comandos (build vite, docker) só rodam na VPS.
   **Por que importa:** ajusta os "Comandos de verificação" de cada PRD de infra.
   **Bloqueia:** nada — os PRDs já assumem VPS para itens de Docker/Caddy e Windows/Docker para build, conforme as convenções do repo.
