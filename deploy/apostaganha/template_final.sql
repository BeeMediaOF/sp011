-- =============================================================================
-- Aposta Ganha — importa o template "Aposta Ganha - Final" (clone do snapshot
-- "KSports - Final", convertido p/ Esporte Agora em 2026-07-10 e aqui
-- reconvertido para a identidade Aposta Ganha)
-- =============================================================================
-- Identidade (da logo Aposta Ganha): laranja vivo #ff6a00 (o "GANHA" — CTA dos
-- banners e acento do rodapé, sempre com tinta #111111 por cima: branco sobre
-- laranja dá 2,9:1); laranja queimado #c24500 (accent do tema, cor dos blocos
-- e do item ativo do menu — esses dois vivem sobre fundo claro e sobre o chip
-- branco da categoria, onde o laranja vivo não passa); preto #111111 (o
-- "APOSTA" — top bar, barra de menu, fundo dos banners e cor alternada dos
-- blocos); rodapé #080808.
-- Estrutura, menu pt-BR e SLUGS IDÊNTICOS aos do Esporte Agora / Resenha Vip
-- (copa-do-mundo, futebol, volei, tenis, f1, futebol-americano, e-sports,
-- outros) — todos os blogs de esporte pt-BR compartilham as fontes na central.
--   * Banners nascem como "Anuncie aqui" em HTML na identidade da marca —
--     troque o HTML do bloco quando houver parceiro. Artes de upload de
--     OUTROS blogs nunca funcionam aqui (bucket por blog).
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
--   docker compose exec -T pg-blogs psql -U postgres -d apostaganha -v ON_ERROR_STOP=1 < deploy/apostaganha/template_final.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM settings WHERE key = 'site_settings') THEN
    RAISE EXCEPTION 'site_settings nao existe neste banco — conclua o wizard /admin/setup do Aposta Ganha antes de importar o template.';
  END IF;
END $$;

