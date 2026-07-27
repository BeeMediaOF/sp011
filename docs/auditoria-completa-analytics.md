# Auditoria completa e correção do Analytics

Analise toda a implementação atual do Analytics antes de alterar qualquer arquivo. O objetivo é transformar essa área em uma fonte confiável de dados reais, eliminando métricas fictícias, duplicadas, infladas por testes internos ou calculadas de forma incorreta.

Use os prints enviados apenas como referência visual da tela atual. Não presuma que os números exibidos estão corretos.

---

## 1. Mapear a arquitetura atual

Antes de implementar qualquer correção:

- Identifique de onde cada métrica é obtida.
- Mapeie frontend, backend, banco de dados, jobs, APIs, webhooks e serviços externos envolvidos.
- Verifique quais dados são reais, simulados, calculados ou preenchidos manualmente.
- Liste todas as tabelas, endpoints, eventos e campos utilizados pela página.
- Identifique métricas duplicadas, inconsistentes ou sem fonte confiável.
- Verifique se existem dados mockados, fallbacks artificiais, seeds, valores fixos ou números gerados apenas para preencher a interface.

Não mantenha nenhum número na tela sem conseguir rastrear sua origem.

---

## 2. Definir uma fonte única de verdade

Crie uma estrutura consistente para que todas as métricas sejam calculadas a partir de eventos reais.

Cada evento deve registrar, quando aplicável:

- identificador da sessão;
- identificador anônimo do visitante;
- URL e rota acessada;
- artigo, categoria ou anúncio relacionado;
- data e hora;
- origem do tráfego;
- referenciador;
- campanha e parâmetros UTM;
- dispositivo;
- navegador;
- sistema operacional;
- país, estado e cidade, quando permitido;
- tempo de permanência;
- profundidade de leitura;
- cliques internos;
- cliques externos;
- impressões e cliques em anúncios.

Evite armazenar dados pessoais desnecessários.

---

## 3. Blindar contra dados falsos ou inflados

Implemente proteção contra estatísticas artificiais causadas por testes, robôs, recarregamentos e navegação administrativa.

### Excluir ou separar:

- acessos feitos dentro do painel administrativo;
- visualizações realizadas por usuários administradores autenticados;
- tráfego de localhost, preview, staging e ambientes de desenvolvimento;
- monitoramentos automáticos, health checks e crawlers;
- bots e user agents conhecidos;
- múltiplos eventos duplicados disparados pela mesma ação;
- refresh repetido da mesma página em poucos segundos;
- pré-carregamento de rotas;
- chamadas de teste;
- eventos gerados por hot reload;
- visualizações causadas por ferramentas internas.

Crie uma configuração para marcar IPs, usuários ou ambientes como tráfego interno.

O tráfego interno não deve entrar nas métricas públicas, mas pode ser armazenado separadamente para auditoria.

---

## 4. Corrigir o rastreamento de sessões e visualizações

Defina regras claras para:

- sessão única;
- visitante único;
- visualização de página;
- visualização de artigo;
- início e encerramento de sessão;
- tempo médio por página;
- taxa de rejeição;
- retorno do visitante;
- navegação entre páginas;
- acesso direto;
- referência externa;
- campanha.

Evite contar a mesma navegação mais de uma vez.

Garanta que mudanças de rota em aplicações SPA também sejam registradas corretamente.

Não use apenas o evento de saída da página para calcular tempo de permanência, pois ele pode não ser disparado. Utilize heartbeat, visibilidade da página e eventos de atividade do usuário.

---

## 5. Corrigir as métricas de leitura

Revise completamente:

- profundidade de leitura de 25%, 50%, 75% e 100%;
- leitores únicos por faixa;
- tempo de leitura;
- abandono;
- conclusão do artigo.

A profundidade deve considerar apenas a área real do conteúdo do artigo, desconsiderando cabeçalho, rodapé, comentários e blocos externos.

Cada faixa deve ser contabilizada apenas uma vez por sessão e artigo.

---

## 6. Corrigir Analytics de propagandas

Os dados de propaganda precisam funcionar de ponta a ponta.

Audite:

- cadastro do anúncio;
- ativação e desativação;
- período de veiculação;
- posição;
- impressão;
- clique;
- CTR;
- anúncio com melhor desempenho;
- histórico diário;
- filtros por período;
- anúncio, campanha e posição;
- comportamento em desktop e mobile.

### Regras obrigatórias

- Uma impressão só deve ser registrada quando o anúncio realmente entrar na área visível da tela.
- Não contar impressão apenas porque o HTML foi renderizado.
- Use `IntersectionObserver` ou mecanismo equivalente.
- Defina um tempo mínimo de visibilidade antes de validar a impressão.
- Não registre múltiplas impressões repetidas em sequência para o mesmo anúncio e sessão.
- O clique deve ser registrado antes do redirecionamento.
- O CTR deve ser calculado por `cliques válidos / impressões válidas × 100`.
- Cliques e impressões de administradores, testes e bots não devem entrar nos números oficiais.
- Diferencie anúncio sem dados de anúncio com zero desempenho.

Corrija também os estados vazios. A tela não deve ficar eternamente em “acumulando dados” quando não existem registros.

---

## 7. Revisar todos os cálculos

Valide individualmente:

- visualizações de página;
- sessões únicas;
- visitantes únicos;
- tempo médio;
- taxa de rejeição;
- tráfego ao longo do tempo;
- fontes de tráfego;
- dispositivos;
- artigos mais acessados;
- categorias;
- localização;
- horários de pico;
- dias da semana;
- pesquisas;
- links externos;
- interações;
- impressões de anúncios;
- cliques;
- CTR;
- melhor anúncio.

