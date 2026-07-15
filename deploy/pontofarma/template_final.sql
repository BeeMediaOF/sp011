-- =============================================================================
-- PontoFarma — importa o template "PontoFarma - Final" (clone do snapshot
-- "KSports - Final" na identidade PontoFarma, gerado em 2026-07-15 a partir
-- do template do Bee Esportes)
-- =============================================================================
-- Identidade (Proposta Bee Media / mock da home): verde #18a957 (acentos/CTA),
-- verde escuro #0c8b46, navy #0e2341 (top bar/menu/banners), rodapé #0c1630.
-- Wordmark: "Ponto" branco + "Farma" verde. Tagline: "conteúdo que gera
-- resultado". Portal B2B do setor farmacêutico (pt-BR).
-- Editorias/slugs DESTE blog (diferentes dos blogs de esporte — as regras da
-- central casam por slug): gestao, fiscal-tributario, legislacao, mercado,
-- vendas, equipe, tecnologia, saude-categorias, outros (fallback).
--   * /tecnologia tem rota fixa no app; os demais slugs resolvem via
--     DynamicCategory — POR ISSO todo slug precisa de menuItem VISÍVEL.
--   * Banners nascem como "Anuncie" (casa/B2B) em HTML na identidade da
--     marca — troque o HTML do bloco quando houver parceiro/mídia kit.
--     Artes de upload de OUTROS blogs nunca funcionam aqui (bucket por blog).
--   * siteLanguage=pt-BR e fuso America/Sao_Paulo gravados ao aplicar.
--   * Ticker "Em Alta" continua OCULTO e a hero strip desligada (como no
--     "Final" do ksports).
--
-- Idempotente: remove versão anterior do mesmo template (id) antes de anexar.
-- Pré-requisito: wizard /admin/setup concluído (tabela settings populada).
-- O app relê site_settings a cada 15s — o template aparece em
-- "Meus templates" sem restart. Não salve Configurações no admin no mesmo
-- instante da importação.
--
-- Uso (VPS, /opt/sp011):
--   docker compose exec -T pg-blogs psql -U postgres -d pontofarma -v ON_ERROR_STOP=1 < deploy/pontofarma/template_final.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM settings WHERE key = 'site_settings') THEN
    RAISE EXCEPTION 'site_settings nao existe neste banco — conclua o wizard /admin/setup do PontoFarma antes de importar o template.';
  END IF;
END $$;

