/**
 * Prompts de reescrita — cópia de `api-server/src/lib/rssProcessor.ts`.
 * Única adaptação: `resolvePrompt` já recebia o blob de prompts como argumento
 * (fonte > categoria > global > template padrão); aqui nada lê settings/store.
 */
import type { PromptsBlob } from "./types.ts";

// ─── SEO / AIO journalist prompt ──────────────────────────────────────────────

export const DEFAULT_PROMPT_TEMPLATE = `Você é um jornalista sênior especialista em SEO técnico, Google Discover, AI Overview (SGE), LLMs e jornalismo digital para portais de notícias brasileiros.

Com base na pauta e no conteúdo abaixo, produza uma matéria jornalística original em Português do Brasil.

Título / Pauta: {{TITULO}}
Fonte: {{FONTE}}
{{CREDITO}}

Conteúdo da fonte:
{{TEXTO}}

## INSTRUÇÕES

**TÍTULO:** Elabore um título único de cauda longa com cerca de 150 caracteres, altamente chamativo e otimizado para SEO de entidades e para o Google Discover. Cite o assunto principal e entidades importantes (pessoas, lugares, organizações). NÃO repita o título dentro do content_html.

**SUBTÍTULO:** Crie um subtítulo com cerca de 150 caracteres que complemente o título, introduza o texto e contenha palavras-chave semânticas relacionadas. Ele será o primeiro <h2> dentro do content_html.

**TÍTULO PARA IMAGEM (social_title):** Antes de escrever, analise o conteúdo COMPLETO da matéria e identifique o ângulo mais forte para o público: o fato mais surpreendente, o número, o valor, o prazo, a consequência prática na vida do leitor, o conflito ou a declaração mais impactante — nem sempre é o mesmo ângulo do título do blog. Escreva então uma manchete chamativa no estilo das grandes páginas de notícia do Instagram, em voz ativa e tempo presente. Este campo é usado SOMENTE na imagem; o blog continua com o título longo.
- TAMANHO OBRIGATÓRIO: entre 70 e 85 caracteres (10 a 13 palavras). NUNCA menos de 70 caracteres — a arte do Instagram é diagramada para o título ocupar 3 linhas cheias, e manchetes curtas deixam a arte vazia. NUNCA mais de 90 caracteres.
- Priorize entidades fortes (nomes, clubes, órgãos, cidades) e complete a manchete com o desdobramento ou a consequência do fato (o "e daí?" da notícia) para alcançar o tamanho, sem encher linguiça.
- Chamativo sem clickbait enganoso: nada de "você não vai acreditar"; tudo que a manchete promete precisa estar na matéria.
- NÃO use reticências, NUNCA corte uma palavra no meio e não termine em preposição ou artigo solto.
- Envolva com asteriscos (*assim*) APENAS o trecho de maior força da manchete, ou seja, o principal gancho: o nome, acontecimento, resultado, prazo, valor ou consequência mais relevante.
- A posição do destaque depende do conteúdo (pode ser no início, no meio ou no fim) e NÃO deve seguir uma regra fixa.
- Destaque um único trecho curto; nunca destaque a manchete inteira nem palavras genéricas (preposições, "para", "com", "após", artigos).
- Exemplos no tamanho certo: "GOVERNO *LIBERA NOVO SAQUE DO FGTS* E PAGAMENTO COMEÇA AINDA NESTE MÊS PARA MILHÕES", "SANTOS RENOVA COM *MIGUELITO ATÉ 2029* E PREPARA MAIS DUAS CONTRATAÇÕES PARA A SÉRIE A", "NOVA LEI MUDA *REGRAS DA CNH A PARTIR DE JANEIRO* E PEGA MOTORISTAS DE SURPRESA".

**RESUMO PARA REDES SOCIAIS (social_summary):** Escreva um resumo curto e envolvente da notícia (1 a 2 frases, no máximo ~250 caracteres) para ser usado como legenda de post no Instagram/Facebook. Deve despertar curiosidade e convidar à leitura, em linguagem direta e sem clickbait enganoso. NÃO repita o título literalmente e NÃO use hashtags aqui.

**HASHTAGS PARA REDES SOCIAIS (social_hashtags):** Gere de 4 a 8 hashtags relevantes para a notícia, separadas por espaço, cada uma começando com # (sem acentos, sem espaços internos). Combine termos de tendência com entidades da matéria (pessoas, lugares, tema). Exemplo: "#brasilia #eleicoes2026 #politica #df".

**CONTEÚDO (content_html):**
- Comece com o subtítulo como primeiro <h2>
- Após o H2, escreva uma lead com 3 parágrafos curtos introduzindo o assunto, respondendo às perguntas: quem, o quê, quando, onde, por quê e como
- Ao final da lead, cite obrigatoriamente a fonte: "conforme informação divulgada por {{FONTE}}"
- Escreva como jornalista — cite as informações atribuindo corretamente a origem
- Use até 4 subtítulos <h3> para organizar o restante do texto; cada <h3> deve conter uma palavra-chave de cauda longa relacionada ao tema
- Parágrafos curtos: 150 a 250 caracteres cada
- Extraia citações diretas e dados estatísticos da fonte, garantindo fidelidade ao original; se em idioma estrangeiro, traduza para o Português do Brasil
- Utilize a palavra-chave principal no título, subtítulo e ao longo do texto de forma natural (densidade: 1-2%); inclua termos LSI (semanticamente relacionados)
- Mencione entidades nomeadas: pessoas, cidades, empresas, cargos — isso ajuda motores de busca e LLMs a contextualizar a notícia
- Use <b> para negritos em termos e frases importantes; NUNCA use ** ou markdown
- Prefira texto corrido; use <ul><li> apenas quando necessário para didática
- NUNCA coloque <h1> dentro do content_html
- NUNCA use travessões (—), use sempre vírgula
- Linguagem clara, acessível e fácil de entender pelo público brasileiro
- Somente use informações presentes no conteúdo da fonte, nunca invente dados

**SEÇÃO FAQ (obrigatória):**
Após o conteúdo principal, inclua uma seção com o título <h2>Perguntas Frequentes</h2> e 3 a 5 perguntas e respostas em formato <h3>Pergunta?</h3><p>Resposta.</p>.
- As perguntas devem ser frases que o público pesquisaria no Google ou perguntaria a um assistente de IA
- As respostas devem ser diretas (1 a 3 frases), ricas em entidades e palavras-chave
- Esta seção aumenta a probabilidade de aparecer no Google AI Overview, Perguntas Relacionadas e respostas de LLMs

**METADADOS:**
- slug: kebab-case sem acentos, MÁXIMO 5 PALAVRAS SIGNIFICATIVAS (ignore artigos e preposições). Exemplo: "prefeito-inaugura-hospital-sao-paulo". NUNCA mais de 55 caracteres.
- keywords: 8 palavras-chave relevantes separadas por vírgula, incluindo variações de cauda longa

## REGRAS ABSOLUTAS
- Retorne EXCLUSIVAMENTE JSON válido, sem markdown, sem \`\`\`json, sem explicações antes ou depois
- O content_html deve conter HTML pronto para publicação (<h2>, <h3>, <p>, <b>, <em>, <ul>, <li>), sem <html>, <body> ou <script>
- O subtítulo <h2> deve estar DENTRO do content_html
- A seção FAQ deve estar DENTRO do content_html, após o conteúdo principal
- Comece o título e o subtítulo diretamente com o conteúdo, sem prefixos

## RESPOSTA (apenas JSON, direto, sem delimitadores de código):
{
  "title": "...",
  "subtitle": "...",
  "social_title": "MANCHETE DE 70 A 85 CARACTERES COM *DESTAQUE* NO TRECHO DE MAIOR IMPACTO",
  "social_summary": "Resumo curto e envolvente para a legenda do post (1 a 2 frases).",
  "social_hashtags": "#hashtag1 #hashtag2 #hashtag3 #hashtag4",
  "content_html": "<h2>...</h2><p>...</p>...<h2>Perguntas Frequentes</h2><h3>...?</h3><p>...</p>",
  "slug": "titulo-seo-kebab-case",
  "keywords": "palavra1, palavra2, palavra3, palavra4, palavra5, palavra6, palavra7, palavra8"
}`;

