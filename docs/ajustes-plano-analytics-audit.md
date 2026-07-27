O plano está aprovado na estrutura geral (fases, `analytics-audit/` flat, STATUS.md,
ordem 04/05 primeiro, verificação adversarial, git untracked). Antes de executar,
aplique estes 10 ajustes:

**1. Inventário neutro de verdade (Fase 0.1).**
O material de exploração já traz conclusões ("rotas de anúncio NÃO têm `is_internal`",
"`fbclid` orgânico vira pago"). O `00-inventario.md` registra APENAS o que existe e
onde (`arquivo:linha`), sem julgar se está certo. Toda afirmação de causa vai para a
0.2. Regra prática: se uma frase do inventário puder ser lida como "isto está errado",
reescreva como "isto existe / não existe em `X:linha`".

**2. A verificação adversarial reabre arquivos.**
Os agentes céticos da 0.2 não podem refutar contra o resumo da exploração — precisam
abrir os arquivos citados e conferir cada `arquivo:linha`. Uma referência errada no
resumo se propaga para 12 PRDs. Divergência encontrada: corrija o inventário e registre
a correção no STATUS.md.

**3. Confiança explícita — nada é "Bug confirmado" só por leitura de código.**
Sem MCP do Supabase nesta sessão, classifique cada achado como:
- **Confirmado no código** — li a lógica e ela produz o efeito descrito
- **Confirmado com dados** — validado contra o banco (indisponível agora)
- **Hipótese** — plausível, sem confirmação
A tabela dos 25 itens ganha uma coluna de confiança (Alta / Média / Baixa).

**4. Lacuna declarada, não silenciosa.**
Registre em `00-inventario.md` (seção de lacunas), no `STATUS.md` e em cada PRD afetado:
"validação contra dados reais do banco não executada nesta sessão — MCP Supabase não
conectado". Todo critério de aceite que dependa de query fica marcado como **pendente
de execução**, nunca como atendido.

**5. Fronteira entre PRDs sobrepostos — decidir ANTES de disparar os agentes.**
Escreva a decisão no `ROADMAP.md` (ou num bloco no STATUS.md) antes da Fase 1:
- dedup de impressão server-side → PRD 04 ou 03?
- contadores `droppedBot` para ads/behavior → PRD 03 ou 08?
- `is_internal` em `behavior_events` → PRD 03 ou 01 (schema)?
- gate de consentimento da newsletter → PRD 02 ou 03?
Cada PRD afetado cita a fronteira em "Riscos e dependências de outros PRDs".

**6. Passe de consistência cruzada (novo, depois da revisão individual).**
Um agente lê os 12 PRDs juntos e reporta: requisitos duplicados, decisões
contraditórias, invariante do §17 tratada de forma diferente entre PRDs, mesma coluna
nova proposta com nomes distintos. Corrigir antes de fechar a Fase 2.

**7. Princípio geral no brief de TODO agente.**
Todo agente (auditoria e escrita de PRD) recebe literalmente: "Volume baixo não é bug —
os blogs são novos. Bug é o que for logicamente incorreto ou inconsistente,
independente do volume." Sem isso, agente paralelo sem o contexto completo trata 3
pageviews como defeito.

**8. LGPD da newsletter sobe para o ROADMAP.**
O bypass do gate de consentimento (`Footer.tsx:68-72`, `HomeCustomBlocks.tsx:370-374`)
é exposição de conformidade, não só falha de tracking — a rede opera conteúdo
político-adjacente. Ele aparece como item próprio no `ROADMAP.md` classificado como
Quick Win, além de estar dentro do PRD 02.



**9. STATUS.md antes e depois de cada fase.**
Grave o STATUS.md também ANTES de iniciar cada fase, com "em andamento: X". Se a sessão
cair no meio de um Workflow com agentes paralelos, preciso saber o que estava rodando,
não só o que terminou.

---

Confirme que entendeu os 10 ajustes e comece pela Fase 0.1 com o inventário neutro.
Pare ao final da 0.1 e me mostre o `00-inventario.md` antes de seguir para a 0.2.
