# 05 — Estratégia e índice dos PRDs (Fase 5.1)

Só o **índice e o racional da divisão**. Os PRDs completos vivem em `prds/PRD-*.md` (um arquivo por PRD, autocontido).

---

## Decisão de divisão: **17 PRDs**

### Critérios aplicados (5.1)
- **Um PRD = uma unidade de deploy/rollback isolada.** Cada um tem branch, comandos de verificação e plano de rollback próprios; deve fazer sentido lido sozinho.
- **Domínios de risco diferentes viram PRDs diferentes** (ex.: hardening de container ≠ correção de RBAC).
- **Itens acoplados na mesma superfície de código ficam juntos** (ex.: os 3 sanitizadores-espelho no PRD-04a).
- **Nenhum PRD depende de muitos outros** — o grafo resultante é quase plano (validado por revisão arquitetural independente).

### Splits e realocações feitos (por que não são menos PRDs)
- **PRD-01 → 01a + 01b:** rotacionar chave viva (incidente, reversível) tem natureza/rollback oposta a purgar histórico git (force-push, coordenado). Rotacionar já neutraliza a exposição; juntar tornaria o PRD não-atômico.
- **PRD-04 → 04a + 04b:** write-path (api/central-hub/news-engine) vs. saída (central-web) são codebases e fronteiras de confiança distintas; rollback isolado exige separar.
- **PRD-06 → 06a + 06b:** proxy público (não-auth, Onda 1) vs. fetch autenticado (Onda 2). Compartilham o util de fetch seguro entregue em 06a.
- **Token em localStorage** movido do "balde XSS" para **PRD-03** (é decisão de armazenamento de auth, não de sanitização).
- **Nonce+transação do ingest** movido do "balde custo/DoS" para **PRD-14** (é integridade, ativo #3).
- **Fix do override/ports** movido do "balde container" para **PRD-08** (é borda; e CSP de borda é inútil enquanto web:3000 é publicado direto — dependência dura explicitada).
- **Trilha de auditoria** adicionada ao **PRD-02** (Repudiation em AP-5, mesmo ponto de instrumentação do RBAC).

## Índice dos PRDs

| PRD | Título | Onda | Prioridade | Esforço | Dep. |
|---|---|:--:|---|---|---|
| **01a** | Incidente: rotação de segredo exposto (VAPID) + chave de envelope | 0 | Quick Win | Baixo | — |
| **01b** | Higiene de segredos em repouso + purge de histórico git | 2 | Médio Prazo | Médio | 01a |
| **02** | RBAC do painel central + trilha de auditoria | 2 | Quick Win | Médio | — |
| **03** | Fronteiras de auth do blog (webhook, revogação, fail-closed, token) | 2 | Médio Prazo | Médio | — |
| **04a** | Sanitização canônica no write-path (gate `enforce`, lib única, drift) | 1 | Médio Prazo | Alto | — |
| **04b** | Defesa de saída no central-web (DOMPurify) | 1 | Quick Win | Baixo | 08 |
| **05** | Injeção indireta de prompt (delimitar + validar saída) | 1 | Médio Prazo | Médio | 04a(soft) |
| **06a** | SSRF no proxy de imagem público + util de fetch seguro | 1 | Quick Win | Médio | — |
| **06b** | SSRF autenticado (article-from-url, scrape) | 2 | Médio Prazo | Baixo | 06a |
| **07** | Hardening de runtime dos containers (non-root, remover `--no-sandbox`) | 3 | Longo Prazo | Alto | — |
| **08** | Borda: fix do override/ports + política CSP/HSTS | 0→1 | Quick Win | Médio | — |
| **09** | Backups & durabilidade do pg-blogs | 0/3 | Quick Win | Médio | — |
| **10** | CI/CD de segurança (secret-scan, SCA, SAST) | 0/3 | Quick Win | Baixo | — |
| **11** | Custo/DoS: teto de cota default + rate limits + anti-bomba | 3 | Médio Prazo | Médio | — |
| **12** | LGPD/privacidade | 4 | Médio Prazo | Médio | — |
| **13** | Robustez operacional (erro global, ensureSchema fail-loud, alerting) | 4 | Médio Prazo | Médio | — |
| **14** | Integridade do ingest & guarda de instalação | 2 | Médio Prazo | Médio | — |

**PRD-15 (condicional):** re-chaveamento da chave de envelope — só será criado se o usuário decidir não aceitar o risco arquitetural. Ver `07-perguntas-pendentes.md`.

## Grafo de dependências

```
FUNDACIONAL (rodar cedo, paralelo):  PRD-10, PRD-09
INCIDENTE (urgência, sem deps):      PRD-01a, PRD-08(passo override)
DURAS:   override-fix ─► CSP borda (08) ─► 04b (central-web consome política)
         06a (util fetch) ─► 06b ;  01a ─► 01b
SUAVES:  04a (gate enforce) ─▷ 05 ;  02 (RBAC) ─▷ audit log (mesmo ponto)
OVERLAP: 01a (rotaciona SESSION_SECRET) ⇄ 03 (revogação de token) — coordenar
INDEPENDENTES: 02, 03, 06a, 07, 09, 10, 11, 12, 13, 14
```

## Auto-checagem (5.3) — critério para considerar cada PRD pronto
- Faz sentido lido **sozinho**, sem esta conversa? 
- Todo item de "Escopo" é **imperativo e específico** (o quê, onde, para quê)?
- Todo critério de aceite é **verificável por comando** ou observação objetiva?
- Tem "Fora de escopo", "Comandos de verificação", "Rollback" e "Notas de execução"?
- Mudanças em auth/segredos/dados sensíveis estão **sinalizadas para revisão humana**?

Ordem de execução recomendada e dimensionamento em `06-roadmap-dimensionamento.md`.
