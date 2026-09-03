-- =============================================================================
-- Cassino Bet — importa o template "Cassino Bet - Final" (clone do snapshot
-- "KSports - Final", pela familia Esporte Agora / Receba Bet)
-- =============================================================================
-- Identidade (da logo Cassino Bet): azul royal #0f57cf (o losango — accent do
-- tema, 6,39:1 sobre o header branco), azul claro #2f8bf7 (a palavra "BET" —
-- CTA dos banners e acento do rodape), CHARCOAL #15181d (a palavra "CASSINO" —
-- top bar, barra de menu e fundo dos banners), rodape #0b0d10. O charcoal e o
-- que separa este blog do Receba Bet, que tambem e azul: la a base e navy.
-- Estrutura, menu pt-BR e SLUGS IDENTICOS aos dos irmaos de esporte
-- (copa-do-mundo, futebol, volei, tenis, f1, futebol-americano, e-sports,
-- outros) — todos compartilham as fontes na central. Menu ja nasce com a aba
-- "Top News" (CLAUDE.md §17: aplicar template APAGA o menu, entao ela precisa
-- estar no snapshot).
--   * Banners nascem como "Anuncie aqui" em HTML na identidade da marca —
--     troque o HTML do bloco quando houver parceiro. Artes de upload de
--     OUTROS blogs nunca funcionam aqui (bucket por blog).
--   * siteLanguage=pt-BR e fuso America/Sao_Paulo gravados ao aplicar.
--   * Ticker "Em Alta" OCULTO e hero strip desligada (como no "Final").
--
-- Idempotente: remove versao anterior do mesmo template (id) antes de anexar.
-- Pre-requisito: wizard /admin/setup concluido (tabela settings populada).
-- O app rele site_settings a cada 15s — o template aparece em "Meus templates"
-- sem restart. Nao salve Configuracoes no admin no mesmo instante da importacao.
--
-- Uso (VPS, /opt/sp011):
--   docker compose exec -T pg-blogs psql -U postgres -d cassinobet -v ON_ERROR_STOP=1 < deploy/cassinobet/template_final.sql
-- =============================================================================

set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM settings WHERE key = 'site_settings') THEN
    RAISE EXCEPTION 'site_settings nao existe neste banco — conclua o wizard /admin/setup do Cassino Bet antes de importar o template.';
  END IF;
END $$;

UPDATE settings s
SET value = jsonb_set(
      s.value::jsonb,
      '{homeTemplates}',
      (
        SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(s.value::jsonb->'homeTemplates', '[]'::jsonb)) AS t
        WHERE t->>'id' <> 'tpl-cassinobet-final'
      ) || $tpl$

