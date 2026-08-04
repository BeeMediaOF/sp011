-- ============================================================================
-- PontoFarma — Newsletter RICA (moldura tela cheia + campanha de boas-vindas)
-- ----------------------------------------------------------------------------
-- Design de borda-a-borda (hero com foto, 5 ícones, cards de artigo, CTA,
-- rodapé social) usando o modo `layout:"full"` da moldura.
--
-- NADA A COPIAR PARA A VPS: este seed usa as duas convenções do painel, e o
-- resto se resolve pelo admin (Newsletter → Campanhas → abrir a campanha).
--
--  1. IMAGENS — cada <img> nasce com src="COLOQUE_A_IMAGEM_AQUI". O painel
--     detecta esses slots ("Imagens deste e-mail", com selo *pendente*), aceita
--     o upload e reescreve o src sozinho para /api/uploads/nl-<alt>-<hash>.
--     O logo mora no headerHtml da MOLDURA: aparece no painel de imagens de
--     "Personalizar cabeçalho e rodapé" (ou na aba Modelos), não no do corpo.
--     Root-relativo de propósito: o dispatch absolutiza para
--     https://<dominio>/api/uploads/... no envio, então o mesmo HTML serve
--     qualquer blog da rede. Zero egress de Storage.
--
--  2. ARTIGOS — a seção "Comece agora a explorar" é o marcador {{artigos:3}},
--     trocado no ENVIO pelos 3 artigos publicados mais recentes (imagem,
--     categoria e link /artigo/<slug> reais). Variantes: {{artigos:3:gestao}}
--     e {{mais-lidos:3}}. A prévia do editor já mostra resolvido.
--
-- Idempotente (guarda por nome da moldura / assunto). Campanha entra como
-- RASCUNHO. Requer a imagem do blog COM o modo full-bleed (email.ts) e com o
-- corpo de campanha sanitizado pela política de e-mail (senão o admin achata o
-- layout ao salvar). Para consertar uma campanha já achatada:
-- deploy/pontofarma/newsletter_rica_reset.sql
-- ============================================================================

-- ── Moldura "PontoFarma — Rica (tela cheia)" ────────────────────────────────
INSERT INTO newsletter_templates (name, config)
SELECT 'PontoFarma — Rica (tela cheia)', jsonb_build_object(
  'layout',        'full',
  'accentColor',   '#1a8a9e',
  'logoMode',      'none',
  'pageBgColor',   '#dfe6ee',
  'bodyTextColor', '#334155',
  'headerHtml',    $hdr$
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;">
  <tr><td style="background:#0e2341;padding:9px 26px;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
      <td style="font-size:11px;color:#aebfd4;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">Seja bem-vindo(a) ao PontoFarma! Informação de qualidade para a sua saúde.</td>
      <td align="right" style="font-size:11px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;"><a href="https://pontofarma.midia.run" style="color:#4ec7d6;text-decoration:none;font-weight:600;">Ver no navegador</a></td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#ffffff;padding:20px 26px;text-align:center;">
    <img src="COLOQUE_A_IMAGEM_AQUI" width="230" alt="logo" style="display:inline-block;width:230px;max-width:60%;height:auto;border:0;" />
  </td></tr>
</table>
$hdr$,
  'footerHtml',    $ftr$
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <tr><td style="background:#0c1630;padding:26px 30px;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
      <td width="44%" valign="top" style="padding-right:10px;">
        <div style="font-size:20px;font-weight:800;letter-spacing:-0.3px;color:#ffffff;">ponto<span style="color:#4ec7d6;">farma</span><span style="font-size:12px;color:#9fb3c8;">.com</span></div>
        <p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:#8ea1bd;">Informação que faz bem para a sua saúde.</p>
      </td>
      <td width="32%" valign="top" style="padding:0 10px;">
        <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#cdd9ea;">Siga o PontoFarma</p>
        <table cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td style="padding-right:8px;"><a href="#" style="display:block;width:34px;height:34px;line-height:34px;text-align:center;border-radius:50%;border:1px solid #33465f;color:#cdd9ea;font-size:12px;font-weight:700;text-decoration:none;">IG</a></td>
          <td style="padding-right:8px;"><a href="#" style="display:block;width:34px;height:34px;line-height:34px;text-align:center;border-radius:50%;border:1px solid #33465f;color:#cdd9ea;font-size:14px;font-weight:700;text-decoration:none;">f</a></td>
          <td><a href="#" style="display:block;width:34px;height:34px;line-height:34px;text-align:center;border-radius:50%;border:1px solid #33465f;color:#cdd9ea;font-size:11px;font-weight:700;text-decoration:none;">in</a></td>
        </tr></table>
      </td>
      <td width="24%" valign="top" align="right">
        <div style="font-size:24px;">💙</div>
        <p style="margin:4px 0 0;font-size:11px;line-height:1.5;color:#8ea1bd;">Obrigado por fazer parte da comunidade!</p>
      </td>
    </tr></table>
  </td></tr>
</table>
$ftr$
)
WHERE NOT EXISTS (SELECT 1 FROM newsletter_templates WHERE name = 'PontoFarma — Rica (tela cheia)');