UPDATE settings s
SET value = jsonb_set(
      s.value::jsonb,
      '{homeTemplates}',
      (
        SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(s.value::jsonb->'homeTemplates', '[]'::jsonb)) AS t
        WHERE t->>'id' <> 'tpl-pontofarma-final'
      ) || $tpl$
{
  "id": "tpl-pontofarma-final",
  "name": "PontoFarma - Final",
  "createdAt": "2026-07-15T12:00:00.000Z",
  "accentColor": "#0c8b46",
  "headerStyle": "standard",
  "footerStyle": "dark",
  "headerBgColor": "#ffffff",
  "footerBgColor": "#0c1630",
  "menuTextColor": "#101418",
  "menuActiveColor": "#18a957",
  "menuFontSize": 12,
  "menuFontWeight": 800,
  "showTickerBar": false,
  "showHeroStrip": false,
  "showTopBar": true,
  "topBarBgColor": "#0e2341",
  "menuBarStyle": "bar",
  "menuBarBgColor": "#0e2341",
  "footerAccentColor": "#18a957",
  "headerPaddingX": 16,
  "headerMarginTop": 0,
  "siteLanguage": "pt-BR",
  "siteTimezone": "America/Sao_Paulo",
  "headerBannerHtml": "<div style=\"display:flex;align-items:center;justify-content:space-between;gap:18px;width:100%;max-width:720px;padding:11px 20px;border:1px solid #23446b;border-radius:8px;background:radial-gradient(circle at 88% 45%, rgba(24,169,87,.30), transparent 42%), radial-gradient(circle at 10% 60%, rgba(12,139,70,.55), transparent 46%), linear-gradient(135deg, #0e2341, #10406b 60%, #0c1630);\"><span style=\"font-weight:900;font-size:19px;letter-spacing:.01em;color:#ffffff;\">Ponto<span style=\"color:#18a957;\">Farma</span></span><span style=\"flex:1;text-align:center;color:#ffffff;line-height:1.15;\"><span style=\"font-size:15px;font-weight:900;letter-spacing:.02em;\">SUA MARCA <span style=\"color:#18a957;\">AQUI.</span></span><br/><span style=\"font-size:10px;font-weight:600;color:#c9d8ea;\">FALE COM QUEM DECIDE NA FARMÁCIA</span></span><span style=\"background:#18a957;color:#ffffff;padding:8px 14px;border-radius:6px;font-weight:800;font-size:11px;white-space:nowrap;\">ANUNCIE</span></div>",
  "menuItems": [
    { "id": "pf-menu-home",    "label": "HOME",                "path": "/",                 "order": 0, "visible": true },
    { "id": "pf-menu-gestao",  "label": "GESTÃO",              "path": "/gestao",           "order": 1, "visible": true },
    { "id": "pf-menu-fiscal",  "label": "FISCAL & TRIBUTÁRIO", "path": "/fiscal-tributario","order": 2, "visible": true },
    { "id": "pf-menu-legis",   "label": "LEGISLAÇÃO",          "path": "/legislacao",       "order": 3, "visible": true },
    { "id": "pf-menu-mercado", "label": "MERCADO",             "path": "/mercado",          "order": 4, "visible": true },
    { "id": "pf-menu-vendas",  "label": "VENDAS",              "path": "/vendas",           "order": 5, "visible": true },
    { "id": "pf-menu-equipe",  "label": "EQUIPE",              "path": "/equipe",           "order": 6, "visible": true },
    { "id": "pf-menu-tec",     "label": "TECNOLOGIA",          "path": "/tecnologia",       "order": 7, "visible": true },
    { "id": "pf-menu-saude",   "label": "SAÚDE & CATEGORIAS",  "path": "/saude-categorias", "order": 8, "visible": true },
    { "id": "pf-menu-outros",  "label": "OUTROS",              "path": "/outros",           "order": 9, "visible": true }
  ],
  "footerConfig": {
    "description": "Conteúdo estratégico para gestão e operação de farmácias.",
    "showSocial": false,
    "socialEnabled": {},
    "columns": [
      { "id": "pf-nav", "title": "Conteúdos", "links": [
        { "id": "pf-nav-home",    "label": "Home",                "href": "/" },
        { "id": "pf-nav-gestao",  "label": "Gestão",              "href": "/gestao" },
        { "id": "pf-nav-fiscal",  "label": "Fiscal & Tributário", "href": "/fiscal-tributario" },
        { "id": "pf-nav-legis",   "label": "Legislação",          "href": "/legislacao" },
        { "id": "pf-nav-mercado", "label": "Mercado",             "href": "/mercado" },
        { "id": "pf-nav-vendas",  "label": "Vendas",              "href": "/vendas" },
        { "id": "pf-nav-equipe",  "label": "Equipe",              "href": "/equipe" },
        { "id": "pf-nav-tec",     "label": "Tecnologia",          "href": "/tecnologia" },
        { "id": "pf-nav-saude",   "label": "Saúde & Categorias",  "href": "/saude-categorias" }
      ] },
      { "id": "pf-inst", "title": "Institucional", "links": [
        { "id": "pf-i-about",     "label": "Sobre o PontoFarma",      "href": "/contato" },
        { "id": "pf-i-advertise", "label": "Anuncie",                 "href": "/contato" },
        { "id": "pf-i-privacy",   "label": "Política de Privacidade", "href": "/privacidade" },
        { "id": "pf-i-terms",     "label": "Termos de Uso",           "href": "/termos" },
        { "id": "pf-i-contact",   "label": "Fale Conosco",            "href": "/contato" }
      ] }
    ],
    "showContact": false,
    "showNewsletter": true,
    "newsletterTitle": "Receba conteúdos exclusivos para a sua farmácia no seu e-mail",
    "copyright": "© {year} {site}. Todos os direitos reservados.",
    "legalLinks": [
      { "id": "pf-l-privacy", "label": "Política de Privacidade", "href": "/privacidade" },
      { "id": "pf-l-terms",   "label": "Termos de Uso",           "href": "/termos" },
      { "id": "pf-l-contact", "label": "Contato",                 "href": "/contato" }
    ]
  },
  "blocks": [
    { "id": "hero",       "area": "main",    "name": "Principais Notícias", "order": 0, "layout": "portal", "visible": true },
    { "id": "mais-lidas", "area": "sidebar", "name": "Mais Lidas", "color": "#0c8b46", "order": 1, "visible": true },
    { "id": "ticker-pf", "name": "Em Alta", "color": "#18a957", "order": 2, "custom": true, "format": "grid", "source": "latest", "visible": false, "blockType": "ticker", "itemsLimit": 8 },
    { "id": "html-pf-ad-faixa", "area": "main", "isAd": true, "name": "Anuncie — Faixa", "color": "#0c8b46", "order": 3, "custom": true, "format": "grid", "visible": true, "blockType": "html", "html": "<div style=\"display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:14px 20px;padding:18px 26px;border:1px solid #23446b;border-radius:8px;background:radial-gradient(circle at 88% 45%, rgba(24,169,87,.30), transparent 42%), radial-gradient(circle at 10% 60%, rgba(12,139,70,.55), transparent 46%), linear-gradient(135deg, #0e2341, #10406b 60%, #0c1630);\"><span style=\"font-weight:900;font-size:26px;letter-spacing:.01em;color:#ffffff;\">Ponto<span style=\"color:#18a957;\">Farma</span></span><span style=\"flex:1;min-width:220px;text-align:center;color:#ffffff;line-height:1.1;\"><span style=\"font-size:20px;font-weight:900;letter-spacing:.02em;\">ANUNCIE <span style=\"color:#18a957;\">AQUI</span></span><br/><span style=\"font-size:13px;font-weight:600;color:#c9d8ea;\">SUA MARCA PARA DONOS DE FARMÁCIA DE TODO O BRASIL</span></span><span style=\"background:#18a957;color:#ffffff;padding:10px 18px;border-radius:6px;font-weight:800;font-size:13px;white-space:nowrap;\">FALE CONOSCO</span></div>" },
    { "id": "list-pf-ultimas", "area": "sidebar", "name": "Últimas Notícias", "color": "#0c8b46", "order": 4, "custom": true, "format": "list_compact", "source": "latest", "reverse": false, "visible": true, "blockType": "list", "itemsLimit": 5 },
    { "id": "content-pf-recentes", "area": "main", "name": "Mais Recentes", "color": "#0c8b46", "order": 5, "custom": true, "format": "grid", "layout": "grid", "source": "latest", "reverse": false, "visible": true, "blockType": "content", "itemsLimit": 8 },
    { "id": "html-pf-ad-box", "area": "sidebar", "isAd": true, "name": "Anuncie — Lateral", "color": "#18a957", "order": 6, "custom": true, "format": "grid", "visible": true, "blockType": "html", "html": "<div style=\"max-width:460px;margin:0 auto;text-align:center;padding:34px 24px;border:1px solid #23446b;border-radius:8px;background:radial-gradient(circle at 88% 45%, rgba(24,169,87,.30), transparent 42%), radial-gradient(circle at 10% 60%, rgba(12,139,70,.55), transparent 46%), linear-gradient(135deg, #0e2341, #10406b 60%, #0c1630);\"><div style=\"color:#c9d8ea;font-size:11px;font-weight:800;letter-spacing:.14em;margin-bottom:10px;\">PARCEIRO OFICIAL</div><div style=\"margin-bottom:12px;\"><span style=\"font-weight:900;font-size:26px;letter-spacing:.01em;color:#ffffff;\">Ponto<span style=\"color:#18a957;\">Farma</span></span></div><div style=\"color:#ffffff;font-size:26px;font-weight:900;line-height:1.1;\">SUA MARCA<br/>NESTE ESPAÇO</div><div style=\"display:inline-block;background:#18a957;color:#ffffff;padding:10px 22px;border-radius:6px;font-weight:800;font-size:13px;margin-top:16px;\">ANUNCIE AQUI</div></div>" },
    { "id": "content-pf-fiscal", "name": "Fiscal & Tributário", "color": "#0c8b46", "order": 7,  "width": "quarter", "custom": true, "format": "featured", "layout": "featured", "source": "automatic_by_category", "visible": true, "category": "fiscal-tributario", "blockType": "content", "linkLabel": "VER TODOS →" },
    { "id": "content-pf-legis",  "name": "Legislação",          "color": "#18a957", "order": 8,  "width": "quarter", "custom": true, "format": "featured", "layout": "featured", "source": "automatic_by_category", "visible": true, "category": "legislacao",        "blockType": "content", "linkLabel": "VER TODOS →" },
    { "id": "content-pf-vendas", "name": "Vendas",              "color": "#0c8b46", "order": 9,  "width": "quarter", "custom": true, "format": "featured", "layout": "featured", "source": "automatic_by_category", "visible": true, "category": "vendas",            "blockType": "content", "linkLabel": "VER TODOS →" },
    { "id": "content-pf-tec",    "name": "Tecnologia",          "color": "#18a957", "order": 10, "width": "quarter", "custom": true, "format": "featured", "layout": "featured", "source": "automatic_by_category", "visible": true, "category": "tecnologia",        "blockType": "content", "linkLabel": "VER TODOS →" },
    { "id": "content-pf-gestao", "name": "Gestão", "color": "#0c8b46", "order": 11, "custom": true, "format": "cultura", "layout": "cultura", "source": "automatic_by_category", "reverse": false, "visible": true, "category": "gestao", "blockType": "content", "itemsLimit": 4 },
    { "id": "content-pf-mais", "name": "Mais Notícias", "color": "#0c8b46", "order": 12, "custom": true, "format": "grid", "layout": "grid", "source": "latest", "reverse": false, "visible": true, "blockType": "content", "itemsLimit": 4 },
    { "id": "brasil",     "name": "Brasil",           "color": "#16a34a", "order": 13, "layout": "grid",    "visible": false, "category": "brasil" },
    { "id": "mundo",      "name": "Mundo",            "color": "#6b21a8", "order": 14, "layout": "grid",    "visible": false, "category": "mundo" },
    { "id": "esporte",    "name": "Esporte",          "color": "#dc2626", "order": 15, "layout": "cultura", "visible": false, "category": "esportes" },
    { "id": "cultura",    "name": "Cultura",          "color": "#0d9488", "order": 16, "layout": "cultura", "visible": false, "category": "cultura" },
    { "id": "df",         "name": "DF",               "color": "#0b3d91", "order": 17, "layout": "duplo",   "visible": false, "category": "cidade" },
    { "id": "saude",      "name": "Saúde",            "color": "#16a34a", "order": 18, "layout": "grid",    "visible": false, "category": "saude" },
    { "id": "tecnologia", "name": "Tecnologia",       "color": "#0284c7", "order": 19, "layout": "grid",    "visible": false, "category": "tecnologia" },
    { "id": "colunistas", "name": "Colunistas",       "order": 20, "visible": false },
    { "id": "ultimas",    "name": "Últimas Notícias", "order": 21, "visible": false }
  ]
}
$tpl$::jsonb,
      true
    )::text,
    updated_at = now()
WHERE s.key = 'site_settings';

COMMIT;

\echo ''
\echo '=== TEMPLATES SALVOS NESTE BLOG ==='
SELECT t->>'id' AS id, t->>'name' AS nome,
       jsonb_array_length(t->'blocks') AS blocos
FROM settings, jsonb_array_elements(value::jsonb->'homeTemplates') AS t
WHERE key = 'site_settings';