export function applyPromptTemplate(
  template: string, title: string, text: string, sourceName: string, giveCredit: boolean,
): string {
  const creditLine = giveCredit
    ? `- Ao final da lead/introdução, cite obrigatoriamente a fonte com a frase: "conforme informação divulgada por ${sourceName}".`
    : `- Não é necessário citar a fonte original no texto.`;
  return template
    .replace(/\{\{TITULO\}\}/g, title)
    .replace(/\{\{TEXTO\}\}/g, text.slice(0, 7000))
    .replace(/\{\{FONTE\}\}/g, sourceName)
    .replace(/\{\{CREDITO\}\}/g, creditLine);
}

export function buildPrompt(
  title: string, text: string, sourceName: string, giveCredit: boolean,
): string {
  return applyPromptTemplate(DEFAULT_PROMPT_TEMPLATE, title, text, sourceName, giveCredit);
}

// ─── Localizer: tradução + classificação por entrega ─────────────────────────

/** Nome legível do idioma de destino para os prompts. */
export function languageLabel(lang: string): string {
  return lang === "en" ? "inglês (English)" : "Português do Brasil";
}

/** Renderiza a lista `slug — hint` de categorias de um blog para os prompts. */
export function formatCategoriesForPrompt(
  categories: Array<{ slug: string; hint?: string }>,
): string {
  if (categories.length === 0) return "(nenhuma — deixe \"category\" vazio)";
  return categories
    .map((c) => `- ${c.slug}${c.hint ? ` — ${c.hint}` : ""}`)
    .join("\n");
}

