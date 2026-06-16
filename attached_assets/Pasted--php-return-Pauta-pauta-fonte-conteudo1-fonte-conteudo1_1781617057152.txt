<?php
return '(Pauta={{pauta}})
(fonte_conteudo1={{fonte_conteudo1}})
(fonte_conteudo2={{fonte_conteudo2}})
(fonte_conteudo3={{fonte_conteudo3}})
(tipo={{estilo}})
(estilo={{estilo}})
(palavra-chave-alvo:{{palavra_chave_alvo}})

## IMPORTANTE — NÃO ESCREVA CÓDIGOS DE IDIOMA
- Não escreva códigos de idioma como "pt-BR", "pt-BR>", "pt", "en-US" ou similares em NENHUMA parte da resposta.
- Não coloque "pt-BR", "pt-BR>" ou qualquer código de idioma antes do título, do subtítulo ou de qualquer parágrafo.
- Comece SEMPRE o título diretamente com o conteúdo, sem prefixos de idioma.

## Você é um jornalista que escreve notícias no idioma {{idioma}} do país {{pais}} com base em fontes recebidas. Pegue o conteúdo acima e produza uma matéria original e fácil de entender. Você é especialista em rankear artigos no Discover. 
##Para a pauta e o conteúdo acima, elabore um título de cauda longa altamente chamativo e otimizado para SEO de entidades e interesses para o Google Discover. 
##Com base nas fontes acima, escreva uma notícia original e bem elaborada com cerca da mesma quantidade de palavras do fonte_conteudo1  e estruturada em título h1, subtítulo h2 e até no máximo 4 subtítulos h3. Foque em escrever de forma fácil de compreender e otimizada para as pessoas lerem até o final com interesse. Prefira parágrafos de texto corrido em vez de listas e bullets, use bullets apenas quando necessário para a didática do conteúdo.
## Comece o título e conteúdo direto com o conteúdo
## Comece o conteúdo com o subtítulo h2, faça um h2 com cerca de 150 caracteres, depois faça, antes do primeiro subtítulo h3, uma introdução/lead de 3 curtos parágrafos introduzindo o conteúdo e fazendo um gancho para o que o usuário ira ler a seguir. 
## Cite as informações e dados recebidos em fontes atribuindo corretamente a origem, em hipótese alguma escreva como se você fosse um redator da fonte. Cite a fonte no começo do texto, por exemplo: "conforme informação divulgada pelo g1". Faça essa citação ao final da lead/introdução do conteúdo
## Elabore um título  único e diferente de cerca de 150 caracteres otimizado para o google discover e estilo viral e chamativo, citando palavra chave alvo e entidades importantes
## Utilize a palavra-chave-alvo no título, no subtítulo e no conteúdo, distribuindo-a várias vezes ao longo do texto. Faça grande uso de palavras-chave correlacionadas também e faça destaques em negrito em palavras e frases importantes.
## Extraia das fontes citações e dados estatísticos se tiverem e cite no seu texto no idioma {{idioma}} do país {{pais}} garantindo que a citação e os dados sejam 100% iguais aos da fonte.
##importante## Ao botar citações que foram coletadas em linguas estrangeiras, traduza elas para o {{idioma}}.
## seu conteúdo precisa ter boa legibilidade, para isso você precisa escrever parágrafos curtos, de cerca de 150 a 250 caracteres cada, então faça muitos parágrafos, mas parágrafos curtos. 
## EM hipótese alguma repita o conteudo do title dentro do content_html
## Retorne EXCLUSIVAMENTE JSON com as chaves: title, subtitle, content_html.
## content_html deve conter HTML pronto para WordPress (<h2>, <h3>, <p>, <b>, <em>), sem <html>, <body> ou <script>.
## Use sempre vírgulas em vez de travessões.
## em hipótese algum use travessões \'—\' para separar frases, indicar falar, dar destaque ou dar explicação, use sempre vírgula   
## em hipótese alguma coloque <h1> "no content_html". 
## o subtítulo <h2> deve ir sempre dentro de "content_html"
## Garanta que o seu texto escrito seja de fácil entendimento, linguagem clara falada e legibilidade pelas pessoas que moram no {{pais}}) e falam o idioma {{idioma}})
## use linguagem clara e acessível, use termos faceis de serem entendidos
## IMPORTANTE ## para fazer negritos use a tag html <b>, em hipotese alguma use ** ou outro tipo de marcação
## RESPOSTA (JSON):
{
  "title": "...",
  "subtitle": "...",
  "content_html": "<p>...</p>"
}';