UPDATE settings s
SET value = jsonb_set(
      s.value::jsonb,
      '{homeTemplates}',
      (
        SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(s.value::jsonb->'homeTemplates', '[]'::jsonb)) AS t
        WHERE t->>'id' <> 'tpl-apostaganha-final'
      ) || $tpl$
{
  "id": "tpl-apostaganha-final",
  "name": "Aposta Ganha - Final",
  "createdAt": "2026-07-11T01:00:00.000Z",
  "accentColor": "#c24500",
  "headerStyle": "standard",
  "footerStyle": "dark",
  "headerBgColor": "#ffffff",
  "footerBgColor": "#080808",
  "menuTextColor": "#101418",
  "menuActiveColor": "#c24500",
  "menuFontSize": 13,
  "menuFontWeight": 800,
  "showTickerBar": false,
  "showHeroStrip": false,
  "showTopBar": true,
  "topBarBgColor": "#111111",
  "menuBarStyle": "bar",
  "menuBarBgColor": "#111111",
  "footerAccentColor": "#ff6a00",
  "headerPaddingX": 16,
  "headerMarginTop": 0,
  "siteLanguage": "pt-BR",
  "siteTimezone": "America/Sao_Paulo",
  "headerBannerHtml": "<div style=\"display:flex;align-items:center;justify-content:space-between;gap:18px;width:100%;max-width:720px;padding:11px 20px;border:1px solid #3a2410;border-radius:8px;background:radial-gradient(circle at 88% 45%, rgba(255,106,0,.32), transparent 42%), radial-gradient(circle at 10% 60%, rgba(217,78,0,.6), transparent 46%), linear-gradient(135deg, #111111, #2e1608 60%, #111111);\"><span style=\"font-style:italic;font-weight:900;font-size:19px;letter-spacing:.04em;color:#ffffff;\">Aposta<span style=\"color:#ff6a00;\">Ganha</span></span><span style=\"flex:1;text-align:center;color:#ffffff;line-height:1.15;\"><span style=\"font-size:15px;font-weight:900;font-style:italic;letter-spacing:.02em;\">SUA MARCA <span style=\"color:#ff6a00;\">AQUI.</span></span><br/><span style=\"font-size:10px;font-weight:600;color:#f3d8c4;\">SEJA O PARCEIRO OFICIAL DO APOSTA GANHA</span></span><span style=\"background:#ff6a00;color:#111111;padding:8px 14px;border-radius:6px;font-weight:800;font-size:11px;white-space:nowrap;\">ANUNCIE</span></div>",
  "menuItems": [
    {
      "id": "ag-menu-home",
      "label": "HOME",
      "path": "/",
      "order": 0,
      "visible": true
    },
    {
      "id": "ag-menu-copa",
      "label": "COPA DO MUNDO",
      "path": "/copa-do-mundo",
      "order": 1,
      "visible": true
    },
    {
      "id": "ag-menu-futebol",
      "label": "FUTEBOL",
      "path": "/futebol",
      "order": 2,
      "visible": true
    },
    {
      "id": "ag-menu-volei",
      "label": "VÔLEI",
      "path": "/volei",
      "order": 3,
      "visible": true
    },
    {
      "id": "ag-menu-tenis",
      "label": "TÊNIS",
      "path": "/tenis",
      "order": 4,
      "visible": true
    },
    {
      "id": "ag-menu-f1",
      "label": "FÓRMULA 1",
      "path": "/f1",
      "order": 5,
      "visible": true
    },
    {
      "id": "ag-menu-futam",
      "label": "FUT. AMERICANO",
      "path": "/futebol-americano",
      "order": 6,
      "visible": true
    },
    {
      "id": "ag-menu-esports",
      "label": "E-SPORTS",
      "path": "/e-sports",
      "order": 7,
      "visible": true
    },
    {
      "id": "ag-menu-outros",
      "label": "OUTROS",
      "path": "/outros",
      "order": 8,
      "visible": true
    },
    {
      "id": "ag-menu-topnews",
      "label": "TOP NEWS",
      "path": "/top-news",
      "order": 9,
      "visible": true
    }
  ],
  "footerConfig": {
    "description": "Esporte, análise e informação para quem vive o jogo.",
    "showSocial": false,
    "socialEnabled": {},
    "columns": [
      {
        "id": "ag-nav",
        "title": "Navegação",
        "links": [
          {
            "id": "ag-nav-home",
            "label": "Home",
            "href": "/"
          },
          {
            "id": "ag-nav-copa",
            "label": "Copa do Mundo",
            "href": "/copa-do-mundo"
          },
          {
            "id": "ag-nav-futebol",
            "label": "Futebol",
            "href": "/futebol"
          },
          {
            "id": "ag-nav-volei",
            "label": "Vôlei",
            "href": "/volei"
          },
          {
            "id": "ag-nav-tenis",
            "label": "Tênis",
            "href": "/tenis"
          },
          {
            "id": "ag-nav-f1",
            "label": "Fórmula 1",
            "href": "/f1"
          },
          {
            "id": "ag-nav-futam",
            "label": "Fut. Americano",
            "href": "/futebol-americano"
          },
          {
            "id": "ag-nav-esports",
            "label": "e-Sports",
            "href": "/e-sports"
          }
        ]
      },
      {
        "id": "ag-inst",
        "title": "Institucional",
        "links": [
          {
            "id": "ag-i-about",
            "label": "Sobre nós",
            "href": "/contato"
          },
          {
            "id": "ag-i-advertise",
            "label": "Anuncie",
            "href": "/contato"
          },
          {
            "id": "ag-i-privacy",
            "label": "Política de Privacidade",
            "href": "/privacidade"
          },
          {
            "id": "ag-i-terms",
            "label": "Termos de Uso",
            "href": "/termos"
          },
          {
            "id": "ag-i-contact",
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
        "id": "ag-l-privacy",
        "label": "Política de Privacidade",
        "href": "/privacidade"
      },
      {
        "id": "ag-l-terms",
        "label": "Termos de Uso",
        "href": "/termos"
      },
      {
        "id": "ag-l-contact",
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
      "color": "#c24500",
      "order": 1,
      "visible": true
    },
    {
      "id": "ticker-ag",
      "name": "Em Alta",
      "color": "#111111",
      "order": 2,
      "custom": true,
      "format": "grid",
      "source": "latest",
      "visible": false,
      "blockType": "ticker",
      "itemsLimit": 8
    },
    {
      "id": "html-ag-ad-faixa",
      "area": "main",
      "isAd": true,
      "name": "Anuncie — Faixa",
      "color": "#c24500",
      "order": 3,
      "custom": true,
      "format": "grid",
      "visible": true,
      "blockType": "html",
      "html": "<div style=\"display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:14px 20px;padding:18px 26px;border:1px solid #3a2410;border-radius:8px;background:radial-gradient(circle at 88% 45%, rgba(255,106,0,.32), transparent 42%), radial-gradient(circle at 10% 60%, rgba(217,78,0,.6), transparent 46%), linear-gradient(135deg, #111111, #2e1608 60%, #111111);\"><span style=\"font-style:italic;font-weight:900;font-size:26px;letter-spacing:.04em;color:#ffffff;\">Aposta<span style=\"color:#ff6a00;\">Ganha</span></span><span style=\"flex:1;min-width:220px;text-align:center;color:#ffffff;line-height:1.1;\"><span style=\"font-size:20px;font-weight:900;font-style:italic;letter-spacing:.02em;\">ANUNCIE <span style=\"color:#ff6a00;\">AQUI</span></span><br/><span style=\"font-size:13px;font-weight:600;color:#f3d8c4;\">SUA MARCA NA TORCIDA DO APOSTA GANHA</span></span><span style=\"background:#ff6a00;color:#111111;padding:10px 18px;border-radius:6px;font-weight:800;font-size:13px;white-space:nowrap;\">FALE CONOSCO</span></div>"
    },
    {
      "id": "list-ag-ultimas",
      "area": "sidebar",
      "name": "Últimas Notícias",
      "color": "#c24500",
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
      "id": "content-ag-recentes",
      "area": "main",
      "name": "Notícias Recentes",
      "color": "#c24500",
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
      "id": "html-ag-ad-box",
      "area": "sidebar",
      "isAd": true,
      "name": "Anuncie — Lateral",
      "color": "#111111",
      "order": 6,
      "custom": true,
      "format": "grid",
      "visible": true,
      "blockType": "html",
      "html": "<div style=\"max-width:460px;margin:0 auto;text-align:center;padding:34px 24px;border:1px solid #3a2410;border-radius:8px;background:radial-gradient(circle at 88% 45%, rgba(255,106,0,.32), transparent 42%), radial-gradient(circle at 10% 60%, rgba(217,78,0,.6), transparent 46%), linear-gradient(135deg, #111111, #2e1608 60%, #111111);\"><div style=\"color:#f3d8c4;font-size:11px;font-weight:800;letter-spacing:.14em;margin-bottom:10px;\">PARCEIRO OFICIAL</div><div style=\"margin-bottom:12px;\"><span style=\"font-style:italic;font-weight:900;font-size:26px;letter-spacing:.04em;color:#ffffff;\">Aposta<span style=\"color:#ff6a00;\">Ganha</span></span></div><div style=\"color:#ffffff;font-size:26px;font-weight:900;line-height:1.1;\">SUA MARCA<br/>NESTE ESPAÇO</div><div style=\"display:inline-block;background:#ff6a00;color:#111111;padding:10px 22px;border-radius:6px;font-weight:800;font-size:13px;margin-top:16px;\">ANUNCIE AQUI</div></div>"
    },
    {
      "id": "content-ag-futebol",
      "name": "Futebol",
      "color": "#c24500",
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
      "id": "content-ag-futam",
      "name": "Fut. Americano",
      "color": "#111111",
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
      "id": "content-ag-f1",
      "name": "Fórmula 1",
      "color": "#c24500",
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
      "id": "content-ag-esports",
      "name": "e-Sports",
      "color": "#111111",
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
      "id": "content-ag-copa",
      "name": "Copa do Mundo",
      "color": "#c24500",
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
      "id": "content-ag-mais",
      "name": "Mais Notícias",
      "color": "#c24500",
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
