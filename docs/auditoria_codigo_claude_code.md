# Auditoria de Código: Segurança, Performance e Refatoração

Atue como um **Engenheiro DevSecOps e especialista em React**. Faça uma auditoria completa do projeto com foco em:

- Segurança
- Otimização
- Qualidade de código
- Organização da arquitetura
- Prontidão para produção

O objetivo não é apenas identificar problemas: **aplique as correções necessárias no código**. Antes e depois de cada alteração relevante, execute os testes disponíveis e valide o comportamento do sistema para garantir que nenhuma funcionalidade seja quebrada.

## Regras de execução

1. Analise o projeto antes de alterar qualquer arquivo.
2. Identifique riscos, gargalos e código desnecessário.
3. Priorize mudanças seguras, incrementais e compatíveis com a arquitetura existente.
4. Corrija os problemas encontrados diretamente no código.
5. Não remova funcionalidades válidas.
6. Execute testes, lint, build e demais verificações disponíveis após as alterações.
7. Caso não existam testes suficientes, crie testes para os fluxos críticos afetados.
8. Ao final, apresente:
   - Problemas encontrados
   - Alterações aplicadas
   - Arquivos modificados
   - Testes executados
   - Riscos ou pendências restantes

---

## 1. Segurança da aplicação

Verifique e corrija:

- Consultas ao banco sem queries parametrizadas ou ORM, prevenindo SQL Injection.
- Conteúdo fornecido por usuários renderizado sem escape ou sanitização, prevenindo XSS.
- Formulários e requisições que alteram dados sem proteção CSRF.
- Inputs sem validação no frontend e, principalmente, no backend.
- Ausência ou configuração inadequada de headers de segurança, incluindo:
  - `Content-Security-Policy`
  - `X-Frame-Options`
  - `X-Content-Type-Options`
  - `Referrer-Policy`
  - `Strict-Transport-Security`, quando aplicável
- Exposição de informações sensíveis em mensagens de erro, logs ou respostas da API.
- Rotas protegidas sem autenticação ou autorização adequada.
- Controle de acesso insuficiente entre diferentes perfis de usuário.

Para cada vulnerabilidade encontrada, implemente a correção adequada e registre o impacto da mudança.

---

## 2. Autenticação e senhas

Audite todo o fluxo de autenticação e gerenciamento de senhas.

Verifique e corrija:

- Senhas armazenadas em texto puro.
- Uso de hashes inseguros ou obsoletos, como MD5 ou SHA-1.
- Ausência de salt único por usuário.
- Comparação de senha insegura.
- Tokens de sessão ou autenticação sem expiração adequada.
- Falta de proteção contra força bruta, enumeração de usuários e tentativas repetidas.
- Fluxos inseguros de recuperação ou redefinição de senha.
- Credenciais, secrets ou chaves expostas no código.

Implemente hashing moderno com **Argon2** ou **bcrypt**, usando parâmetros seguros e compatíveis com o ambiente do projeto.

O sistema deve seguir o princípio de **zero knowledge**: a senha original nunca deve ser armazenada, recuperável ou visível, inclusive para administradores.

---

## 3. Prontidão para produção e dependências

Faça uma auditoria de `Production Readiness`.

Analise:

- `package.json`
- Arquivos de lock
- Configurações de ambiente
- Scripts de build, lint e testes
- Dependências de produção e desenvolvimento

Execute, quando possível:

```bash
npm audit
npm outdated
npm run lint
npm test
npm run build
```

Verifique:

- Dependências desatualizadas.
- Pacotes com vulnerabilidades conhecidas.
- Dependências não utilizadas.
- Pacotes duplicados ou substituíveis.
- Atualizações com breaking changes.
- Scripts ausentes ou incorretos.
- Configurações inseguras para produção.

Aplique upgrades seguros, preferencialmente um por vez, validando testes e build após cada alteração relevante. Não force atualizações que possam quebrar o projeto sem adaptar o código necessário.

