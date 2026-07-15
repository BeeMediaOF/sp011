-- =============================================================================
-- Crédito.vc — importa o template "Crédito.vc - Final" (clone do snapshot
-- "KSports - Final" na identidade Crédito.vc, gerado em 2026-07-15 a partir
-- do template do Bee Esportes)
-- =============================================================================
-- Identidade (Proposta Bee Media / mock da home): verde vivo #0ec76d
-- (acentos/CTA), verde escuro #0a9455, navy #0f2446 (top bar/menu/banners),
-- rodapé #0a1630. Wordmark: "crédito" branco + ".vc" verde (minúsculas).
-- Tagline: "Educação financeira para a vida real" (pt-BR).
-- Editorias/slugs DESTE blog (diferentes dos blogs de esporte — as regras da
-- central casam por slug): sair-das-dividas, credito, score,
-- organizar-financas, renda-extra, planejar-o-futuro, investimentos,
-- outros (fallback). Slugs custom resolvem via DynamicCategory — POR ISSO
-- todo slug precisa de menuItem VISÍVEL.
--   * Banners nascem como "publicidade da própria casa" (identidade da
--     marca, sem link) — a proposta prevê que os espaços de anúncio são do
--     próprio Crédito.vc. Troque o HTML dos blocos pelo banner do SIMULADOR
--     DE CRÉDITO quando ele existir. Artes de upload de OUTROS blogs nunca
--     funcionam aqui (bucket por blog).
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
--   docker compose exec -T pg-blogs psql -U postgres -d creditovc -v ON_ERROR_STOP=1 < deploy/creditovc/template_final.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM settings WHERE key = 'site_settings') THEN
    RAISE EXCEPTION 'site_settings nao existe neste banco — conclua o wizard /admin/setup do Credito.vc antes de importar o template.';
  END IF;
END $$;

