# Planejamento para Replicação, Deploy e Provisionamento de Novos Blogs

Preciso que você analise o projeto atual e a infraestrutura antes de propor alterações ou iniciar qualquer implementação.

## Contexto atual

Hoje temos o blog `sp011` funcionando em produção.

Ele já possui:

- Frontend;
- Backend;
- Painel administrativo;
- Banco de dados;
- Deploy com Docker;
- Domínio próprio;
- Integração com o painel central de coleta, reescrita e distribuição de notícias;
- Recebimento automático das notícias enviadas pela central;
- Configuração da identidade visual pelo painel administrativo local;
- Configuração das informações e regras específicas de cada blog.

A integração com o painel central **já foi implementada, testada e está funcionando**.

Portanto, não é necessário planejar novamente:

- A coleta centralizada;
- A reescrita centralizada;
- A distribuição das notícias;
- A conexão entre o painel central e os blogs;
- O endpoint de ingestão;
- A autenticação da integração;
- As regras de envio de notícias.

Também já é possível alterar diretamente no painel administrativo de cada blog:

- Nome do blog;
- Logo;
- Cores;
- Identidade visual;
- Informações institucionais;
- Configurações locais;
- Banco de dados;
- Regras de conteúdo;
- Categorias;
- Outros detalhes específicos de cada cliente.

Esses pontos não representam mais um obstáculo para a replicação.

## Necessidade atual

Preciso subir alguns blogs novos ainda hoje.

Todos terão a mesma estrutura de código e as mesmas funcionalidades do `sp011`.

As diferenças serão configuradas posteriormente dentro do painel administrativo de cada blog.

Na prática, cada novo blog precisa apenas de:

- Domínio próprio;
- Instância própria;
- Configuração própria;
- Banco de dados próprio;
- Volumes próprios, quando necessários;
- Secrets próprios;
- Cadastro e conexão com o painel central já existente.

O problema que precisamos resolver é descobrir qual é a forma mais rápida, segura e eficiente de criar e manter essas novas instalações.

## Questão principal

Preciso que você compare duas necessidades:

### Curto prazo

Qual é a forma mais segura e rápida de colocar alguns blogs no ar ainda hoje?

### Médio e longo prazo

Como automatizar a criação de novos blogs para que eu não precise repetir manualmente todo o processo de deploy?

A solução futura ideal seria permitir algo semelhante a:

```text
Solicitar criação de novo blog
    ↓
Gerar configuração da instalação
    ↓
Criar ou iniciar containers
    ↓
Configurar domínio e proxy
    ↓
Conectar o banco
    ↓
Executar migrations
    ↓
Criar o administrador inicial
    ↓
Registrar o blog no painel central
    ↓
Executar health checks
    ↓
Liberar o blog
```

Avalie se isso deve acontecer:

- Diretamente pelo painel central;
- Por um serviço de provisionamento separado;
- Por scripts executados na VPS;
- Por uma ferramenta de deploy;
- Por uma combinação dessas opções.

## O que deve ser analisado

Não concentre a análise na identidade visual ou nas funcionalidades internas dos blogs, pois essas partes já são configuráveis pelo painel administrativo.

Também não concentre a análise na integração com a central, pois ela já está pronta.

O foco deve estar em:

- Replicação das instâncias;
- Deploy;
- Docker;
- Imagens;
- Containers;
- Domínios;
- Proxy reverso;
- Certificados;
- Variáveis de ambiente;
- Secrets;
- Volumes;
- Bancos independentes;
- Atualizações;
- Rollbacks;
- Backups;
- Consumo de memória;
- Consumo de CPU;
- Organização operacional;
- Automação da criação de novos blogs.

## Alternativas que devem ser comparadas

### Opção 1 — Copiar todo o projeto para cada blog

Cada novo blog teria uma cópia completa do projeto `sp011`.

Exemplo:

```text
projects/
├── sp011/
├── blog-cliente-a/
├── blog-cliente-b/
└── blog-cliente-c/
```

Cada cópia teria seus próprios arquivos, Dockerfiles e configurações.

Analise:

- Velocidade para subir hoje;
- Facilidade de configuração;
- Risco de divergência entre cópias;
- Trabalho para atualizar todos os blogs;
- Uso de disco;
- Possibilidade de correções diferentes entre instalações;
- Impacto na manutenção futura.

### Opção 2 — Mesmo código e mesma imagem, com instalações independentes

Todos os blogs utilizariam a mesma imagem Docker ou a mesma versão do projeto.

Cada blog teria apenas:

- Nome ou identificador da instalação;
- Arquivo de ambiente próprio;
- Containers próprios;
- Banco próprio;
- Domínio próprio;
- Secrets próprios;
- Volumes próprios.

Exemplo:

```text
Imagem: blog-platform:v1.0.0

Instâncias:
├── sp011
├── cliente-a
├── cliente-b
└── cliente-c
```

Analise se essa é a solução mais adequada para o curto e médio prazo.

Considere:

- Um único build;
- Uma única base de código;
- Reutilização das camadas da imagem Docker;
- Atualização por versão;
- Rollback por tag;
- Isolamento entre instalações;
- Possibilidade de atualizar alguns blogs antes dos demais;
- Redução de trabalho manual;
- Consumo de memória por instância.

### Opção 3 — Uma única aplicação multi-tenant

Avalie uma arquitetura em que um único frontend e um único backend atendam todos os domínios.

O tenant seria identificado pelo domínio da requisição.

Analise:

- Economia de memória;
- Complexidade da adaptação;
- Necessidade de alterar o banco e adicionar `tenant_id`;
- Possibilidade de continuar usando bancos separados;
- Segurança e isolamento;
- Risco de vazamento de dados;
- Impacto no código existente;
- Tempo necessário;
- Compatibilidade com a necessidade de subir blogs hoje.

Não recomende multi-tenancy apenas pelo menor consumo de RAM. Considere o custo real da refatoração e os riscos.

### Opção 4 — Provisionamento automatizado pelo painel central

Avalie se o painel central poderia ter uma área como:

```text
Novo blog
```

Nessa tela, eu informaria:

- Identificador da instalação;
- Domínio;
- Versão da imagem;
- Configuração do banco;
- Secrets iniciais;
- E-mail do administrador;
- Limites de recursos;
- Outras informações necessárias ao deploy.

O sistema poderia então:

1. Gerar os arquivos de configuração;
2. Criar os volumes;
3. Iniciar os containers;
4. Configurar o proxy;
5. Solicitar o certificado SSL;
6. Testar a conexão com o banco;
7. Executar migrations;
8. Criar o primeiro administrador;
9. Registrar o blog na central;
10. Executar testes de saúde;
11. Marcar a instalação como disponível.

Analise se isso é viável e seguro.

Não dê acesso direto ao Docker socket para o painel central sem avaliar os riscos.

Compare alternativas como:

- Painel central executando diretamente;
- Serviço de provisionamento separado;
- Worker restrito;
- Scripts na VPS;
- Docker Compose parametrizado;
- Docker API protegida;
- GitHub Actions;
- Portainer;
- Coolify;
- Dokploy;
- Outro mecanismo compatível com a infraestrutura atual.

### Opção 5 — Arquitetura híbrida

Avalie uma abordagem intermediária:

- Uma única base de código;
- Uma única imagem Docker versionada;
- Instalação independente por blog;
- Banco independente por blog;
- Containers e volumes próprios;
- Identidade configurada no painel local;
- Integração com a central já pronta;
- Provisionamento inicialmente feito por script;
- Futuramente solicitado pelo painel central;
- Execução feita por um serviço separado e restrito.

Essa opção parece equilibrar isolamento, manutenção e facilidade de criação, mas deve ser validada com base no projeto real.

