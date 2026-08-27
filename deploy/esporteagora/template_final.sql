-- =============================================================================
-- Esporte Agora — importa o template "Esporte Agora - Final" (clone do
-- snapshot "KSports - Final" do ksports, convertido em 2026-07-10)
-- =============================================================================
-- Conversões aplicadas sobre o snapshot original:
--   * Paleta KBET → identidade Esporte Agora: rosa #ff2b74 → roxo #5b2d8e /
--     verde #4bce10 (acentos), dark blue #0e0d2a → roxo escuro #241243,
--     rodapé #04082d → #1c0d35. Menu ativo/acento do rodapé em verde.
--   * Textos de blocos/menu/rodapé em pt-BR; slugs do menu = os das regras
--     da central (sources_pt.sql): copa-do-mundo, futebol, volei, tenis, f1,
--     futebol-americano, e-sports, outros.
--   * As 3 artes enviadas no Storage do ksports (banner do cabeçalho, faixa
--     e box lateral) NÃO existem no bucket do Esporte Agora → substituídas
--     por banners HTML "Anuncie aqui" na identidade EA (troque o HTML do
--     bloco quando tiver a arte/parceiro).
--   * Seção "World cup" (fonte: últimas) virou "Copa do Mundo" puxando da
--     categoria copa-do-mundo; o grid "Latest" virou "Mais Notícias".
--   * siteLanguage=pt-BR e fuso America/Sao_Paulo (o snapshot era EN/UTC).
--   * Estrutura preservada: ticker "Em Alta" continua OCULTO e a faixa de
--     destaque (hero strip) desligada, como no Final do ksports.
--
-- Idempotente: remove versão anterior do mesmo template (id) antes de anexar.
-- Pré-requisito: wizard /admin/setup concluído (tabela settings populada).
-- O app relê site_settings a cada 15s — o template aparece em
-- "Meus templates" sem restart. Não salve Configurações no admin no mesmo
-- instante da importação.
--
-- Uso (VPS, /opt/sp011):
--   docker compose exec -T pg-blogs psql -U postgres -d esporteagora -v ON_ERROR_STOP=1 < deploy/esporteagora/template_final.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM settings WHERE key = 'site_settings') THEN
    RAISE EXCEPTION 'site_settings nao existe neste banco — conclua o wizard /admin/setup do Esporte Agora antes de importar o template.';
  END IF;
END $$;

