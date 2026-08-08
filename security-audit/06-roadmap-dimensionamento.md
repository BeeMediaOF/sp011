# 06 — Roadmap e dimensionamento (Fase 6)

Priorização final = **impacto × esforço × alinhamento com o objetivo** (`00-objetivo.md`): hardening de produção, exposição primeiro, 4 ativos inegociáveis. Roadmap rastreável e baseado em risco — não uma lista de tópicos.

---

## Ondas (ordem de execução recomendada)

### Onda 0 — Incidente & quick wins de config (horas–dias)
| PRD | Por que agora | Esforço | Paraleliza |
|---|---|---|---|
| **01a** Rotação VAPID | Segredo real vivo e versionado (F1); rotacionar neutraliza já | Baixo | sim |
| **08 (passo override)** Parar de publicar web:3000 | Exposição possivelmente viva (F10); sem TLS/CSP | Baixo | sim |
| **10** CI/segurança (não-bloqueante) | Fundacional; pega segredos futuros; barato | Baixo | sim |
| **09** Backups | INEGOCIÁVEL; AP-9 catastrófico; barato | Médio | sim |

**Milestone M0:** nenhuma exposição de segredo viva; frontend só atrás do Caddy; backup diário rodando; scanners ligados.

### Onda 1 — Externo não-autenticado → 4 ativos (maior exposição)
| PRD | Attack path | Esforço | Nota de execução |
|---|---|---|---|
| **04a** Sanitização write-path + gate enforce | AP-1 (armazenamento) | Alto | **shadow/report-diff** antes de virar default |
| **06a** SSRF proxy público | AP-2 | Médio | canário (allowlist) |
| **08 (passo CSP)** CSP/HSTS de borda | AP-3 | Médio | **report-only** primeiro |
| **04b** central-web DOMPurify | AP-1 (exfiltração) | Baixo | depende de 08 (CSP) |
| **05** Injeção indireta de prompt | AP-1 (entrada) | Médio | aditivo; soft-dep de 04a |

**Milestone M1:** a cadeia-mãe (AP-1) quebrada em 3 pontos (entrada, armazenamento, saída); SSRF público fechado; borda com CSP.

### Onda 2 — Fronteiras de privilégio
| PRD | Attack path | Esforço | Nota |
|---|---|---|---|
| **02** RBAC central + auditoria | AP-5 | Médio | break-glass admin |
| **03** Auth do blog (webhook/revogação/fail-closed/token) | AP-4 | Médio | fail-closed com circuit-breaker; coordenar c/ 01a |
| **14** Integridade do ingest + adopt-guard | AP-6 | Médio | — |
| **06b** SSRF autenticado | AP-2 (auth) | Baixo | usa util do 06a |
| **01b** Segredos em repouso + purge git | AP-7 | Médio | **purge coordenado**; dep 01a |

**Milestone M2:** central com RBAC + auditoria; webhook key sem admin; token revogável e fora do localStorage; ingest à prova de replay; histórico git limpo.

### Onda 3 — Runtime / disponibilidade / custo
| PRD | Attack path | Esforço | Nota |
|---|---|---|---|
| **07** Hardening de containers | AP-11 | Alto | **canário**; Chromium/volumes |
| **11** Custo/DoS (cota default, rate limits, anti-bomba) | AP-8 | Médio | canário (cota default) |

**Milestone M3:** containers non-root sem `--no-sandbox`; portão de economia sempre fecha; rate limits e limites anti-bomba.

### Onda 4 — Compliance & robustez
| PRD | Attack path | Esforço | Nota |
|---|---|---|---|
| **12** LGPD/privacidade | AP-10 | Médio | deleção em **dry-run** |
| **13** Robustez operacional | (suporte) | Médio | fail-loud com validação prévia |

**Milestone M4:** base legal/retenção LGPD; erro global sem vazamento; migrações fail-loud; alerting de segurança.

---

## Classificação Quick Win / Médio / Longo Prazo

- **Quick Wins:** 01a, 08 (override), 10, 09, 04b, 06a, 02 (middleware aditivo). *Alto valor, baixo/médio esforço, pouco risco de quebra.*
- **Médio Prazo:** 03, 05, 06b, 11, 12, 13, 14, 01b, 04a. *Esforço médio/alto ou exigem canário/shadow.*
- **Longo Prazo:** 07 (remoção do `--no-sandbox` + non-root é o mais arriscado/custoso).

## Classificações contraintuitivas (justificadas pelo objetivo)

- **04a é Alto esforço mas está na Onda 1** — sobe porque bloqueia a cadeia-mãe (AP-1), o único caminho externo-não-auth que toca os 4 ativos. Custa mais, mas é o de maior impacto.
- **09 (backups) não está no caminho de ataque externo, mas é Onda 0** — porque AP-9 é perda total irreversível e o custo é baixo; impacto catastrófico vence a regra de exposição.
- **07 é Alto risco e fica na Onda 3, não antes** — apesar de ser ativo #1 (isolamento), é amplificador (precisa de outro RCE para disparar) e o canário é caro; não bloqueia nada externo-não-auth diretamente.
- **13 (robustez) é Onda 4** — vaza `err.message` (baixo) e melhora detecção; importante mas fora do caminho direto aos 4 ativos.

## Dependências e paralelismo (resumo)

Arestas duras: `08(override) → 08(CSP) → 04b`; `06a → 06b`; `01a → 01b`. Soft: `04a ▷ 05`; `02 ▷ audit`. Overlap: `01a ⇄ 03` (rotação de SESSION_SECRET já revoga tokens). Todo o resto é paralelizável — múltiplos PRDs por onda podem correr juntos.

## Definition of Done (global do roadmap)

Cada PRD tem seu DoD próprio (arquivo do PRD). O roadmap está "pronto" quando: todos os PRDs de M0–M2 concluídos e verificados por comando; itens de canário/shadow promovidos a default após observação; `STATUS.md` refletindo cada PRD como feito; e a pergunta do re-chaveamento (PRD-15) resolvida.

## Esforço agregado (ordem de grandeza)

- Onda 0: ~1–3 dias (config + backup + rotação).
- Onda 1: ~1–2 semanas (04a com shadow domina).
- Onda 2: ~1–2 semanas (5 PRDs, muitos paralelos; purge git é o mais delicado).
- Onda 3: ~1 semana + tempo de canário do container.
- Onda 4: ~1 semana (majoritariamente documental + jobs).
