-- =============================================================================
-- Crédito.vc — aplica o rodapé "Portal" (modelo aprovado em 2026-08-14)
-- =============================================================================
-- Layout (footerStyle "portal", novo na imagem do blog — exige api/web com o
-- estilo; ver artifacts/brasilia-agora/src/components/Footer.tsx):
--   [ marca + descrição ] [ EDITORIAS ] [ MAIS TEMAS ] [ INSTITUCIONAL ]
--   ────────────────────────────────────────────────────────────────────
--   © {year} {site} …                          CNPJ … • cidade/UF
--
-- Fiel ao modelo, com UMA diferença deliberada: os rótulos do mock apontavam
-- para páginas que não existem no blog ("Investimentos & Ações", "Crédito com
-- Garantia", e a coluna FERRAMENTAS inteira — Simulador de Crédito, Calculadora
-- de Selic, Comparador de Fundos, Conversor de Moedas, Simulador de
-- Financiamento). Aqui as colunas usam as 8 editorias REAIS do blog e as três
-- páginas institucionais que existem (/contato, /privacidade, /termos), para
-- não publicar link quebrado. Quando as ferramentas existirem, basta criar uma
-- 4ª coluna em painel → Blocos da Home → Rodapé → Colunas de links.
--
-- A linha da direita da barra final sai de painel → Configurações → Contato
-- (CNPJ + Endereço). Este script NÃO inventa esses dados: enquanto os dois
-- estiverem vazios, a barra mostra os links legais (Privacidade | Termos |
-- Contato) no lugar. Preencha no painel para ver "CNPJ … • São Paulo, SP".
--
-- Idempotente: pode rodar quantas vezes quiser. Mexe SÓ em footerStyle,
-- footerBgColor, footerAccentColor e footerConfig — nenhum outro campo das
-- settings é tocado (blocos, menu, cores do cabeçalho ficam como estão).
--
-- ⚠️ Aplicar um TEMPLATE no admin depois disto sobrescreve o rodapé (o snapshot
-- do template carrega o footerConfig dele). Rode este script DEPOIS do
-- template_final.sql, não antes.
--
-- O app relê site_settings a cada 15s — sem restart.
--
-- Uso (VPS, /opt/sp011):
--   docker compose exec -T pg-blogs psql -U postgres -d creditovc -v ON_ERROR_STOP=1 < deploy/creditovc/footer_final.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Pré-requisito: a linha existe (wizard concluído + 1º Salvar no admin, ou o
-- bootstrap do template_final.sql). Sem ela não há o que atualizar.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM settings WHERE key = 'site_settings') THEN
    RAISE EXCEPTION 'settings.site_settings não existe — rode deploy/creditovc/template_final.sql antes';
  END IF;
END $$;

UPDATE settings s
SET value = (
      s.value::jsonb
      || jsonb_build_object(
           'footerStyle',       'portal',
           'footerBgColor',     '#080f14',
           'footerAccentColor', '#0ec76d',
           'footerConfig',      $fc$
{
  "description": "O portal de conteúdo definitivo sobre crédito e finanças pessoais no Brasil. Unindo a credibilidade do jornalismo financeiro com a inovação das fintechs.",
  "showSocial": true,
  "socialEnabled": {},
  "columns": [
    { "id": "cvc-f-editorias", "title": "Editorias", "links": [
      { "id": "cvc-f-dividas",   "label": "Sair das Dívidas",   "href": "/sair-das-dividas" },
      { "id": "cvc-f-credito",   "label": "Crédito",            "href": "/credito" },
      { "id": "cvc-f-score",     "label": "Score de Crédito",   "href": "/score" },
      { "id": "cvc-f-organizar", "label": "Organizar Finanças", "href": "/organizar-financas" }
    ] },
    { "id": "cvc-f-temas", "title": "Mais Temas", "links": [
      { "id": "cvc-f-renda",  "label": "Renda Extra",       "href": "/renda-extra" },
      { "id": "cvc-f-futuro", "label": "Planejar o Futuro", "href": "/planejar-o-futuro" },
      { "id": "cvc-f-invest", "label": "Investimentos",     "href": "/investimentos" },
      { "id": "cvc-f-outros", "label": "Outros",            "href": "/outros" }
    ] },
    { "id": "cvc-f-inst", "title": "Institucional", "links": [
      { "id": "cvc-f-sobre",   "label": "Sobre o Crédito.vc",     "href": "/contato" },
      { "id": "cvc-f-anuncie", "label": "Anuncie Conosco",        "href": "/contato" },
      { "id": "cvc-f-fale",    "label": "Fale Conosco",           "href": "/contato" },
      { "id": "cvc-f-privacy", "label": "Política de Privacidade","href": "/privacidade" },
      { "id": "cvc-f-terms",   "label": "Termos de Uso",          "href": "/termos" }
    ] }
  ],
  "showContact": false,
  "showNewsletter": false,
  "copyright": "© {year} {site} — Todos os direitos reservados.",
  "legalLinks": [
    { "id": "cvc-f-l-privacy", "label": "Privacidade", "href": "/privacidade" },
    { "id": "cvc-f-l-terms",   "label": "Termos",      "href": "/termos" },
    { "id": "cvc-f-l-contact", "label": "Contato",     "href": "/contato" }
  ]
}
$fc$::jsonb
         )
    )::text,
    updated_at = now()
WHERE s.key = 'site_settings';

-- Conferência: deve devolver portal / #080f14 / 3
SELECT value::jsonb->>'footerStyle'                                AS estilo,
       value::jsonb->>'footerBgColor'                              AS fundo,
       jsonb_array_length(value::jsonb->'footerConfig'->'columns') AS colunas
FROM settings WHERE key = 'site_settings';

COMMIT;
