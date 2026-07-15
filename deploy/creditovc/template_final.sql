-- =============================================================================
-- Crédito.vc — importa o template "Crédito.vc - Final" (layout PRÓPRIO,
-- clonado do mock da proposta Bee Media / docs/Guia_Claude_Code_Base.md —
-- NÃO é o layout da família KSports dos blogs de esporte)
-- =============================================================================
-- Estrutura da home (espelha o mock):
--   1. Hero em 2 colunas: card branco de boas-vindas (eyebrow verde + título
--      + busca) | "Destaques" (1 matéria grande + 3 empilhadas)
--   2. Zona principal+lateral: Mais Recentes (grade) → Temas em Destaque
--      (ícones por editoria) → Leitura Essencial (card grande + lista) →
--      Escolha do Editor (mais lidas) ‖ lateral: Mais Lidas + box CTA navy
--      da casa ("Precisando de crédito?") + Últimas Notícias
--   3. Negócios & Trabalho | Crédito & Score (3 cards cada)
--   4. Faixa navy de newsletter (formulário funcional)
-- Identidade: verde #12a75c (CTA) / verde vivo #0ec76d (acentos) + navy
-- #0f2446; header BRANCO sem top bar escura (menu claro estilo mock);
-- rodapé claro (light).
-- Editorias/slugs: sair-das-dividas, credito, score, organizar-financas,
-- renda-extra, planejar-o-futuro, investimentos, outros — todo slug tem
-- menuItem VISÍVEL (rota custom via DynamicCategory).
--   * O box CTA da lateral é estático por enquanto — troque pelo banner do
--     SIMULADOR DE CRÉDITO (com link) quando ele existir.
--
-- Bootstrap: se a linha settings.site_settings ainda NÃO existir (blog
-- recém-instalado — ela só nasce no 1º Salvar do admin), o script a cria com
-- os defaults do app (espelho de DEFAULT_SETTINGS/DEFAULT_HOME_BLOCKS em
-- api-server/src/lib/store.ts) + o siteName/tagline do Crédito.vc.
--
-- Idempotente: remove versão anterior do mesmo template (id) antes de anexar.
-- Pré-requisito: wizard /admin/setup concluído (tabela settings existe).
-- O app relê site_settings a cada 15s — o template aparece em
-- "Meus templates" sem restart. Não salve Configurações no admin no mesmo
-- instante da importação.
--
-- Uso (VPS, /opt/sp011):
--   docker compose exec -T pg-blogs psql -U postgres -d creditovc -v ON_ERROR_STOP=1 < deploy/creditovc/template_final.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Blog recém-instalado: cria site_settings com os defaults do app (o objeto
-- gravado SUBSTITUI os defaults em memória — por isso precisa vir completo,
-- não só com homeTemplates).
INSERT INTO settings (key, value, updated_at)
SELECT 'site_settings',
'{"siteName":"Crédito.vc","tagline":"Educação financeira para a vida real","logoSize":101,"mobileEnabled":true,"desktopEnabled":true,"showTickerBar":true,"showHeroStrip":true,"homeBlocks":[{"id":"hero","name":"Hero / Destaques","visible":true,"order":0},{"id":"brasil","name":"Brasil","visible":true,"order":1},{"id":"mais-lidas","name":"Mais Lidas","visible":true,"order":2},{"id":"mundo","name":"Mundo","visible":true,"order":3},{"id":"esporte","name":"Esporte","visible":true,"order":4},{"id":"cultura","name":"Cultura","visible":true,"order":5},{"id":"df","name":"DF","visible":true,"order":6},{"id":"saude","name":"Saúde","visible":true,"order":7},{"id":"tecnologia","name":"Tecnologia","visible":true,"order":8},{"id":"colunistas","name":"Colunistas","visible":true,"order":9},{"id":"ultimas","name":"Últimas Notícias","visible":true,"order":10}]}',
now()
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'site_settings');

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
  "createdAt": "2026-07-15T18:00:00.000Z",
  "accentColor": "#12a75c",
  "headerStyle": "standard",
  "footerStyle": "light",
  "headerBgColor": "#ffffff",
  "footerBgColor": "#ffffff",
  "menuTextColor": "#334155",
  "menuActiveColor": "#12a75c",
  "menuFontSize": 15,
  "menuFontWeight": 600,
  "showTickerBar": false,
  "showHeroStrip": false,
  "showTopBar": false,
  "menuBarStyle": "attached",
  "menuBarBgColor": "#ffffff",
  "footerAccentColor": "#12a75c",
  "headerPaddingX": 16,
  "headerMarginTop": 0,
  "siteLanguage": "pt-BR",
  "siteTimezone": "America/Sao_Paulo",
  "headerBannerHtml": "<a href=\"/#newsletter-cvc-assine\" style=\"display:inline-flex;align-items:center;background:#12a75c;color:#ffffff;padding:10px 22px;border-radius:12px;font-weight:700;font-size:14px;text-decoration:none;white-space:nowrap;box-shadow:0 8px 28px rgba(15,23,42,.10);\">Receber conteúdos</a>",
  "menuItems": [
    { "id": "cvc-menu-dividas",  "label": "Sair das Dívidas",   "path": "/sair-das-dividas",   "order": 0, "visible": true },
    { "id": "cvc-menu-credito",  "label": "Crédito",            "path": "/credito",            "order": 1, "visible": true },
    { "id": "cvc-menu-score",    "label": "Score",              "path": "/score",              "order": 2, "visible": true },
    { "id": "cvc-menu-organizar","label": "Organizar Finanças", "path": "/organizar-financas", "order": 3, "visible": true },
    { "id": "cvc-menu-renda",    "label": "Renda Extra",        "path": "/renda-extra",        "order": 4, "visible": true },
    { "id": "cvc-menu-futuro",   "label": "Planejar o Futuro",  "path": "/planejar-o-futuro",  "order": 5, "visible": true },
    { "id": "cvc-menu-invest",   "label": "Investimentos",      "path": "/investimentos",      "order": 6, "visible": true,
      "children": [
        { "id": "cvc-menu-outros", "label": "Outros", "path": "/outros", "order": 0, "visible": true }
      ] }
  ],
  "footerConfig": {
    "description": "Seu guia de educação financeira para conquistar estabilidade, crédito e liberdade para realizar seus sonhos.",
    "showSocial": false,
    "socialEnabled": {},
    "columns": [
      { "id": "cvc-nav", "title": "Conteúdos", "links": [
        { "id": "cvc-nav-dividas",  "label": "Sair das Dívidas",   "href": "/sair-das-dividas" },
        { "id": "cvc-nav-credito",  "label": "Crédito",            "href": "/credito" },
        { "id": "cvc-nav-score",    "label": "Score",              "href": "/score" },
        { "id": "cvc-nav-organizar","label": "Organizar Finanças", "href": "/organizar-financas" },
        { "id": "cvc-nav-renda",    "label": "Renda Extra",        "href": "/renda-extra" },
        { "id": "cvc-nav-futuro",   "label": "Planejar o Futuro",  "href": "/planejar-o-futuro" },
        { "id": "cvc-nav-invest",   "label": "Investimentos",      "href": "/investimentos" }
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
    "showNewsletter": false,
    "copyright": "© {year} {site}. Todos os direitos reservados.",
    "legalLinks": [
      { "id": "cvc-l-privacy", "label": "Política de Privacidade", "href": "/privacidade" },
      { "id": "cvc-l-terms",   "label": "Termos de Uso",           "href": "/termos" },
      { "id": "cvc-l-contact", "label": "Contato",                 "href": "/contato" }
    ]
  },
  "blocks": [
    { "id": "search-cvc-hero", "name": "Bem-vindo ao Crédito.vc", "width": "half", "order": 0, "color": "#12a75c", "custom": true, "format": "search_card", "visible": true, "blockType": "search", "caption": "Buscar artigos, guias e ferramentas...", "linkLabel": "✉️ Receba conteúdos exclusivos no seu e-mail — inscreva-se no fim da página.", "linkUrl": "#newsletter-cvc-assine", "html": "<div style=\"color:#12a75c;font-weight:800;letter-spacing:.08em;font-size:13px;text-transform:uppercase;margin-bottom:14px;\">Bem-vindo ao Crédito.vc</div><div style=\"font-size:36px;line-height:1.08;color:#0f2446;font-weight:800;margin-bottom:14px;\">Educação financeira para a vida real</div><div style=\"color:#6b7280;font-size:16px;line-height:1.5;\">Dicas práticas e confiáveis para cuidar do seu dinheiro, conquistar crédito, investir melhor e realizar seus sonhos.</div>" },
    { "id": "content-cvc-destaques", "name": "", "width": "half", "order": 1, "color": "#12a75c", "custom": true, "format": "magazine", "layout": "magazine", "source": "latest", "visible": true, "blockType": "content" },
    { "id": "content-cvc-recentes", "name": "Mais Recentes", "area": "main", "order": 2, "color": "#12a75c", "custom": true, "format": "grid", "layout": "grid", "source": "latest", "visible": true, "blockType": "content", "itemsLimit": 8 },
    { "id": "html-cvc-temas", "name": "Temas em Destaque", "area": "main", "order": 3, "custom": true, "format": "grid", "visible": true, "blockType": "html", "html": "<div><div style=\"display:flex;align-items:center;gap:10px;margin-bottom:16px;\"><span style=\"width:4px;height:20px;background:#12a75c;display:inline-block;\"></span><span style=\"font-size:15px;font-weight:800;color:#1a1a1a;text-transform:uppercase;letter-spacing:.05em;\">Temas em Destaque</span></div><div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;\"><a href=\"/sair-das-dividas\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">💰</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Sair das Dívidas</span></a><a href=\"/credito\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">💳</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Crédito</span></a><a href=\"/score\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">🎯</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Score</span></a><a href=\"/organizar-financas\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">📊</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Organizar Finanças</span></a><a href=\"/renda-extra\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">💼</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Renda Extra</span></a><a href=\"/planejar-o-futuro\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">🛡️</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Planejar o Futuro</span></a><a href=\"/investimentos\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">📈</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Investimentos</span></a></div></div>" },
    { "id": "content-cvc-essencial", "name": "Leitura Essencial", "area": "main", "order": 4, "color": "#12a75c", "custom": true, "format": "cultura", "layout": "cultura", "source": "automatic_by_category", "category": "sair-das-dividas", "caption": "Guia completo", "visible": true, "blockType": "content", "itemsLimit": 4, "linkLabel": "Ver todos →" },
    { "id": "content-cvc-editor", "name": "Escolha do Editor", "area": "main", "order": 5, "color": "#12a75c", "custom": true, "format": "grid", "layout": "grid", "source": "most_read", "visible": true, "blockType": "content", "itemsLimit": 4 },
    { "id": "mais-lidas", "name": "Mais Lidas", "area": "sidebar", "order": 6, "color": "#12a75c", "visible": true, "itemsLimit": 5 },
    { "id": "html-cvc-cta", "name": "Publicidade da casa", "area": "sidebar", "order": 7, "isAd": true, "custom": true, "format": "grid", "visible": true, "blockType": "html", "html": "<div style=\"background:linear-gradient(180deg,#0f2446,#0a1630);color:#ffffff;border-radius:18px;padding:24px;box-shadow:0 8px 28px rgba(15,23,42,.06);\"><span style=\"display:inline-block;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.12);color:#d1fae5;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;\">Publicidade</span><div style=\"font-size:24px;line-height:1.15;font-weight:800;margin-bottom:10px;\">Precisando de crédito? A gente te ajuda.</div><div style=\"color:#cbd5e1;font-size:14px;line-height:1.5;margin-bottom:16px;\">Guias e ferramentas para você conquistar crédito com segurança e nas melhores condições.</div><span style=\"display:inline-block;background:#12a75c;color:#ffffff;padding:12px 20px;border-radius:12px;font-weight:700;font-size:14px;\">Simulador em breve</span></div>" },
    { "id": "list-cvc-ultimas", "name": "Últimas Notícias", "area": "sidebar", "order": 8, "color": "#12a75c", "custom": true, "format": "list_compact", "source": "latest", "visible": true, "blockType": "list", "itemsLimit": 5 },
    { "id": "content-cvc-negocios", "name": "Negócios & Trabalho", "width": "half", "order": 9, "color": "#12a75c", "custom": true, "format": "trio", "layout": "trio", "source": "automatic_by_category", "category": "renda-extra", "visible": true, "blockType": "content", "linkLabel": "Ver todos →" },
    { "id": "content-cvc-creditoscore", "name": "Crédito & Score", "width": "half", "order": 10, "color": "#0ec76d", "custom": true, "format": "trio", "layout": "trio", "source": "automatic_by_category", "category": "credito", "visible": true, "blockType": "content", "linkLabel": "Ver todos →" },
    { "id": "newsletter-cvc-assine", "name": "Inscreva-se na nossa newsletter", "order": 11, "color": "#0f2446", "custom": true, "format": "grid", "visible": true, "blockType": "newsletter", "caption": "Dicas semanais, guias práticos e ferramentas para você cuidar melhor do seu dinheiro." },
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