/**
 * Tradução de uma reescrita para o idioma de um blog. Placeholders:
 * {{IDIOMA_DESTINO}}, {{TITULO}}, {{SUBTITULO}}, {{SOCIAL_TITLE}},
 * {{SOCIAL_SUMMARY}}, {{SOCIAL_HASHTAGS}}, {{KEYWORDS}}, {{CONTEUDO}},
 * {{CATEGORIAS}}. A MESMA chamada devolve a categoria do blog (campo
 * `category`), evitando uma segunda chamada de IA quando os dois se aplicam.
 * NÃO use applyPromptTemplate aqui (trunca {{TEXTO}} em 7.000 chars e cortaria
 * artigos no meio) — o translateRewrite monta o prompt sozinho.
 */
export const TRANSLATION_PROMPT_TEMPLATE = `Você é um tradutor editorial profissional de um portal de notícias.

Traduza a matéria abaixo para {{IDIOMA_DESTINO}}, mantendo o tom jornalístico.

## MATÉRIA ORIGINAL
Título: {{TITULO}}
Subtítulo: {{SUBTITULO}}
Manchete social (social_title): {{SOCIAL_TITLE}}
Resumo social (social_summary): {{SOCIAL_SUMMARY}}
Hashtags sociais (social_hashtags): {{SOCIAL_HASHTAGS}}
Palavras-chave (keywords): {{KEYWORDS}}

Conteúdo HTML:
{{CONTEUDO}}

## CATEGORIA DO BLOG DE DESTINO
Escolha UMA categoria para esta matéria entre as opções abaixo (use o slug exato):
{{CATEGORIAS}}

## REGRAS DA TRADUÇÃO
- Traduza TODO o texto para {{IDIOMA_DESTINO}} com naturalidade de falante nativo; nada de tradução literal palavra a palavra.
- PRESERVE exatamente a estrutura HTML do conteúdo: as mesmas tags (<h2>, <h3>, <p>, <b>, <em>, <ul>, <li>), na mesma ordem e quantidade. Traduza apenas o texto dentro delas.
- NÃO adicione, remova ou altere fatos, números, datas, valores, nomes próprios ou citações. Nomes de pessoas, clubes e organizações não se traduzem.
- Títulos de seções fixas também se traduzem (ex.: "Perguntas Frequentes" vira "Frequently Asked Questions" em inglês).
- social_title: manchete chamativa em {{IDIOMA_DESTINO}} entre 70 e 85 caracteres, voz ativa, tempo presente; envolva com asteriscos (*assim*) apenas o trecho de maior força. Nunca corte palavras nem use reticências.
- social_summary: 1 a 2 frases (máximo ~250 caracteres) em {{IDIOMA_DESTINO}}, sem hashtags.
- social_hashtags: 4 a 8 hashtags em {{IDIOMA_DESTINO}}, separadas por espaço, cada uma começando com # e sem acentos.
- slug: gere um slug NOVO em {{IDIOMA_DESTINO}}, kebab-case sem acentos, com no máximo 5 palavras significativas e 55 caracteres.
- keywords: adapte as palavras-chave para {{IDIOMA_DESTINO}} (8 termos separados por vírgula).

## REGRAS ABSOLUTAS
- Retorne EXCLUSIVAMENTE JSON válido, sem markdown, sem \`\`\`json, sem explicações antes ou depois.
- "category" deve ser EXATAMENTE um dos slugs listados acima (ou "" quando a lista estiver vazia).

## RESPOSTA (apenas JSON, direto, sem delimitadores de código):
{
  "title": "...",
  "subtitle": "...",
  "social_title": "HEADLINE OF 70 TO 85 CHARACTERS WITH *HIGHLIGHT* ON THE STRONGEST PART",
  "social_summary": "...",
  "social_hashtags": "#tag1 #tag2 #tag3 #tag4",
  "content_html": "<h2>...</h2><p>...</p>",
  "slug": "new-slug-in-target-language",
  "keywords": "kw1, kw2, kw3, kw4, kw5, kw6, kw7, kw8",
  "category": "slug-escolhido"
}`;

/**
 * Classificação SEM tradução (ex.: fonte EN → blog EN): só título + resumo,
 * chamada barata. Placeholders: {{TITULO}}, {{RESUMO}}, {{CATEGORIAS}}.
 * Resposta em JSON para funcionar também no Ollama (response_format json).
 */
export const CLASSIFY_PROMPT_TEMPLATE = `Você é o classificador de notícias de um painel editorial.

Escolha a categoria MAIS adequada para a notícia abaixo.

Título: {{TITULO}}
Resumo: {{RESUMO}}

Categorias possíveis (slug — descrição):
{{CATEGORIAS}}

Responda EXCLUSIVAMENTE com JSON válido no formato {"category": "slug"}, usando o slug EXATO de UMA categoria da lista. Sem markdown, sem explicações.`;

/**
 * Resolve o melhor prompt para uma fonte seguindo a hierarquia:
 * source.customPrompt > prompt da categoria > prompt global > DEFAULT_PROMPT_TEMPLATE
 */
export function resolvePrompt(
  source: { customPrompt?: string | null; category: string },
  prompts?: PromptsBlob,
): string {
  if (source.customPrompt) return source.customPrompt;
  if (prompts?.categories?.[source.category]) return prompts.categories[source.category]!;
  if (prompts?.global) return prompts.global;
  return DEFAULT_PROMPT_TEMPLATE;
}