---

## 4. Leftovers e código de demonstração

Faça uma varredura por elementos que não devem permanecer em produção:

- Rotas de teste.
- Endpoints temporários.
- Mocks de dados.
- Dados fictícios fixos no código.
- Credenciais em texto claro.
- Tokens, chaves ou secrets expostos.
- Funções de bypass.
- Autenticação desativada.
- Condições temporárias.
- Logs excessivos ou sensíveis.
- Código exclusivo para demonstração.
- Flags de debug habilitadas.

Remova ou substitua esses elementos sem comprometer funcionalidades reais.

---

## 5. Arquitetura e separação de responsabilidades no React

Examine os componentes React e identifique problemas de organização.

Procure por:

- Componentes de interface contendo regras de negócio.
- Chamadas de API diretamente em componentes puramente visuais.
- Componentes muito grandes ou com responsabilidades excessivas.
- Lógica duplicada entre componentes.
- Estado compartilhado de forma inadequada.
- Componentes que poderiam seguir o padrão container/presentational.
- Lógica que deveria estar em hooks, services, stores ou utilitários.

Refatore para melhorar:

- Separação de responsabilidades.
- Reutilização.
- Testabilidade.
- Legibilidade.
- Manutenção.
- Isolamento da camada de acesso à API.

---

## 6. Performance no React

Identifique e corrija problemas reais de performance.

Verifique:

- Componentes com renderizações desnecessárias.
- Uso adequado de `React.memo()`.
- Funções recriadas em cada render que justificam `useCallback()`.
- Cálculos pesados que justificam `useMemo()`.
- Listas grandes sem virtualização.
- Imagens sem compressão, lazy loading ou dimensões adequadas.
- Requisições duplicadas.
- Efeitos executados mais vezes do que o necessário.
- Dependências incorretas em `useEffect`.
- Estados redundantes ou derivados.
- Contextos globais provocando renderizações excessivas.
- Imports pesados que poderiam usar lazy loading ou code splitting.

Não aplique memoização indiscriminadamente. Use essas técnicas apenas quando houver benefício real e mensurável.

---

## 7. Código morto e limpeza

Identifique:

- Componentes criados, mas nunca renderizados.
- Funções declaradas, mas nunca chamadas.
- Imports não utilizados.
- Variáveis não utilizadas.
- Estados que nunca são lidos ou alterados.
- Props sem uso.
- Arquivos órfãos.
- Código duplicado.
- Código comentado sem explicação ou necessidade.
- Comentários desatualizados.
- Tipos, interfaces ou schemas não utilizados.

Remova o código morto com cuidado e valide que nenhuma referência dinâmica, lazy import, rota ou integração externa depende dele.

---

## 8. Refatoração e validação

Após concluir a análise:

1. Organize os problemas por prioridade:
   - Crítico
   - Alto
   - Médio
   - Baixo
2. Aplique primeiro as correções de segurança e estabilidade.
3. Faça as refatorações em etapas pequenas.
4. Teste cada etapa.
5. Compare o comportamento antes e depois.
6. Garanta que:
   - O projeto compila.
   - Os testes passam.
   - O lint não apresenta novos erros.
   - As rotas continuam funcionando.
   - Os fluxos de autenticação continuam válidos.
   - A interface não sofreu regressões.
   - Não houve perda de dados ou alterações incompatíveis no banco.

---

## 9. Relatório final

Ao finalizar, entregue um relatório com:

### Problemas encontrados
Liste cada problema, sua gravidade e o arquivo afetado.

### Correções aplicadas
Explique de forma objetiva o que foi alterado.

### Testes e validações
Informe os comandos executados e os resultados.

### Tarefas e subtarefas
Crie uma lista das refatorações realizadas e das pendências restantes.

### Riscos restantes
Registre qualquer ponto que não tenha sido possível corrigir com segurança ou que dependa de decisão do projeto.
