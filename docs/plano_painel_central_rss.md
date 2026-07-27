ISg# Plano para Centralização da Coleta, Reescrita e Distribuição de Notícias RSS

Quero que você analise a arquitetura atual do projeto antes de sugerir qualquer alteração ou começar a implementar.

## Contexto atual

Hoje temos um blog que possui:

- Coleta automática de notícias por RSS;
- Reescrita das notícias utilizando inteligência artificial;
- Publicação automática dos conteúdos;
- Painel administrativo próprio;
- Configurações relacionadas às fontes RSS, categorias, reescrita, publicação e gerenciamento dos conteúdos;
- Banco de dados próprio.

A intenção é replicar esse blog para várias empresas ou clientes. Cada empresa poderá ter seu próprio blog, identidade visual, domínio, configurações e nicho de conteúdo.

Entretanto, não quero que cada blog faça individualmente a coleta e a reescrita das mesmas notícias, pois isso poderia gerar:

- Consumo duplicado de tokens das APIs de inteligência artificial;
- Processamento repetido da mesma notícia;
- Armazenamento duplicado de conteúdos semelhantes em vários bancos de dados;
- Maior dificuldade para gerenciar fontes RSS, prompts, automações e regras de distribuição;
- Maior custo de manutenção e infraestrutura.

## Ideia principal

Quero avaliar a criação de um painel administrativo central, separado dos blogs, responsável principalmente por:

1. Coletar notícias das fontes RSS;
2. Identificar conteúdos duplicados ou semelhantes;
3. Classificar as notícias por tema, categoria, esporte, campeonato, localização, palavras-chave ou outros critérios;
4. Reescrever o conteúdo utilizando inteligência artificial;
5. Armazenar centralmente os conteúdos processados;
6. Distribuir as notícias para os blogs conectados;
7. Controlar quais notícias cada blog pode receber;
8. Monitorar o status de envio, publicação, falhas e tentativas de reprocessamento.

Os blogs continuariam tendo seus próprios painéis administrativos e funcionalidades locais. Não quero reconstruir completamente o painel atual nem remover funcionalidades importantes do blog.

O painel central deve assumir principalmente a responsabilidade pela coleta, processamento, reescrita e distribuição das notícias.

## Comunicação com os blogs

O painel central precisa ter uma forma segura de se comunicar com todos os blogs cadastrados.

Deve existir uma maneira de conectar manualmente um novo blog ao painel central. Essa conexão pode utilizar, por exemplo:

- API REST;
- Webhooks;
- Chaves de API;
- Tokens;
- Assinatura HMAC;
- Credenciais individuais por blog;
- Outro mecanismo que você considerar mais adequado.

Quero que você avalie qual arquitetura de comunicação é mais segura, escalável, simples de manter e compatível com o projeto existente.

Cada blog conectado deverá ter, no mínimo:

- Nome;
- Domínio;
- URL da API;
- Credencial ou chave de autenticação;
- Status da conexão;
- Data da última comunicação;
- Categorias permitidas;
- Categorias bloqueadas;
- Fontes permitidas ou bloqueadas;
- Palavras-chave de interesse;
- Palavras-chave proibidas;
- Regras de publicação;
- Status ativo ou inativo;
- Configurações específicas de distribuição.

## Controle de distribuição

Preciso ter controle completo sobre quais conteúdos serão enviados para cada blog.

Exemplo:

- Um blog pode ser exclusivamente esportivo;
- Outro pode receber somente futebol;
- Outro pode receber apenas notícias de determinados campeonatos;
- Outro pode receber notícias gerais;
- Outro pode receber esportes e entretenimento;
- Outro pode receber somente notícias de determinadas fontes;
- Outro pode bloquear temas, clubes, pessoas ou palavras-chave específicas.

O sistema deve permitir regras como:

- Distribuição por categoria;
- Distribuição por subcategoria;
- Distribuição por tags;
- Distribuição por fonte RSS;
- Distribuição por palavras-chave;
- Distribuição por entidade mencionada;
- Distribuição por relevância;
- Distribuição por localização;
- Distribuição por horário;
- Distribuição por prioridade;
- Distribuição manual;
- Distribuição automática;
- Limite diário de publicações por blog;
- Intervalo mínimo entre publicações;
- Aprovação manual antes do envio;
- Publicação imediata ou agendada.

Também quero avaliar se cada blog poderá receber:

- O mesmo conteúdo reescrito pelo painel central;
- Uma variação da reescrita adaptada para cada blog;
- Um título diferente;
- Uma introdução diferente;
- Um tom de voz específico;
- SEO específico;
- Categorias e tags locais;
- Imagem destacada diferente;
- Links internos próprios;
- Chamadas para ação específicas.

Analise o impacto dessas personalizações sobre o objetivo de economizar tokens.

## Deduplicação e reaproveitamento

O sistema deve evitar processar repetidamente a mesma notícia.

