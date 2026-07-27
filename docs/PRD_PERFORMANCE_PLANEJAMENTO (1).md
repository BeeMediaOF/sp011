# Prompt Mestre — Auditoria e Otimização de Performance (Blog Engine)

> **Como usar:** cole este arquivo como instrução no Claude Code na raiz do repositório.
> Dois modos, em sessões separadas: **Modo Planejamento** (Fases 0 → 1 → 2 — analisa,
> diagnostica, gera PRDs; nunca altera código) e **Modo Execução** (Fase 3 — implementa
> um PRD por vez, roda os testes, gera relatório). Diga em qual modo está ao colar.
>
> Entregáveis ficam em `performance-audit/` na raiz do repo (mesmo padrão do
> `security-audit/` e `analytics-audit/`). Nenhum código de produção é alterado no
> Modo Planejamento — só documentos.

---

## 0. Papel e objetivo

Você atuará como **Web Performance Engineer** com domínio de Core Web Vitals,
bundling/code-splitting (Vite/Rollup), otimização de imagens, estratégias de
renderização (CSR/SSR/SSG/streaming), cache HTTP e diagnóstico de Lighthouse.

**Objetivo:** levar o Lighthouse Performance Score do estado atual (**43**, com LCP de
**17s**, FCP de **6.4s**, TBT de **500ms** e payload total de **5MB**) para **≥ 75 em
mobile** (meta primária) e **≥ 90 em desktop** (meta secundária), com o menor número
de mudanças de alto impacto possível — não com uma lista exaustiva de micro-otimizações.

**O entregável final são PRDs autocontidos** (escritos para serem executados pelo
próprio Claude Code em sessão futura), organizados por gargalo, não por componente.
Espera-se entre **4 e 6 PRDs** — se a análise mostrar que mais são necessários,
justifique; se menos bastarem, melhor.

---

## 0.1 Diagnóstico de referência (dados do Lighthouse que motivam este trabalho)

Esses números são o ponto de partida. Todo PRD gerado deve referenciar qual métrica
ele ataca e qual melhoria estimada se espera.

### Métricas (mobile)
| Métrica | Valor atual | Meta |
|---|---|---|
| Performance Score | **43** | ≥ 75 |
| First Contentful Paint (FCP) | **6.4s** | ≤ 1.8s |
| Largest Contentful Paint (LCP) | **17.0s** | ≤ 2.5s |
| Total Blocking Time (TBT) | **500ms** | ≤ 200ms |
| Cumulative Layout Shift (CLS) | **0** ✅ | manter |
| Speed Index | **14.1s** | ≤ 3.4s |

### Insights do Lighthouse
| Insight | Economia estimada |
|---|---|
| Render-blocking requests | **2.650ms** |
| Image delivery | **2.360 KiB** |
| Document request latency | **135 KiB** |
| Unused CSS | **246 KiB** |
| Unused JavaScript | **117 KiB** |
| Minify JavaScript | **66 KiB** |
| Main-thread work | **7.4s** |
| JS execution time | **3.1s** |
| Network payload total | **5.029 KiB** |
| Long tasks | **20** |

### Outros scores (referência — não são foco, mas não devem regredir)
| Score | Valor |
|---|---|
| Accessibility | 93 |
| Best Practices | 100 |
| SEO | 100 |
| Agentic Browsing | 2/3 (llms.txt não segue recomendações) |

---

## 1. Guardrails

1. **Modo Planejamento: somente leitura sobre código de produção.** Escrita apenas
   dentro de `performance-audit/`. Modo Execução: edição permitida no código, guiada
   pelo PRD sendo implementado.
2. **Não regredir CLS (0), Accessibility (93), Best Practices (100) nem SEO (100).**
   Qualquer PRD que toque layout, fontes, imagens ou estrutura HTML deve incluir
   verificação explícita de que esses 4 scores não caíram.
3. **Não assumir sem evidência.** Se não conseguir confirmar um achado lendo o código
   real, classifique como Hipótese e registre o que falta verificar.
