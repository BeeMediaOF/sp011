-- =============================================================================
-- SP011 — importa o template "SP011 - Final" (mesma estrutura do
-- "Esporte Agora - Final"/familia KSports-Final, na identidade SP011)
-- =============================================================================
-- Identidade (das logos SP011): navy #1e2d5e (o "SP", acento principal),
-- vermelho #e01b2c (o "011", CTA/menu ativo), fundo escuro #0d1533
-- (top bar/menu/banners), rodape #070d24, tagline "Noticia que conecta".
--
-- CATEGORIAS INTOCADAS (pedido do usuario): menu e blocos usam as categorias
-- que o sp011 JA tem — politica, economia, mundo, cidade, esportes, cultura,
-- saude, tecnologia, geral (todas com rota propria; "geral" cai na rota
-- dinamica). Nenhum slug novo e criado, nada de categorias de esporte.
--   * Quarters da home: Politica / Economia / Mundo / Esportes; secao
--     horizontal: Cultura; grids de "latest" iguais aos irmaos.
--   * Banners "Anuncie aqui" em HTML na identidade SP011 — troque o HTML do
--     bloco quando houver parceiro.
--   * Ao APLICAR o template no admin, o menu publico e substituido pelo
--     deste arquivo — isso conserta o item quebrado "/recnologia" e os
--     filhos em ingles que sobraram no menu atual, e adiciona Politica/
--     Economia (hoje ausentes). As categorias em si nao mudam.
--
-- Idempotente: remove versao anterior do mesmo template (id) antes de anexar.
-- O app rele site_settings a cada 15s — o template aparece em
-- "Meus templates" sem restart. Nao salve Configuracoes no admin no mesmo
-- instante da importacao.
--
-- Uso (VPS, /opt/sp011 — o banco do sp011 e o Supabase do .env raiz):
--   DBURL=$(grep -m1 '^SUPABASE_DATABASE_URL=' /opt/sp011/.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
--   docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 < deploy/sp011/template_final.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM settings WHERE key = 'site_settings') THEN
    RAISE EXCEPTION 'site_settings nao existe neste banco — este script e para o banco do SP011.';
  END IF;
END $$;