UPDATE settings s
SET value = jsonb_set(
      s.value::jsonb,
      '{homeTemplates}',
      (
        SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(s.value::jsonb->'homeTemplates', '[]'::jsonb)) AS t
        WHERE t->>'id' <> 'tpl-creditovc-final'
      ) || $tpl$
{
  "id": "tpl-creditovc-final",
  "name": "Crédito.vc - Final",
  "createdAt": "2026-07-15T12:00:00.000Z",
  "accentColor": "#0a9455",
  "headerStyle": "standard",
  "footerStyle": "dark",
  "headerBgColor": "#ffffff",
  "footerBgColor": "#0a1630",
  "menuTextColor": "#101418",
  "menuActiveColor": "#0ec76d",
  "menuFontSize": 12,
  "menuFontWeight": 800,
  "showTickerBar": false,
  "showHeroStrip": false,
  "showTopBar": true,
  "topBarBgColor": "#0f2446",
  "menuBarStyle": "bar",
  "menuBarBgColor": "#0f2446",
  "footerAccentColor": "#0ec76d",
  "headerPaddingX": 16,
  "headerMarginTop": 0,
  "siteLanguage": "pt-BR",
  "siteTimezone": "America/Sao_Paulo",
  "headerBannerHtml": "<div style=\"display:flex;align-items:center;justify-content:space-between;gap:18px;width:100%;max-width:720px;padding:11px 20px;border:1px solid #1d3f66;border-radius:8px;background:radial-gradient(circle at 88% 45%, rgba(14,199,109,.30), transparent 42%), radial-gradient(circle at 10% 60%, rgba(10,148,85,.55), transparent 46%), linear-gradient(135deg, #0f2446, #123a6b 60%, #0a1630);\"><span style=\"font-weight:900;font-size:19px;letter-spacing:.01em;color:#ffffff;\">crédito<span style=\"color:#0ec76d;\">.vc</span></span><span style=\"flex:1;text-align:center;color:#ffffff;line-height:1.15;\"><span style=\"font-size:15px;font-weight:900;letter-spacing:.02em;\">EDUCAÇÃO FINANCEIRA <span style=\"color:#0ec76d;\">PARA A VIDA REAL.</span></span><br/><span style=\"font-size:10px;font-weight:600;color:#cbd8ea;\">CONTEÚDO GRATUITO PARA CUIDAR DO SEU DINHEIRO</span></span><span style=\"background:#0ec76d;color:#06301d;padding:8px 14px;border-radius:6px;font-weight:800;font-size:11px;white-space:nowrap;\">CRÉDITO.VC</span></div>",
  "menuItems": [
    { "id": "cvc-menu-home",    "label": "HOME",               "path": "/",                   "order": 0, "visible": true },
    { "id": "cvc-menu-dividas", "label": "SAIR DAS DÍVIDAS",   "path": "/sair-das-dividas",   "order": 1, "visible": true },
    { "id": "cvc-menu-credito", "label": "CRÉDITO",            "path": "/credito",            "order": 2, "visible": true },
    { "id": "cvc-menu-score",   "label": "SCORE",              "path": "/score",              "order": 3, "visible": true },
    { "id": "cvc-menu-organizar","label": "ORGANIZAR FINANÇAS","path": "/organizar-financas", "order": 4, "visible": true },
    { "id": "cvc-menu-renda",   "label": "RENDA EXTRA",        "path": "/renda-extra",        "order": 5, "visible": true },
    { "id": "cvc-menu-futuro",  "label": "PLANEJAR O FUTURO",  "path": "/planejar-o-futuro",  "order": 6, "visible": true },
    { "id": "cvc-menu-invest",  "label": "INVESTIMENTOS",      "path": "/investimentos",      "order": 7, "visible": true },
    { "id": "cvc-menu-outros",  "label": "OUTROS",             "path": "/outros",             "order": 8, "visible": true }
  ],
  "footerConfig": {
    "description": "Educação financeira para a vida real: dicas práticas para cuidar do seu dinheiro, conquistar crédito e realizar seus sonhos.",
    "showSocial": false,
    "socialEnabled": {},
    "columns": [
      { "id": "cvc-nav", "title": "Conteúdos", "links": [
        { "id": "cvc-nav-home",    "label": "Home",               "href": "/" },
        { "id": "cvc-nav-dividas", "label": "Sair das Dívidas",   "href": "/sair-das-dividas" },
        { "id": "cvc-nav-credito", "label": "Crédito",            "href": "/credito" },
        { "id": "cvc-nav-score",   "label": "Score",              "href": "/score" },
        { "id": "cvc-nav-organizar","label": "Organizar Finanças","href": "/organizar-financas" },
        { "id": "cvc-nav-renda",   "label": "Renda Extra",        "href": "/renda-extra" },
        { "id": "cvc-nav-futuro",  "label": "Planejar o Futuro",  "href": "/planejar-o-futuro" },
        { "id": "cvc-nav-invest",  "label": "Investimentos",      "href": "/investimentos" }
      ] },
      { "id": "cvc-inst", "title": "Institucional", "links": [
        { "id": "cvc-i-about",     "label": "Sobre o Crédito.vc",      "href": "/contato" },
        { "id": "cvc-i-advertise", "label": "Anuncie",                 "href": "/contato" },
        { "id": "cvc-i-privacy",   "label": "Política de Privacidade", "href": "/privacidade" },
        { "id": "cvc-i-terms",     "label": "Termos de Uso",           "href": "/termos" },
        { "id": "cvc-i-contact",   "label": "Fale Conosco",            "href": "/contato" }
      ] }
    ],
    "showContact": false,
    "showNewsletter": true,
    "newsletterTitle": "Receba dicas de finanças e crédito toda semana no seu e-mail",
    "copyright": "© {year} {site}. Todos os direitos reservados.",
    "legalLinks": [
      { "id": "cvc-l-privacy", "label": "Política de Privacidade", "href": "/privacidade" },
      { "id": "cvc-l-terms",   "label": "Termos de Uso",           "href": "/termos" },
      { "id": "cvc-l-contact", "label": "Contato",                 "href": "/contato" }
    ]
  },
  "blocks": [
    { "id": "hero",       "area": "main",    "name": "Principais Notícias", "order": 0, "layout": "portal", "visible": true },
    { "id": "mais-lidas", "area": "sidebar", "name": "Mais Lidas", "color": "#0a9455", "order": 1, "visible": true },
    { "id": "ticker-cvc", "name": "Em Alta", "color": "#0ec76d", "order": 2, "custom": true, "format": "grid", "source": "latest", "visible": false, "blockType": "ticker", "itemsLimit": 8 },
    { "id": "html-cvc-ad-faixa", "area": "main", "isAd": true, "name": "Casa — Faixa", "color": "#0a9455", "order": 3, "custom": true, "format": "grid", "visible": true, "blockType": "html", "html": "<div style=\"display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:14px 20px;padding:18px 26px;border:1px solid #1d3f66;border-radius:8px;background:radial-gradient(circle at 88% 45%, rgba(14,199,109,.30), transparent 42%), radial-gradient(circle at 10% 60%, rgba(10,148,85,.55), transparent 46%), linear-gradient(135deg, #0f2446, #123a6b 60%, #0a1630);\"><span style=\"font-weight:900;font-size:26px;letter-spacing:.01em;color:#ffffff;\">crédito<span style=\"color:#0ec76d;\">.vc</span></span><span style=\"flex:1;min-width:220px;text-align:center;color:#ffffff;line-height:1.1;\"><span style=\"font-size:20px;font-weight:900;letter-spacing:.02em;\">SAIA DO <span style=\"color:#0ec76d;\">VERMELHO</span></span><br/><span style=\"font-size:13px;font-weight:600;color:#cbd8ea;\">GUIAS PRÁTICOS PARA ORGANIZAR AS CONTAS, LIMPAR O NOME E CONQUISTAR CRÉDITO</span></span><span style=\"background:#0ec76d;color:#06301d;padding:10px 18px;border-radius:6px;font-weight:800;font-size:13px;white-space:nowrap;\">CRÉDITO.VC</span></div>" },
    { "id": "list-cvc-ultimas", "area": "sidebar", "name": "Últimas Notícias", "color": "#0a9455", "order": 4, "custom": true, "format": "list_compact", "source": "latest", "reverse": false, "visible": true, "blockType": "list", "itemsLimit": 5 },
    { "id": "content-cvc-recentes", "area": "main", "name": "Mais Recentes", "color": "#0a9455", "order": 5, "custom": true, "format": "grid", "layout": "grid", "source": "latest", "reverse": false, "visible": true, "blockType": "content", "itemsLimit": 8 },
    { "id": "html-cvc-ad-box", "area": "sidebar", "isAd": true, "name": "Casa — Lateral", "color": "#0ec76d", "order": 6, "custom": true, "format": "grid", "visible": true, "blockType": "html", "html": "<div style=\"max-width:460px;margin:0 auto;text-align:center;padding:34px 24px;border:1px solid #1d3f66;border-radius:8px;background:radial-gradient(circle at 88% 45%, rgba(14,199,109,.30), transparent 42%), radial-gradient(circle at 10% 60%, rgba(10,148,85,.55), transparent 46%), linear-gradient(135deg, #0f2446, #123a6b 60%, #0a1630);\"><div style=\"color:#cbd8ea;font-size:11px;font-weight:800;letter-spacing:.14em;margin-bottom:10px;\">PUBLICIDADE DA CASA</div><div style=\"margin-bottom:12px;\"><span style=\"font-weight:900;font-size:26px;letter-spacing:.01em;color:#ffffff;\">crédito<span style=\"color:#0ec76d;\">.vc</span></span></div><div style=\"color:#ffffff;font-size:26px;font-weight:900;line-height:1.1;\">SEU DINHEIRO<br/>NO CONTROLE</div><div style=\"display:inline-block;background:#0ec76d;color:#06301d;padding:10px 22px;border-radius:6px;font-weight:800;font-size:13px;margin-top:16px;\">CRÉDITO.VC</div></div>" },
    { "id": "content-cvc-credito", "name": "Crédito",            "color": "#0a9455", "order": 7,  "width": "quarter", "custom": true, "format": "featured", "layout": "featured", "source": "automatic_by_category", "visible": true, "category": "credito",            "blockType": "content", "linkLabel": "VER TODOS →" },
    { "id": "content-cvc-score",   "name": "Score",              "color": "#0ec76d", "order": 8,  "width": "quarter", "custom": true, "format": "featured", "layout": "featured", "source": "automatic_by_category", "visible": true, "category": "score",              "blockType": "content", "linkLabel": "VER TODOS →" },
    { "id": "content-cvc-organizar","name": "Organizar Finanças","color": "#0a9455", "order": 9,  "width": "quarter", "custom": true, "format": "featured", "layout": "featured", "source": "automatic_by_category", "visible": true, "category": "organizar-financas","blockType": "content", "linkLabel": "VER TODOS →" },
    { "id": "content-cvc-renda",   "name": "Renda Extra",        "color": "#0ec76d", "order": 10, "width": "quarter", "custom": true, "format": "featured", "layout": "featured", "source": "automatic_by_category", "visible": true, "category": "renda-extra",        "blockType": "content", "linkLabel": "VER TODOS →" },
    { "id": "content-cvc-dividas", "name": "Sair das Dívidas", "color": "#0a9455", "order": 11, "custom": true, "format": "cultura", "layout": "cultura", "source": "automatic_by_category", "reverse": false, "visible": true, "category": "sair-das-dividas", "blockType": "content", "itemsLimit": 4 },
    { "id": "content-cvc-mais", "name": "Mais Notícias", "color": "#0a9455", "order": 12, "custom": true, "format": "grid", "layout": "grid", "source": "latest", "reverse": false, "visible": true, "blockType": "content", "itemsLimit": 4 },
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
