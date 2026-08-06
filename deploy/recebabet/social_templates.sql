-- Receba Bet — 2 modelos de arte social (Feed 1080×1350) na identidade do blog.
-- Roda no banco DO BLOG (tabela social_templates). Idempotente: re-rodar
-- RESTAURA os modelos originais (edições manuais nesses 2 IDs são sobrescritas;
-- para personalizar sem perder, duplique o template no editor antes).
-- A logo vem de /api/site-asset/logo (a logo atual do admin — troca junto).
-- A URL exibida é texto fixo: recebabet.midia.run
-- Como rodar (VPS):
--   cd /opt/sp011
--   docker compose exec -T pg-blogs psql -U postgres -d recebabet -v ON_ERROR_STOP=1 < deploy/recebabet/social_templates.sql

BEGIN;

INSERT INTO social_templates (id, name, type, width, height, background_color, elements, story)
VALUES
  ('modelo-titulo-central', 'Feed — Título centralizado', 'feed', 1080, 1350, '#071b3d', $soc$[{"x":0,"y":0,"width":1080,"height":1350,"fontSize":32,"fontFamily":"Archivo","fontWeight":"normal","color":"#ffffff","backgroundColor":"#333333","textAlign":"left","padding":0,"borderRadius":0,"opacity":1,"zIndex":1,"content":"","id":"m1-foto","type":"image","objectFit":"cover"},{"x":0,"y":640,"width":1080,"height":710,"fontSize":32,"fontFamily":"Archivo","fontWeight":"normal","color":"#ffffff","backgroundColor":"transparent","textAlign":"left","padding":0,"borderRadius":0,"opacity":1,"zIndex":2,"content":"","id":"m1-scrim","type":"gradient","fill":"gradient","gradient":{"type":"linear","angle":180,"stops":[{"color":"rgba(0,0,0,0)","pos":0},{"color":"rgba(0,0,0,0.051)","pos":14},{"color":"rgba(0,0,0,0.182)","pos":29},{"color":"rgba(0,0,0,0.362)","pos":43},{"color":"rgba(0,0,0,0.558)","pos":57},{"color":"rgba(0,0,0,0.738)","pos":71},{"color":"rgba(0,0,0,0.869)","pos":86},{"color":"rgba(0,0,0,0.92)","pos":100}]}},{"x":955,"y":165,"width":230,"height":560,"fontSize":32,"fontFamily":"Archivo","fontWeight":"normal","color":"#ffffff","backgroundColor":"#0f62d6","textAlign":"left","padding":0,"borderRadius":62,"opacity":1,"zIndex":3,"content":"","id":"m1-aba","type":"shape","shapeKind":"rect","fill":"solid","borderWidth":0},{"x":66,"y":60,"width":310,"height":150,"fontSize":32,"fontFamily":"Archivo","fontWeight":"normal","color":"#ffffff","backgroundColor":"transparent","textAlign":"left","padding":0,"borderRadius":0,"opacity":1,"zIndex":6,"content":"/api/site-asset/logo","id":"m1-logo","type":"logo","objectFit":"contain"},{"x":70,"y":915,"width":940,"height":260,"fontSize":58,"fontFamily":"Archivo","fontWeight":"bold","color":"#ffffff","backgroundColor":"transparent","textAlign":"center","padding":0,"borderRadius":0,"opacity":1,"zIndex":6,"content":"{{title}}","id":"m1-titulo","type":"title","verticalAlign":"bottom","autoFit":true,"lineHeight":1.12},{"x":70,"y":1200,"width":940,"height":56,"fontSize":34,"fontFamily":"Archivo","fontWeight":"bold","color":"#3d9bff","backgroundColor":"transparent","textAlign":"center","padding":0,"borderRadius":0,"opacity":1,"zIndex":6,"content":"recebabet.midia.run","id":"m1-url","type":"text","verticalAlign":"middle","letterSpacing":0.5}]$soc$::jsonb, NULL),
  ('modelo-caixa-titulo',   'Feed — Caixa de título',     'feed', 1080, 1350, '#071b3d', $soc$[{"x":0,"y":0,"width":1080,"height":1350,"fontSize":32,"fontFamily":"Archivo","fontWeight":"normal","color":"#ffffff","backgroundColor":"#333333","textAlign":"left","padding":0,"borderRadius":0,"opacity":1,"zIndex":1,"content":"","id":"m2-foto","type":"image","objectFit":"cover"},{"x":-105,"y":870,"width":230,"height":400,"fontSize":32,"fontFamily":"Archivo","fontWeight":"normal","color":"#ffffff","backgroundColor":"#0f62d6","textAlign":"left","padding":0,"borderRadius":58,"opacity":1,"zIndex":3,"content":"","id":"m2-aba","type":"shape","shapeKind":"rect","fill":"solid","borderWidth":0},{"x":90,"y":890,"width":1050,"height":400,"fontSize":32,"fontFamily":"Archivo","fontWeight":"normal","color":"#ffffff","backgroundColor":"#071b3d","textAlign":"left","padding":0,"borderRadius":46,"opacity":1,"zIndex":4,"content":"","id":"m2-caixa","type":"shape","shapeKind":"rect","fill":"solid","borderWidth":0},{"x":66,"y":60,"width":310,"height":150,"fontSize":32,"fontFamily":"Archivo","fontWeight":"normal","color":"#ffffff","backgroundColor":"transparent","textAlign":"left","padding":0,"borderRadius":0,"opacity":1,"zIndex":6,"content":"/api/site-asset/logo","id":"m2-logo","type":"logo","objectFit":"contain"},{"x":150,"y":930,"width":900,"height":225,"fontSize":48,"fontFamily":"Archivo","fontWeight":"bold","color":"#ffffff","backgroundColor":"transparent","textAlign":"left","padding":0,"borderRadius":0,"opacity":1,"zIndex":6,"content":"{{title}}","id":"m2-titulo","type":"title","verticalAlign":"middle","autoFit":true,"lineHeight":1.14},{"x":150,"y":1180,"width":900,"height":55,"fontSize":32,"fontFamily":"Archivo","fontWeight":"bold","color":"#3d9bff","backgroundColor":"transparent","textAlign":"left","padding":0,"borderRadius":0,"opacity":1,"zIndex":6,"content":"recebabet.midia.run","id":"m2-url","type":"text","verticalAlign":"middle","letterSpacing":0.5}]$soc$::jsonb, NULL)
ON CONFLICT (id) DO UPDATE SET
  name             = EXCLUDED.name,
  type             = EXCLUDED.type,
  width            = EXCLUDED.width,
  height           = EXCLUDED.height,
  background_color = EXCLUDED.background_color,
  elements         = EXCLUDED.elements,
  story            = EXCLUDED.story,
  updated_at       = now();

COMMIT;

-- Conferência: 2 linhas, 6 elementos cada
SELECT id, name, jsonb_array_length(elements) AS elementos
FROM social_templates
WHERE id IN ('modelo-titulo-central', 'modelo-caixa-titulo')
ORDER BY id;