UPDATE settings s
SET value = jsonb_set(
      s.value::jsonb,
      '{homeTemplates}',
      (
        SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(s.value::jsonb->'homeTemplates', '[]'::jsonb)) AS t
        WHERE t->>'id' <> 'tpl-sp011-final'
      ) || $tpl$
{
  "id": "tpl-sp011-final",
  "name": "SP011 - Final",
  "createdAt": "2026-07-11T02:00:00.000Z",
  "accentColor": "#1e2d5e",
  "headerStyle": "standard",
  "footerStyle": "dark",
  "headerBgColor": "#ffffff",
  "footerBgColor": "#070d24",
  "menuTextColor": "#101418",
  "menuActiveColor": "#e01b2c",
  "menuFontSize": 13,
  "menuFontWeight": 800,
  "showTickerBar": false,
  "showHeroStrip": false,
  "showTopBar": true,
  "topBarBgColor": "#0d1533",
  "menuBarStyle": "bar",
  "menuBarBgColor": "#0d1533",
  "footerAccentColor": "#e01b2c",
  "headerPaddingX": 16,
  "headerMarginTop": 0,
  "siteLanguage": "pt-BR",
  "siteTimezone": "America/Sao_Paulo",
  "headerBannerHtml": "<div style=\"display:flex;align-items:center;justify-content:space-between;gap:18px;width:100%;max-width:720px;padding:11px 20px;border:1px solid #26356f;border-radius:8px;background:radial-gradient(circle at 88% 45%, rgba(224,27,44,.32), transparent 42%), radial-gradient(circle at 10% 60%, rgba(30,45,94,.6), transparent 46%), linear-gradient(135deg, #0d1533, #1b2b66 60%, #0d1533);\"><span style=\"font-style:italic;font-weight:900;font-size:19px;letter-spacing:.04em;color:#ffffff;\">SP<span style=\"color:#e01b2c;\">011</span></span><span style=\"flex:1;text-align:center;color:#ffffff;line-height:1.15;\"><span style=\"font-size:15px;font-weight:900;font-style:italic;letter-spacing:.02em;\">SUA MARCA <span style=\"color:#e01b2c;\">AQUI.</span></span><br/><span style=\"font-size:10px;font-weight:600;color:#c9d2ef;\">SEJA O PARCEIRO OFICIAL DO SP011</span></span><span style=\"background:#e01b2c;color:#ffffff;padding:8px 14px;border-radius:6px;font-weight:800;font-size:11px;white-space:nowrap;\">ANUNCIE</span></div>",
  "menuItems": [
    {
      "id": "sp-menu-home",
      "label": "HOME",
      "path": "/",
      "order": 0,
      "visible": true
    },
    {
      "id": "sp-menu-politica",
      "label": "POLÍTICA",
      "path": "/politica",
      "order": 1,
      "visible": true
    },
    {
      "id": "sp-menu-economia",
      "label": "ECONOMIA",
      "path": "/economia",
      "order": 2,
      "visible": true
    },
    {
      "id": "sp-menu-mundo",
      "label": "MUNDO",
      "path": "/mundo",
      "order": 3,
      "visible": true
    },
    {
      "id": "sp-menu-cidade",
      "label": "CIDADE",
      "path": "/cidade",
      "order": 4,
      "visible": true
    },
    {
      "id": "sp-menu-esportes",
      "label": "ESPORTES",
      "path": "/esportes",
      "order": 5,
      "visible": true
    },
    {
      "id": "sp-menu-cultura",
      "label": "CULTURA",
      "path": "/cultura",
      "order": 6,
      "visible": true
    },
    {
      "id": "sp-menu-saude",
      "label": "SAÚDE",
      "path": "/saude",
      "order": 7,
      "visible": true
    },
    {
      "id": "sp-menu-tecnologia",
      "label": "TECNOLOGIA",
      "path": "/tecnologia",
      "order": 8,
      "visible": true
    },
    {
      "id": "sp-menu-geral",
      "label": "GERAL",
      "path": "/geral",
      "order": 9,
      "visible": true
    }
  ],
  "footerConfig": {
    "description": "Notícia que conecta.",
    "showSocial": false,
    "socialEnabled": {},
    "columns": [
      {
        "id": "sp-nav",
        "title": "Navegação",
        "links": [
          {
            "id": "sp-nav-home",
            "label": "Home",
            "href": "/"
          },
          {
            "id": "sp-nav-politica",
            "label": "Política",
            "href": "/politica"
          },
          {
            "id": "sp-nav-economia",
            "label": "Economia",
            "href": "/economia"
          },
          {
            "id": "sp-nav-mundo",
            "label": "Mundo",
            "href": "/mundo"
          },
          {
            "id": "sp-nav-cidade",
            "label": "Cidade",
            "href": "/cidade"
          },
          {
            "id": "sp-nav-esportes",
            "label": "Esportes",
            "href": "/esportes"
          },
          {
            "id": "sp-nav-cultura",
            "label": "Cultura",
            "href": "/cultura"
          },
          {
            "id": "sp-nav-saude",
            "label": "Saúde",
            "href": "/saude"
          },
          {
            "id": "sp-nav-tecnologia",
            "label": "Tecnologia",
            "href": "/tecnologia"
          }
        ]
      },
      {
        "id": "sp-inst",
        "title": "Institucional",
        "links": [
          {
            "id": "sp-i-about",
            "label": "Sobre nós",
            "href": "/contato"
          },
          {
            "id": "sp-i-advertise",
            "label": "Anuncie",
            "href": "/contato"
          },
          {
            "id": "sp-i-privacy",
            "label": "Política de Privacidade",
            "href": "/privacidade"
          },
          {
            "id": "sp-i-terms",
            "label": "Termos de Uso",
            "href": "/termos"
          },
          {
            "id": "sp-i-contact",
            "label": "Contato",
            "href": "/contato"
          }
        ]
      }
    ],
    "showContact": false,
    "showNewsletter": true,
    "newsletterTitle": "Receba as principais notícias no seu e-mail",
    "copyright": "© {year} {site}. Todos os direitos reservados.",
    "legalLinks": [
      {
        "id": "sp-l-privacy",
        "label": "Política de Privacidade",
        "href": "/privacidade"
      },
      {
        "id": "sp-l-terms",
        "label": "Termos de Uso",
        "href": "/termos"
      },
      {
        "id": "sp-l-contact",
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
      "color": "#1e2d5e",
      "order": 1,
      "visible": true
    },
    {
      "id": "ticker-sp011",
      "name": "Em Alta",
      "color": "#e01b2c",
      "order": 2,
      "custom": true,
      "format": "grid",
      "source": "latest",
      "visible": false,
      "blockType": "ticker",
      "itemsLimit": 8
    },
    {
      "id": "html-sp-ad-faixa",
      "area": "main",
      "isAd": true,
      "name": "Anuncie — Faixa",
      "color": "#1e2d5e",
      "order": 3,
      "custom": true,
      "format": "grid",
      "visible": true,
      "blockType": "html",
      "html": "<div style=\"display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:14px 20px;padding:18px 26px;border:1px solid #26356f;border-radius:8px;background:radial-gradient(circle at 88% 45%, rgba(224,27,44,.32), transparent 42%), radial-gradient(circle at 10% 60%, rgba(30,45,94,.6), transparent 46%), linear-gradient(135deg, #0d1533, #1b2b66 60%, #0d1533);\"><span style=\"font-style:italic;font-weight:900;font-size:26px;letter-spacing:.04em;color:#ffffff;\">SP<span style=\"color:#e01b2c;\">011</span></span><span style=\"flex:1;min-width:220px;text-align:center;color:#ffffff;line-height:1.1;\"><span style=\"font-size:20px;font-weight:900;font-style:italic;letter-spacing:.02em;\">ANUNCIE <span style=\"color:#e01b2c;\">AQUI</span></span><br/><span style=\"font-size:13px;font-weight:600;color:#c9d2ef;\">SUA MARCA NA NOTÍCIA QUE CONECTA</span></span><span style=\"background:#e01b2c;color:#ffffff;padding:10px 18px;border-radius:6px;font-weight:800;font-size:13px;white-space:nowrap;\">FALE CONOSCO</span></div>"
    },
    {
      "id": "list-sp-ultimas",
      "area": "sidebar",
      "name": "Últimas Notícias",
      "color": "#1e2d5e",
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
      "id": "content-sp-recentes",
      "area": "main",
      "name": "Notícias Recentes",
      "color": "#1e2d5e",
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
      "id": "html-sp-ad-box",
      "area": "sidebar",
      "isAd": true,
      "name": "Anuncie — Lateral",
      "color": "#e01b2c",
      "order": 6,
      "custom": true,
      "format": "grid",
      "visible": true,
      "blockType": "html",
      "html": "<div style=\"max-width:460px;margin:0 auto;text-align:center;padding:34px 24px;border:1px solid #26356f;border-radius:8px;background:radial-gradient(circle at 88% 45%, rgba(224,27,44,.32), transparent 42%), radial-gradient(circle at 10% 60%, rgba(30,45,94,.6), transparent 46%), linear-gradient(135deg, #0d1533, #1b2b66 60%, #0d1533);\"><div style=\"color:#c9d2ef;font-size:11px;font-weight:800;letter-spacing:.14em;margin-bottom:10px;\">PARCEIRO OFICIAL</div><div style=\"margin-bottom:12px;\"><span style=\"font-style:italic;font-weight:900;font-size:26px;letter-spacing:.04em;color:#ffffff;\">SP<span style=\"color:#e01b2c;\">011</span></span></div><div style=\"color:#ffffff;font-size:26px;font-weight:900;line-height:1.1;\">SUA MARCA<br/>NESTE ESPAÇO</div><div style=\"display:inline-block;background:#e01b2c;color:#ffffff;padding:10px 22px;border-radius:6px;font-weight:800;font-size:13px;margin-top:16px;\">ANUNCIE AQUI</div></div>"
    },
    {
      "id": "content-sp-politica",
      "name": "Política",
      "color": "#1e2d5e",
      "order": 7,
      "width": "quarter",
      "custom": true,
      "format": "featured",
      "layout": "featured",
      "source": "automatic_by_category",
      "visible": true,
      "category": "politica",
      "blockType": "content",
      "linkLabel": "VER TODAS →"
    },
    {
      "id": "content-sp-economia",
      "name": "Economia",
      "color": "#e01b2c",
      "order": 8,
      "width": "quarter",
      "custom": true,
      "format": "featured",
      "layout": "featured",
      "source": "automatic_by_category",
      "visible": true,
      "category": "economia",
      "blockType": "content",
      "linkLabel": "VER TODAS →"
    },
    {
      "id": "content-sp-mundo",
      "name": "Mundo",
      "color": "#1e2d5e",
      "order": 9,
      "width": "quarter",
      "custom": true,
      "format": "featured",
      "layout": "featured",
      "source": "automatic_by_category",
      "visible": true,
      "category": "mundo",
      "blockType": "content",
      "linkLabel": "VER TODAS →"
    },
    {
      "id": "content-sp-esportes",
      "name": "Esportes",
      "color": "#e01b2c",
      "order": 10,
      "width": "quarter",
      "custom": true,
      "format": "featured",
      "layout": "featured",
      "source": "automatic_by_category",
      "visible": true,
      "category": "esportes",
      "blockType": "content",
      "linkLabel": "VER TODAS →"
    },
    {
      "id": "content-sp-cultura",
      "name": "Cultura",
      "color": "#1e2d5e",
      "order": 11,
      "custom": true,
      "format": "cultura",
      "layout": "cultura",
      "source": "automatic_by_category",
      "reverse": false,
      "visible": true,
      "category": "cultura",
      "blockType": "content",
      "itemsLimit": 4
    },
    {
      "id": "content-sp-mais",
      "name": "Mais Notícias",
      "color": "#1e2d5e",
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
