-- =============================================================================
-- Crédito.vc — importa o template "Crédito.vc - Final" (layout PRÓPRIO,
-- clonado do mock da proposta Bee Media / docs/Guia_Claude_Code_Base.md —
-- NÃO é o layout da família KSports dos blogs de esporte)
-- =============================================================================
-- Estrutura da home (fiel ao mock, coluna única — revisão 2026-07-16; exige
-- imagem blog-api/blog-web com os layouts "hero"/"mini" e sectionStyle):
--   1. Hero Revista 3 colunas (layout "hero"): boas-vindas + busca | destaque
--      grande | 2 cards menores — 3 notícias mais recentes
--   2. Mais Recentes (layout "mini": 5 cards revista, largura total)
--   3. Temas em Destaque (ícones por editoria, largura total)
--   4. Zona 2 colunas: Leitura Essencial (cultura + cabeçalho revista) | box
--      CTA navy da casa ("Precisando de crédito?")
--   5. Escolha do Editor (format "destaque": 1 card grande com título sobre a
--      foto + 3 mini cards ao lado, mais lidas — fiel ao mock do Crédito.vc)
--   6. Negócios & Trabalho | Crédito & Score (mini, 3 cards cada)
--   7. Newsletter em CARTÃO arredondado (format "card" + nota "Sem spam…")
-- Fora do mock: "Mais Lidas" e "Últimas Notícias" saíram da home (decisão
-- 2026-07-16); "colunistas" fica oculto até existirem colunistas reais.
-- Identidade: verde #12a75c (CTA) / verde vivo #0ec76d (acentos) + navy
-- #0f2446; fundo da página #f7f9fb (pageBgColor); header BRANCO sem top bar
-- escura; rodapé claro (light) com 3 colunas (Conteúdos/Institucional/Legal)
-- + redes sociais (ícones aparecem quando as URLs forem preenchidas).
-- Editorias/slugs: sair-das-dividas, credito, score, organizar-financas,
-- renda-extra, planejar-o-futuro, investimentos, outros — todo slug tem
-- menuItem VISÍVEL (rota custom via DynamicCategory).
--   * Botões do mock que apontam para ferramentas que NÃO existem (Simular
--     Crédito, Planilha de Orçamento, calculadoras) ficaram de fora: o CTA do
--     cabeçalho vira "Receber conteúdos" (âncora da newsletter) e o box navy
--     da lateral aponta para /sair-das-dividas. Troque pelo banner do
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
  "pageBgColor": "#f7f9fb",
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
    "showSocial": true,
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
        { "id": "cvc-i-about",     "label": "Sobre o Crédito.vc", "href": "/contato" },
        { "id": "cvc-i-advertise", "label": "Anuncie",            "href": "/contato" },
        { "id": "cvc-i-contact",   "label": "Fale Conosco",       "href": "/contato" }
      ] },
      { "id": "cvc-legal", "title": "Legal", "links": [
        { "id": "cvc-l-privacy", "label": "Política de Privacidade", "href": "/privacidade" },
        { "id": "cvc-l-terms",   "label": "Termos de Uso",           "href": "/termos" }
      ] }
    ],
    "showContact": false,
    "showNewsletter": false,
    "copyright": "© {year} {site}. Todos os direitos reservados.",
    "legalLinks": []
  },
  "blocks": [
    { "id": "content-cvc-hero", "name": "Hero — Boas-vindas + Destaques", "order": 0, "color": "#12a75c", "custom": true, "format": "hero", "layout": "hero", "source": "latest", "visible": true, "blockType": "content", "itemsLimit": 3, "caption": "Buscar artigos, guias e ferramentas...", "linkLabel": "✉️ Receba conteúdos exclusivos no seu e-mail. Quero me inscrever →", "linkUrl": "#newsletter-cvc-assine", "html": "<div style=\"color:#12a75c;font-weight:800;letter-spacing:.08em;font-size:13px;text-transform:uppercase;margin-bottom:14px;\">Bem-vindo ao Crédito.vc</div><div style=\"font-size:36px;line-height:1.08;color:#0f2446;font-weight:800;margin-bottom:14px;\">Educação financeira para a vida real</div><div style=\"color:#6b7280;font-size:16px;line-height:1.5;margin-bottom:18px;\">Dicas práticas e confiáveis para cuidar do seu dinheiro, conquistar crédito, investir melhor e realizar seus sonhos.</div>" },
    { "id": "content-cvc-recentes", "name": "Mais Recentes", "order": 1, "color": "#12a75c", "custom": true, "format": "mini", "layout": "mini", "source": "latest", "visible": true, "blockType": "content", "itemsLimit": 5, "linkLabel": "Ver todos →", "linkUrl": "/arquivo" },
    { "id": "html-cvc-temas", "name": "Temas em Destaque", "order": 2, "custom": true, "format": "grid", "visible": true, "blockType": "html", "html": "<div><div style=\"font-size:22px;line-height:1.2;font-weight:800;color:#1a1a1a;margin-bottom:18px;\">Temas em Destaque</div><div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;\"><a href=\"/sair-das-dividas\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">💰</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Sair das Dívidas</span></a><a href=\"/credito\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">💳</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Crédito</span></a><a href=\"/score\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">🎯</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Score de Crédito</span></a><a href=\"/organizar-financas\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">📊</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Organizar Finanças</span></a><a href=\"/renda-extra\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">💼</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Renda Extra</span></a><a href=\"/investimentos\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">📈</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Investimentos</span></a><a href=\"/planejar-o-futuro\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">📅</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Planejar o Futuro</span></a><a href=\"/arquivo\" style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 10px;text-align:center;text-decoration:none;display:block;\"><span style=\"width:54px;height:54px;border-radius:50%;border:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 8px;\">📚</span><span style=\"display:block;font-weight:600;color:#334155;font-size:13px;\">Todos os temas</span></a></div></div>" },
    { "id": "content-cvc-essencial", "name": "Leitura Essencial", "area": "main", "order": 3, "color": "#12a75c", "custom": true, "format": "cultura", "layout": "cultura", "sectionStyle": "revista", "source": "automatic_by_category", "category": "sair-das-dividas", "caption": "Guia completo", "visible": true, "blockType": "content", "itemsLimit": 4, "linkLabel": "Ver todos →" },
    { "id": "html-cvc-cta", "name": "CTA da casa — Comece por aqui", "area": "sidebar", "order": 4, "isAd": true, "custom": true, "format": "grid", "visible": true, "blockType": "html", "html": "<div style=\"background:linear-gradient(180deg,#0f2446,#0a1630);color:#ffffff;border-radius:18px;padding:24px;box-shadow:0 8px 28px rgba(15,23,42,.06);\"><span style=\"display:inline-block;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.12);color:#d1fae5;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;\">Comece por aqui</span><div style=\"font-size:24px;line-height:1.15;font-weight:800;margin-bottom:10px;\">Saia das dívidas e retome o controle do seu dinheiro.</div><div style=\"color:#cbd5e1;font-size:14px;line-height:1.5;margin-bottom:16px;\">Guias práticos para renegociar, organizar as contas e voltar a ter crédito com segurança.</div><a href=\"/sair-das-dividas\" style=\"display:inline-block;background:#12a75c;color:#ffffff;padding:12px 20px;border-radius:12px;font-weight:700;font-size:14px;text-decoration:none;\">Ver o guia completo →</a></div>" },
    { "id": "content-cvc-editor", "name": "Escolha do Editor", "order": 5, "color": "#12a75c", "custom": true, "format": "destaque", "layout": "mini", "source": "most_read", "visible": true, "blockType": "content", "itemsLimit": 4, "linkLabel": "Ver todos →", "linkUrl": "/arquivo" },
    { "id": "content-cvc-negocios", "name": "Negócios & Trabalho", "width": "half", "order": 6, "color": "#12a75c", "custom": true, "format": "mini", "layout": "mini", "source": "automatic_by_category", "category": "renda-extra", "visible": true, "blockType": "content", "itemsLimit": 3, "linkLabel": "Ver todos →" },
    { "id": "content-cvc-creditoscore", "name": "Crédito & Score", "width": "half", "order": 7, "color": "#0ec76d", "custom": true, "format": "mini", "layout": "mini", "source": "automatic_by_category", "category": "credito", "visible": true, "blockType": "content", "itemsLimit": 3, "linkLabel": "Ver todos →" },
    { "id": "newsletter-cvc-assine", "name": "Inscreva-se na nossa newsletter", "order": 8, "color": "#0f2446", "custom": true, "format": "card", "visible": true, "blockType": "newsletter", "caption": "Dicas semanais, guias práticos e ferramentas para você cuidar melhor do seu dinheiro.", "buttonLabel": "Quero receber", "linkLabel": "Sem spam. Você pode cancelar quando quiser." },
    { "id": "hero",       "name": "Principais Notícias", "order": 9,  "layout": "portal",  "visible": false },
    { "id": "brasil",     "name": "Brasil",           "color": "#16a34a", "order": 10, "layout": "grid",    "visible": false, "category": "brasil" },
    { "id": "mundo",      "name": "Mundo",            "color": "#6b21a8", "order": 11, "layout": "grid",    "visible": false, "category": "mundo" },
    { "id": "esporte",    "name": "Esporte",          "color": "#dc2626", "order": 12, "layout": "cultura", "visible": false, "category": "esportes" },
    { "id": "cultura",    "name": "Cultura",          "color": "#0d9488", "order": 13, "layout": "cultura", "visible": false, "category": "cultura" },
    { "id": "df",         "name": "DF",               "color": "#0b3d91", "order": 14, "layout": "duplo",   "visible": false, "category": "cidade" },
    { "id": "saude",      "name": "Saúde",            "color": "#16a34a", "order": 15, "layout": "grid",    "visible": false, "category": "saude" },
    { "id": "tecnologia", "name": "Tecnologia",       "color": "#0284c7", "order": 16, "layout": "grid",    "visible": false, "category": "tecnologia" },
    { "id": "colunistas", "name": "Colunistas",       "order": 17, "visible": false },
    { "id": "ultimas",    "name": "Últimas Notícias", "order": 18, "visible": false },
    { "id": "mais-lidas", "name": "Mais Lidas",       "color": "#12a75c", "order": 19, "visible": false, "itemsLimit": 5 }
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
