-- =============================================================================
-- PontoFarma — importa o template "PontoFarma - Final" (layout PRÓPRIO,
-- clonado do mock da proposta Bee Media / docs/Guia_Claude_Code_Base.md —
-- NÃO é o layout da família KSports dos blogs de esporte)
-- =============================================================================
-- Estrutura da home (espelha o mock):
--   1. Hero em 2 colunas: card branco de boas-vindas (eyebrow verde + título
--      + busca) | "Destaques" (1 matéria grande + 3 empilhadas)
--   2. Zona principal+lateral: Mais Recentes (grade) → Temas em Destaque
--      (ícones por editoria) → Leitura Essencial (card grande + lista) →
--      Escolha do Editor (mais lidas) ‖ lateral: Mais Lidas + box CTA navy
--      (publicidade da casa) + Últimas Notícias
--   3. Negócios & Operação | Compliance & Regulação (3 cards cada)
--   4. Faixa navy de newsletter (formulário funcional)
-- Identidade: verde #18a957 / verde escuro #0c8b46 + navy #0e2341; header
-- BRANCO sem top bar escura (menu claro estilo mock); rodapé claro (light).
-- Editorias/slugs: gestao, fiscal-tributario, legislacao, mercado, vendas,
-- equipe, tecnologia, saude-categorias, outros — todo slug tem menuItem
-- VISÍVEL (rota custom via DynamicCategory).
--
-- Bootstrap: se a linha settings.site_settings ainda NÃO existir (blog
-- recém-instalado — ela só nasce no 1º Salvar do admin), o script a cria com
-- os defaults do app (espelho de DEFAULT_SETTINGS/DEFAULT_HOME_BLOCKS em
-- api-server/src/lib/store.ts) + o siteName/tagline do PontoFarma.
--
-- Idempotente: remove versão anterior do mesmo template (id) antes de anexar.
-- Pré-requisito: wizard /admin/setup concluído (tabela settings existe).
-- O app relê site_settings a cada 15s — o template aparece em
-- "Meus templates" sem restart. Não salve Configurações no admin no mesmo
-- instante da importação.
--
-- Uso (VPS, /opt/sp011):
--   docker compose exec -T pg-blogs psql -U postgres -d pontofarma -v ON_ERROR_STOP=1 < deploy/pontofarma/template_final.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Blog recém-instalado: cria site_settings com os defaults do app (o objeto
-- gravado SUBSTITUI os defaults em memória — por isso precisa vir completo,
-- não só com homeTemplates).
INSERT INTO settings (key, value, updated_at)
SELECT 'site_settings',
'{"siteName":"PontoFarma","tagline":"conteúdo que gera resultado","logoSize":101,"mobileEnabled":true,"desktopEnabled":true,"showTickerBar":true,"showHeroStrip":true,"homeBlocks":[{"id":"hero","name":"Hero / Destaques","visible":true,"order":0},{"id":"brasil","name":"Brasil","visible":true,"order":1},{"id":"mais-lidas","name":"Mais Lidas","visible":true,"order":2},{"id":"mundo","name":"Mundo","visible":true,"order":3},{"id":"esporte","name":"Esporte","visible":true,"order":4},{"id":"cultura","name":"Cultura","visible":true,"order":5},{"id":"df","name":"DF","visible":true,"order":6},{"id":"saude","name":"Saúde","visible":true,"order":7},{"id":"tecnologia","name":"Tecnologia","visible":true,"order":8},{"id":"colunistas","name":"Colunistas","visible":true,"order":9},{"id":"ultimas","name":"Últimas Notícias","visible":true,"order":10}]}',
now()
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'site_settings');

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
  "createdAt": "2026-07-15T18:00:00.000Z",
  "accentColor": "#18a957",
  "headerStyle": "standard",
  "footerStyle": "light",
  "headerBgColor": "#ffffff",
  "footerBgColor": "#ffffff",
  "menuTextColor": "#334155",
  "menuActiveColor": "#18a957",
  "menuFontSize": 14,
  "menuFontWeight": 700,
  "showTickerBar": false,
  "showHeroStrip": false,
  "showTopBar": false,
  "menuBarStyle": "attached",
  "menuBarBgColor": "#ffffff",
  "footerAccentColor": "#18a957",
  "headerPaddingX": 16,
  "headerMarginTop": 0,
  "siteLanguage": "pt-BR",
  "siteTimezone": "America/Sao_Paulo",
  "menuItems": [
    { "id": "pf-menu-home",    "label": "Home",                "path": "/",                 "order": 0, "visible": true },
    { "id": "pf-menu-gestao",  "label": "Gestão",              "path": "/gestao",           "order": 1, "visible": true },
    { "id": "pf-menu-fiscal",  "label": "Fiscal & Tributário", "path": "/fiscal-tributario","order": 2, "visible": true },
    { "id": "pf-menu-legis",   "label": "Legislação",          "path": "/legislacao",       "order": 3, "visible": true },
    { "id": "pf-menu-mercado", "label": "Mercado",             "path": "/mercado",          "order": 4, "visible": true },
    { "id": "pf-menu-vendas",  "label": "Vendas",              "path": "/vendas",           "order": 5, "visible": true },
    { "id": "pf-menu-equipe",  "label": "Equipe",              "path": "/equipe",           "order": 6, "visible": true },
    { "id": "pf-menu-tec",     "label": "Tecnologia",          "path": "/tecnologia",       "order": 7, "visible": true },
    { "id": "pf-menu-saude",   "label": "Saúde & Categorias",  "path": "/saude-categorias", "order": 8, "visible": true },
    { "id": "pf-menu-outros",  "label": "Outros",              "path": "/outros",           "order": 9, "visible": true }
  ],
  "footerConfig": {
    "description": "Portal de conteúdo para gestão e operação farmacêutica.",
    "showSocial": false,
    "socialEnabled": {},
    "columns": [
      { "id": "pf-nav", "title": "Conteúdos", "links": [
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
        { "id": "pf-i-about",     "label": "Sobre o Ponto Farma",     "href": "/contato" },
        { "id": "pf-i-advertise", "label": "Anuncie",                 "href": "/contato" },
        { "id": "pf-i-privacy",   "label": "Política de Privacidade", "href": "/privacidade" },
        { "id": "pf-i-terms",     "label": "Termos de Uso",           "href": "/termos" },
        { "id": "pf-i-contact",   "label": "Fale Conosco",            "href": "/contato" }
      ] }
    ],
    "showContact": false,
    "showNewsletter": false,
    "copyright": "© {year} {site}. Todos os direitos reservados.",
    "legalLinks": [
      { "id": "pf-l-privacy", "label": "Política de Privacidade", "href": "/privacidade" },
      { "id": "pf-l-terms",   "label": "Termos de Uso",           "href": "/termos" },
      { "id": "pf-l-contact", "label": "Contato",                 "href": "/contato" }
    ]
  },
  "blocks": [
    { "id": "html-pf-hero", "name": "Bem-vindo ao Ponto Farma", "width": "half", "order": 0, "custom": true, "format": "grid", "visible": true, "blockType": "html", "html": "<div style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;padding:32px 30px;box-shadow:0 8px 28px rgba(15,23,42,.06);height:100%;display:flex;flex-direction:column;justify-content:center;\"><div style=\"color:#18a957;font-weight:800;letter-spacing:.08em;font-size:13px;text-transform:uppercase;margin-bottom:14px;\">Bem-vindo ao Ponto Farma</div><div style=\"font-size:36px;line-height:1.08;color:#0e2341;font-weight:800;margin-bottom:14px;\">Conteúdo estratégico para farmácias</div><div style=\"color:#6b7280;font-size:16px;line-height:1.5;margin-bottom:22px;\">Insights práticos sobre gestão, regulação, mercado e operação para tomar melhores decisões e fazer sua farmácia crescer.</div><a href=\"/arquivo\" style=\"display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid #e5e7eb;border-radius:14px;padding:13px 16px;color:#6b7280;font-size:14px;text-decoration:none;background:#ffffff;\"><span>Buscar artigos, guias e temas...</span><span style=\"background:#18a957;color:#ffffff;border-radius:10px;padding:8px 16px;font-weight:700;font-size:13px;\">Buscar</span></a><div style=\"color:#6b7280;font-size:13px;margin-top:14px;\">✉️ Receba conteúdos exclusivos no seu e-mail — <span style=\"color:#18a957;font-weight:700;\">inscreva-se no fim da página</span>.</div></div>" },
    { "id": "content-pf-destaques", "name": "Destaques", "width": "half", "order": 1, "custom": true, "format": "featured", "layout": "featured", "source": "latest", "visible": true, "blockType": "content" },
    { "id": "content-pf-recentes", "name": "Mais Recentes", "area": "main", "order": 2, "color": "#0c8b46", "custom": true, "format": "grid", "layout": "grid", "source": "latest", "visible": true, "blockType": "content", "itemsLimit": 8 },
    { "id": "html-pf-temas", "name": "Temas em Destaque", "area": "main", "order": 3, "custom": true, "format": "grid", "visible": true, "blockType": "html", "html": "<div><div style=\"display:flex;align-items:center;gap:10px;margin-bottom:16px;\"><span style=\"width:4px;height:20px;background:#0c8b46;display:inline-block;\"></span><span style=\"font-size:15px;font-weight:800;color:#1a1a1a;text-transform:uppercase;letter-spacing:.05em;\">Temas em Destaque</span></div><div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;\"><a href=\"/gestao\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">📈</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Gestão</span></a><a href=\"/fiscal-tributario\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">🧾</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Fiscal & Tributário</span></a><a href=\"/legislacao\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">⚖️</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Legislação</span></a><a href=\"/mercado\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">📊</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Mercado</span></a><a href=\"/vendas\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">🛒</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Vendas</span></a><a href=\"/equipe\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">👥</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Equipe</span></a><a href=\"/tecnologia\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">💻</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Tecnologia</span></a><a href=\"/saude-categorias\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">➕</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Saúde & Categorias</span></a></div></div>" },
    { "id": "content-pf-essencial", "name": "Leitura Essencial", "area": "main", "order": 4, "color": "#0c8b46", "custom": true, "format": "cultura", "layout": "cultura", "source": "automatic_by_category", "category": "gestao", "caption": "Guia completo", "visible": true, "blockType": "content", "itemsLimit": 4, "linkLabel": "Ver todos →" },
    { "id": "content-pf-editor", "name": "Escolha do Editor", "area": "main", "order": 5, "color": "#0c8b46", "custom": true, "format": "grid", "layout": "grid", "source": "most_read", "visible": true, "blockType": "content", "itemsLimit": 4 },
    { "id": "mais-lidas", "name": "Mais Lidas", "area": "sidebar", "order": 6, "color": "#0c8b46", "visible": true, "itemsLimit": 5 },
    { "id": "html-pf-cta", "name": "Anuncie no Ponto Farma", "area": "sidebar", "order": 7, "isAd": true, "custom": true, "format": "grid", "visible": true, "blockType": "html", "html": "<div style=\"background:linear-gradient(180deg,#0e2341,#0c1630);color:#ffffff;border-radius:18px;padding:24px;box-shadow:0 8px 28px rgba(15,23,42,.06);\"><span style=\"display:inline-block;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.12);color:#d1fae5;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;\">Publicidade</span><div style=\"font-size:24px;line-height:1.15;font-weight:800;margin-bottom:10px;\">Sua marca para quem decide na farmácia</div><div style=\"color:#cbd5e1;font-size:14px;line-height:1.5;margin-bottom:16px;\">Anuncie no Ponto Farma e fale com donos e gestores de farmácias de todo o Brasil.</div><a href=\"/contato\" style=\"display:inline-block;background:#18a957;color:#ffffff;padding:12px 20px;border-radius:12px;font-weight:700;font-size:14px;text-decoration:none;\">Anunciar agora</a></div>" },
    { "id": "list-pf-ultimas", "name": "Últimas Notícias", "area": "sidebar", "order": 8, "color": "#0c8b46", "custom": true, "format": "list_compact", "source": "latest", "visible": true, "blockType": "list", "itemsLimit": 5 },
    { "id": "content-pf-negocios", "name": "Negócios & Operação", "width": "half", "order": 9, "color": "#0c8b46", "custom": true, "format": "trio", "layout": "trio", "source": "automatic_by_category", "category": "mercado", "visible": true, "blockType": "content", "linkLabel": "Ver todos →" },
    { "id": "content-pf-compliance", "name": "Compliance & Regulação", "width": "half", "order": 10, "color": "#18a957", "custom": true, "format": "trio", "layout": "trio", "source": "automatic_by_category", "category": "legislacao", "visible": true, "blockType": "content", "linkLabel": "Ver todos →" },
    { "id": "newsletter-pf-assine", "name": "Inscreva-se para receber conteúdos exclusivos", "order": 11, "color": "#0e2341", "custom": true, "format": "grid", "visible": true, "blockType": "newsletter", "caption": "Artigos, guias e ferramentas práticas para ajudar sua farmácia a crescer todos os dias." },
    { "id": "hero",       "name": "Principais Notícias", "order": 12, "layout": "portal",  "visible": false },
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