4. **Multi-blog.** Toda mudança afeta a rede inteira (mesma imagem Docker). Cada PRD
   deve considerar o rollout por blog (padrão do CLAUDE.md §6, se existir) e não
   quebrar nenhum blog específico.
5. **Persistir em disco a cada artefato concluído**, atualizando `STATUS.md`.

---

## 2. Fase 0 — Reconhecimento (obrigatória, primeira ação)

Antes de diagnosticar, mapeie o que existe hoje:

### 0.1 Inventário de build e bundle
- Abra `vite.config.ts` (ou equivalente) do frontend (`artifacts/brasilia-agora`):
  estratégia de chunking, plugins, `build.rollupOptions`, `manualChunks`.
- Rode `pnpm --filter @workspace/sbc-agora run build` (se possível) e liste os
  chunks gerados com tamanhos (`dist/assets/*.js`, `*.css`). Se não for possível
  buildar, leia a config e deduza.
- Identifique quais dependências pesadas estão no bundle público (Recharts, Tiptap,
  Radix UI, React Hook Form, Zod — e quais são usadas APENAS no admin, não nas
  páginas públicas).
- Verifique se há code splitting por rota (lazy imports com `React.lazy` /
  `import()`) ou se tudo carrega no bundle inicial.

### 0.2 Inventário de imagens
- Como as imagens de artigo são servidas: proxy `/api/image` (sharp), parâmetros
  aceitos (`w`, `q`, `f`), cache headers.
- No frontend: componente `LazyImage.tsx` — usa `srcset`? `sizes`? `loading="lazy"`?
  Formato negociado (WebP/AVIF) via `<picture>` ou via query param?
- Imagens de anúncio (`imageBase64`, `imageUrl`): inline base64 no HTML ou request
  separada? Tamanho típico?
- Fontes: como Merriweather e Inter são carregadas (Google Fonts CDN? self-hosted?
  `font-display`? preload?).

### 0.3 Inventário de renderização
- Existe SSR/SSG para páginas públicas, ou é SPA pura (React monta tudo no client)?
- O HTML inicial (`index.html`) tem conteúdo visível ou é um `<div id="root"></div>`
  vazio esperando o JS?
- Existe preload/prefetch de dados críticos (artigos da home, por exemplo)?
- Nginx/proxy serve assets estáticos com compressão (gzip/brotli)? Cache headers
  (`Cache-Control`, `ETag`)?

### 0.4 Inventário de recursos bloqueantes
- Quais `<link rel="stylesheet">` e `<script>` estão no `<head>` sem `async`/`defer`?
- Existe critical CSS inline?
- Tailwind CSS 4: o CSS final é purgado ou carrega o framework inteiro?

Produza `performance-audit/00-inventario.md` com os achados, sem conclusões de
"certo/errado" — só o que existe e onde.

---

## 3. Fase 1 — Diagnóstico e plano de PRDs

Com base no inventário, cruze os achados com os números do Lighthouse (§0.1) e
identifique os **gargalos reais** — não uma lista genérica de "boas práticas", mas
o que especificamente está causando LCP de 17s e FCP de 6.4s neste projeto.

### 1.1 Cadeia causal (obrigatória)

Para cada métrica ruim (LCP, FCP, TBT, Speed Index), trace a cadeia completa:

```
[o que o navegador espera] → [o que bloqueia] → [arquivo:linha ou config] → [segundos perdidos]
```

Exemplo esperado (não copie — descubra o real):
```
LCP 17s: index.html vazio → JS bundle 2MB → fetch /api/articles → React render
         = ~2s download + ~3s parse/exec + ~2s fetch + ~1s render = ~8s chain
         + imagens hero sem srcset/preload = +6s no LCP element
```

### 1.2 Priorização por impacto × esforço

Classifique cada gargalo encontrado:

| Gargalo | Métrica(s) afetada(s) | Impacto estimado | Esforço | Classificação |
|---|---|---|---|---|
| [gargalo real] | LCP, FCP, ... | -Xs no LCP | P/M/G | Quick Win / Médio / Alto |

### 1.3 Decisão de PRDs

Agrupe os gargalos em PRDs por **cadeia causal**, não por componente isolado. Um PRD
deve resolver um gargalo completo de ponta a ponta — não "melhorar imagens" como
conceito abstrato, mas "reduzir o LCP de 17s para ≤4s atacando [X, Y, Z que estão
na cadeia]".

Domínios prováveis (adaptar ao que o inventário revelar — não force todos se não
se aplicarem):

- **Recursos bloqueantes e caminho crítico** — fontes, CSS, scripts no `<head>`,
  critical CSS inline, `font-display`, preloads
- **Imagens** — `srcset`/`sizes`, formato moderno (WebP/AVIF via `<picture>` ou
  Accept), lazy loading real, preload da imagem LCP, anúncios em base64
- **Bundle splitting e tree-shaking** — admin vs público, lazy routes, dependências
  pesadas (Recharts, Tiptap, Radix) fora do bundle inicial, Tailwind purge
- **Renderização inicial** — se o HTML é um `<div>` vazio, o LCP nunca vai ser bom
  sem SSR/streaming/prerender; avaliar viabilidade real dentro do Vite 7 + Express 5
  sem reescrever a stack
- **Compressão e cache HTTP** — gzip/brotli no Nginx, `Cache-Control` para assets
  com hash, compressão do documento HTML
- **llms.txt** — Quick Win para Agentic Browsing score

Produza `performance-audit/01-diagnostico.md` com a cadeia causal, a tabela de
priorização e a decisão de quantos PRDs, justificada.

---

## 4. Fase 1.5 — Geração dos PRDs

### Template obrigatório

Cada PRD é escrito para ser executado pelo próprio Claude Code em sessão futura —
autocontido, imperativo, verificável por comando:

```markdown
# PRD-PERF-XX — [Nome focado no gargalo, não no componente]

## Objetivo
O que este PRD resolve, qual métrica ataca e qual melhoria estimada (1-2 frases).

## Métrica(s) alvo
| Métrica | Antes (atual) | Meta deste PRD | Como medir |
|---|---|---|---|

## Contexto / evidência
Referência ao diagnóstico (`01-diagnostico.md`), arquivo:linha, cadeia causal.

## Pré-condições
- [ ] Branch: `git checkout -b perf/prd-XX-[slug]`
- [ ] Baseline: rodar Lighthouse antes e salvar o relatório JSON
- [ ] Ler obrigatoriamente: [lista de arquivos]

## Escopo (ações em ordem)
1. Em `caminho/arquivo.ext`, [ação específica].
2. [próxima ação]

## Fora de escopo
O que NÃO tocar neste PRD.

## Comandos de verificação
```bash
# Build sem erros
pnpm run build

# Lighthouse local (se disponível) ou checklist manual:
# - FCP / LCP / TBT / CLS antes e depois
# - Bundle size antes e depois (ls -la dist/assets/*.js | sort -k5 -n)

# Verificação de não-regressão:
# - CLS continua 0
# - Accessibility ≥ 93
# - SEO = 100
```

## Critérios de aceite
- [ ] [verificável por comando ou observação objetiva]

## Invariantes preservadas
- CLS = 0 (não introduzir shift)
- Accessibility ≥ 93, SEO = 100, Best Practices = 100
- Multi-blog: funciona em todos os blogs da rede
- [invariantes do CLAUDE.md §17 aplicáveis]

## Dependências de outros PRDs
## Estimativa de esforço (P/M/G)

## Plano de rollback
```bash
git revert HEAD  # ou procedimento específico
```

## Notas de execução para o agente
- Trabalhe apenas neste PRD; não expanda escopo.
- Se critério de aceite falhar: registre em STATUS.md e pare.
- Rode Lighthouse ANTES e DEPOIS; registre ambos os scores no commit message.
- Ao concluir: atualize STATUS.md.
```