{
  "id": "tpl-cassinobet-final",
  "name": "Cassino Bet - Final",
  "createdAt": "2026-09-02T12:00:00.000Z",
  "accentColor": "#0f57cf",
  "headerStyle": "standard",
  "footerStyle": "dark",
  "headerBgColor": "#ffffff",
  "footerBgColor": "#0b0d10",
  "menuTextColor": "#101418",
  "menuActiveColor": "#0f57cf",
  "menuFontSize": 13,
  "menuFontWeight": 800,
  "showTickerBar": false,
  "showHeroStrip": false,
  "showTopBar": true,
  "topBarBgColor": "#15181d",
  "menuBarStyle": "bar",
  "menuBarBgColor": "#15181d",
  "footerAccentColor": "#2f8bf7",
  "headerPaddingX": 16,
  "headerMarginTop": 0,
  "siteLanguage": "pt-BR",
  "siteTimezone": "America/Sao_Paulo",
  "headerBannerHtml": "<div style=\"display:flex;align-items:center;justify-content:space-between;gap:18px;width:100%;max-width:720px;padding:11px 20px;border:1px solid #2a2f38;border-radius:8px;background:radial-gradient(circle at 88% 45%, rgba(47,139,247,.32), transparent 42%), radial-gradient(circle at 10% 60%, rgba(15,87,207,.6), transparent 46%), linear-gradient(135deg, #15181d, #1b3a6e 60%, #15181d);\"><span style=\"font-style:italic;font-weight:900;font-size:19px;letter-spacing:.04em;color:#ffffff;\">CASSINO<span style=\"color:#2f8bf7;\">BET</span></span><span style=\"flex:1;text-align:center;color:#ffffff;line-height:1.15;\"><span style=\"font-size:15px;font-weight:900;font-style:italic;letter-spacing:.02em;\">SUA MARCA <span style=\"color:#2f8bf7;\">AQUI.</span></span><br/><span style=\"font-size:10px;font-weight:600;color:#c3ccd9;\">SEJA O PARCEIRO OFICIAL DO CASSINO BET</span></span><span style=\"background:#2f8bf7;color:#15181d;padding:8px 14px;border-radius:6px;font-weight:800;font-size:11px;white-space:nowrap;\">ANUNCIE</span></div>",
  "menuItems": [
    {
      "id": "cb-menu-home",
      "label": "HOME",
      "path": "/",
      "order": 0,
      "visible": true
    },
    {
      "id": "cb-menu-copa",
      "label": "COPA DO MUNDO",
      "path": "/copa-do-mundo",
      "order": 1,
      "visible": true
    },
    {
      "id": "cb-menu-futebol",
      "label": "FUTEBOL",
      "path": "/futebol",
      "order": 2,
      "visible": true
    },
    {
      "id": "cb-menu-volei",
      "label": "VÔLEI",
      "path": "/volei",
      "order": 3,
      "visible": true
    },
    {
      "id": "cb-menu-tenis",
      "label": "TÊNIS",
      "path": "/tenis",
      "order": 4,
      "visible": true
    },
    {
      "id": "cb-menu-f1",
      "label": "FÓRMULA 1",
      "path": "/f1",
      "order": 5,
      "visible": true
    },
    {
      "id": "cb-menu-futam",
      "label": "FUT. AMERICANO",
      "path": "/futebol-americano",
      "order": 6,
      "visible": true
    },
    {
      "id": "cb-menu-esports",
      "label": "E-SPORTS",
      "path": "/e-sports",
      "order": 7,
      "visible": true
    },
    {
      "id": "cb-menu-outros",
      "label": "OUTROS",
      "path": "/outros",
      "order": 8,
      "visible": true
    },
    {
      "id": "cb-menu-topnews",
      "label": "TOP NEWS",
      "path": "/top-news",
      "order": 9,
      "visible": true
    }
  ],
  "footerConfig": {
    "description": "Notícia, análise e emoção do esporte todos os dias.",
    "showSocial": false,
    "socialEnabled": {},
    "columns": [
      {
        "id": "cb-nav",
        "title": "Navegação",
        "links": [
          {
            "id": "cb-nav-home",
            "label": "Home",
            "href": "/"
          },
          {
            "id": "cb-nav-copa",
            "label": "Copa do Mundo",
            "href": "/copa-do-mundo"
          },
          {
            "id": "cb-nav-futebol",
            "label": "Futebol",
            "href": "/futebol"
          },
          {
            "id": "cb-nav-volei",
            "label": "Vôlei",
            "href": "/volei"
          },
          {
            "id": "cb-nav-tenis",
            "label": "Tênis",
            "href": "/tenis"
          },
          {
            "id": "cb-nav-f1",
            "label": "Fórmula 1",
            "href": "/f1"
          },
          {
            "id": "cb-nav-futam",
            "label": "Fut. Americano",
            "href": "/futebol-americano"
          },
          {
            "id": "cb-nav-esports",
            "label": "e-Sports",
            "href": "/e-sports"
          }
        ]
      },
      {
        "id": "cb-inst",
        "title": "Institucional",
        "links": [
          {
            "id": "cb-i-about",
            "label": "Sobre nós",
            "href": "/contato"
          },
          {
            "id": "cb-i-advertise",
            "label": "Anuncie",
            "href": "/contato"
          },
          {
            "id": "cb-i-privacy",
            "label": "Política de Privacidade",
            "href": "/privacidade"
          },
          {
            "id": "cb-i-terms",
            "label": "Termos de Uso",
            "href": "/termos"
          },
          {
            "id": "cb-i-contact",
            "label": "Contato",
            "href": "/contato"
          }
        ]
      }
    ],
    "showContact": false,
    "showNewsletter": true,
    "newsletterTitle": "Receba as principais notícias do esporte no seu e-mail",
    "copyright": "© {year} {site}. Todos os direitos reservados.",
    "legalLinks": [
      {
        "id": "cb-l-privacy",
        "label": "Política de Privacidade",
        "href": "/privacidade"
      },
      {
        "id": "cb-l-terms",
        "label": "Termos de Uso",
        "href": "/termos"
      },
      {
        "id": "cb-l-contact",
        "label": "Contato",
        "href": "/contato"
      }
    ]
  },
  "blocks": [
    {
      "id": "hero",
      "area": "main",
      "name": "Principais Notícias",
      "order": 0,
      "layout": "portal",
      "visible": true
    },
    {
      "id": "mais-lidas",
      "area": "sidebar",
      "name": "Mais Lidas",
      "color": "#0f57cf",
      "order": 1,
      "visible": true
    },
    {
      "id": "ticker-rb",
      "name": "Em Alta",
      "color": "#15181d",
      "order": 2,
      "custom": true,
      "format": "grid",
      "source": "latest",
      "visible": false,
      "blockType": "ticker",
      "itemsLimit": 8
    },
    {
      "id": "html-cb-ad-faixa",
      "area": "main",
      "isAd": true,
      "name": "Anuncie — Faixa",
      "color": "#0f57cf",
      "order": 3,
      "custom": true,
      "format": "grid",
      "visible": true,
      "blockType": "html",
      "html": "<div style=\"display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:14px 20px;padding:18px 26px;border:1px solid #2a2f38;border-radius:8px;background:radial-gradient(circle at 88% 45%, rgba(47,139,247,.32), transparent 42%), radial-gradient(circle at 10% 60%, rgba(15,87,207,.6), transparent 46%), linear-gradient(135deg, #15181d, #1b3a6e 60%, #15181d);\"><span style=\"font-style:italic;font-weight:900;font-size:26px;letter-spacing:.04em;color:#ffffff;\">CASSINO<span style=\"color:#2f8bf7;\">BET</span></span><span style=\"flex:1;min-width:220px;text-align:center;color:#ffffff;line-height:1.1;\"><span style=\"font-size:20px;font-weight:900;font-style:italic;letter-spacing:.02em;\">ANUNCIE <span style=\"color:#2f8bf7;\">AQUI</span></span><br/><span style=\"font-size:13px;font-weight:600;color:#c3ccd9;\">SUA MARCA NA TORCIDA DO CASSINO BET</span></span><span style=\"background:#2f8bf7;color:#15181d;padding:10px 18px;border-radius:6px;font-weight:800;font-size:13px;white-space:nowrap;\">FALE CONOSCO</span></div>"
    },
    {
      "id": "list-cb-ultimas",
      "area": "sidebar",
      "name": "Últimas Notícias",
      "color": "#0f57cf",
      "order": 4,
      "custom": true,
      "format": "list_compact",
      "source": "latest",
      "reverse": false,
      "visible": true,
      "blockType": "list",
      "itemsLimit": 5
    },
    {
      "id": "content-cb-recentes",
      "area": "main",
      "name": "Notícias Recentes",
      "color": "#0f57cf",
      "order": 5,
      "custom": true,
      "format": "grid",
      "layout": "grid",
      "source": "latest",
      "reverse": false,
      "visible": true,
      "blockType": "content",
      "itemsLimit": 8
    },
    {
      "id": "html-cb-ad-box",
      "area": "sidebar",
      "isAd": true,
      "name": "Anuncie — Lateral",
      "color": "#15181d",
      "order": 6,
      "custom": true,
      "format": "grid",
      "visible": true,
      "blockType": "html",
      "html": "<div style=\"max-width:460px;margin:0 auto;text-align:center;padding:34px 24px;border:1px solid #2a2f38;border-radius:8px;background:radial-gradient(circle at 88% 45%, rgba(47,139,247,.32), transparent 42%), radial-gradient(circle at 10% 60%, rgba(15,87,207,.6), transparent 46%), linear-gradient(135deg, #15181d, #1b3a6e 60%, #15181d);\"><div style=\"color:#c3ccd9;font-size:11px;font-weight:800;letter-spacing:.14em;margin-bottom:10px;\">PARCEIRO OFICIAL</div><div style=\"margin-bottom:12px;\"><span style=\"font-style:italic;font-weight:900;font-size:26px;letter-spacing:.04em;color:#ffffff;\">CASSINO<span style=\"color:#2f8bf7;\">BET</span></span></div><div style=\"color:#ffffff;font-size:26px;font-weight:900;line-height:1.1;\">SUA MARCA<br/>NESTE ESPAÇO</div><div style=\"display:inline-block;background:#2f8bf7;color:#15181d;padding:10px 22px;border-radius:6px;font-weight:800;font-size:13px;margin-top:16px;\">ANUNCIE AQUI</div></div>"
    },
    {
      "id": "content-cb-futebol",
      "name": "Futebol",
      "color": "#0f57cf",
      "order": 7,
      "width": "quarter",
      "custom": true,
      "format": "featured",
      "layout": "featured",
      "source": "automatic_by_category",
      "visible": true,
      "category": "futebol",
      "blockType": "content",
      "linkLabel": "VER TODAS →"
    },
    {
      "id": "content-cb-futam",
      "name": "Fut. Americano",
      "color": "#15181d",
      "order": 8,
      "width": "quarter",
      "custom": true,
      "format": "featured",
      "layout": "featured",
      "source": "automatic_by_category",
      "visible": true,
      "category": "futebol-americano",
      "blockType": "content",
      "linkLabel": "VER TODAS →"
    },
    {
      "id": "content-cb-f1",
      "name": "Fórmula 1",
      "color": "#0f57cf",
      "order": 9,
      "width": "quarter",
      "custom": true,
      "format": "featured",
      "layout": "featured",
      "source": "automatic_by_category",
      "visible": true,
      "category": "f1",
      "blockType": "content",
      "linkLabel": "VER TODAS →"
    },
    {
      "id": "content-cb-esports",
      "name": "e-Sports",
      "color": "#15181d",
      "order": 10,
      "width": "quarter",
      "custom": true,
      "format": "featured",
      "layout": "featured",
      "source": "automatic_by_category",
      "visible": true,
      "category": "e-sports",
      "blockType": "content",
      "linkLabel": "VER TODAS →"
    },
    {
      "id": "content-cb-copa",
      "name": "Copa do Mundo",
      "color": "#0f57cf",
      "order": 11,
      "custom": true,
      "format": "cultura",
      "layout": "cultura",
      "source": "automatic_by_category",
      "reverse": false,
      "visible": true,
      "category": "copa-do-mundo",
      "blockType": "content",
      "itemsLimit": 4
    },
    {
      "id": "content-cb-mais",
      "name": "Mais Notícias",
      "color": "#0f57cf",
      "order": 12,
      "custom": true,
      "format": "grid",
      "layout": "grid",
      "source": "latest",
      "reverse": false,
      "visible": true,
      "blockType": "content",
      "itemsLimit": 4
    },
    {
      "id": "brasil",
      "name": "Brasil",
      "color": "#16a34a",
      "order": 13,
      "layout": "grid",
      "visible": false,
      "category": "brasil"
    },
    {
      "id": "mundo",
      "name": "Mundo",
      "color": "#6b21a8",
      "order": 14,
      "layout": "grid",
      "visible": false,
      "category": "mundo"
    },
    {
      "id": "esporte",
      "name": "Esporte",
      "color": "#dc2626",
      "order": 15,
      "layout": "cultura",
      "visible": false,
      "category": "esportes"
    },
    {
      "id": "cultura",
      "name": "Cultura",
      "color": "#0d9488",
      "order": 16,
      "layout": "cultura",
      "visible": false,
      "category": "cultura"
    },
    {
      "id": "df",
      "name": "DF",
      "color": "#0b3d91",
      "order": 17,
      "layout": "duplo",
      "visible": false,
      "category": "cidade"
    },
    {
      "id": "saude",
      "name": "Saúde",
      "color": "#16a34a",
      "order": 18,
      "layout": "grid",
      "visible": false,
      "category": "saude"
    },
    {
      "id": "tecnologia",
      "name": "Tecnologia",
      "color": "#0284c7",
      "order": 19,
      "layout": "grid",
      "visible": false,
      "category": "tecnologia"
    },
    {
      "id": "colunistas",
      "name": "Colunistas",
      "order": 20,
      "visible": false
    },
    {
      "id": "ultimas",
      "name": "Últimas Notícias",
      "order": 21,
      "visible": false
    }
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
