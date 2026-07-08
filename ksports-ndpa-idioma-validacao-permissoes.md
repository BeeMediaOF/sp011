# Ajustes específicos do blog KSports

Realize estas alterações **somente no blog KSports**, sem afetar os demais blogs da plataforma.

Antes de alterar qualquer arquivo, analise como o sistema atual separa configurações por blog, usuários, idioma, permissões e textos legais.

---

## 1. Adequação à Nigeria Data Protection Act, 2023

No KSports, substitua os textos e fluxos atualmente baseados na LGPD por uma implementação adequada à **Nigeria Data Protection Act, 2023 (NDPA)**.

### Verificações e ajustes

- Remover referências à LGPD, ANPD, Brasil e legislação brasileira.
- Atualizar Política de Privacidade, Política de Cookies e textos de consentimento.
- Disponibilizar esses conteúdos em inglês.
- Adaptar o conteúdo ao contexto do KSports e do público da Nigéria.
- Verificar banner de cookies, preferências, retirada de consentimento e registro das escolhas.
- Garantir que scripts não essenciais respeitem as preferências de consentimento quando aplicável.
- Verificar integrações como Analytics, Meta Pixel, Google Tag Manager, publicidade, formulários e newsletter.
- Permitir configurar no painel os dados institucionais e o contato relacionado à privacidade.
- Garantir que essa alteração seja isolada por blog e não modifique os textos legais dos demais clientes.

Não faça apenas uma troca de nomes entre LGPD e NDPA. Revise o fluxo completo de privacidade e consentimento.

Caso algum ponto dependa de validação jurídica especializada, sinalize isso claramente no relatório final.

---

## 2. Idioma do painel por usuário

Adicione a opção de idioma individual no painel administrativo.

### Regras

- Cada usuário deve escolher o próprio idioma.
- A preferência deve ser salva no perfil do usuário.
- A escolha de uma pessoa não pode alterar o idioma das demais.
- O idioma deve continuar salvo após logout, novo login e acesso por outro dispositivo.
- Disponibilize inicialmente:
  - Português;
  - Inglês.
- O usuário KSports já existente deve ter **inglês como idioma padrão**.
- A alteração de idioma deve ser feita pelo próprio painel, sem edição manual no banco.


## 3. Verificação do controle de permissões existente

Já existe uma tela de controle de permissões, conforme os prints enviados. **Não crie uma nova tela e não redesenhe esse módulo sem necessidade.**

O objetivo é apenas fazer uma auditoria completa da implementação atual e garantir que todos os controles existentes funcionem corretamente.

### O que deve ser verificado

- Confirmar se cada chave da tela realmente salva a alteração.
- Confirmar se o estado salvo continua correto após atualizar a página e fazer novo login.
- Verificar se “Ativar todas” e “Desativar todas” funcionam em cada grupo.
- Conferir se os contadores de permissões ativas e bloqueadas estão corretos.
- Validar se cada permissão está ligada à funcionalidade certa.
- Verificar se não existem permissões visuais sem efeito real.
- Verificar se não existem funcionalidades sem permissão correspondente.
- Conferir se as alterações são registradas corretamente nos logs de auditoria.

### Validação em três camadas

Garanta que cada permissão seja respeitada em:

1. **Menu lateral**  
   O item não deve aparecer para quem não possui acesso.

2. **Página ou tela protegida**  
   O usuário não pode abrir a página diretamente pela URL. 

3. **Backend e API**  
   A ação deve ser bloqueada mesmo em chamadas manuais, alteração de parâmetros ou requisições fora da interface.

Ocultar menus e botões não é suficiente.

### Permissões a validar

Revise todas as permissões existentes na tela, incluindo:

- artigos;
- criação, edição, exclusão e publicação;
- upload de imagens;
- dashboard;
- analytics;
- menus;
- blocos da home;
- propagandas;
- categorias;
- fontes RSS;
- redes sociais;
- colunistas;
- configurações;
- usuários e permissões;
- logs;
- segurança;
- demais permissões já cadastradas no sistema.

### Isolamento entre blogs

- O usuário KSports deve acessar apenas o blog KSports.
- Nenhuma permissão pode permitir acesso a dados de outro blog.
- O backend deve validar o blog vinculado ao usuário em todas as operações.
- Não confiar apenas em filtros do frontend.
- Bloquear tentativas de acesso por URL, ID alterado ou requisição manual.

### Regras importantes

- Não alterar nomes, grupos ou visual da tela sem necessidade.
- Não criar um novo modelo de permissões se o atual puder ser corrigido.
- Não remover permissões existentes.
- Corrigir inconsistências, falhas de persistência e acessos indevidos.
- Manter o princípio do menor privilégio.
- Impedir que usuários sem autorização alterem as próprias permissões ou elevem a própria função.
- Registrar alterações sensíveis nos logs.

---

## 4. Configuração do usuário KSports

Localize o usuário KSports já existente e aplique:

- idioma padrão: inglês;
- acesso somente ao blog KSports;
- permissões conforme a função já atribuída;
- bloqueio de acesso a dados e configurações de outros blogs.

Não altere senha, e-mail, função ou outros dados sem necessidade.

---

## 5. Testes obrigatórios

Execute e documente pelo menos os seguintes testes:

1. usuário KSports entrando com o painel em inglês;
2. outro usuário entrando com o painel em português;
3. troca de idioma sem afetar outros usuários;
4. idioma mantido após logout e novo login;
5. ativação e desativação individual de cada permissão;
6. uso de “Ativar todas” e “Desativar todas”;
7. persistência das permissões após recarregar a página;
8. contadores de permissões ativas e bloqueadas;
9. ocultação correta dos itens no menu;
10. bloqueio ao acessar página diretamente pela URL;
11. bloqueio ao executar ação pela API;
12. tentativa de acessar dados de outro blog;
13. tentativa de alterar a própria permissão sem autorização;
14. geração correta dos logs de auditoria;
15. exibição correta dos textos legais do KSports;
16. confirmação de que os demais blogs não foram alterados.

Execute também lint, testes automatizados e build de produção disponíveis no projeto.

---

## 6. Critérios de aceite

A tarefa só pode ser considerada concluída quando:

- o KSports não possuir referências à LGPD;
- os textos legais estiverem adaptados ao contexto da NDPA;
- os demais blogs permanecerem inalterados;
- o idioma do painel funcionar por usuário;
- o usuário KSports abrir o painel em inglês por padrão;
- todas as chaves da tela de permissões tiverem efeito real;
- as permissões forem validadas no menu, nas páginas e no backend;
- não houver acesso cruzado entre blogs;
- os contadores e ações em massa estiverem corretos;
- alterações sensíveis forem registradas nos logs;
- os testes forem executados e documentados;
- não existirem erros relevantes no console, backend ou build.

---

## 7. Entrega final

Ao concluir, apresente:

- problemas encontrados;
- arquivos alterados;
- ajustes feitos no KSports;
- estrutura utilizada para idioma por usuário;
- permissões que estavam com falha;
- correções realizadas;
- endpoints protegidos ou corrigidos;
- validação do isolamento entre blogs;
- testes executados e resultados;
- pontos que ainda exigem validação jurídica ou técnica.

Não diga apenas que “foi corrigido”. Mostre como cada item foi testado e validado.

Não faça mudanças fora deste escopo sem necessidade técnica.
