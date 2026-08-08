-- =============================================================================
-- O Comandante News — importa os DOIS templates de home do blog + cadastra as
-- 4 editorias em Categorias. Roda no banco DO BLOG.
--   "O Comandante - Portal"  (22 blocos) — clone estrutural do "Aposta Ganha -
--      Final" / familia "KSports - Final": top bar escura, hero portal com
--      sidebar (Mais Lidas + Ultimas), faixa de anuncio, recentes, 4 colunas
--      (uma por editoria), "Radar da Aviacao" horizontal e "mais noticias".
--   "O Comandante - Revista" (21 blocos) — clone estrutural do "Credito.vc -
--      Final" / layout do mock Bee Media: coluna unica clara, hero de
--      boas-vindas com busca, cards revista (layout "mini"), grade das 4
--      editorias com icones, escolha do editor, newsletter em cartao.
--      EXIGE imagem blog-api/blog-web com os layouts "hero"/"mini" (>= v85).
-- Os dois ficam salvos em "Meus templates" — aplique um, veja no site, e
-- troque pelo outro quando quiser (Desfazer restaura o estado anterior).
-- =============================================================================
-- EDITORIAS (definidas em 2026-08-07): negocios, economia, aviacao, turismo.
--   * So "economia" e editoria FIXA do engine (categoryRoutes.ts). /negocios,
--     /aviacao e /turismo resolvem porque existe menuItem apontando para elas —
--     por isso as 4 estao no menu dos DOIS templates. Tirar uma do menu derruba
--     a pagina dela (404), a menos que seja a economia.
--   * As 4 tambem sao gravadas em settings.categories (painel -> Categorias):
--     alimenta o seletor de categoria dos blocos e o editor de artigos.
--     Aplicar template NAO mexe nessa lista.
--   * O ingest da central grava o slug que a regra de distribuicao definir —
--     ver deploy/ocomandante/sources_ocomandante.sql (banco CENTRAL).
--
-- Identidade (das logos O Comandante News): navy #14265e (wordmark e metade de
-- cima do emblema — accent do tema, item ativo do menu e chip de Negocios);
-- azul royal #1657d0 (metade de baixo do emblema — chip de Economia); royal
-- clareado #2f6fe0 (chip de Turismo, 4,7:1 com branco); navy profundo #0a1740
-- (top bar, barra de menu, fundo dos banners e chip de Aviacao); azul claro
-- #4d8dff (acento do rodape e dos banners: so vive sobre fundo escuro);
-- vermelho #d81f26 (o bloco "NEWS" — botoes e CTAs, SEMPRE com tinta branca);
-- rodape #060e26.
--   * A cor do bloco vira o fundo do chip de categoria com texto BRANCO por
--     cima (SectionBlock*.tsx) — por isso todas as cores de bloco passam de
--     4,5:1 com branco e o vermelho fica so em botao/CTA (5,1:1).
--   * Banners nascem como "Anuncie aqui" na identidade da marca — troque o
--     HTML do bloco quando houver anunciante. Artes de upload de OUTROS blogs
--     nunca funcionam aqui (bucket por blog).
--   * siteLanguage=pt-BR e fuso America/Sao_Paulo gravados ao aplicar.
--
-- Bootstrap: se a linha settings.site_settings ainda NAO existir (blog
-- recem-instalado — ela so nasce no 1o Salvar do admin), o script a cria com
-- os defaults do app (espelho de DEFAULT_SETTINGS/DEFAULT_HOME_BLOCKS em
-- api-server/src/lib/store.ts) + siteName/tagline do O Comandante.
--
-- Idempotente: remove as versoes anteriores dos DOIS templates (por id) antes
-- de anexar, e so grava settings.categories se ainda nao existir (nao apaga
-- categoria que voce tenha criado no painel). Pre-requisito: wizard
-- /admin/setup concluido. O app rele site_settings a cada 15s — os templates
-- aparecem em "Meus templates" sem restart. Nao salve Configuracoes no admin
-- no mesmo instante.
--
-- Uso (VPS, /opt/sp011):
--   docker compose exec -T pg-blogs psql -U postgres -d ocomandante -v ON_ERROR_STOP=1 < deploy/ocomandante/template_final.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Blog recem-instalado: cria site_settings com os defaults do app (o objeto
-- gravado SUBSTITUI os defaults em memoria — por isso precisa vir completo,
-- nao so com homeTemplates).
INSERT INTO settings (key, value, updated_at)
SELECT 'site_settings',
'{"siteName":"O Comandante News","tagline":"No comando da notícia","logoSize":101,"mobileEnabled":true,"desktopEnabled":true,"showTickerBar":true,"showHeroStrip":true,"homeBlocks":[{"id":"hero","name":"Hero / Destaques","visible":true,"order":0},{"id":"brasil","name":"Brasil","visible":true,"order":1},{"id":"mais-lidas","name":"Mais Lidas","visible":true,"order":2},{"id":"mundo","name":"Mundo","visible":true,"order":3},{"id":"esporte","name":"Esporte","visible":true,"order":4},{"id":"cultura","name":"Cultura","visible":true,"order":5},{"id":"df","name":"DF","visible":true,"order":6},{"id":"saude","name":"Saúde","visible":true,"order":7},{"id":"tecnologia","name":"Tecnologia","visible":true,"order":8},{"id":"colunistas","name":"Colunistas","visible":true,"order":9},{"id":"ultimas","name":"Últimas Notícias","visible":true,"order":10}]}',
now()
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'site_settings');

