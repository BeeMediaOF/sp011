# PRD 01 --- Arquitetura da IA, Engenharia de Prompts e Pipeline

> Documento técnico para implementação no Claude Code

## Objetivo

Este documento define como evoluir toda a arquitetura responsável pela
geração automática de notícias, preservando o padrão de escrita já
aprovado e aumentando significativamente a confiabilidade do sistema.

## Regra mais importante

O projeto já possui um prompt de reescrita aprovado.

**NÃO substitua esse prompt.**

Sua função é:

-   analisar profundamente o prompt existente;
-   identificar pontos fracos;
-   reduzir ambiguidades;
-   fortalecer instruções;
-   reduzir espaço para alucinações;
-   aumentar consistência;
-   manter exatamente o padrão de escrita já validado.

O estilo de escrita existente continua sendo a referência oficial.

------------------------------------------------------------------------

# Objetivos da nova arquitetura

A arquitetura deve priorizar:

-   fidelidade factual;
-   consistência;
-   previsibilidade;
-   SEO;
-   baixo consumo de tokens;
-   facilidade de manutenção;
-   modularidade;
-   facilidade para futuras melhorias.

Não priorizar criatividade acima da precisão.

------------------------------------------------------------------------

# Arquitetura recomendada

Não utilizar apenas uma chamada de IA para tudo sem validação.

Também não utilizar uma chamada separada para cada pequena tarefa, pois
isso aumentaria muito o consumo de tokens.

A arquitetura recomendada é híbrida.

Fluxo:

RSS ↓ Pré-processamento ↓ IA Principal ↓ Validação em Código ↓ IA
Auditora (apenas quando necessário) ↓ Publicação

------------------------------------------------------------------------

# Chamada principal da IA

A primeira chamada deverá executar conjuntamente:

-   análise da notícia;
-   extração de fatos;
-   reescrita;
-   geração do título;
-   geração do resumo;
-   geração do slug;
-   meta description;
-   tags;
-   categoria;
-   confiança da categoria;
-   score de qualidade;
-   observações internas.

Toda a resposta deve ser retornada em JSON estruturado.

------------------------------------------------------------------------

# Engenharia do prompt de reescrita

O prompt atual deve permanecer como base.

Adicionar regras explícitas:

-   nunca inventar fatos;
-   nunca alterar datas;
-   nunca alterar horários;
-   nunca alterar nomes;
-   nunca alterar números;
-   nunca alterar estatísticas;
-   nunca alterar placares;
-   nunca alterar locais;
-   nunca alterar empresas;
-   nunca utilizar conhecimento externo;
-   nunca preencher lacunas.

Caso uma informação não exista na notícia original, ela não deve
aparecer na versão reescrita.

A IA deve priorizar fidelidade em vez de criatividade.

------------------------------------------------------------------------

# Engenharia do prompt do título

O título deve:

-   representar exatamente a notícia;
-   manter SEO;
-   favorecer Google Discover;
-   ser natural;
-   evitar clickbait enganoso;
-   destacar o assunto principal.

Nunca alterar o foco da notícia.

------------------------------------------------------------------------

# Engenharia do prompt da categoria

Transformar o prompt em um classificador contextual.

Antes de escolher a categoria:

1.  identificar o assunto principal;
2.  identificar assuntos secundários;
3.  identificar entidades;
4.  identificar esporte, competição, empresa ou tema;
5.  comparar todas as categorias disponíveis.

A decisão nunca deve ser baseada apenas em palavras isoladas.

Retornar:

-   categoria;
-   confiança (%);
-   justificativa resumida.

------------------------------------------------------------------------

# Estratégia anti-alucinação

Adicionar regras explícitas ao prompt:

-   não assumir informações implícitas;
-   não criar estatísticas;
-   não criar citações;
-   não criar contexto;
-   não completar informações ausentes;
-   não modificar fatos.

Caso exista dúvida, manter apenas o que é suportado pelo texto original.

------------------------------------------------------------------------

# Estratégia para reduzir consumo de tokens

Uma única chamada principal deve produzir:

-   notícia;
-   título;
-   resumo;
-   slug;
-   SEO;
-   categoria;
-   score.

A segunda chamada de IA deve ocorrer somente quando:

-   confiança da categoria estiver abaixo do limite;
-   score de qualidade estiver abaixo do mínimo;
-   houver conflito semântico;
-   o RSS estiver incompleto.

Todo o restante deve ser validado pelo backend sem utilizar IA.

------------------------------------------------------------------------

# Estrutura sugerida do JSON

A resposta da IA deve conter campos estruturados para:

-   notícia reescrita;
-   título;
-   resumo;
-   slug;
-   meta description;
-   tags;
-   categoria;
-   confiança;
-   score;
-   alertas;
-   observações.

Evitar respostas livres em texto.

------------------------------------------------------------------------

# Score de qualidade

Gerar pontuações independentes para:

-   fidelidade factual;
-   fluidez;
-   ortografia;
-   SEO;
-   categoria;
-   título;
-   coerência.

Calcular uma nota final.

Essa nota será utilizada nas próximas etapas do pipeline.

------------------------------------------------------------------------

# Critérios desta fase

Antes de alterar qualquer prompt:

1.  analisar completamente o prompt atual;
2.  explicar os problemas encontrados;
3.  justificar cada melhoria;
4.  manter compatibilidade com o comportamento já aprovado;
5.  somente depois iniciar a implementação.

Não modificar código antes dessa análise.