### Auto-checagem antes de fechar a Fase 1.5

Releia cada PRD e confirme:
- Faz sentido lido sozinho, sem esta conversa?
- Todo critério de aceite é verificável por comando ou observação objetiva?
- A melhoria estimada é realista para o esforço?

Se "não" para qualquer um, reescreva antes de seguir.

---

## 5. Fase 2 — Roadmap

Produza `performance-audit/ROADMAP.md` com:

1. **Sequência de implementação por dependência** — qual PRD vem antes de qual.
2. **Quick Wins primeiro** — o que pode subir hoje com mínimo risco e máximo impacto.
3. **Meta por onda** — ex.: "Onda 1 (Quick Wins): FCP de 6.4s → ≤3s, payload de
   5MB → ≤2.5MB. Onda 2: LCP de 17s → ≤4s."
4. **Matriz de cobertura**: cada insight do Lighthouse (§0.1) mapeado a um PRD dono.
5. **Definition of Done geral**: Lighthouse Performance ≥ 75 mobile, ≥ 90 desktop;
   nenhuma regressão nos outros 3 scores.

---

## 6. Estrutura de entrega

```
performance-audit/
├── 00-inventario.md                (Fase 0)
├── 01-diagnostico.md               (Fase 1 — cadeia causal + priorização)
├── PRD-PERF-01-[nome].md           (Fase 1.5)
├── PRD-PERF-02-[nome].md
├── PRD-PERF-0N-[nome].md
├── ROADMAP.md                      (Fase 2)
├── STATUS.md                       (atualizar a cada artefato)
└── RELATORIO-FINAL.md              (Fase 3 — só após implementação)
```

`STATUS.md`: fase atual, artefatos concluídos, PRDs pendentes, última atualização,
próxima ação. Atualizar **antes e depois** de cada fase/PRD.

---

## 7. Fase 3 — Execução e relatório final (sessão futura)

Quando instruído a implementar, para cada PRD:

1. Cumprir pré-condições (branch, baseline Lighthouse).
2. Implementar apenas o escopo do PRD.
3. **Rodar os comandos de verificação literalmente** — não presumir sucesso.
4. **Rodar Lighthouse ANTES e DEPOIS** (ou registrar os números se Lighthouse não
   estiver disponível no ambiente — nesse caso, use `pnpm run build` + tamanho dos
   chunks + checklist manual como proxy).
5. Conferir critérios de aceite contra resultado real.
6. Se passar: marcar concluído em `STATUS.md` com os números antes/depois.
7. Se falhar: reverter, registrar motivo, parar.

Ao final de todos os PRDs (ou do lote pedido), gerar
`performance-audit/RELATORIO-FINAL.md` com:

- **Resumo em linguagem simples** — o que mudou e por que importa.
- **Tabela comparativa antes/depois por PRD:**

| PRD | Métrica alvo | Antes | Depois | Meta atingida? |
|---|---|---|---|---|

- **Bundle size antes/depois** (lista de chunks com tamanhos).
- **Risco residual** — o que continua lento e por quê.
- **Próximos passos** — o que daria mais ganho mas ficou fora do escopo (ex.: SSR
  completo, CDN, edge caching).

---

## 8. Regras finais

- Não modificar código no Modo Planejamento.
- Toda conclusão com evidência + Fato/Hipótese/Limitação + Confiança.
- Não produzir checklist genérica de "boas práticas de performance" — só o que
  ataca os números reais do Lighthouse deste projeto.
- Persistir em disco a cada fase, atualizando STATUS.md.
- PRDs enxutos e focados: 4-6 PRDs, não 12. Se um gargalo pode ser resolvido
  com 3 linhas de config (ex.: `font-display: swap`), ele não vira um PRD próprio
  — entra como item dentro do PRD da cadeia causal que ele integra.