-- ── Campanha "Boas-vindas PontoFarma (rica)" (RASCUNHO) ─────────────────────
INSERT INTO newsletter_campaigns (subject, body_html, status, template_id)
SELECT
  'Seja muito bem-vindo(a) ao PontoFarma! 💊',
  $body$
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;background:#0e2341;">
  <tr>
    <td width="52%" valign="middle" style="padding:38px 10px 38px 34px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
      <h1 style="margin:0 0 14px;font-size:34px;line-height:1.12;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Seja muito<br><span style="color:#4ec7d6;">bem-vindo(a)!</span></h1>
      <div style="width:46px;height:3px;background:#1a8a9e;margin:0 0 18px;"></div>
      <p style="margin:0 0 12px;font-size:16px;line-height:1.5;font-weight:700;color:#eaf1fb;">É um prazer ter você na comunidade do PontoFarma.</p>
      <p style="margin:0;font-size:14px;line-height:1.65;color:#b9c6dc;">Aqui você encontra informação confiável, atualizada e de fácil compreensão sobre saúde, medicamentos, prevenção e novidades do setor farmacêutico.</p>
    </td>
    <td width="48%" valign="middle" align="center" style="padding:26px 30px 26px 12px;">
      <img src="COLOQUE_A_IMAGEM_AQUI" width="250" alt="hero" style="display:block;width:100%;max-width:250px;height:auto;border:3px solid #1a8a9e;border-radius:20px;" />
    </td>
  </tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;background:#ffffff;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <tr><td style="padding:36px 30px 8px;text-align:center;">
    <h2 style="margin:0 0 8px;font-size:21px;font-weight:800;color:#0e2341;">O que você vai encontrar por aqui:</h2>
    <div style="width:44px;height:3px;background:#1a8a9e;margin:0 auto 24px;"></div>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
      <td width="20%" valign="top" style="padding:0 6px;text-align:center;"><div style="width:56px;height:56px;line-height:56px;border-radius:50%;background:#e6f2f4;font-size:24px;margin:0 auto 10px;">📰</div><p style="margin:0 0 5px;font-size:13px;font-weight:700;color:#0e2341;line-height:1.3;">Notícias relevantes</p><p style="margin:0;font-size:11px;line-height:1.5;color:#7a8aa0;">O que acontece em saúde e medicamentos.</p></td>
      <td width="20%" valign="top" style="padding:0 6px;text-align:center;"><div style="width:56px;height:56px;line-height:56px;border-radius:50%;background:#e6f2f4;font-size:24px;margin:0 auto 10px;">📖</div><p style="margin:0 0 5px;font-size:13px;font-weight:700;color:#0e2341;line-height:1.3;">Conteúdos completos</p><p style="margin:0;font-size:11px;line-height:1.5;color:#7a8aa0;">Guias e artigos claros e confiáveis.</p></td>
      <td width="20%" valign="top" style="padding:0 6px;text-align:center;"><div style="width:56px;height:56px;line-height:56px;border-radius:50%;background:#e6f2f4;font-size:24px;margin:0 auto 10px;">💓</div><p style="margin:0 0 5px;font-size:13px;font-weight:700;color:#0e2341;line-height:1.3;">Dicas para o dia a dia</p><p style="margin:0;font-size:11px;line-height:1.5;color:#7a8aa0;">Orientações práticas de bem-estar.</p></td>
      <td width="20%" valign="top" style="padding:0 6px;text-align:center;"><div style="width:56px;height:56px;line-height:56px;border-radius:50%;background:#e6f2f4;font-size:24px;margin:0 auto 10px;">💊</div><p style="margin:0 0 5px;font-size:13px;font-weight:700;color:#0e2341;line-height:1.3;">Medicamentos e tratamentos</p><p style="margin:0;font-size:11px;line-height:1.5;color:#7a8aa0;">Indicações, cuidados e muito mais.</p></td>
      <td width="20%" valign="top" style="padding:0 6px;text-align:center;"><div style="width:56px;height:56px;line-height:56px;border-radius:50%;background:#e6f2f4;font-size:24px;margin:0 auto 10px;">🧪</div><p style="margin:0 0 5px;font-size:13px;font-weight:700;color:#0e2341;line-height:1.3;">Novidades do setor</p><p style="margin:0;font-size:11px;line-height:1.5;color:#7a8aa0;">Pesquisas, lançamentos e tendências.</p></td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:24px 30px 30px;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#e6f2f4;border-radius:14px;"><tr>
      <td width="34%" valign="middle" align="center" style="padding:20px 6px 20px 18px;font-size:56px;">✉️</td>
      <td width="66%" valign="middle" style="padding:20px 22px 20px 6px;">
        <h3 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#0e2341;">Conteúdos feitos para você!</h3>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#4d5c72;">Nossa missão é ajudar você a tomar decisões mais conscientes sobre a sua saúde todos os dias.</p>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:0 30px 6px;">
    <h2 style="margin:0 0 4px;font-size:21px;font-weight:800;color:#0e2341;">Comece agora a explorar!</h2>
    <p style="margin:0 0 18px;font-size:13px;color:#7a8aa0;">Nossas publicações mais recentes, direto do blog.</p>
    {{artigos:3}}
  </td></tr>
  <tr><td style="padding:22px 30px 34px;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#0e2341;border-radius:14px;"><tr>
      <td width="60%" valign="middle" style="padding:22px 10px 22px 26px;"><p style="margin:0;font-size:18px;font-weight:800;line-height:1.3;color:#ffffff;">Acesse agora e aproveite todo o conteúdo do blog!</p></td>
      <td width="40%" valign="middle" align="center" style="padding:22px 26px 22px 10px;"><a href="https://pontofarma.midia.run" style="display:inline-block;background:#1a8a9e;color:#ffffff;text-decoration:none;font-weight:800;font-size:14px;letter-spacing:0.4px;padding:14px 26px;border-radius:9px;">IR PARA O BLOG</a></td>
    </tr></table>
  </td></tr>
</table>
$body$,
  'draft',
  (SELECT id FROM newsletter_templates WHERE name = 'PontoFarma — Rica (tela cheia)' ORDER BY id LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM newsletter_campaigns WHERE subject = 'Seja muito bem-vindo(a) ao PontoFarma! 💊');

-- Conferência
SELECT 'moldura rica' AS o, count(*) FROM newsletter_templates WHERE name = 'PontoFarma — Rica (tela cheia)'
UNION ALL
SELECT 'campanha rica', count(*) FROM newsletter_campaigns WHERE subject = 'Seja muito bem-vindo(a) ao PontoFarma! 💊';
