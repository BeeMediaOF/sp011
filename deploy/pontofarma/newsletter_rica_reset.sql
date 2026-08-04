-- ============================================================================
-- PontoFarma — RESET da newsletter rica (apaga para re-semear)
-- ----------------------------------------------------------------------------
-- Use quando a moldura/campanha rica já está no banco mas com o conteúdo
-- ERRADO. Foi o caso em 2026-08-03: o corpo da campanha era sanitizado com a
-- política de ARTIGO ao salvar no admin (descartava `style=` e os atributos de
-- tabela), então abrir a campanha e clicar em enviar — que salva antes — achatou
-- o layout; e o logo da moldura apontava para um host placeholder (SEU-PROJ).
--
-- Apaga SEM guarda de status: a campanha de boas-vindas é semeada por este kit,
-- e uma versão já disparada com o layout quebrado não é histórico que valha
-- preservar. (Uma 1ª versão deste script guardava por `status='draft'` e por
-- "nenhuma campanha referencia a moldura" — as duas guardas falharam justamente
-- no caso real: a campanha tinha sido enviada e referenciava a moldura, então
-- nada era apagado e o seed seguinte era pulado pelo próprio WHERE NOT EXISTS.)
--
-- Depois deste script, rode o seed de novo:
--
--   cd /opt/sp011
--   docker compose exec -T pg-blogs psql -U postgres -d pontofarma -v ON_ERROR_STOP=1 < deploy/pontofarma/newsletter_rica_reset.sql
--   docker compose exec -T pg-blogs psql -U postgres -d pontofarma -v ON_ERROR_STOP=1 < deploy/pontofarma/newsletter_rica.sql
--
-- PRÉ-REQUISITO: imagem api/web nova no ar (senão o admin achata o layout de
-- novo no primeiro salvamento) e as imagens acessíveis por URL pública.
-- ============================================================================

-- Estado antes (para o log ficar com o que havia).
SELECT 'antes' AS quando, id, status, length(body_html) AS tam
FROM newsletter_campaigns WHERE subject LIKE 'Seja muito bem-vindo%';

-- Fila de envio da campanha (sem FK; linhas órfãs seriam descartadas pelo
-- worker como "campanha não existe mais", mas é mais limpo remover).
DELETE FROM newsletter_send_queue
WHERE campaign_id IN (
  SELECT id FROM newsletter_campaigns WHERE subject LIKE 'Seja muito bem-vindo%'
);

DELETE FROM newsletter_campaigns
WHERE subject LIKE 'Seja muito bem-vindo%';

DELETE FROM newsletter_templates
WHERE name LIKE 'PontoFarma%Rica (tela cheia)%';

-- Conferência: as duas linhas devem voltar 0.
SELECT 'moldura rica restante' AS o, count(*) FROM newsletter_templates WHERE name LIKE 'PontoFarma%Rica (tela cheia)%'
UNION ALL
SELECT 'campanha rica restante', count(*) FROM newsletter_campaigns WHERE subject LIKE 'Seja muito bem-vindo%';
