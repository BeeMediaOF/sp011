-- ============================================================================
-- PontoFarma — Newsletter: molduras + campanha de boas-vindas (seed)
-- ----------------------------------------------------------------------------
-- Roda no banco DO BLOG pontofarma (NÃO no central), depois do go-live/wizard
-- (as tabelas newsletter_* se autocriam no boot via ensureSchema):
--
--   cd /opt/sp011
--   docker compose exec -T pg-blogs psql -U postgres -d pontofarma -v ON_ERROR_STOP=1 \
--     < deploy/pontofarma/newsletter_boas_vindas.sql
--
-- Idempotente: reexecutar não duplica (guarda por nome da moldura / assunto).
-- A campanha entra como RASCUNHO (status 'draft') — nada é enviado sozinho.
--
-- Logo: usamos o WORDMARK "pontofarma.com" recriado em HTML (navy + teal),
-- porque em e-mail texto nunca é bloqueado pelo cliente e não depende de
-- hospedar imagem. Para usar o PNG real: Admin → Newsletter → Modelos → editar
-- a moldura → "Enviar logo" (modo imagem) OU trocar o headerHtml por um <img>
-- com a URL pública do arquivo no bucket de Storage do pontofarma.
-- Paleta: navy #0e2341 · teal #158b9c · verde #18a957/#0c8b46 (identidade do site).
-- ============================================================================

-- ── Moldura 1: "PontoFarma — Boas-vindas" (cabeçalho branco + verde) ─────────
INSERT INTO newsletter_templates (name, config)
SELECT 'PontoFarma — Boas-vindas', jsonb_build_object(
  'accentColor',    '#18a957',
  'logoMode',       'none',
  'pageBgColor',    '#eef2f6',
  'bodyTextColor',  '#334155',
  'headerTextColor','#ffffff',
  'headerHtml',     $hdr$
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;background:#ffffff;">
  <tr>
    <td style="padding:30px 40px 22px;text-align:center;border-bottom:3px solid #18a957;">
      <div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:32px;font-weight:800;letter-spacing:-0.8px;line-height:1;color:#0e2341;">ponto<span style="color:#158b9c;">farma</span><span style="font-size:15px;font-weight:700;color:#0e2341;">.com</span></div>
      <div style="margin-top:10px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#18a957;">conteúdo que gera resultado</div>
    </td>
  </tr>
</table>
$hdr$,
  'footerHtml',     $ftr$
<div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="font-size:16px;font-weight:800;letter-spacing:-0.3px;color:#0e2341;">ponto<span style="color:#158b9c;">farma</span><span style="font-size:11px;color:#0e2341;">.com</span></div>
  <div style="margin:6px 0 2px;font-size:12px;color:#64748b;">Conteúdo B2B para o varejo farmacêutico</div>
</div>
$ftr$
)
WHERE NOT EXISTS (SELECT 1 FROM newsletter_templates WHERE name = 'PontoFarma — Boas-vindas');

-- ── Moldura 2: "PontoFarma — Clean" (cabeçalho navy compacto) ────────────────
INSERT INTO newsletter_templates (name, config)
SELECT 'PontoFarma — Clean', jsonb_build_object(
  'accentColor',    '#18a957',
  'logoMode',       'none',
  'pageBgColor',    '#f1f5f9',
  'bodyTextColor',  '#334155',
  'headerTextColor','#ffffff',
  'signature',      'Equipe PontoFarma',
  'footerText',     'PontoFarma · pontofarma.midia.run',
  'headerHtml',     $hdr$
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;background:#0e2341;">
  <tr>
    <td style="padding:24px 40px;text-align:center;">
      <div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:26px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">ponto<span style="color:#3fbfd0;">farma</span><span style="font-size:13px;color:#9fb3c8;">.com</span></div>
    </td>
  </tr>
</table>
$hdr$
)
WHERE NOT EXISTS (SELECT 1 FROM newsletter_templates WHERE name = 'PontoFarma — Clean');

-- ── Campanha de boas-vindas (RASCUNHO), usando a moldura "Boas-vindas" ───────
INSERT INTO newsletter_campaigns (subject, body_html, status, template_id)
SELECT
  'Boas-vindas à PontoFarma 💊',
  $body$
<h1 style="margin:0 0 6px;font-size:24px;line-height:1.25;color:#0e2341;font-weight:800;">Que bom ter você aqui! 👋</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#334155;">Você acaba de assinar a newsletter da <strong style="color:#0e2341;">PontoFarma</strong> — o conteúdo B2B feito para quem toca uma farmácia no dia a dia. A cada edição, resumimos o que importa para você <strong>vender mais, cumprir a lei e gerir melhor</strong>, sem juridiquês.</p>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;margin:0 0 24px;">
  <tr>
    <td style="background:#f0f9f4;border:1px solid #cdeede;border-left:4px solid #18a957;border-radius:10px;padding:18px 20px;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:800;letter-spacing:0.4px;text-transform:uppercase;color:#0c8b46;">O que você vai receber</p>
      <p style="margin:0;font-size:14px;line-height:1.9;color:#334155;">💼 <strong>Gestão</strong> e <strong>Vendas</strong> para o balcão<br>📋 <strong>Fiscal, Tributário</strong> e <strong>Legislação</strong> sem complicação<br>📈 <strong>Mercado</strong> e tendências do setor farmacêutico<br>👥 <strong>Equipe</strong>, <strong>Tecnologia</strong> e <strong>Saúde</strong> no varejo</p>
    </td>
  </tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;margin:0 0 26px;">
  <tr>
    <td align="center">
      <a href="https://pontofarma.midia.run" style="display:inline-block;background:#18a957;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 34px;border-radius:9px;">Explorar o portal &rarr;</a>
    </td>
  </tr>
</table>
<p style="margin:0 0 4px;font-size:15px;line-height:1.7;color:#334155;">Fique de olho na caixa de entrada: a próxima edição chega em breve. E se tiver uma dúvida ou sugestão de pauta, é só responder este e-mail.</p>
<p style="margin:20px 0 0;font-size:15px;line-height:1.6;color:#334155;">Um abraço,<br><strong style="color:#0e2341;">Equipe PontoFarma</strong></p>
$body$,
  'draft',
  (SELECT id FROM newsletter_templates WHERE name = 'PontoFarma — Boas-vindas' ORDER BY id LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM newsletter_campaigns WHERE subject = 'Boas-vindas à PontoFarma 💊');

-- Conferência
SELECT 'molduras' AS o, count(*) FROM newsletter_templates WHERE name LIKE 'PontoFarma%'
UNION ALL
SELECT 'campanha boas-vindas', count(*) FROM newsletter_campaigns WHERE subject = 'Boas-vindas à PontoFarma 💊';
