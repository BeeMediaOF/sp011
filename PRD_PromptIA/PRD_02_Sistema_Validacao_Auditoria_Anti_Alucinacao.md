# PRD 02 — Sistema de Validação, Auditoria e Anti-Alucinação

> Documento técnico para implementação no Claude Code.

---

# Objetivo

Este documento define toda a camada de validação do pipeline de publicação automática de notícias.

O objetivo desta etapa é garantir que **nenhuma notícia seja publicada automaticamente sem passar por verificações estruturais, semânticas e editoriais**.

A IA deve deixar de ser apenas um gerador de conteúdo e passar a fazer parte de um pipeline controlado por regras de negócio.

A prioridade absoluta é:

- Precisão
- Confiabilidade
- Consistência
- Segurança
- Redução de alucinações

Velocidade nunca deve ser priorizada em detrimento da qualidade.

---

# Objetivos da validação

Toda notícia deve responder positivamente às seguintes perguntas antes da publicação:

- O conteúdo representa fielmente a notícia original?
- Existe alguma informação inventada?
- O título representa corretamente o texto?
- A categoria realmente corresponde ao assunto predominante?
- O SEO está coerente?
- A notícia possui todos os campos obrigatórios?
- Existe risco de duplicidade?
- Existe alguma inconsistência estrutural?

Caso qualquer resposta seja negativa, a notícia não deverá ser publicada automaticamente.

---

# Filosofia da validação

Nem toda validação precisa utilizar IA.

Na verdade, a maior parte das verificações pode ser feita diretamente pelo backend.

A IA deve ser utilizada apenas quando for realmente necessária.

Isso reduz:

- consumo de tokens;
- tempo de processamento;
- custo operacional.

---

# Arquitetura recomendada

O pipeline deverá seguir obrigatoriamente a seguinte ordem:

```

RSS

↓

Pré-processamento

↓

IA Principal

↓

Validação Estrutural (Código)

↓

Validação Semântica (Código)

↓

IA Auditora (somente quando necessário)

↓

Publicação

```

A publicação somente poderá ocorrer após todas as etapas anteriores serem aprovadas.

---

# Validação Estrutural

Essas validações não precisam utilizar IA.

Devem ser executadas diretamente pelo backend.

Verificações obrigatórias:

## Conteúdo

- título preenchido;
- notícia preenchida;
- resumo preenchido;
- slug preenchido;
- categoria preenchida;
- meta description preenchida;
- imagem principal existente.

---

## Tamanho

Validar:

- título mínimo;
- título máximo;
- resumo mínimo;
- resumo máximo;
- quantidade mínima de palavras;
- quantidade máxima de palavras.

Evitar tanto conteúdos extremamente curtos quanto excessivamente longos.

---

## HTML

Verificar:

- HTML válido;
- tags fechadas;
- ausência de scripts;
- ausência de atributos perigosos;
- ausência de código malicioso.

---

## URLs

Verificar:

- imagem acessível;
- links válidos;
- links internos corretos;
- domínio permitido.

---

## Dados obrigatórios

Confirmar:

- fonte registrada;
- data da notícia;
- autor (quando existir);
- idioma.

---

# Validação da categoria

A categoria deve existir no sistema.

Não permitir:

- categoria inexistente;
- categoria desativada;
- categoria removida.

Caso isso aconteça:

bloquear publicação.

---

# Validação do slug

Verificar:

- caracteres válidos;
- unicidade;
- tamanho;
- remoção de caracteres especiais.

Caso exista slug duplicado:

gerar alternativa automaticamente.

---

# Detecção de duplicidade

Implementar múltiplas camadas.

## Hash

Comparar hash da notícia.

---

## Similaridade

Comparar:

- título;
- conteúdo;
- URL da fonte.

Caso a similaridade ultrapasse determinado limite configurável:

enviar para revisão.

---

# Validação semântica

Essa etapa verifica se o resultado faz sentido.

Ela pode ser parcialmente implementada em código.

Exemplos:

Uma notícia sobre:

NBA

não pode ser publicada em:

Futebol.

Uma notícia sobre:

Fórmula 1

não pode ir para:

Basquete.

Uma notícia sobre:

Apple Inc.

não pode ser classificada como Agricultura apenas porque aparece a palavra "Apple".

Sempre analisar contexto.

---

# Sistema de confiança

A IA principal deverá retornar:

```

categoria

confiança_categoria

score_geral

alertas

```

Exemplo:

```

Categoria:
Futebol

Confiança:
98%

```

A confiança mínima deve ser configurável.

Exemplo:

```

Categoria >= 90%

```

Caso contrário:

enviar para auditoria.

---

# Score de qualidade

Gerar notas independentes.

## Fidelidade factual

0–100

---

## Categoria

0–100

---

## Fluidez

0–100

---

## Ortografia

0–100

---

## SEO

0–100

---

## Título

0–100

---

## Coerência

0–100

---

## Nota final

Calcular média ponderada.

O peso da fidelidade factual deve ser maior que o das demais métricas.

---

# IA Auditora

A segunda chamada de IA não deve acontecer sempre.

Ela só deverá ser utilizada quando houver baixa confiança ou inconsistências detectadas.

Ela nunca deve reescrever a notícia.

Ela apenas audita.

---

# Perguntas obrigatórias da auditoria

Responder:

Existe informação inventada?

SIM ou NÃO

---

O título representa corretamente o texto?

SIM ou NÃO

---

A categoria está correta?

SIM ou NÃO

---

Existe contradição?

SIM ou NÃO

---

Existe exagero?

SIM ou NÃO

---

O SEO está coerente?

SIM ou NÃO

---

A notícia pode ser publicada?

SIM ou NÃO

---

Justifique todas as respostas negativas.

---

# Casos especiais

Criar regras específicas para:

## RSS incompleto

Quando faltar contexto suficiente:

não publicar automaticamente.

---

## Notícias muito curtas

Caso a notícia possua poucas informações:

não inventar conteúdo.

---

## Notícias em atualização

Se a notícia indicar que ainda está em andamento:

evitar frases conclusivas.

---

## Conteúdo promocional

Detectar automaticamente.

Caso seja identificado:

encaminhar para revisão.

---

## Notícias sem categoria evidente

Não escolher categoria aleatoriamente.

Encaminhar para auditoria.

---

# Logging

Registrar absolutamente todas as decisões.

Campos mínimos:

- data;
- hora;
- fonte;
- URL original;
- categoria escolhida;
- confiança;
- score;
- versão do prompt;
- tempo de processamento;
- validações executadas;
- motivo da aprovação;
- motivo da reprovação.

Esses logs serão utilizados para auditorias futuras.

---

# Dashboard de qualidade

Criar métricas como:

- taxa de aprovação;
- taxa de reprovação;
- quantidade de auditorias;
- categorias mais corrigidas;
- notícias bloqueadas;
- duplicidades detectadas;
- média de confiança;
- média do score;
- principais motivos de rejeição.

Esses indicadores serão utilizados posteriormente no Painel Central.

---

# Critérios de aceite

Esta etapa somente será considerada concluída quando:

- nenhuma notícia puder ser publicada sem validação;
- todas as validações forem registradas;
- a auditoria ocorrer apenas em casos necessários;
- o consumo de tokens permanecer controlado;
- notícias inconsistentes deixarem de ser publicadas automaticamente.

---

# Ordem de implementação

Antes de alterar qualquer código:

1. Analisar todo o pipeline atual.
2. Identificar quais validações já existem.
3. Identificar quais validações estão faltando.
4. Documentar todas as mudanças propostas.
5. Apresentar o plano de implementação.
6. Aguardar aprovação.

Somente após a aprovação iniciar a implementação.

---

# Importante

Não criar validações redundantes.

Sempre que uma verificação puder ser realizada em código, ela deve ser feita em código.

Utilizar IA apenas para decisões que realmente exigem interpretação semântica.

O objetivo desta arquitetura é obter a maior confiabilidade possível com o menor consumo possível de tokens.

Essa camada deve ser modular, permitindo adicionar novas validações futuramente sem alterar o restante do pipeline.