Analise estratégias para identificar duplicidade por meio de:

- URL original;
- GUID do RSS;
- Título normalizado;
- Hash do conteúdo;
- Similaridade textual;
- Similaridade semântica;
- Fonte e data de publicação;
- Combinação de entidades, título e assunto.

Avalie também se devemos manter:

- Uma notícia original central;
- Uma versão reescrita central;
- Variações específicas por blog;
- Apenas referências da notícia nos bancos dos blogs;
- Uma cópia completa do conteúdo em cada blog;
- Um modelo híbrido.

Considere que os blogs precisam continuar funcionando mesmo se o painel central ficar temporariamente indisponível.

## Responsabilidades do painel central

Avalie se o painel central deve administrar:

- Fontes RSS;
- Categorias globais;
- Categorias por blog;
- Prompts de reescrita;
- Modelos de inteligência artificial;
- Credenciais das APIs de IA;
- Fila de processamento;
- Fila de distribuição;
- Histórico das notícias;
- Conteúdos duplicados;
- Erros;
- Logs;
- Tentativas de reenvio;
- Custos de tokens;
- Consumo por blog;
- Limites mensais;
- Agendamento;
- Aprovação editorial;
- Usuários e permissões;
- Métricas de publicação;
- Status de cada blog;
- Versionamento dos conteúdos;
- Auditoria das alterações.

## Responsabilidades dos blogs

Avalie quais funcionalidades devem permanecer locais em cada blog, como:

- Identidade visual;
- Layout;
- Banners;
- Páginas;
- Menus;
- Rodapé;
- SEO local;
- Categorias locais;
- Tags;
- Autores;
- Usuários;
- Comentários;
- Publicações manuais;
- Edição final das notícias;
- Imagens;
- Configurações de domínio;
- Analytics;
- Configurações específicas do cliente.

Quero evitar uma dependência excessiva do painel central para tarefas que podem continuar sendo realizadas diretamente no blog.

## Segurança

Analise os requisitos de segurança da comunicação entre o painel central e os blogs.

Considere:

- Autenticação individual por blog;
- Rotação de chaves;
- Criptografia dos segredos;
- HTTPS obrigatório;
- Assinatura das requisições;
- Proteção contra replay;
- Limitação de requisições;
- Lista de IPs permitidos;
- Permissões por escopo;
- Revogação de acesso;
- Registro de auditoria;
- Validação dos dados recebidos;
- Proteção contra envio duplicado;
- Idempotência;
- Controle de versões da API.

## Confiabilidade

O sistema deve tratar corretamente:

- Blog temporariamente offline;
- API do blog indisponível;
- Falha na coleta RSS;
- Falha na API de inteligência artificial;
- Falha no banco de dados;
- Conteúdo duplicado;
- Envio duplicado;
- Timeout;
- Erro de autenticação;
- Mudança na estrutura de um RSS;
- Conteúdo incompleto;
- Imagem indisponível;
- Reprocessamento;
- Reenvio automático;
- Dead-letter queue;
- Logs detalhados.

Avalie a necessidade de utilizar filas, jobs, workers, retries, cache e processamento assíncrono.

## Escalabilidade

Considere que inicialmente podem existir poucos blogs, mas futuramente o sistema poderá atender dezenas ou centenas de blogs.

Analise:

- Separação entre coleta, reescrita e distribuição;
- Filas de processamento;
- Workers independentes;
- Processamento em lote;
- Cache;
- Rate limits das APIs de IA;
- Rate limits dos blogs;
- Escalabilidade horizontal;
- Multi-tenant;
- Isolamento dos clientes;
- Métricas de consumo por blog;
- Priorização de filas;
- Controle de custos;
- Crescimento do banco de dados;
- Retenção e arquivamento de conteúdos.

## Compatibilidade com o sistema existente

Antes de propor a arquitetura, analise o código atual para entender:

1. Como a coleta RSS funciona;
2. Como as notícias são armazenadas;
3. Como a reescrita por IA funciona;
4. Como as publicações são criadas;
5. Como o painel administrativo está estruturado;
6. Quais serviços e módulos já podem ser reaproveitados;
7. Quais partes estão muito acopladas;
8. Quais mudanças seriam necessárias nos blogs;
9. Se já existem APIs ou endpoints reutilizáveis;
10. Como migrar sem interromper o funcionamento atual.

Não quero uma proposta genérica. O plano deve considerar a estrutura real do projeto.

## O que você deve entregar

Depois de analisar o projeto e esclarecer as dúvidas, apresente:

### 1. Análise de viabilidade

Explique:

- Se a ideia é tecnicamente viável;
- Quais benefícios reais ela oferece;
- Quais problemas ela resolve;
- Quais novos riscos ela cria;
- Em que cenários ela não seria recomendada;
- Se realmente haverá economia de tokens e banco de dados;
- Onde os custos poderão apenas ser transferidos, em vez de eliminados.

