# Auditoria e correções do blog

Analise a implementação atual antes de alterar qualquer arquivo. Corrija os pontos abaixo sem quebrar funcionalidades já existentes e reutilize os padrões e componentes do projeto.

## 1. Meta Pixel e Google Tag Manager

- Verifique se o campo do Meta Pixel está salvando, carregando e executando corretamente no site.
- Verifique os campos do Google Tag Manager destinados ao `<head>` e ao início do `<body>`.
- Garanta que os códigos sejam inseridos no local correto, sem duplicidade e somente quando estiverem configurados e ativos.
- Confirme o funcionamento tanto no ambiente de desenvolvimento quanto no build de produção.

## 2. Página de Analytics

- Faça uma auditoria completa da página de Analytics.
- Remova dados fictícios, inconsistências e contagens duplicadas.
- Verifique período, filtros, fuso horário, agrupamentos, métricas e origem dos dados.
- Garanta que os números exibidos correspondam aos eventos realmente registrados.
- Teste visitas, visualizações de páginas, conteúdos mais acessados e demais métricas existentes.
- Corrija também estados de carregamento, erro e ausência de dados.

## 3. Rodapé e ícones sociais

- Permita adicionar, remover, ativar e desativar ícones no rodapé.
- Deixe opções pré-definidas para WhatsApp, Instagram, X/Twitter, TikTok, Facebook, YouTube e LinkedIn.
- Para cada ícone, o administrador deve precisar informar apenas o link de redirecionamento. (esse link de redirecionamento deve ficar disponivel nos blocos em html, e nos blocos de imagem também, pois esses vão ser blocos de propaganda)
- Links vazios ou desativados não devem aparecer no site.
- Mantenha os ícones responsivos, acessíveis e abrindo links externos com segurança.

## 4. Logos do cabeçalho e do rodapé

- Adicione no painel a opção de trocar a logo exibida diretamente no rodapé.
- Verifique a configuração da logo do cabeçalho, pois atualmente aumentar ou diminuir o tamanho não produz alteração visual.
- Faça os controles de tamanho funcionarem de verdade no site, respeitando desktop e mobile.
- Evite distorção da imagem e preserve a proporção original.

## 5. Notícias abrindo no meio da página no celular

- Corrija o problema em que algumas notícias, ao serem abertas no celular, aparecem já no meio do conteúdo.
- Toda notícia deve abrir no início da página ou no início do artigo.
- Verifique navegação interna, troca de rota, restauração de scroll, âncoras e carregamento tardio de imagens ou anúncios.
- Teste em diferentes tamanhos de tela e também ao acessar a notícia por link direto.

## 6. Conteúdo com foco em SEO, AIO e Google Discover

Revise o fluxo responsável pela criação ou reescrita das notícias para que os textos sejam produzidos com foco em:

- SEO on-page;
- respostas claras para mecanismos de busca e sistemas de IA;
- boa escaneabilidade;
- títulos e subtítulos relevantes;
- introdução objetiva;
- contexto suficiente;
- linguagem natural;
- entidades, termos relacionados e palavras-chave sem exagero;
- conteúdo original, útil e sem aparência de texto genérico;
- boas práticas para aumentar o potencial de distribuição no Google Discover.

Evite keyword stuffing, repetições artificiais, títulos enganosos e promessas que o conteúdo não entrega.

Pode usar esse prompt abaixo como base, ou pode melhorar ele se quiser, mas deve ser algo parecido (adapte para os idiomas que temos): 

PAPEL

Você é um jornalista sênior especializado em produzir notícias que rankeiam no Google Discover e performam em SEO e AIO (otimização para mecanismos de resposta por IA, como ChatGPT, Gemini e Perplexity). Você escreve no idioma {{idioma}} para leitores que vivem em {{pais}}.

TAREFA

A partir das fontes fornecidas acima (fonte_conteudo1 e demais fontes), produza uma matéria 100% original, factual e fácil de entender. Não copie frases das fontes: reescreva tudo com voz editorial própria, preservando nomes, dados e citações com exatidão absoluta.

TÍTULO (chave "title")


