# Prompt Mestre — Newsletter (Captura + Disparo por E-mail)

> **Como usar:** cole este arquivo como instrução no Claude Code, **junto com a
> imagem anexada** do bloco de newsletter desejado (ícone, título, subtítulo,
> campo de e-mail, CTA, aviso de "sem spam"). Diferente dos outros prompts
> mestre (segurança, analytics, performance), esta tarefa gera **um único PRD**,
> não uma série — é uma funcionalidade, não uma auditoria.
>
> Dois modos, em sessões separadas: **Modo Planejamento** (investiga, pergunta,
> escreve o PRD; nunca altera código) e **Modo Execução** (implementa o PRD,
> roda os testes, gera relatório). Diga em qual modo está ao colar.
>
> Entregável fica em `newsletter-audit/` na raiz do repo (mesmo padrão de
> `security-audit/`, `analytics-audit/`, `performance-audit/`). Nenhum código de
> produção é alterado no Modo Planejamento — só o PRD.

---

## 0. Papel e objetivo

Você atuará como **Product Engineer** com domínio de arquitetura full-stack,
filas/workers assíncronos, LGPD aplicada a e-mail marketing, e performance de
sistemas multi-tenant.

**Objetivo:** projetar a funcionalidade de captura e disparo de newsletter —
ponta a ponta — para funcionar de forma independente em cada blog da rede,
sem depender de um provedor de e-mail transacional de terceiros na primeira
versão (Gmail comum como remetente é um MVP aceitável), mas com o caminho de
evolução para um provedor de verdade já desenhado no PRD.

**O entregável final é um PRD único, completo e autocontido** (escrito para ser
executado pelo próprio Claude Code em sessão futura) — não uma série de PRDs.
Mesmo sendo um PRD só, ele deve ter fases internas de verificação (ver §3) e
cobrir a funcionalidade de forma completa, não um MVP capenga.

---

## 0.1 Contexto — o que a imagem mostra

A imagem anexada (`06 - Área de Newsletter`) mostra o bloco de captura desejado:
ícone, "Inscreva-se na nossa newsletter", subtítulo com a proposta de valor,
campo "Seu e-mail", botão de CTA ("Quero receber") e um aviso de
"Sem spam. Você é livre para cancelar quando quiser". Além da captura em si,
precisamos de:

1. Uma área no **admin** para o dono do blog cadastrar o e-mail/remetente de
   onde as newsletters saem.
2. Um **"Modelo de Layout"** configurável — o dono do blog monta/edita o
   template do e-mail de disparo (marketing) que vai para a lista.

**Achado de uma auditoria anterior que este PRD precisa corrigir, não repetir:**
o caminho atual de captura de newsletter (`Footer.tsx` e
`HomeCustomBlocks.tsx`, fazendo fetch direto a `/behavior`) **ignora o gate de
consentimento de LGPD**. A funcionalidade nova não pode ser construída em cima
dessa falha — corrigir isso é parte do escopo deste PRD, não um item à parte.

---

## 1. Guardrails

1. **Modo Planejamento: somente leitura sobre código de produção.** Escrita
   apenas dentro de `newsletter-audit/`.
2. **Não assumir sem evidência.** Se não conseguir confirmar algo lendo o
   código real (ex.: se já existe alguma biblioteca de e-mail instalada, se o
   n8n já tem um workflow parecido), classifique como Hipótese e pergunte antes
   de escrever o PRD como se fosse fato.
3. **Multi-blog.** Cada blog habilita/configura a funcionalidade de forma
   independente — inclusive lista de inscritos isolada por blog (confirmar,
   não assumir — ver perguntas em §2).
4. **LGPD não é opcional.** Consentimento explícito com timestamp, link de
   descadastro em todo e-mail, lista de supressão — são requisitos, não
   "nice to have".
5. **Performance não pode regredir.** O disparo de e-mail não pode rodar
   dentro do processo web/api nem bloquear a captura do formulário no site
   público — trate como requisito não-funcional com critério de aceite
   mensurável, não como boa prática genérica.

---

## 2. Fase 0 — Investigação e perguntas (obrigatória, antes de escrever o PRD)

Antes de qualquer linha do PRD, explore o código relevante e responda (com
evidência, `arquivo:linha`) ou pergunte quando não for possível confirmar:

### Investigar
- O que já existe hoje de captura de newsletter: componentes, rota de submissão
  atual (`/behavior` e o bypass de consentimento), onde o e-mail capturado é
  guardado (se é guardado) hoje.
- Se existe alguma biblioteca de envio de e-mail já instalada (nodemailer,
  SDK de algum provedor) ou qualquer menção a SMTP no projeto.
- Como o n8n é usado hoje na rede (outras automações) — é candidato natural
  para o motor de disparo assíncrono; confirmar se há um workflow parecido ou
  se seria do zero.
- Como as configurações por blog já são armazenadas (settings/admin) — para
  decidir onde entram os novos campos (remetente, template).