### 2. Arquitetura recomendada

Apresente:

- Visão geral da arquitetura;
- Responsabilidades de cada componente;
- Fluxo completo desde a coleta até a publicação;
- Modelo de comunicação entre o painel central e os blogs;
- Estratégia de autenticação;
- Estratégia de filas;
- Estratégia de deduplicação;
- Estratégia de armazenamento;
- Estratégia para indisponibilidade;
- Estratégia de observabilidade;
- Estratégia de versionamento da API.

Inclua um diagrama textual ou Mermaid da arquitetura proposta.

### 3. Comparação de alternativas

Compare pelo menos estas abordagens:

- Painel central enviando conteúdos para os blogs;
- Blogs consultando periodicamente o painel central;
- Comunicação por webhooks;
- Comunicação por fila ou mensageria;
- Banco central compartilhado;
- Bancos separados com sincronização;
- Arquitetura híbrida.

Para cada opção, explique vantagens, desvantagens, complexidade, segurança, custo e impacto sobre o sistema existente.

### 4. Modelo de dados

Sugira as principais entidades e relacionamentos, como:

- Blogs;
- Credenciais;
- Fontes RSS;
- Notícias originais;
- Notícias reescritas;
- Variações por blog;
- Categorias;
- Tags;
- Regras de distribuição;
- Filas;
- Entregas;
- Tentativas de entrega;
- Logs;
- Consumo de tokens;
- Usuários;
- Permissões.

Não é necessário criar todas as migrations neste momento, mas apresente uma estrutura inicial coerente.

### 5. Contrato da API

Proponha os principais endpoints necessários, incluindo:

- Cadastro e conexão de blogs;
- Teste de conexão;
- Envio de conteúdo;
- Confirmação de recebimento;
- Atualização de status;
- Consulta de categorias;
- Sincronização de configurações;
- Reenvio;
- Revogação de acesso;
- Health check.

Apresente exemplos resumidos de payloads, autenticação e respostas.

### 6. Fluxos operacionais

Descreva os fluxos de:

- Cadastro de um novo blog;
- Teste de conexão;
- Coleta de uma notícia;
- Deduplicação;
- Reescrita;
- Classificação;
- Seleção dos blogs elegíveis;
- Envio;
- Confirmação;
- Publicação;
- Falha;
- Reenvio;
- Edição posterior;
- Desativação de um blog.

### 7. Plano de migração

Monte uma estratégia progressiva para migrar o sistema atual sem quebrar os blogs existentes.

Considere etapas como:

- Extração dos serviços atuais;
- Criação da API nos blogs;
- Criação do painel central;
- Teste com um único blog;
- Operação paralela;
- Migração gradual das fontes RSS;
- Migração da reescrita;
- Migração da distribuição;
- Monitoramento;
- Desativação controlada dos processos duplicados.

### 8. Plano de implementação

Divida o trabalho em fases, com:

- Objetivo de cada fase;
- Alterações necessárias;
- Arquivos ou módulos afetados;
- Dependências;
- Riscos;
- Critérios de aceite;
- Testes necessários;
- Ordem recomendada.

Separe claramente:

- MVP;
- Melhorias posteriores;
- Funcionalidades opcionais;
- Funcionalidades que devem ser evitadas inicialmente.

### 9. Testes

Defina uma estratégia de testes para:

- Autenticação;
- Autorização;
- Deduplicação;
- Classificação;
- Regras de distribuição;
- Idempotência;
- Envio;
- Reenvio;
- Falhas de rede;
- Blog offline;
- Processamento concorrente;
- Limites de publicação;
- Isolamento entre clientes;
- Migração;
- Compatibilidade com o fluxo atual.

### 10. Riscos e decisões técnicas

Liste:

- Riscos técnicos;
- Riscos de segurança;
- Riscos de custo;
- Riscos de dependência central;
- Riscos de perda ou duplicação de conteúdo;
- Riscos de manutenção;
- Decisões que precisam ser tomadas antes da implementação.

## Ordem obrigatória de execução

Não comece a modificar o código ainda.

Siga esta ordem:

1. Analise detalhadamente o projeto atual;
2. Identifique os módulos relacionados à coleta RSS, reescrita, armazenamento, publicação e painel administrativo;
3. Explique resumidamente como o fluxo atual funciona;
4. Liste os pontos de acoplamento e os componentes reutilizáveis;
5. Faça perguntas objetivas para esclarecer requisitos, regras de negócio, infraestrutura, custos e comportamento esperado;
6. Aguarde as minhas respostas;
7. Somente depois apresente a análise de viabilidade e o plano detalhado de implementação;
8. Não implemente nenhuma alteração até que o plano seja aprovado.

Ao fazer as perguntas, agrupe-as por tema e evite perguntar algo que possa ser descoberto diretamente pela análise do código.
