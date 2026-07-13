# Redesign do Dashboard — Painel Central

## Objetivo

Melhorar o dashboard atual do Painel Central, mantendo a identidade visual existente, mas transformando a tela em uma visão operacional completa.

O objetivo é criar uma central de monitoramento de notícias, IA, distribuição, blogs conectados e saúde do sistema.

Não alterar funcionalidades existentes. O foco é melhoria visual, organização das informações e novos indicadores.

---

## Estrutura visual proposta

Reorganizar o dashboard em blocos:

1. Resumo geral
2. Operação de notícias
3. Distribuição
4. Blogs conectados
5. Consumo de IA
6. Atividade recente
7. Saúde do sistema

A tela atual possui muitos cards semelhantes. Criar uma hierarquia melhor entre informações importantes e secundárias.

---

## Melhorias nos cards

Os cards atuais mostram apenas número e descrição.

Novo padrão:

- Ícone;
- Valor principal;
- Nome da métrica;
- Comparação com período anterior;
- Indicador de tendência;
- Contexto adicional.

Exemplo:

Antes:

```
1420
distribuídas
```

Depois:

```
🚀 1.420

Entregues hoje

+18% vs ontem
```

---

# Indicadores adicionais

## Notícias

Adicionar:

- Notícias recebidas hoje;
- Em fila de reescrita;
- Processando agora;
- Prontas para distribuição;
- Distribuídas;
- Falhas.

## Entregas

Adicionar:

- Total enviado;
- Taxa de sucesso;
- Falhas;
- Duplicadas;
- Tempo médio de entrega;
- Quantidade de blogs alcançados.

## IA

Adicionar:

- Chamadas realizadas;
- Tokens utilizados;
- Custo estimado;
- Média de tokens por notícia;
- Consumo por período.

---

# Gráficos

## Gráfico 1 — Evolução de entregas

Gráfico de linha:

- Últimos 7 dias;
- Últimos 30 dias.

Mostrar quantidade de notícias entregues por dia.

---

## Gráfico 2 — Status das notícias

Gráfico de rosca:

- Entregues;
- Pendentes;
- Falhas;
- Processando.

Objetivo: visualizar rapidamente a saúde da operação.

---

## Gráfico 3 — Consumo de IA

Gráfico de barras:

- Tokens por dia;
- Chamadas por dia;
- Custo estimado.

---

# Tabela de blogs conectados

Criar uma tabela operacional:

Colunas:

- Blog;
- Status;
- Última comunicação;
- Notícias enviadas hoje;
- Taxa de sucesso;
- Tendência.

Exemplo:

```
Portal X

🟢 Online

Última entrega:
há 3 minutos

320 notícias hoje

98% sucesso
```

Adicionar pequenos gráficos de tendência.

---

# Timeline de atividade recente

Criar uma área mostrando eventos:

Exemplos:

- Nova notícia recebida;
- Reescrita concluída;
- Envio realizado;
- Falha encontrada;
- Blog offline.

Formato:

```
✓ Notícia reescrita
há 5 minutos

✓ Enviada para 6 blogs
há 10 minutos

⚠ Falha no blog X
há 20 minutos
```

---

# Health Status

Adicionar um bloco de saúde do sistema:

Mostrar:

```
Sistema operacional

API:
🟢 Online

Banco:
🟢 Online

Blogs:
6/6 Online

IA:
🟢 Funcionando
```

---

# Performance

Adicionar resumo:

- Tempo médio de entrega;
- Taxa de sucesso;
- Quantidade de falhas;
- Processamentos de IA.

---

# Cabeçalho

Melhorar o topo:

Adicionar:

- Seleção de período;
- Última atualização;
- Atualização automática;
- Usuário logado.

Exemplo:

```
Dashboard

Visão geral do sistema em tempo real

[12/07/2026 - Hoje]

Atualização automática ✓
```

---

# Estilo visual

Seguir padrão SaaS moderno:

- Fundo claro;
- Muito espaço em branco;
- Cards elegantes;
- Bordas suaves;
- Sombras discretas;
- Ícones coloridos;
- Tipografia limpa.

Referências:

- Linear;
- Vercel Dashboard;
- Stripe Dashboard;
- Notion Admin.

---

# Responsividade

Desktop:

- Grid organizado;
- Gráficos lado a lado;
- Tabelas completas.

Tablet:

- Duas colunas.

Mobile:

- Cards empilhados;
- Gráficos adaptados;
- Tabelas com scroll.

---

# Resultado esperado

O dashboard deve funcionar como uma central profissional de operação de conteúdo.

O administrador deve conseguir responder rapidamente:

- Quantas notícias estão entrando?
- Quantas estão sendo processadas?
- Quantas foram entregues?
- Quais blogs estão funcionando?
- Existe algum problema?
- Quanto está sendo gasto com IA?
- A operação está melhorando ou piorando?

Não remover dados existentes. Apenas reorganizar, melhorar visualmente e adicionar indicadores úteis.