-- 1) Categorias do blog (painel -> Categorias). So grava se ainda nao houver
--    lista salva — o admin mostra as sugeridas ate o 1o Salvar.
UPDATE settings s
SET value = jsonb_set(s.value::jsonb, '{categories}', $cats$
[
  {
    "id": "oc-negocios",
    "name": "Negócios",
    "slug": "negocios",
    "color": "#14265e",
    "visible": true
  },
  {
    "id": "oc-economia",
    "name": "Economia",
    "slug": "economia",
    "color": "#1657d0",
    "visible": true
  },
  {
    "id": "oc-aviacao",
    "name": "Aviação",
    "slug": "aviacao",
    "color": "#0a1740",
    "visible": true
  },
  {
    "id": "oc-turismo",
    "name": "Turismo",
    "slug": "turismo",
    "color": "#2f6fe0",
    "visible": true
  }
]
$cats$::jsonb, true)::text,
    updated_at = now()
WHERE s.key = 'site_settings'
  AND COALESCE(jsonb_array_length(
        CASE WHEN jsonb_typeof(s.value::jsonb->'categories') = 'array'
             THEN s.value::jsonb->'categories' ELSE '[]'::jsonb END), 0) = 0;

-- 2) Os dois templates de home
UPDATE settings s
SET value = jsonb_set(
      s.value::jsonb,
      '{homeTemplates}',
      (
        SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(s.value::jsonb->'homeTemplates', '[]'::jsonb)) AS t
        WHERE t->>'id' NOT IN ('tpl-ocomandante-portal', 'tpl-ocomandante-revista')
      ) || jsonb_build_array($tplp$
{
  "id": "tpl-ocomandante-portal",
  "name": "O Comandante - Portal",
  "createdAt": "2026-08-07T12:00:00.000Z",
  "accentColor": "#14265e",
  "headerStyle": "standard",
  "footerStyle": "dark",
  "headerBgColor": "#ffffff",
  "footerBgColor": "#060e26",
  "menuTextColor": "#101418",
  "menuActiveColor": "#14265e",
  "menuFontSize": 13,
  "menuFontWeight": 800,
  "showTickerBar": false,
  "showHeroStrip": false,
  "showTopBar": true,
  "topBarBgColor": "#0a1740",
  "menuBarStyle": "bar",
  "menuBarBgColor": "#0a1740",
  "footerAccentColor": "#4d8dff",
  "headerPaddingX": 16,
  "headerMarginTop": 0,
  "siteLanguage": "pt-BR",
  "siteTimezone": "America/Sao_Paulo",
  "headerBannerHtml": "<div style=\"display:flex;align-items:center;justify-content:space-between;gap:18px;width:100%;max-width:720px;padding:11px 20px;border:1px solid #1c2f66;border-radius:8px;background:radial-gradient(circle at 88% 45%, rgba(77,141,255,.30), transparent 42%), radial-gradient(circle at 10% 60%, rgba(22,87,208,.55), transparent 46%), linear-gradient(135deg, #0a1740, #0f1e4d 60%, #0a1740);\"><span style=\"font-weight:900;font-size:18px;letter-spacing:.02em;color:#ffffff;white-space:nowrap;\">O Comandante <span style=\"background:#d81f26;color:#ffffff;padding:2px 7px;border-radius:3px;font-size:14px;\">NEWS</span></span><span style=\"flex:1;text-align:center;color:#ffffff;line-height:1.15;\"><span style=\"font-size:15px;font-weight:900;letter-spacing:.02em;\">SUA MARCA <span style=\"color:#4d8dff;\">AQUI.</span></span><br/><span style=\"font-size:10px;font-weight:600;color:#c3d0ef;\">ANUNCIE NO O COMANDANTE NEWS</span></span><span style=\"background:#d81f26;color:#ffffff;padding:8px 14px;border-radius:6px;font-weight:800;font-size:11px;white-space:nowrap;\">ANUNCIE</span></div>",
  "menuItems": [
    {
      "id": "oc-m-home",
      "label": "HOME",
      "path": "/",
      "visible": true
    },
    {
      "id": "oc-m-negocios",
      "label": "NEGÓCIOS",
      "path": "/negocios",
      "visible": true
    },
    {
      "id": "oc-m-economia",
      "label": "ECONOMIA",
      "path": "/economia",
      "visible": true
    },
    {
      "id": "oc-m-aviacao",
      "label": "AVIAÇÃO",
      "path": "/aviacao",
      "visible": true
    },
    {
      "id": "oc-m-turismo",
      "label": "TURISMO",
      "path": "/turismo",
      "visible": true
    }
  ],
  "footerConfig": {
    "description": "Negócios, economia, aviação e turismo — o que move o mercado, com apuração e contexto.",
    "showSocial": false,
    "socialEnabled": {},
    "columns": [
      {
        "id": "oc-nav",
        "title": "Editorias",
        "links": [
          {
            "id": "oc-nav-negocios",
            "label": "Negócios",
            "href": "/negocios"
          },
          {
            "id": "oc-nav-economia",
            "label": "Economia",
            "href": "/economia"
          },
          {
            "id": "oc-nav-aviacao",
            "label": "Aviação",
            "href": "/aviacao"
          },
          {
            "id": "oc-nav-turismo",
            "label": "Turismo",
            "href": "/turismo"
          }
        ]
      },
      {
        "id": "oc-inst",
        "title": "Institucional",
        "links": [
          {
            "id": "oc-i-about",
            "label": "Sobre nós",
            "href": "/contato"
          },
          {
            "id": "oc-i-advertise",
            "label": "Anuncie",
            "href": "/contato"
          },
          {
            "id": "oc-i-contact",
            "label": "Contato",
            "href": "/contato"
          },
          {
            "id": "oc-i-privacy",
            "label": "Política de Privacidade",
            "href": "/privacidade"
          },
          {
            "id": "oc-i-terms",
            "label": "Termos de Uso",
            "href": "/termos"
          }
        ]
      }
    ],
    "showContact": false,
    "showNewsletter": true,
    "newsletterTitle": "Receba as principais notícias do dia no seu e-mail",
    "copyright": "© {year} {site}. Todos os direitos reservados.",
    "legalLinks": [
      {
        "id": "oc-l-privacy",
        "label": "Política de Privacidade",
        "href": "/privacidade"
      },
      {
        "id": "oc-l-terms",
        "label": "Termos de Uso",
        "href": "/termos"
      },
      {
        "id": "oc-l-contact",
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
      "color": "#14265e",
      "order": 1,
      "visible": true
    },
    {
      "id": "ticker-oc",
      "area": "main",
      "name": "Em Alta",
      "color": "#0a1740",
      "order": 2,
      "custom": true,
      "format": "grid",
      "source": "most_read",
      "visible": false,
      "blockType": "ticker",
      "itemsLimit": 6
    },
    {
      "id": "html-oc-ad-faixa",
      "area": "main",
      "isAd": true,
      "name": "Anuncie — Faixa",
      "color": "#14265e",
      "order": 3,
      "custom": true,
      "format": "grid",
      "visible": true,
      "blockType": "html",
      "html": "<div style=\"display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:14px 20px;padding:18px 26px;border:1px solid #1c2f66;border-radius:8px;background:radial-gradient(circle at 88% 45%, rgba(77,141,255,.30), transparent 42%), radial-gradient(circle at 10% 60%, rgba(22,87,208,.55), transparent 46%), linear-gradient(135deg, #0a1740, #0f1e4d 60%, #0a1740);\"><span style=\"font-weight:900;font-size:24px;letter-spacing:.02em;color:#ffffff;white-space:nowrap;\">O Comandante <span style=\"background:#d81f26;color:#ffffff;padding:2px 7px;border-radius:3px;font-size:18px;\">NEWS</span></span><span style=\"flex:1;min-width:220px;text-align:center;color:#ffffff;line-height:1.1;\"><span style=\"font-size:20px;font-weight:900;letter-spacing:.02em;\">ANUNCIE <span style=\"color:#4d8dff;\">AQUI</span></span><br/><span style=\"font-size:13px;font-weight:600;color:#c3d0ef;\">SUA MARCA NA HOME DO O COMANDANTE NEWS</span></span><span style=\"background:#d81f26;color:#ffffff;padding:10px 18px;border-radius:6px;font-weight:800;font-size:13px;white-space:nowrap;\">FALE CONOSCO</span></div>"
    },
    {
      "id": "list-oc-ultimas",
      "area": "sidebar",
      "name": "Últimas Notícias",
      "color": "#14265e",
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
      "id": "content-oc-recentes",
      "area": "main",
      "name": "Notícias Recentes",
      "color": "#14265e",
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
      "id": "html-oc-ad-box",
      "area": "sidebar",
      "isAd": true,
      "name": "Anuncie — Lateral",
      "color": "#0a1740",
      "order": 6,
      "custom": true,
      "format": "grid",
      "visible": true,
      "blockType": "html",
      "html": "<div style=\"max-width:460px;margin:0 auto;text-align:center;padding:34px 24px;border:1px solid #1c2f66;border-radius:8px;background:radial-gradient(circle at 88% 45%, rgba(77,141,255,.30), transparent 42%), radial-gradient(circle at 10% 60%, rgba(22,87,208,.55), transparent 46%), linear-gradient(135deg, #0a1740, #0f1e4d 60%, #0a1740);\"><div style=\"color:#c3d0ef;font-size:11px;font-weight:800;letter-spacing:.14em;margin-bottom:10px;\">ESPAÇO PUBLICITÁRIO</div><div style=\"margin-bottom:12px;\"><span style=\"font-weight:900;font-size:24px;letter-spacing:.02em;color:#ffffff;white-space:nowrap;\">O Comandante <span style=\"background:#d81f26;color:#ffffff;padding:2px 7px;border-radius:3px;font-size:18px;\">NEWS</span></span></div><div style=\"color:#ffffff;font-size:26px;font-weight:900;line-height:1.1;\">SUA MARCA<br/>NESTE ESPAÇO</div><div style=\"display:inline-block;background:#d81f26;color:#ffffff;padding:10px 22px;border-radius:6px;font-weight:800;font-size:13px;margin-top:16px;\">ANUNCIE AQUI</div></div>"
    },
    {
      "id": "content-oc-negocios",
      "name": "Negócios",
      "color": "#14265e",
      "order": 7,
      "width": "quarter",
      "custom": true,
      "format": "featured",
      "layout": "featured",
      "source": "automatic_by_category",
      "visible": true,
      "category": "negocios",
      "blockType": "content",
      "linkLabel": "VER TODAS →"
    },
    {
      "id": "content-oc-economia",
      "name": "Economia",
      "color": "#1657d0",
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
      "id": "content-oc-aviacao",
      "name": "Aviação",
      "color": "#0a1740",
      "order": 9,
      "width": "quarter",
      "custom": true,
      "format": "featured",
      "layout": "featured",
      "source": "automatic_by_category",
      "visible": true,
      "category": "aviacao",
      "blockType": "content",
      "linkLabel": "VER TODAS →"
    },
    {
      "id": "content-oc-turismo",
      "name": "Turismo",
      "color": "#2f6fe0",
      "order": 10,
      "width": "quarter",
      "custom": true,
      "format": "featured",
      "layout": "featured",
      "source": "automatic_by_category",
      "visible": true,
      "category": "turismo",
      "blockType": "content",
      "linkLabel": "VER TODAS →"
    },
    {
      "id": "content-oc-radar",
      "name": "Radar da Aviação",
      "color": "#0a1740",
      "order": 11,
      "custom": true,
      "format": "cultura",
      "layout": "cultura",
      "source": "automatic_by_category",
      "reverse": false,
      "visible": true,
      "category": "aviacao",
      "blockType": "content",
      "itemsLimit": 4
    },
    {
      "id": "content-oc-mais",
      "name": "Mais Notícias",
      "color": "#14265e",
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
$tplp$::jsonb, $tplr$
{
  "id": "tpl-ocomandante-revista",
  "name": "O Comandante - Revista",
  "createdAt": "2026-08-07T12:00:00.000Z",
  "accentColor": "#14265e",
  "headerStyle": "standard",
  "footerStyle": "light",
  "headerBgColor": "#ffffff",
  "footerBgColor": "#ffffff",
  "menuTextColor": "#334155",
  "menuActiveColor": "#14265e",
  "menuFontSize": 15,
  "menuFontWeight": 600,
  "showTickerBar": false,
  "showHeroStrip": false,
  "showTopBar": false,
  "menuBarStyle": "attached",
  "menuBarBgColor": "#ffffff",
  "footerAccentColor": "#14265e",
  "pageBgColor": "#f7f9fb",
  "headerPaddingX": 16,
  "headerMarginTop": 0,
  "siteLanguage": "pt-BR",
  "siteTimezone": "America/Sao_Paulo",
  "headerBannerHtml": "<a href=\"/#newsletter-oc-r-assine\" style=\"display:inline-flex;align-items:center;background:#d81f26;color:#ffffff;padding:10px 22px;border-radius:12px;font-weight:700;font-size:14px;text-decoration:none;white-space:nowrap;box-shadow:0 8px 28px rgba(15,23,42,.10);\">Receber notícias</a>",
  "menuItems": [
    {
      "id": "ocr-m-negocios",
      "label": "Negócios",
      "path": "/negocios",
      "visible": true
    },
    {
      "id": "ocr-m-economia",
      "label": "Economia",
      "path": "/economia",
      "visible": true
    },
    {
      "id": "ocr-m-aviacao",
      "label": "Aviação",
      "path": "/aviacao",
      "visible": true
    },
    {
      "id": "ocr-m-turismo",
      "label": "Turismo",
      "path": "/turismo",
      "visible": true
    }
  ],
  "footerConfig": {
    "description": "Negócios, economia, aviação e turismo — o que move o mercado, com apuração e contexto.",
    "showSocial": true,
    "socialEnabled": {},
    "columns": [
      {
        "id": "ocr-nav",
        "title": "Editorias",
        "links": [
          {
            "id": "ocr-nav-negocios",
            "label": "Negócios",
            "href": "/negocios"
          },
          {
            "id": "ocr-nav-economia",
            "label": "Economia",
            "href": "/economia"
          },
          {
            "id": "ocr-nav-aviacao",
            "label": "Aviação",
            "href": "/aviacao"
          },
          {
            "id": "ocr-nav-turismo",
            "label": "Turismo",
            "href": "/turismo"
          }
        ]
      },
      {
        "id": "ocr-inst",
        "title": "Institucional",
        "links": [
          {
            "id": "ocr-i-about",
            "label": "Sobre nós",
            "href": "/contato"
          },
          {
            "id": "ocr-i-advertise",
            "label": "Anuncie",
            "href": "/contato"
          },
          {
            "id": "ocr-i-contact",
            "label": "Contato",
            "href": "/contato"
          }
        ]
      },
      {
        "id": "ocr-legal",
        "title": "Legal",
        "links": [
          {
            "id": "ocr-l-privacy",
            "label": "Política de Privacidade",
            "href": "/privacidade"
          },
          {
            "id": "ocr-l-terms",
            "label": "Termos de Uso",
            "href": "/termos"
          }
        ]
      }
    ],
    "showContact": false,
    "showNewsletter": false,
    "copyright": "© {year} {site}. Todos os direitos reservados.",
    "legalLinks": []
  },
  "blocks": [
    {
      "id": "content-oc-r-hero",
      "name": "Hero — Boas-vindas + Destaques",
      "order": 0,
      "color": "#14265e",
      "custom": true,
      "format": "hero",
      "layout": "hero",
      "source": "latest",
      "visible": true,
      "blockType": "content",
      "itemsLimit": 3,
      "caption": "Buscar notícias, empresas e destinos...",
      "linkLabel": "✉️ Receba as principais notícias do dia no seu e-mail. Quero me inscrever →",
      "linkUrl": "#newsletter-oc-r-assine",
      "html": "<div style=\"color:#14265e;font-weight:800;letter-spacing:.08em;font-size:13px;text-transform:uppercase;margin-bottom:14px;\">O Comandante News</div><div style=\"font-size:36px;line-height:1.08;color:#0a1740;font-weight:800;margin-bottom:14px;\">No comando da notícia</div><div style=\"color:#6b7280;font-size:16px;line-height:1.5;margin-bottom:18px;\">Negócios, economia, aviação e turismo — o que move o mercado, com apuração e contexto.</div>"
    },
    {
      "id": "content-oc-r-recentes",
      "name": "Mais Recentes",
      "order": 1,
      "color": "#14265e",
      "custom": true,
      "format": "mini",
      "layout": "mini",
      "source": "latest",
      "visible": true,
      "blockType": "content",
      "itemsLimit": 5,
      "linkLabel": "Ver todas →",
      "linkUrl": "/arquivo"
    },
    {
      "id": "html-oc-r-temas",
      "name": "Editorias",
      "order": 2,
      "custom": true,
      "format": "grid",
      "visible": true,
      "blockType": "html",
      "html": "<div><div style=\"font-size:22px;line-height:1.2;font-weight:800;color:#1a1a1a;margin-bottom:18px;\">Editorias</div><div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;\"><a href=\"/negocios\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">💼</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Negócios</span></a><a href=\"/economia\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">📈</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Economia</span></a><a href=\"/aviacao\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">✈️</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Aviação</span></a><a href=\"/turismo\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">🧳</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Turismo</span></a><a href=\"/arquivo\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">📰</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Todas as editorias</span></a></div></div>"
    },
    {
      "id": "content-oc-r-radar",
      "name": "Radar da Aviação",
      "area": "main",
      "order": 3,
      "color": "#0a1740",
      "custom": true,
      "format": "cultura",
      "layout": "cultura",
      "sectionStyle": "revista",
      "source": "automatic_by_category",
      "category": "aviacao",
      "caption": "Cobertura completa",
      "visible": true,
      "blockType": "content",
      "itemsLimit": 4,
      "linkLabel": "Ver todas →"
    },
    {
      "id": "html-oc-r-ad",
      "name": "Anuncie — Lateral",
      "area": "sidebar",
      "order": 4,
      "isAd": true,
      "custom": true,
      "format": "grid",
      "visible": true,
      "blockType": "html",
      "html": "<div style=\"background:linear-gradient(180deg,#0a1740,#060e26);color:#ffffff;border-radius:18px;padding:24px;box-shadow:0 8px 28px rgba(15,23,42,.06);\"><span style=\"display:inline-block;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.12);color:#c3d0ef;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;\">Espaço publicitário</span><div style=\"font-size:24px;line-height:1.15;font-weight:800;margin-bottom:10px;\">Sua marca ao lado da notícia que decide investimento.</div><div style=\"color:#c3d0ef;font-size:14px;line-height:1.5;margin-bottom:16px;\">Formatos de destaque na home e nas editorias do O Comandante News.</div><a href=\"/contato\" style=\"display:inline-block;background:#d81f26;color:#ffffff;padding:12px 20px;border-radius:12px;font-weight:700;font-size:14px;text-decoration:none;\">Fale com a gente →</a></div>"
    },
    {
      "id": "content-oc-r-editor",
      "name": "Escolha do Editor",
      "order": 5,
      "color": "#14265e",
      "custom": true,
      "format": "destaque",
      "layout": "mini",
      "source": "most_read",
      "visible": true,
      "blockType": "content",
      "itemsLimit": 4,
      "linkLabel": "Ver todas →",
      "linkUrl": "/arquivo"
    },
    {
      "id": "content-oc-r-negocios",
      "name": "Negócios",
      "width": "half",
      "order": 6,
      "color": "#14265e",
      "custom": true,
      "format": "mini",
      "layout": "mini",
      "source": "automatic_by_category",
      "category": "negocios",
      "visible": true,
      "blockType": "content",
      "itemsLimit": 3,
      "linkLabel": "Ver todas →"
    },
    {
      "id": "content-oc-r-economia",
      "name": "Economia",
      "width": "half",
      "order": 7,
      "color": "#1657d0",
      "custom": true,
      "format": "mini",
      "layout": "mini",
      "source": "automatic_by_category",
      "category": "economia",
      "visible": true,
      "blockType": "content",
      "itemsLimit": 3,
      "linkLabel": "Ver todas →"
    },
    {
      "id": "content-oc-r-turismo",
      "name": "Turismo",
      "order": 8,
      "color": "#2f6fe0",
      "custom": true,
      "format": "mini",
      "layout": "mini",
      "source": "automatic_by_category",
      "category": "turismo",
      "visible": true,
      "blockType": "content",
      "itemsLimit": 4,
      "linkLabel": "Ver todas →"
    },
    {
      "id": "newsletter-oc-r-assine",
      "name": "Receba as notícias do dia",
      "order": 9,
      "color": "#0a1740",
      "custom": true,
      "format": "card",
      "visible": true,
      "blockType": "newsletter",
      "caption": "Um resumo diário do que move negócios, economia, aviação e turismo.",
      "buttonLabel": "Quero receber",
      "linkLabel": "Sem spam. Você pode cancelar quando quiser."
    },
    {
      "id": "hero",
      "name": "Principais Notícias",
      "order": 10,
      "layout": "portal",
      "visible": false
    },
    {
      "id": "brasil",
      "name": "Brasil",
      "color": "#16a34a",
      "order": 11,
      "layout": "grid",
      "visible": false,
      "category": "brasil"
    },
    {
      "id": "mundo",
      "name": "Mundo",
      "color": "#6b21a8",
      "order": 12,
      "layout": "grid",
      "visible": false,
      "category": "mundo"
    },
    {
      "id": "esporte",
      "name": "Esporte",
      "color": "#dc2626",
      "order": 13,
      "layout": "cultura",
      "visible": false,
      "category": "esportes"
    },
    {
      "id": "cultura",
      "name": "Cultura",
      "color": "#0d9488",
      "order": 14,
      "layout": "cultura",
      "visible": false,
      "category": "cultura"
    },
    {
      "id": "df",
      "name": "DF",
      "color": "#0b3d91",
      "order": 15,
      "layout": "duplo",
      "visible": false,
      "category": "cidade"
    },
    {
      "id": "saude",
      "name": "Saúde",
      "color": "#16a34a",
      "order": 16,
      "layout": "grid",
      "visible": false,
      "category": "saude"
    },
    {
      "id": "tecnologia",
      "name": "Tecnologia",
      "color": "#0284c7",
      "order": 17,
      "layout": "grid",
      "visible": false,
      "category": "tecnologia"
    },
    {
      "id": "colunistas",
      "name": "Colunistas",
      "order": 18,
      "visible": false
    },
    {
      "id": "ultimas",
      "name": "Últimas Notícias",
      "order": 19,
      "visible": false
    },
    {
      "id": "mais-lidas",
      "name": "Mais Lidas",
      "color": "#14265e",
      "order": 20,
      "visible": false,
      "itemsLimit": 5
    }
  ]
}
$tplr$::jsonb),
      true
    )::text,
    updated_at = now()
WHERE s.key = 'site_settings';

COMMIT;

\echo ''
\echo '=== TEMPLATES SALVOS NESTE BLOG ==='
SELECT t->>'id' AS id, t->>'name' AS nome,
       jsonb_array_length(t->'blocks') AS blocos,
       jsonb_array_length(t->'menuItems') AS itens_menu
FROM settings, jsonb_array_elements(value::jsonb->'homeTemplates') AS t
WHERE key = 'site_settings';

\echo ''
\echo '=== CATEGORIAS DO BLOG ==='
SELECT c->>'slug' AS slug, c->>'name' AS nome, c->>'color' AS cor
FROM settings, jsonb_array_elements(value::jsonb->'categories') AS c
WHERE key = 'site_settings';
