-- ============================================================================
-- PontoFarma — RESET da newsletter rica (apaga para re-semear)
-- ----------------------------------------------------------------------------
-- Use quando a moldura/campanha rica já está no banco mas com o conteúdo
-- ERRADO. Foi o caso em 2026-08-03: o corpo da campanha era sanitizado com a
-- política de ARTIGO ao salvar no admin (descartava `style=` e os atributos de
-- tabela), então abrir a campanha e clicar em "Enviar teste" — que salva antes
-- de enviar — achatou o layout; e as imagens apontavam para um bucket Supabase
-- que não existia (404).
--
-- Só apaga RASCUNHO (campanha já enviada/agendada não é tocada). Depois deste
-- script, rode o seed de novo:
--
--   cd /opt/sp011
--   docker compose exec -T pg-blogs psql -U postgres -d pontofarma -v ON_ERROR_STOP=1 < deploy/pontofarma/newsletter_rica_reset.sql
--   docker compose exec -T pg-blogs psql -U postgres -d pontofarma -v ON_ERROR_STOP=1 < deploy/pontofarma/newsletter_rica.sql
--
-- PRÉ-REQUISITO: as imagens já copiadas para /data/uploads do blog e a imagem
-- api/web nova no ar (senão o admin achata o layout de novo ao salvar).
-- ============================================================================

-- A campanha referencia a moldura (FK) — apagar a campanha primeiro.
DELETE FROM newsletter_campaigns
WHERE subject = 'Seja muito bem-vindo(a) ao PontoFarma! 💊'
  AND status = 'draft';

DELETE FROM newsletter_templates
WHERE name = 'PontoFarma — Rica (tela cheia)'
  AND NOT EXISTS (
    SELECT 1 FROM newsletter_campaigns c
    WHERE c.template_id = newsletter_templates.id
  );

-- Conferência: as duas linhas devem voltar 0.
SELECT 'moldura rica restante' AS o, count(*) FROM newsletter_templates WHERE name = 'PontoFarma — Rica (tela cheia)'
UNION ALL
SELECT 'campanha rica restante', count(*) FROM newsletter_campaigns WHERE subject = 'Seja muito bem-vindo(a) ao PontoFarma! 💊';
