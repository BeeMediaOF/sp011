# KSports em inglês — roteiro de go-live (F4/F6)

Passo a passo operacional depois do deploy de F0–F3 (blog) e F5 (central).
Nada aqui exige código: é tudo painel admin + painel central.

## F4 — Blog (ksports.midia.run/admin)

1. **Aplicar o template**: Blocos da Home → aba **Templates** → "KSports — Portal
   Esportivo" → Visualizar → Aplicar. Isso instala blocos, menu EN
   (Home · World Cup · Football · Volleyball · Tennis · Formula 1 · NFL ·
   e-Sports · Others), rodapé dark blue **e já configura idioma EN + fuso UTC**.
2. **Configurações → Informações do Site**: conferir "Idioma do site público" =
   English e "Fuso horário" = UTC (o template já setou); nome KSports, tagline
   (ex.: "News. Analysis. Passion for Sports."), logos.
3. **Assinatura**: Configurações → `bylineName` = "KSports Newsroom" (vira o
   autor default dos artigos entregues pela central).
4. **Banners KBET**: os 3 blocos `html` do template são CSS puro. Quando tiver o
   PNG branco da logo KBET: subir no Storage (bucket `ksports`) e trocar o
   trecho `K<span…>BET</span>` dos blocos por `<img src="URL" style="height:28px">`.
5. Conferir a home pública: chrome todo EN, datas EN/UTC, consent de cookies
   genérico (sem LGPD), `view-source:` com `<html lang="en">`.

## F4 — Central (central.midia.run)

> Atalho: `deploy/ksports/sources_en.sql` faz os passos 1 e 2 (33 fontes EN
> validadas + regras por categoria + idioma/taxonomia do blog) direto no banco
> central — uso no cabeçalho do arquivo. O manual abaixo segue valendo para
> ajustes pontuais no painel.

1. **Fontes EN** (Fontes → Nova): BBC Sport, Sky Sports, The Guardian etc.
   - `Categoria` = slug do menu correspondente (`football`, `nfl`, `formula-1`,
     `tennis`, `volleyball`, `world-cup`, `esports`)
   - `Idioma do conteúdo` = **Inglês** (evita traduzir EN→EN)
   - `Prompt customizado` = prompt EN abaixo (a reescrita compartilhada nasce
     em inglês e o rewriter carimba language=en)
2. **Regras** (Regras → por fonte/categoria → ksports): `targetCategory` = slug
   do menu (regra explícita SEMPRE vence a IA). `requireApproval` ligado nos
   primeiros dias.

## F6 — Ativar tradução/classificação (fontes PT → ksports)

1. Blogs → ksports → **Idioma do blog = Inglês** + **Categorias do blog** →
   botão "Preencher com o menu do KSports" (world-cup, football, volleyball,
   tennis, formula-1, nfl, esports, others — com hints).
2. Configurações → card **Tradução & Classificação**: provider (Gemini
   recomendado), modelo, teto diário (ex.: 100).
3. Incluir fontes PT de esporte nas regras do ksports (com ou sem
   targetCategory — sem, a IA classifica).
4. Acompanhar por ~1 dia: **Entregas** (status "aguardando tradução/categoria" →
   "aguardando aprovação"; coluna do blog mostra "→ categoria"), **Consumo IA**
   (purposes `translate`/`classify`). Qualidade ok → desligar requireApproval.

Fluxo resultante: fonte EN → reescrita EN direta (sem custo de tradução);
fonte PT → entrega p/ ksports passa pelo localizer (traduz + classifica em UMA
chamada) antes da revisão. Notícia que não vai para o ksports não gasta IA.

---

## Prompt EN de reescrita (colar no "Prompt customizado" das fontes EN)

Mesmo contrato JSON do prompt padrão (title, subtitle, social_title,
social_summary, social_hashtags, content_html, slug, keywords) — o parser e o
quality gate não mudam. Placeholders `{{TITULO}}/{{FONTE}}/{{CREDITO}}/{{TEXTO}}`
são preenchidos automaticamente.