Para cada métrica, documente:

1. evento de origem;
2. regra de cálculo;
3. filtros aplicados;
4. período considerado;
5. fuso horário;
6. forma de deduplicação.

Não misture visualizações, sessões, visitantes e leitores.

---

## 8. Períodos, datas e fuso horário

Padronize os cálculos utilizando o fuso horário configurado para o portal.

Verifique:

- hoje;
- ontem;
- últimos 7 dias;
- últimos 30 dias;
- período personalizado;
- comparação com período anterior;
- agrupamento por hora;
- agrupamento por dia;
- virada de mês;
- horário de verão, quando aplicável.

O frontend e o backend devem aplicar exatamente o mesmo intervalo de datas.

---

## 9. Origem do tráfego e campanhas

Corrija a classificação de:

- direto;
- referência;
- busca orgânica;
- redes sociais;
- campanhas pagas;
- e-mail;
- tráfego interno;
- desconhecido.

Capture corretamente parâmetros UTM e preserve a origem durante a sessão.

Não classifique tudo como “Direto” quando existe referenciador ou campanha identificável.

---

## 10. Localização e dispositivos

Verifique se os dados de cidade, estado, país e dispositivo vêm de uma fonte real.

- Não invente localização quando o dado não estiver disponível.
- Exiba “Não identificado” quando necessário.
- Não derive localização de forma insegura.
- Padronize nomes e evite cidades duplicadas por diferenças de escrita.
- Garanta que os percentuais somem corretamente.
- Diferencie desktop, mobile e tablet com uma regra consistente.

---

## 11. Limpeza e migração dos dados antigos

Antes de apagar qualquer coisa:

- faça backup;
- identifique registros de teste;
- identifique dados duplicados;
- identifique eventos inválidos;
- classifique registros antigos como válidos, internos, suspeitos ou descartáveis.

Não apague dados silenciosamente.

Crie uma estratégia de migração e, quando necessário, reconstrua agregações históricas a partir dos eventos válidos.

Caso não seja possível garantir a confiabilidade dos dados antigos, deixe isso explícito na interface e considere iniciar uma nova janela confiável a partir da correção.

---

## 12. Monitoramento e auditoria

Adicione mecanismos para acompanhar a saúde do Analytics:

- logs de erro;
- eventos rejeitados;
- eventos duplicados;
- tráfego filtrado;
- falhas de gravação;
- divergências entre eventos e agregações;
- status dos jobs;
- data da última atualização;
- volume processado.

Crie uma forma simples de validar um evento do navegador até o banco.

Não deixe falhas silenciosas.

---

## 13. Interface da página de Analytics

A interface deve sempre diferenciar:

- zero real;
- ausência de dados;
- erro de carregamento;
- coleta ainda não iniciada;
- dados em processamento;
- dado indisponível.

Corrija números, percentuais, gráficos, legendas, tooltips e comparações.

Não exiba valores enganosos apenas para preencher cards.

Inclua, quando útil:

- data da última atualização;
- informação sobre filtros internos;
- indicação de janela confiável dos dados;
- tooltip explicando cada métrica.

---

## 14. Testes obrigatórios

Crie testes para validar:

- uma visualização comum;
- duas visualizações na mesma sessão;
- refresh repetido;
- navegação SPA;
- acesso de administrador;
- acesso em ambiente de desenvolvimento;
- bot conhecido;
- impressão de anúncio fora da tela;
- impressão visível;
- clique em anúncio;
- artigo lido até 25%, 50%, 75% e 100%;
- troca de aba;
- fechamento inesperado;
- origem por UTM;
- origem por referência;
- mobile, desktop e tablet;
- mudança de período;
- fuso horário;
- dados vazios;
- falha de API;
- duplicidade de evento.

Execute também lint, testes automatizados e build de produção.

---

## 15. Validação manual controlada

Monte um roteiro de teste com resultados esperados.

Exemplo:

1. zerar ou isolar um ambiente de teste;
2. abrir uma página uma única vez;
3. confirmar exatamente uma visualização;
4. acessar um artigo;
5. rolar até 50%;
6. confirmar apenas os eventos esperados;
7. visualizar um anúncio;
8. clicar no anúncio;
9. conferir os registros no banco;
10. conferir os números na interface.

Compare o evento bruto, a agregação do backend e o valor apresentado na tela.

---

## 16. Critérios de aceite

A tarefa só pode ser considerada concluída quando:

- nenhuma métrica depender de dados fictícios;
- todas as métricas tiverem origem rastreável;
- acessos administrativos e de desenvolvimento forem excluídos dos números oficiais;
- bots e eventos duplicados forem filtrados;
- impressões e cliques de anúncios funcionarem;
- CTR e demais cálculos estiverem corretos;
- períodos e fuso horário estiverem consistentes;
- estados de erro e ausência de dados estiverem claros;
- frontend, backend e banco retornarem números compatíveis;
- testes automatizados e manuais forem executados;
- não existirem erros relevantes no console ou nos logs;
- a documentação técnica da coleta for atualizada.

---

## 17. Entrega final

Ao finalizar, apresente:

- diagnóstico dos problemas encontrados;
- arquitetura anterior;
- arquitetura corrigida;
- arquivos alterados;
- tabelas e endpoints envolvidos;
- eventos criados ou corrigidos;
- regras de deduplicação;
- regras de exclusão de tráfego interno;
- correções das propagandas;
- estratégia aplicada aos dados antigos;
- testes executados;
- evidências de validação;
- limitações que ainda existirem.

Não diga apenas que “foi corrigido”. Demonstre como cada número foi validado.

Não faça alterações fora deste escopo sem necessidade técnica.
