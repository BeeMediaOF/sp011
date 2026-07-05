# Auditoria e Melhoria Completa do Painel Administrativo

Atue como um **especialista em frontend, UX/UI e arquitetura de aplicações web**. Faça uma auditoria completa do painel administrativo, com foco em:

- Funcionamento correto de todas as funcionalidades
- Edição do conteúdo do blog
- Experiência do usuário
- Responsividade
- Organização visual
- Aproveitamento do espaço da tela
- Confiabilidade das alterações feitas no painel

O objetivo não é apenas identificar problemas. **Corrija diretamente o código**, valide cada mudança e garanta que nenhuma funcionalidade existente seja quebrada.

---

## 1. Preparação e uso de skills

Antes de iniciar a auditoria, baixe e analise as skills disponíveis nestes repositórios:

- https://github.com/bencium/bencium-claude-code-design-skill.git
- https://github.com/anthropics/skills.git
- https://github.com/vercel-labs/agent-skills.git
- https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Use principalmente as skills relacionadas a:

- Frontend
- Web apps
- UX/UI
- Design systems
- Responsividade
- Acessibilidade
- Componentização
- Auditoria visual

Não use as skills de forma automática ou superficial. Aplique apenas aquelas que realmente contribuírem para a análise e melhoria do projeto.

---

## 2. Auditoria funcional dos blocos de conteúdo

Revise todos os tipos de blocos de conteúdo disponíveis no painel.

Verifique:

- Criação
- Edição
- Exclusão
- Reordenação
- Salvamento
- Pré-visualização
- Persistência no banco
- Renderização correta no blog
- Atualização imediata ou após recarregamento
- Comportamento em diferentes tamanhos de tela

Analise especialmente os blocos relacionados à home e às páginas do blog.

### Problemas já identificados

- Ao clicar em bloco de imagem, o sistema está criando um carrossel.
- Alterações feitas em blocos de imagem não estão sendo aplicadas corretamente.
- Alguns editores podem não estar salvando ou atualizando os dados como deveriam.

Corrija a lógica para que cada tipo de bloco crie e edite apenas o conteúdo correspondente.

Exemplos:

- Bloco de imagem deve criar uma imagem.
- Bloco de carrossel deve criar um carrossel.
- Bloco de texto deve editar apenas texto.
- Bloco de vídeo deve editar apenas vídeo.
- Blocos compostos devem manter sua estrutura própria.

Valide todos os tipos existentes, não apenas os citados.

---

## 3. Auditoria dos editores do blog

Revise todos os editores disponíveis no painel administrativo.

Inclua:

- Editor de posts
- Editor de páginas
- Editor da home
- Editor de blocos
- Editor de imagens
- Editor de carrosséis
- Editor de banners
- Editor de menus
- Editor de rodapé
- Editor de SEO
- Editor de categorias
- Editor de tags
- Editor de autores
- Editor de elementos globais

Verifique se:
- Os campos exibidos correspondem ao tipo de conteúdo.
- As alterações são realmente salvas.
- O estado do formulário é atualizado corretamente.
- Não há sobrescrita indevida de dados.
- Não há perda de dados ao trocar de aba, bloco ou seção.
- A edição de um item não altera outro.
- O backend recebe os dados corretos.
- O frontend renderiza o conteúdo atualizado.
- Erros de validação são exibidos de forma clara.
- O usuário recebe feedback de sucesso ou falha.
- A edição funciona tanto para dados antigos quanto para novos.

Corrija qualquer fluxo inconsistente.

---

## 4. Rodapé completamente editável

Torne o rodapé totalmente configurável pelo painel administrativo.

Todos os elementos existentes no rodapé devem poder ser editados, incluindo:

- Textos
- Títulos
- Descrições
- Links
- Colunas
- Menus
- Redes sociais
- Ícones
- Logos
- Imagens
- Informações de contato
- Endereço
- Direitos autorais
- Políticas
- Termos
- Links legais
- Ordem dos elementos
- Visibilidade de cada item

Quando fizer sentido, permita:

- Adicionar itens
- Remover itens
- Reordenar itens
- Ativar ou desativar elementos
- Editar labels e URLs
- Alterar imagens e ícones

Garanta que as alterações sejam salvas corretamente e refletidas no blog.

---

## 5. Auditoria visual e de experiência do usuário

Faça uma revisão completa da interface do painel.

Corrija problemas como:

- Botões escondidos ou cortados (como botão visualizar que está em um dos prints).
- Ações importantes fora da área visível.
- Formulários longos organizados apenas em uma coluna.
- Espaço horizontal desperdiçado.
- Campos desalinhados.
- Elementos muito próximos ou muito distantes.
- Hierarquia visual confusa.
- Falta de agrupamento lógico.
- Títulos e labels pouco claros.
- Ações principais sem destaque.
- Excesso de rolagem vertical.
- Modais ou painéis difíceis de usar.
- Estados de loading, sucesso e erro pouco claros.

### Diretrizes de layout

- Em telas largas, distribua campos relacionados em duas ou mais colunas.
- Em telas menores, reorganize os campos verticalmente.
- Use grids responsivos.
- Mantenha ações principais visíveis.
- Evite botões cortados ou escondidos.
- Use espaçamento consistente.
- Agrupe campos por contexto.
- Destaque ações como salvar, visualizar, publicar e cancelar.
- Evite interfaces densas ou confusas.
- Priorize clareza e velocidade de uso.

---

## 6. Botões e ações do painel

Revise todos os botões e ações.

Verifique:

- Visualizar
- Salvar
- Publicar
- Atualizar
- Excluir
- Duplicar
- Reordenar
- Adicionar
- Cancelar
- Voltar
- Pré-visualizar
- Upload
- Selecionar mídia

Garanta que:

- Nenhum botão fique escondido.
- Todos sejam acessíveis em desktop e mobile.
- As ações tenham feedback visual.
- Botões perigosos exijam confirmação.
- Ações desabilitadas expliquem o motivo.
- A ação executada corresponda ao texto do botão.
- O estado de loading impeça cliques duplicados.
- Erros sejam tratados corretamente.

---

## 7. Responsividade

Teste o painel em diferentes larguras.

Inclua:

- Desktop grande
- Notebook
- Tablet
- Mobile

Verifique:

- Grids
- Formulários
- Tabelas
- Botões
- Modais
- Menus laterais
- Abas
- Cards
- Editores
- Uploads
- Pré-visualizações

Corrija quebras de layout, overflow, cortes, sobreposição e rolagem horizontal desnecessária.

---

## 8. Qualidade técnica

Durante a auditoria, revise também:

- Componentes duplicados
- Estados inconsistentes
- Props desnecessárias
- Lógica de formulário repetida
- Componentes excessivamente grandes
- Chamadas de API espalhadas
- Falta de validação
- Falta de tipagem
- Tratamento de erros incompleto
- Falta de loading states
- Dados desatualizados após salvar
- Problemas de cache
- Problemas de sincronização entre frontend e backend

Refatore quando necessário para melhorar:

- Manutenção
- Reutilização
- Testabilidade
- Legibilidade
- Consistência

---

## 9. Testes obrigatórios

Antes e depois das alterações, execute as validações disponíveis.

Inclua, quando existirem:

```bash
npm run lint
npm test
npm run build
```

Além disso:

- Teste a criação de cada tipo de bloco.
- Teste a edição de cada tipo de bloco.
- Teste a exclusão de cada tipo de bloco.
- Teste a reordenação.
- Teste o salvamento.
- Teste a pré-visualização.
- Teste a persistência após recarregar a página.
- Teste o reflexo das alterações no blog.
- Teste desktop, tablet e mobile.
- Teste o rodapé completo.
- Teste todos os botões principais.

Se não houver testes suficientes, crie testes para os fluxos críticos.

---

## 10. Forma de execução

Siga esta ordem:

1. Analise a estrutura atual do painel.
2. Liste os problemas encontrados.
3. Organize por prioridade:
   - Crítico
   - Alto
   - Médio
   - Baixo
4. Corrija primeiro os problemas funcionais.
5. Depois melhore a UX/UI.
6. Faça alterações incrementais.
7. Teste após cada etapa.
8. Não remova funcionalidades válidas.
9. Não altere comportamentos sem necessidade.
10. Garanta compatibilidade com os dados existentes.

---

## 11. Relatório final

Ao concluir, apresente:

### Problemas encontrados
Liste o problema, gravidade e arquivo afetado.

### Correções aplicadas
Explique objetivamente o que foi alterado.

### Melhorias de UX/UI
Descreva as melhorias visuais e de usabilidade.

### Testes executados
Informe os comandos e fluxos testados.

### Arquivos modificados
Liste os arquivos alterados.

### Pendências
Registre qualquer ponto que não tenha sido possível corrigir com segurança.

### Resultado esperado
O painel deve terminar:

- Funcional
- Intuitivo
- Responsivo
- Consistente
- Fácil de manter
- Seguro para edição do blog
- Confiável no salvamento e publicação de alterações