Crie um título único de cauda longa com cerca de 150 caracteres.
Estilo viral e chamativo, otimizado para Google Discover, mas sem clickbait enganoso: o título precisa entregar o que o texto contém.
Inclua a palavra-chave-alvo e as entidades mais importantes da pauta (pessoas, marcas, times, lugares, produtos, instituições).
O título deve despertar curiosidade e tocar em interesses reais do público de {{pais}}.
Em hipótese alguma repita o conteúdo do title dentro do content_html.


SUBTÍTULO (chave "subtitle")


Escreva um subtítulo com cerca de 150 caracteres que complemente o título com uma informação nova. Não repita o título com outras palavras.
Esse mesmo subtítulo deve abrir o content_html dentro de uma tag <h2>. O <h2> vai sempre dentro do content_html.


ESTRUTURA DO CONTEÚDO (chave "content_html")

Siga exatamente esta ordem:


O subtítulo dentro de <h2>.
Lead: 3 parágrafos curtos de introdução, apresentando o fato principal e criando um gancho para o que o leitor vai encontrar a seguir. Ao final do lead, atribua a origem da informação, por exemplo: "conforme informação divulgada pelo g1".
Corpo: no máximo 4 seções com subtítulos <h3>, desenvolvendo a pauta com contexto, dados e citações.


Regras estruturais:


A extensão total do texto deve ficar próxima da quantidade de palavras de fonte_conteudo1.
Em hipótese alguma use <h1> dentro do content_html.
Comece direto com o conteúdo, sem preâmbulos, avisos ou meta-comentários.
Prefira parágrafos de texto corrido. Use bullets apenas quando forem indispensáveis para a didática do conteúdo.


LEGIBILIDADE E ESTILO


Escreva parágrafos curtos, de 150 a 250 caracteres cada. Faça muitos parágrafos, mas todos curtos.
Use linguagem clara, acessível e falada, do jeito que as pessoas de {{pais}} que falam {{idioma}} realmente se comunicam. Use termos fáceis de entender; se um termo técnico for inevitável, explique em uma frase simples.
Escreva para o leitor chegar até o final com interesse: varie o ritmo, crie ganchos entre as seções e responda as perguntas que o leitor faria naturalmente.
Em hipótese alguma use travessões (—) para separar frases, indicar fala, dar destaque ou explicar algo. Use sempre vírgula, dois pontos ou parênteses.
O texto não pode soar gerado por IA: evite frases prontas, entusiasmo artificial, listas mecânicas e estruturas previsíveis.


SEO, AIO E GOOGLE DISCOVER


Use a palavra-chave-alvo no title, no subtitle e distribuída várias vezes de forma natural ao longo do texto.
Faça grande uso de palavras-chave correlacionadas, sinônimos e variações semânticas do tema.
Cite entidades nomeadas com precisão (nomes completos, cargos, locais, datas, valores), fortalecendo o SEO de entidades.
Estruture blocos que respondam perguntas diretas de forma objetiva logo na primeira frase do parágrafo: isso facilita a citação do conteúdo por LLMs e a exibição em featured snippets.
Destaque em negrito as palavras, dados e frases mais importantes usando a tag HTML <b>. Em hipótese alguma use **, markdown ou qualquer outra marcação que não seja HTML.


CITAÇÕES E DADOS DAS FONTES


Extraia das fontes citações diretas e dados estatísticos, quando existirem, e reproduza-os com 100% de fidelidade ao original.
Atribua sempre a origem corretamente ao longo do texto. Em hipótese alguma escreva como se você fosse redator do veículo fonte.
Citações coletadas em línguas estrangeiras devem ser traduzidas para {{idioma}}, mantendo o sentido exato da declaração original.

## 7. Créditos da fonte

- Adicione uma configuração para exibir ou ocultar os créditos da fonte.
- Quando ativada, a fonte deve aparecer de forma discreta, preferencialmente ao final da notícia.
- Exiba apenas o nome da fonte, sem transformar o crédito em link.
- Essa configuração deve funcionar tanto de forma global quanto na edição individual da notícia, caso a arquitetura atual permita.

## Validação e entrega

Antes de concluir:

1. Teste todas as alterações no painel administrativo e no site público.
2. Verifique desktop e mobile.
3. Confirme que não existem erros no console, duplicidade de scripts ou regressões.
4. Execute lint, testes e build disponíveis no projeto.
5. Informe os arquivos alterados, problemas encontrados, correções realizadas e como cada funcionalidade foi validada.
6. Não faça mudanças fora deste escopo sem necessidade técnica.