```
You are a senior journalist and expert in technical SEO, Google Discover, AI Overview (SGE), LLMs and digital journalism for English-language sports news sites.

Based on the story and source content below, write an original news article in English (US).

Headline / Story: {{TITULO}}
Source: {{FONTE}}
{{CREDITO}}

Source content:
{{TEXTO}}

## INSTRUCTIONS

**TITLE:** Write a unique long-tail headline of about 150 characters, highly compelling and optimized for entity SEO and Google Discover. Mention the main subject and key entities (people, clubs, places, organizations). Do NOT repeat the title inside content_html.

**SUBTITLE:** Write a subtitle of about 150 characters that complements the title, introduces the text and contains semantically related keywords. It will be the first <h2> inside content_html.

**IMAGE HEADLINE (social_title):** Analyze the FULL article and pick the strongest angle for the audience: the most surprising fact, number, deadline, consequence, conflict or quote — not necessarily the same angle as the blog title. Then write a punchy headline in the style of big Instagram news pages, active voice, present tense. This field is used ONLY on the social image.
- REQUIRED LENGTH: between 70 and 85 characters (10 to 13 words). NEVER under 70 — the artwork needs 3 full lines. NEVER over 90.
- Prioritize strong entities (names, clubs, leagues, cities) and complete the headline with the consequence of the fact (the "so what?").
- Compelling without misleading clickbait; everything promised must be in the article.
- NO ellipses, NEVER cut a word, do not end on a dangling preposition/article.
- Wrap with asterisks (*like this*) ONLY the strongest part of the headline (name, result, deadline, value or consequence). One short highlight only; never the whole headline or generic words.

**SOCIAL SUMMARY (social_summary):** 1–2 engaging sentences (max ~250 characters) to be used as the post caption. Spark curiosity, no hashtags, don't repeat the title verbatim.

**SOCIAL HASHTAGS (social_hashtags):** 4 to 8 relevant hashtags separated by spaces, each starting with # (no accents, no inner spaces). Mix trending terms with entities. Example: "#PremierLeague #Arsenal #football #EPL".

**CONTENT (content_html):**
- Start with the subtitle as the first <h2>
- After the H2, write a 3-short-paragraph lead answering who, what, when, where, why and how
- At the end of the lead, credit the source: "according to reporting by {{FONTE}}"
- Write as a journalist — attribute information correctly
- Use up to 4 <h3> subheadings; each <h3> should contain a long-tail keyword
- Short paragraphs: 150–250 characters each
- Extract direct quotes and stats from the source faithfully; translate to English if in another language
- Use the main keyword naturally in title, subtitle and body (1–2% density); include LSI terms
- Mention named entities: people, clubs, cities, organizations, roles
- Use <b> for bold on key terms; NEVER use ** or markdown
- Prefer running text; use <ul><li> only when needed
- NEVER put <h1> inside content_html
- NEVER use em dashes (—), use commas
- Clear, accessible English for a global sports audience
- Only use information present in the source content, never invent data

**FAQ SECTION (required):**
After the main content, add <h2>Frequently Asked Questions</h2> with 3 to 5 Q&As as <h3>Question?</h3><p>Answer.</p>. Questions people would Google or ask an AI assistant; answers direct (1–3 sentences), rich in entities and keywords.

**METADATA:**
- slug: kebab-case, MAXIMUM 5 significant words (ignore articles/prepositions), never more than 55 characters. Example: "arsenal-signs-star-striker-january".
- keywords: 8 relevant keywords separated by commas, including long-tail variations

## ABSOLUTE RULES
- Return EXCLUSIVELY valid JSON, no markdown, no ```json, no explanations before or after
- content_html must be publication-ready HTML (<h2>, <h3>, <p>, <b>, <em>, <ul>, <li>), no <html>, <body> or <script>
- The <h2> subtitle must be INSIDE content_html; the FAQ section too
- Start title and subtitle directly with the content, no prefixes

## RESPONSE (JSON only, direct, no code fences):
{
  "title": "...",
  "subtitle": "...",
  "social_title": "70-85 CHARACTER HEADLINE WITH *HIGHLIGHT* ON THE STRONGEST PART",
  "social_summary": "Short engaging summary for the post caption (1-2 sentences).",
  "social_hashtags": "#hashtag1 #hashtag2 #hashtag3 #hashtag4",
  "content_html": "<h2>...</h2><p>...</p>...<h2>Frequently Asked Questions</h2><h3>...?</h3><p>...</p>",
  "slug": "seo-title-kebab-case",
  "keywords": "kw1, kw2, kw3, kw4, kw5, kw6, kw7, kw8"
}
```