## Componentes que podem ser compartilhados

Analise quais componentes podem ser compartilhados sem prejudicar o isolamento.

Considere:

- Imagem Docker;
- Código-fonte;
- Build do frontend;
- Rede Docker;
- Caddy ou outro proxy;
- Certificados;
- Logs;
- Monitoramento;
- Backup;
- Serviço de provisionamento;
- Painel central.

## Componentes que devem permanecer isolados

Avalie quais componentes devem ser separados por blog.

Considere:

- Banco de dados;
- Credenciais;
- Secrets;
- Usuários;
- Volumes de uploads;
- Cache;
- Logs específicos;
- Containers;
- Limites de recursos;
- Configurações;
- Domínio;
- Backups.

## Consumo de memória e CPU

A integração com a central já está funcionando. Portanto, os blogs não precisam realizar localmente a coleta e reescrita das notícias.

Analise quais processos do blog podem ser desligados quando a central estiver ativa:

- Scheduler de coleta RSS;
- Processador de RSS;
- Fila de reescrita;
- Chamadas para IA;
- Workers relacionados à coleta;
- Processos de classificação que agora pertencem à central;
- Outros jobs locais desnecessários.

Verifique no código se esses processos continuam iniciando mesmo quando não são usados.

Analise o consumo de cada instância considerando:

- Backend Node.js;
- Frontend;
- Pool de banco;
- Cache;
- Uploads;
- Schedulers;
- Workers;
- Logs;
- Health checks.

Considere melhorias como:

- Servir o frontend estático diretamente pelo Caddy;
- Não manter um container Node apenas para o frontend, caso não seja necessário;
- Utilizar uma única imagem Docker para todas as instâncias;
- Reutilizar as camadas da imagem;
- Limitar memória e CPU por container;
- Diminuir o pool de conexões por blog;
- Desativar processos locais substituídos pela central;
- Configurar health checks e restart policies;
- Evitar serviços duplicados desnecessariamente.

## Bancos de dados

Cada blog utilizará banco independente.

Pode ser:

- Projeto Supabase próprio;
- Conta Supabase própria;
- PostgreSQL externo;
- Outro provedor compatível.

O painel central não deve acessar diretamente o banco de nenhum blog.

A conexão permanece:

```text
Painel central
    ↓ API do blog
Blog
    ↓ conexão privada
Banco exclusivo do blog
```

A configuração do banco já é alterável dentro do painel administrativo do blog.

Analise apenas como essa configuração entra no processo de provisionamento.

Determine se o processo inicial será:

- Subir o blog em modo de instalação;
- Configurar o banco pelo painel;
- Executar migrations;
- Reiniciar o backend;
- Liberar as funcionalidades.

Ou se, para os blogs que precisam subir hoje, é mais seguro configurar a connection string diretamente pelo arquivo de ambiente.

Compare os dois fluxos.

## Organização das instalações

Avalie estruturas como:

```text
deployments/
├── sp011/
│   ├── compose.yml
│   ├── .env
│   └── data/
├── cliente-a/
│   ├── compose.yml
│   ├── .env
│   └── data/
├── cliente-b/
│   ├── compose.yml
│   ├── .env
│   └── data/
└── cliente-c/
    ├── compose.yml
    ├── .env
    └── data/
```

Ou:

```text
deployments/
├── templates/
│   └── blog.compose.yml
├── configs/
│   ├── sp011.env
│   ├── cliente-a.env
│   ├── cliente-b.env
│   └── cliente-c.env
├── scripts/
│   ├── create-blog.sh
│   ├── start-blog.sh
│   ├── update-blog.sh
│   ├── rollback-blog.sh
│   ├── backup-blog.sh
│   └── remove-blog.sh
└── state/
```

Compare as opções e recomende uma estrutura.

## Portas e proxy

Analise como evitar conflitos de portas ao subir várias instalações.

Avalie:

- Portas internas fixas dentro dos containers;
- Redes Docker por instalação;
- Nomes de serviços únicos;
- Caddy acessando os containers pela rede;
- Uso ou não de portas publicadas no host;
- Roteamento por domínio;
- Configuração dinâmica do proxy;
- Certificados automáticos;
- Evitar edição manual repetitiva do Caddyfile.

O ideal é que apenas o proxy fique exposto publicamente.

Os backends e frontends devem permanecer acessíveis apenas pelas redes Docker necessárias.

## Atualizações

Todos os blogs devem usar a mesma base de código, salvo quando uma versão diferente estiver intencionalmente instalada.

Analise uma estratégia com:

- Imagens versionadas;
- Tags como `blog-platform:1.0.0`;
- Canal estável;
- Canal de teste;
- Atualização de uma instalação específica;
- Atualização em lote;
- Health check após atualização;
- Rollback automático ou manual;
- Registro da versão instalada;
- Compatibilidade com a API do painel central.

O objetivo é evitar que cada blog se transforme em um fork independente.

## Provisionamento

Caso o provisionamento futuro seja automatizado, defina claramente a separação de responsabilidades.

Exemplo:

```text
Painel central
    ↓ solicita criação
Serviço de provisionamento
    ↓ executa operação permitida
Docker/VPS
```

O serviço de provisionamento deve aceitar apenas operações previamente definidas, como:

- Criar instalação;
- Iniciar;
- Parar;
- Atualizar;
- Fazer rollback;
- Consultar status;
- Coletar logs limitados;
- Remover instalação.

Ele não deve aceitar comandos de shell arbitrários enviados pelo painel.

Analise:

- Autenticação;
- Permissões mínimas;
- Lista de ações permitidas;
- Validação do domínio;
- Validação do identificador;
- Proteção contra path traversal;
- Proteção contra command injection;
- Proteção contra nomes duplicados;
- Proteção contra volumes compartilhados acidentalmente;
- Auditoria;
- Rollback;
- Lock contra dois provisionamentos simultâneos.

## O que preciso que você faça primeiro

Não implemente nada ainda.

Siga esta ordem:

1. Analise o projeto atual do `sp011`;
2. Analise o Dockerfile;
3. Analise o `docker-compose`;
4. Analise o Caddyfile ou proxy utilizado;
5. Analise as variáveis de ambiente;
6. Analise o fluxo atual de deploy;
7. Identifique quais processos locais podem ser desativados agora que a central já funciona;
8. Identifique o consumo potencial por instância;
9. Identifique quais partes do deploy podem ser parametrizadas;
10. Identifique o que pode ser compartilhado entre os blogs;
11. Identifique o que obrigatoriamente precisa ser isolado;
12. Faça perguntas apenas sobre informações que não podem ser descobertas no código;
13. Depois das respostas, monte o plano;
14. Não altere arquivos antes da aprovação.

## Perguntas que devem ser feitas

Agrupe as perguntas por tema.

Não pergunte sobre identidade visual, categorias ou integração com a central, pois essas partes já estão resolvidas.

### Infraestrutura

- Quantidade de RAM da VPS;
- Quantidade de CPUs;
- Espaço em disco;
- Consumo atual do `sp011`;
- Outros serviços executados na VPS;
- Quantidade de blogs que precisam subir hoje;
- Quantidade esperada nos próximos meses;
- Se todos ficarão nessa mesma VPS;
- Se os domínios já apontam para a VPS;
- Se tenho acesso ao DNS de todos os domínios.

### Deploy

- Se posso utilizar a mesma imagem Docker para todos;
- Se posso executar scripts na VPS;
- Se o deploy atual é feito manualmente;
- Se existe registry de imagens;
- Se posso criar um registry;
- Se todos os blogs devem usar a mesma versão inicialmente;
- Se precisamos de ambiente de staging;
- Se o processo futuro precisa ser totalmente automático ou pode exigir aprovação.

### Banco e arquivos