- Limites de recursos do container (`mem_limit`, se aplicável) que um worker de
  envio de e-mail precisaria respeitar.

### Perguntar ao usuário (não assumir)
- Cada blog tem lista de inscritos totalmente isolada, ou pode haver
  compartilhamento entre blogs do mesmo grupo?
- O disparo é manual (dono clica "enviar campanha"), agendado, ou os dois desde
  a v1?
- Para o remetente via Gmail comum: cada blog usa uma conta Gmail própria, ou
  existe uma conta compartilhada da BeeMedia disparando "em nome de"?
- Existe alguma expectativa de volume (quantos inscritos por blog, hoje ou
  projetado) que mude a escolha técnica do motor de disparo?
- O "Modelo de Layout" do e-mail precisa de editor visual (drag-and-drop) já
  nesta v1, ou um editor de texto rico (like o editor de artigo) já resolve?

Registre achados e perguntas em `newsletter-audit/00-investigacao.md` antes de
seguir para a Fase 1. Se houver pergunta bloqueante, pare e aguarde resposta.

---

## 3. Fase 1 — Geração do PRD (template obrigatório)

Com base na Fase 0, escreva `newsletter-audit/PRD-NEWSLETTER-01-captura-e-disparo.md`
seguindo este template — autocontido, para ser executado pelo próprio Claude
Code numa sessão futura sem memória desta conversa:

```markdown
# PRD-NEWSLETTER-01 — Captura e Disparo de Newsletter

## Objetivo
## Contexto / evidência (achados da Fase 0, arquivo:linha)

## Requisitos funcionais
- Captura (formulário estilizado conforme a imagem de referência)
- Admin: cadastro de remetente
- Admin: "Modelo de Layout" do e-mail de disparo
- Disparo (manual/agendado, conforme resposta da Fase 0)
- Descadastro (link obrigatório em todo e-mail)

## Requisitos não-funcionais
- Performance: captura não pode adicionar latência perceptível ao site público;
  critério de aceite mensurável (ex.: tempo de resposta do endpoint de captura,
  ausência de bloqueio no processo web)
- LGPD: consentimento explícito com timestamp; correção do bypass de
  consentimento existente (`Footer.tsx`, `HomeCustomBlocks.tsx`); lista de
  supressão; link de descadastro
- Multi-blog: isolamento de lista por blog (conforme confirmado na Fase 0)

## Modelo de dados
Tabela de inscritos, tabela/campo de template, campo de remetente por blog,
tabela de supressão/descadastro.

## Motor de disparo assíncrono
Fila/worker (n8n ou equivalente confirmado na Fase 0) — desenho de como o envio
sai do processo web/api.

## Contrato de API / admin
Endpoints de captura, de gestão de inscritos, de configuração de remetente e
template, de disparo de campanha.

## Fases internas de verificação
1. Captura funcionando + consentimento LGPD corrigido
2. Admin de configuração (remetente + template)
3. Motor de disparo assíncrono
4. Ponta a ponta: inscrição real → e-mail de teste recebido → descadastro
   funcionando

## Comandos de verificação (por fase interna, com resultado esperado)

## Critérios de aceite (verificáveis por comando ou observação objetiva)

## Invariantes preservadas
- CLS = 0 (o bloco de captura não pode causar layout shift)
- Performance do site público não regride
- Multi-blog: cada blog isolado

## Caminho de evolução (fora do MVP, registrado para o futuro)
Migração de Gmail comum para provedor de e-mail transacional dedicado —
o que muda no modelo de dados/motor de disparo quando isso acontecer.

## Dependências
## Estimativa de esforço
## Plano de rollback

## Notas de execução para o agente
- Trabalhe apenas neste PRD; não expanda escopo.
- Rode os comandos de verificação literalmente; não presuma sucesso.
- Se qualquer critério de aceite falhar: registre, reverta, pare.
- Ao concluir: atualize `newsletter-audit/STATUS.md`.
```

Antes de considerar a Fase 1 concluída, releia o PRD e confirme: faz sentido
lido sozinho? Todo critério de aceite é verificável por comando ou observação
objetiva? Se "não", reescreva antes de entregar.

---

## 4. Estrutura de entrega

```
newsletter-audit/
├── 00-investigacao.md              (Fase 0 — achados + perguntas respondidas)
├── PRD-NEWSLETTER-01-captura-e-disparo.md   (Fase 1)
├── STATUS.md                       (atualizar a cada fase interna do PRD)
└── RELATORIO-FINAL.md              (só após a implementação, Modo Execução)
```

---

## 5. Regras finais

- Não modificar código no Modo Planejamento.
- Não assumir sem evidência — pergunte antes de escrever o PRD.
- É um PRD único — não fragmentar em vários arquivos, mesmo a funcionalidade
  tendo várias partes (captura, admin, disparo).
- Corrigir o bypass de LGPD existente é parte do escopo, não um adendo.
- Persistir em disco a cada fase interna, atualizando `STATUS.md`.