UPDATE settings s
SET value = jsonb_set(
      s.value::jsonb,
      '{homeTemplates}',
      (
        SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(s.value::jsonb->'homeTemplates', '[]'::jsonb)) AS t
        WHERE t->>'id' <> 'tpl-esporteagora-final'
      ) || $tpl$
{
  "id": "tpl-esporteagora-final",
  "name": "Esporte Agora - Final",
  "createdAt": "2026-07-10T21:30:00.000Z",
  "accentColor": "#5b2d8e",
  "headerStyle": "standard",
  "footerStyle": "dark",
  "headerBgColor": "#ffffff",
  "footerBgColor": "#1c0d35",
  "menuTextColor": "#101418",
  "menuActiveColor": "#4bce10",
  "menuFontSize": 13,
  "menuFontWeight": 800,
  "showTickerBar": false,
  "showHeroStrip": false,
  "showTopBar": true,
  "topBarBgColor": "#241243",
  "menuBarStyle": "bar",
  "menuBarBgColor": "#241243",
  "footerAccentColor": "#4bce10",
  "headerPaddingX": 16,
  "headerMarginTop": 0,
  "siteLanguage": "pt-BR",
  "siteTimezone": "America/Sao_Paulo",
  "headerBannerHtml": "<div style=\"display:flex;align-items:center;justify-content:space-between;gap:18px;width:100%;max-width:720px;padding:11px 20px;border:1px solid #3b2a63;border-radius:8px;background:radial-gradient(circle at 88% 45%, rgba(75,206,16,.32), transparent 42%), radial-gradient(circle at 10% 60%, rgba(91,45,142,.6), transparent 46%), linear-gradient(135deg, #241243, #3a1c6e 60%, #241243);\"><span style=\"font-style:italic;font-weight:900;font-size:19px;letter-spacing:.04em;color:#ffffff;\">Esporte<span style=\"color:#4bce10;\">Agora</span></span><span style=\"flex:1;text-align:center;color:#ffffff;line-height:1.15;\"><span style=\"font-size:15px;font-weight:900;font-style:italic;letter-spacing:.02em;\">SUA MARCA <span style=\"color:#4bce10;\">AQUI.</span></span><br/><span style=\"font-size:10px;font-weight:600;color:#cdc3e8;\">SEJA O PARCEIRO OFICIAL DO ESPORTE AGORA</span></span><span style=\"background:#4bce10;color:#0c2601;padding:8px 14px;border-radius:6px;font-weight:800;font-size:11px;white-space:nowrap;\">ANUNCIE</span></div>",
  "menuItems": [
    { "id": "ea-menu-home",    "label": "HOME",           "path": "/",                  "order": 0, "visible": true },
    { "id": "ea-menu-copa",    "label": "COPA DO MUNDO",  "path": "/copa-do-mundo",     "order": 1, "visible": true },
    { "id": "ea-menu-futebol", "label": "FUTEBOL",        "path": "/futebol",           "order": 2, "visible": true },
    { "id": "ea-menu-volei",   "label": "VÔLEI",          "path": "/volei",             "order": 3, "visible": true },
    { "id": "ea-menu-tenis",   "label": "TÊNIS",          "path": "/tenis",             "order": 4, "visible": true },
    { "id": "ea-menu-f1",      "label": "FÓRMULA 1",      "path": "/f1",                "order": 5, "visible": true },
    { "id": "ea-menu-futam",   "label": "FUT. AMERICANO", "path": "/futebol-americano", "order": 6, "visible": true },
    { "id": "ea-menu-esports", "label": "E-SPORTS",       "path": "/e-sports",          "order": 7, "visible": true },
    { "id": "ea-menu-outros",  "label": "OUTROS",         "path": "/outros",            "order": 8, "visible": true },
    { "id": "ea-menu-topnews", "label": "TOP NEWS",       "path": "/top-news",          "order": 9, "visible": true }
  ],
  "footerConfig": {
    "description": "Notícias. Análises. Paixão pelo esporte.",
    "showSocial": false,
    "socialEnabled": {},
    "columns": [
      { "id": "ea-nav", "title": "Navegação", "links": [
        { "id": "ea-nav-home",    "label": "Home",           "href": "/" },
        { "id": "ea-nav-copa",    "label": "Copa do Mundo",  "href": "/copa-do-mundo" },
        { "id": "ea-nav-futebol", "label": "Futebol",        "href": "/futebol" },
        { "id": "ea-nav-volei",   "label": "Vôlei",          "href": "/volei" },
        { "id": "ea-nav-tenis",   "label": "Tênis",          "href": "/tenis" },
        { "id": "ea-nav-f1",      "label": "Fórmula 1",      "href": "/f1" },
        { "id": "ea-nav-futam",   "label": "Fut. Americano", "href": "/futebol-americano" },
        { "id": "ea-nav-esports", "label": "e-Sports",       "href": "/e-sports" }
      ] },
      { "id": "ea-inst", "title": "Institucional", "links": [
        { "id": "ea-i-about",     "label": "Sobre nós",               "href": "/contato" },
        { "id": "ea-i-advertise", "label": "Anuncie",                 "href": "/contato" },
        { "id": "ea-i-privacy",   "label": "Política de Privacidade", "href": "/privacidade" },
        { "id": "ea-i-terms",     "label": "Termos de Uso",           "href": "/termos" },
        { "id": "ea-i-contact",   "label": "Contato",                 "href": "/contato" }
      ] }
    ],
    "showContact": false,
    "showNewsletter": true,
    "newsletterTitle": "Receba as principais notícias do esporte no seu e-mail",
    "copyright": "© {year} {site}. Todos os direitos reservados.",
    "legalLinks": [
      { "id": "ea-l-privacy", "label": "Política de Privacidade", "href": "/privacidade" },
      { "id": "ea-l-terms",   "label": "Termos de Uso",           "href": "/termos" },
      { "id": "ea-l-contact", "label": "Contato",                 "href": "/contato" }
    ]
  },
  "blocks": [
    { "id": "hero",       "area": "main",    "name": "Principais Notícias", "order": 0, "layout": "portal", "visible": true },
    { "id": "mais-lidas", "area": "sidebar", "name": "Mais Lidas", "color": "#5b2d8e", "order": 1, "visible": true },
    { "id": "ticker-ea", "name": "Em Alta", "color": "#4bce10", "order": 2, "custom": true, "format": "grid", "source": "latest", "visible": false, "blockType": "ticker", "itemsLimit": 8 },
    { "id": "html-ea-ad-faixa", "area": "main", "isAd": true, "name": "Anuncie — Faixa", "color": "#5b2d8e", "order": 3, "custom": true, "format": "grid", "visible": true, "blockType": "html", "html": "<div style=\"display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:14px 20px;padding:18px 26px;border:1px solid #3b2a63;border-radius:8px;background:radial-gradient(circle at 88% 45%, rgba(75,206,16,.32), transparent 42%), radial-gradient(circle at 10% 60%, rgba(91,45,142,.6), transparent 46%), linear-gradient(135deg, #241243, #3a1c6e 60%, #241243);\"><span style=\"font-style:italic;font-weight:900;font-size:26px;letter-spacing:.04em;color:#ffffff;\">Esporte<span style=\"color:#4bce10;\">Agora</span></span><span style=\"flex:1;min-width:220px;text-align:center;color:#ffffff;line-height:1.1;\"><span style=\"font-size:20px;font-weight:900;font-style:italic;letter-spacing:.02em;\">ANUNCIE <span style=\"color:#4bce10;\">AQUI</span></span><br/><span style=\"font-size:13px;font-weight:600;color:#cdc3e8;\">SUA MARCA NA TORCIDA DO ESPORTE AGORA</span></span><span style=\"background:#4bce10;color:#0c2601;padding:10px 18px;border-radius:6px;font-weight:800;font-size:13px;white-space:nowrap;\">FALE CONOSCO</span></div>" },
    { "id": "list-ea-ultimas", "area": "sidebar", "name": "Últimas Notícias", "color": "#5b2d8e", "order": 4, "custom": true, "format": "list_compact", "source": "latest", "reverse": false, "visible": true, "blockType": "list", "itemsLimit": 5 },
    { "id": "content-ea-recentes", "area": "main", "name": "Notícias Recentes", "color": "#5b2d8e", "order": 5, "custom": true, "format": "grid", "layout": "grid", "source": "latest", "reverse": false, "visible": true, "blockType": "content", "itemsLimit": 8 },
    { "id": "html-ea-ad-box", "area": "sidebar", "isAd": true, "name": "Anuncie — Lateral", "color": "#4bce10", "order": 6, "custom": true, "format": "grid", "visible": true, "blockType": "html", "html": "<div style=\"max-width:460px;margin:0 auto;text-align:center;padding:34px 24px;border:1px solid #3b2a63;border-radius:8px;background:radial-gradient(circle at 88% 45%, rgba(75,206,16,.32), transparent 42%), radial-gradient(circle at 10% 60%, rgba(91,45,142,.6), transparent 46%), linear-gradient(135deg, #241243, #3a1c6e 60%, #241243);\"><div style=\"color:#cdc3e8;font-size:11px;font-weight:800;letter-spacing:.14em;margin-bottom:10px;\">PARCEIRO OFICIAL</div><div style=\"margin-bottom:12px;\"><span style=\"font-style:italic;font-weight:900;font-size:26px;letter-spacing:.04em;color:#ffffff;\">Esporte<span style=\"color:#4bce10;\">Agora</span></span></div><div style=\"color:#ffffff;font-size:26px;font-weight:900;line-height:1.1;\">SUA MARCA<br/>NESTE ESPAÇO</div><div style=\"display:inline-block;background:#4bce10;color:#0c2601;padding:10px 22px;border-radius:6px;font-weight:800;font-size:13px;margin-top:16px;\">ANUNCIE AQUI</div></div>" },
    { "id": "content-ea-futebol", "name": "Futebol",        "color": "#5b2d8e", "order": 7,  "width": "quarter", "custom": true, "format": "featured", "layout": "featured", "source": "automatic_by_category", "visible": true, "category": "futebol",           "blockType": "content", "linkLabel": "VER TODAS →" },
    { "id": "content-ea-futam",   "name": "Fut. Americano", "color": "#4bce10", "order": 8,  "width": "quarter", "custom": true, "format": "featured", "layout": "featured", "source": "automatic_by_category", "visible": true, "category": "futebol-americano", "blockType": "content", "linkLabel": "VER TODAS →" },
    { "id": "content-ea-f1",      "name": "Fórmula 1",      "color": "#5b2d8e", "order": 9,  "width": "quarter", "custom": true, "format": "featured", "layout": "featured", "source": "automatic_by_category", "visible": true, "category": "f1",                "blockType": "content", "linkLabel": "VER TODAS →" },
    { "id": "content-ea-esports", "name": "e-Sports",       "color": "#4bce10", "order": 10, "width": "quarter", "custom": true, "format": "featured", "layout": "featured", "source": "automatic_by_category", "visible": true, "category": "e-sports",          "blockType": "content", "linkLabel": "VER TODAS →" },
    { "id": "content-ea-copa", "name": "Copa do Mundo", "color": "#5b2d8e", "order": 11, "custom": true, "format": "cultura", "layout": "cultura", "source": "automatic_by_category", "reverse": false, "visible": true, "category": "copa-do-mundo", "blockType": "content", "itemsLimit": 4 },
    { "id": "content-ea-mais", "name": "Mais Notícias", "color": "#5b2d8e", "order": 12, "custom": true, "format": "grid", "layout": "grid", "source": "latest", "reverse": false, "visible": true, "blockType": "content", "itemsLimit": 4 },
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
