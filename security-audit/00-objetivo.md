# 00 — Objetivo da auditoria (Fase 0.1)

**Data:** 2026-07-21
**Origem:** fornecido pelo usuário (dono/operador do projeto) via pergunta direta no início da missão.
**Nível de confiança da inferência:** **Alta** (declaração explícita, não inferida do contexto).

---

## Objetivo declarado

| Direcionador | Decisão |
|---|---|
| **Natureza do trabalho** | **Hardening contínuo de sistema em produção.** Não é pré-lançamento de uma funcionalidade específica, não é resposta a incidente ativo confirmado, não é primariamente compliance externo. |
| **Prazo / marco** | **Sem prazo rígido.** Priorização por **risco puro** (impacto × exposição × esforço). |
| **Ativos inegociavelmente mais críticos** | **Todos os 4** foram marcados como inegociáveis: (1) **isolamento entre blogs**, (2) **segredos mestres**, (3) **integridade do conteúdo**, (4) **dados pessoais (PII/LGPD)**. |

### Detalhamento dos 4 ativos críticos

1. **Isolamento entre blogs (multi-tenant).** Nenhum blog/tenant pode acessar dados, banco ou infraestrutura de outro. Peso extra porque o isolamento é feito **só por infraestrutura** — não há `blogId` no app; a identidade do blog = qual banco ele conecta + suas próprias settings.
2. **Segredos mestres.** `SESSION_SECRET` (deriva a chave AES-256-GCM que cifra todos os segredos do banco), `SETTINGS_ENCRYPTION_KEY`, `CENTRAL_INGEST_SECRET` (HMAC do ingest por blog), chaves de IA. Comprometer qualquer um deles cascateia para tudo o mais.
3. **Integridade do conteúdo.** Ninguém pode desfigurar ou publicar em nome dos blogs — seja falsificando/replayando o HMAC do ingest, sequestrando a sessão do painel central, ou injetando payload que se torna conteúdo publicado.
4. **Dados pessoais (PII).** Dados de admins (email, hash de senha, segredo TOTP), de visitantes (analytics, mensagens de contato com IP/UA) e qualquer PII enviada a APIs de IA hospedadas fora do Brasil.

---

## Regra de priorização derivada (governa todo o plano)

Como **todos os 4 ativos são inegociáveis** e o objetivo é **hardening de produção com priorização por exposição**, a ordem de ataque do trabalho é:

1. **Primeiro:** o que um **atacante externo NÃO autenticado** alcança **e** toca um dos 4 ativos.
2. **Depois:** **fronteiras de privilégio** — blog→blog, usuário comum→admin, central→blog.
3. **Por último:** **itens de suporte** que não estão no caminho direto de um ataque (backups, supply chain, observabilidade) — exceto quando o impacto é catastrófico o bastante para subir na fila (ex.: ausência de backups = perda total de todos os blogs).

> **Esta regra substitui a ordem padrão do OWASP Top 10.** Toda priorização subsequente (mapa de riscos, ordem da Fase 4, ondas do roadmap, ordem dos PRDs) referencia este objetivo — ver `04-plano-auditorias.md` e `06-roadmap-dimensionamento.md`.

---

## O que este objetivo NÃO é (para evitar desvio de escopo)

- **Não** é preparação de um go-live específico (embora existam go-lives pendentes — ver CLAUDE.md §19). Portanto o plano **não** prioriza artefatos de um blog em detrimento do hardening estrutural.
- **Não** é uma resposta a incidente confirmado. O único item tratado com urgência de incidente é o segredo real versionado (`.replit`), por ser exposição ativa e verificável — ver PRD-01a.
- **Não** é auditoria de compliance formal (ISO/SOC2/PCI). LGPD entra porque há PII e transferência internacional, mas como hardening, não como certificação.