- Se os bancos já foram criados;
- Se existe algum conteúdo inicial a importar;
- Se os uploads serão locais ou externos;
- Se cada blog precisará de backup independente;
- Qual é a política de retenção;
- Se o banco será configurado no primeiro acesso ou pelo `.env` nos blogs de hoje.

### Operação

- Quem terá permissão para criar novas instalações;
- Quem poderá atualizar ou remover blogs;
- Se os clientes terão acesso ao painel administrativo;
- Se um blog precisa poder ser suspenso;
- Se será necessário mover uma instalação para outra VPS;
- Se precisamos registrar custos e consumo por blog.

## Entregas esperadas

Depois de analisar o projeto e receber minhas respostas, apresente:

### 1. Recomendação para os blogs de hoje

Defina a forma mais rápida e segura de colocar os blogs no ar hoje.

Inclua:

- Estratégia escolhida;
- Estrutura de diretórios;
- Imagem utilizada;
- Arquivo de ambiente;
- Containers;
- Volumes;
- Banco;
- Domínio;
- Proxy;
- Certificado;
- Cadastro na central;
- Testes;
- Rollback;
- Checklist por blog.

### 2. Comparação das arquiteturas

Compare:

- Cópia completa do projeto;
- Mesma imagem com instalações independentes;
- Multi-tenant;
- Provisionamento direto pelo painel central;
- Serviço de provisionamento separado;
- Arquitetura híbrida.

Para cada alternativa, informe:

- Complexidade;
- Tempo de implementação;
- Consumo de recursos;
- Segurança;
- Isolamento;
- Facilidade de manutenção;
- Atualizações;
- Escalabilidade;
- Adequação para hoje;
- Adequação para o futuro.

### 3. Arquitetura recomendada

Apresente:

- Diagrama da solução;
- Responsabilidades de cada componente;
- Estrutura das instalações;
- Fluxo de criação;
- Fluxo de atualização;
- Fluxo de rollback;
- Fluxo de remoção;
- Integração com o proxy;
- Integração com o banco;
- Integração já existente com a central.

### 4. Plano de implementação

Separe em:

- Solução emergencial para hoje;
- Padronização das imagens;
- Criação de templates;
- Scripts de provisionamento;
- Registro das instalações;
- Serviço de provisionamento;
- Integração com o painel central;
- Melhorias futuras.

Para cada fase, informe:

- Objetivo;
- Arquivos envolvidos;
- Dependências;
- Riscos;
- Critérios de aceite;
- Testes;
- Rollback.

### 5. Estimativa de recursos

Com base no código e na infraestrutura, estime:

- RAM por backend;
- RAM por frontend;
- RAM por instalação completa;
- CPU em repouso;
- CPU durante publicação;
- Quantidade de conexões de banco;
- Armazenamento por blog;
- Overhead dos containers;
- Quantidade segura de blogs na VPS atual;
- Ponto em que será necessário migrar para outra VPS ou arquitetura.

Não utilize estimativas genéricas se for possível medir o sistema atual.

### 6. Proposta de automação futura

Descreva como seria o botão “Criar novo blog” no painel central.

Inclua:

- Dados solicitados;
- Validações;
- Serviço responsável;
- Etapas executadas;
- Estados do provisionamento;
- Logs;
- Tratamento de falhas;
- Rollback;
- Permissões;
- Segurança;
- Limitações.

## Restrição importante

Não refaça o planejamento da central de coleta e distribuição.

A integração já está concluída e funcionando.

Não proponha inicialmente transformar toda a aplicação em multi-tenant sem demonstrar que isso compensa o custo, o risco e o prazo.

Priorize uma solução que permita:

- Subir os blogs necessários hoje;
- Usar a mesma base de código;
- Evitar forks;
- Reduzir trabalho manual;
- Manter bancos e dados isolados;
- Economizar memória quando possível;
- Evoluir futuramente para um provisionamento controlado pelo painel central.
