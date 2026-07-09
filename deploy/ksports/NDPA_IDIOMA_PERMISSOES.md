# KSports — NDPA + idioma do painel + permissões (go-live)

Entregável das 3 frentes do spec `ksports-ndpa-idioma-validacao-permissoes.md`.
Tudo isolado no blog KSports; os demais blogs seguem inalterados.

Commits (imagem do blog): `c16bde2` (permissões), `f33f8ff` (idioma do painel),
`0f35df5` (NDPA/consentimento).

> ⚠️ **Validação jurídica pendente.** O texto NDPA abaixo é um rascunho técnico,
> **não é aconselhamento jurídico**. Um advogado/DPO habilitado na Nigéria deve
> revisar antes de publicar (identidade do controlador, bases legais, prazos de
> retenção, transferências internacionais e o registro na NDPC).

---

## 1. Deploy (imagem do blog — cobre as 3 fases)

```bash
cd /opt/sp011
git pull
sed -i 's/^BLOG_IMAGE_VERSION=.*/BLOG_IMAGE_VERSION=v23/' .env
docker compose build api web
docker compose up -d
sed -i 's/^BLOG_IMAGE_TAG=.*/BLOG_IMAGE_TAG=v23/' /opt/blogs/ksports/.env
cd /opt/blogs/ksports && docker compose up -d
```

Sem mudança na central. `git pull` traz tudo até aqui; ajuste o número da versão
se o seu último tag não for o v22.

O boot roda `ensureSchema` e cria sozinho a coluna `users.language`
(`ADD COLUMN IF NOT EXISTS ... DEFAULT 'pt-BR'`) — sem passo manual de migração.

---

## 2. Permissões — deixar o Editor da KSports restrito às 5 áreas

Rodar em `/opt/sp011` (banco do blog = `ksports`). Antes, abra uma vez
**Configurações → Permissões** como admin (BeeMedia) para semear as 24 chaves.

```bash
docker compose exec -T pg-blogs psql -U postgres -d ksports -c "UPDATE role_permissions SET enabled = permission_key IN ('dashboard.view','analytics.view','menu.view','menu.edit','social.view','social.manage','settings.view'), updated_at = now() WHERE role='editor';"
```

Conferir:

```bash
docker compose exec -T pg-blogs psql -U postgres -d ksports -c "SELECT permission_key, enabled FROM role_permissions WHERE role='editor' ORDER BY enabled DESC, permission_key;"
```

---

## 3. Usuário KSports — inglês por padrão + papel editor

O usuário **cliente** da KSports deve ser `editor` (a BeeMedia mantém a conta
`admin`). O idioma normalmente é trocado pelo próprio usuário em **Meu Perfil**
(sem banco); esta é só a inicialização única do padrão inglês.

```bash
# troque o e-mail pelo do usuario cliente da KSports
docker compose exec -T pg-blogs psql -U postgres -d ksports -c "UPDATE users SET language='en', role='editor', updated_at=now() WHERE email='CLIENTE@ksports.example';"
```

> ⚠️ Garanta que **exista pelo menos uma conta admin ativa** (a da BeeMedia)
> antes de rebaixar o cliente — o SQL bruto ignora a trava de último admin da API.
> Conferir: `... -c "SELECT email, role, status, language FROM users ORDER BY role;"`

---

## 4. Textos legais NDPA (colar no painel — não hardcoded)

Em **Configurações → Contato & Redes**:

1. **Dados Legais → E-mail de privacidade (DPO):** o e-mail do responsável por
   dados (ex.: `privacy@ksports…`). Aparece em `/privacidade` e `/contato`.
2. **Textos Legais → Política de Privacidade:** colar o HTML do §4.1.
3. **Textos Legais → Termos de Uso:** colar o HTML do §4.2.

Enquanto os campos ficam vazios, o site usa o template genérico em inglês
(fallback) — nada quebra. Ao preencher, o `/privacidade` e `/termos` da KSports
passam a mostrar o texto NDPA (sanitizado), só neste blog.

### 4.1 Política de Privacidade + Cookies (rascunho NDPA, inglês)

```html
<p><strong>Last updated: [DATE]</strong></p>
<p>This Privacy &amp; Cookie Policy explains how KSports ("we", "us", "our")
collects, uses, shares and protects personal data of visitors ("you"), in
accordance with the <strong>Nigeria Data Protection Act, 2023 (NDPA)</strong>
and guidance issued by the Nigeria Data Protection Commission (NDPC).</p>

<h2>1. Data Controller</h2>
<p>KSports is the data controller responsible for your personal data. For any
privacy request or question, contact our Data Protection Officer / privacy
contact at <strong>[PRIVACY EMAIL]</strong>.</p>

<h2>2. Personal data we collect</h2>
<ul>
  <li><strong>Usage &amp; device data</strong> — pages viewed, approximate
  location (from IP), browser, operating system and referral source, collected
  through cookies and analytics after you consent.</li>
  <li><strong>Contact data</strong> — name, email and message when you use our
  contact form.</li>
  <li><strong>Newsletter data</strong> — email address when you subscribe.</li>
</ul>

<h2>3. Lawful basis for processing (NDPA s. 25)</h2>
<ul>
  <li><strong>Consent</strong> — for non-essential cookies, analytics and
  advertising technologies, and for newsletter emails. You may withdraw consent
  at any time.</li>
  <li><strong>Legitimate interest</strong> — to keep the site secure, prevent
  abuse and understand aggregate audience trends.</li>
  <li><strong>Legal obligation</strong> — where we must retain or disclose data
  to comply with applicable law.</li>
</ul>

<h2>4. Cookies and tracking</h2>
<p>Essential cookies are needed for the site to work. Analytics and advertising
technologies (e.g. Google Analytics, Google Tag Manager, Meta Pixel) load
<strong>only after you click "Accept"</strong> on our cookie banner. If you
reject or ignore the banner, these technologies are not loaded. You can change
your choice at any time by clearing this site's cookies in your browser, which
brings the banner back.</p>

<h2>5. How we use your data</h2>
<p>To operate and improve the site, measure audience, respond to your messages,
send our newsletter (if you subscribed), and comply with legal duties. We do not
sell your personal data.</p>

<h2>6. Sharing and international transfers</h2>
<p>We may share data with service providers that help us run the site (analytics
and advertising providers, hosting and email delivery). Some of these providers
process data outside Nigeria. Where personal data is transferred abroad, we rely
on the adequacy and safeguard mechanisms permitted under the NDPA.</p>

<h2>7. Data retention</h2>
<p>We keep personal data only as long as necessary for the purposes above or as
required by law, after which it is deleted or anonymised.</p>

<h2>8. Your rights under the NDPA</h2>
<p>Subject to the Act, you have the right to: access your data; request
correction or erasure; restrict or object to processing; withdraw consent;
request data portability; and lodge a complaint with the
<strong>Nigeria Data Protection Commission (NDPC)</strong>. To exercise any
right, email <strong>[PRIVACY EMAIL]</strong>. We respond within the timeframe
required by the NDPA.</p>

<h2>9. Security</h2>
<p>We apply reasonable technical and organisational measures (encryption in
transit, access controls) to protect personal data. No method is 100% secure,
but we work to safeguard your information.</p>

<h2>10. Children</h2>
<p>The site is not directed to children under the age of consent under Nigerian
law. We do not knowingly collect their data; contact us to request removal.</p>

<h2>11. Changes and contact</h2>
<p>We may update this policy; the "Last updated" date shows the latest version.
For any privacy matter, contact our DPO / privacy contact at
<strong>[PRIVACY EMAIL]</strong>.</p>
```

### 4.2 Termos de Uso (rascunho, inglês)

```html
<p><strong>Last updated: [DATE]</strong></p>
<p>By accessing and using KSports, you agree to these Terms of Use. If you do not
agree, please do not use the site.</p>

<h2>1. Content</h2>
<p>KSports provides sports news and analysis for general information. We strive
for accuracy but do not warrant that all content is complete or error-free.</p>

<h2>2. Intellectual property</h2>
<p>The content, brand and layout are protected. You may not reproduce or
redistribute material without authorisation, except for personal, non-commercial
use with proper credit and a link to the source.</p>

<h2>3. Acceptable use</h2>
<p>You agree not to misuse the site, attempt to disrupt it, or use it for any
unlawful purpose.</p>

<h2>4. Third-party links</h2>
<p>The site may link to third-party sites. We are not responsible for their
content or practices.</p>

<h2>5. Liability</h2>
<p>To the extent permitted by law, KSports is not liable for any indirect or
consequential loss arising from use of the site.</p>

<h2>6. Governing law</h2>
<p>These Terms are governed by the laws of the Federal Republic of Nigeria.</p>

<h2>7. Contact</h2>
<p>Questions about these Terms: <strong>[CONTACT EMAIL]</strong>.</p>
```

Substitua `[DATE]`, `[PRIVACY EMAIL]`, `[CONTACT EMAIL]` antes de publicar.

---

## 5. O que foi entregue (relatório)

### Fase 1 — Permissões reais em 3 camadas (`c16bde2`)
- **Problema encontrado:** 11 das 24 permissões eram "enfeite" (não bloqueavam
  no backend); o menu lateral e as rotas se contradiziam (itens visíveis que a
  rota bloqueava; páginas abríveis por URL sem checar a permissão).
- **Correção:** guarda de rota `RequirePermission` (`pages/Admin.tsx`) + cache
  único (`lib/permissionsCache.ts`) compartilhado com o menu → **menu, rota e API
  concordam**. Backend passou a exigir a chave certa em `/analytics/stats`
  (analytics.view), `GET /admin/menu` (menu.view), `PUT /admin/settings` +
  `POST /admin/logo` + `PUT /admin/contact` (settings.view). Editor com
  settings.view gerencia o site, mas injeção de script (`customHeadCode/Body`) e
  chaves de IA são retiradas do patch de editor; a tela esconde esses campos, a
  DatabaseCard e as abas Webhook/Segurança/Permissões/Logs/Exclusão.
- **Isolamento entre blogs:** garantido por infraestrutura (container + banco +
  `SESSION_SECRET` próprios por blog; sem `blogId` no app). Um token da KSports só
  vale contra o banco da KSports — não há como alcançar outro blog por URL/ID.
- **Anti-escalonamento:** editor não alcança as rotas de usuários/permissões
  (admin-only); trava nova impede rebaixar/desativar/excluir o último admin ativo.
  Trocas de permissão continuam nos logs de auditoria (`permission_enabled/disabled`).

### Fase 2 — Idioma do painel por usuário (`f33f8ff`)
- Coluna `users.language` (+ `ensureSchema`), carregada/salva em login/2FA/`me`.
- Seletor **Português/English** no **Meu Perfil**; salva no perfil e persiste após
  logout/novo login/outro dispositivo (vem do banco). Não afeta outros usuários.
- `lib/adminI18n.ts` (`useAdminT`) dirigido pelo idioma do usuário. Traduzido o
  **shell** (menu, topbar, notificações, perfil, Acesso Restrito). Corpos das 5
  páginas (Dashboard/Analytics/Menu/Config/Redes) entram por lote — o fallback
  pt-BR garante que nada quebra no meio.

### Fase 3 — NDPA / consentimento (`0f35df5`)
- **Falha corrigida:** GTM/GA4/Meta Pixel carregavam **sem checar o consentimento**
  (o banner era decorativo para scripts de terceiros). Agora só disparam após
  "Aceitar" (global, também corrige a LGPD do BR).
- Páginas legais dirigidas por settings, isoladas por blog (fallback = template).
- Novo campo de contato de privacidade (DPO). Fim do vazamento de e-mail/telefone
  brasileiros fixos no `/contato`.

---

## 6. Testes obrigatórios (16 do spec) — como validar

| # | Teste | Como |
|---|-------|------|
| 1 | KSports em inglês | Login do cliente → painel em inglês (após §3 ou trocar no Meu Perfil) |
| 2 | Outro usuário em pt-BR | Login de outra conta → painel em português |
| 3 | Troca de idioma não afeta os demais | Trocar no Meu Perfil de um; outro segue no idioma dele |
| 4 | Idioma persiste | Logout/login/outro dispositivo → idioma mantido (vem do banco) |
| 5 | Liga/desliga cada permissão | Configurações → Permissões: alternar e recarregar |
| 6 | Ativar/Desativar todas | Por grupo, na tela de Permissões |
| 7 | Persistência das permissões | Recarregar a página + novo login |
| 8 | Contadores ativas/bloqueadas | Conferir no topo da tela de Permissões |
| 9 | Menu oculta o que não tem acesso | Editor KSports vê só as 5 áreas |
| 10 | Bloqueio por URL | Editor abre `…/admin/artigos` → "Acesso Restrito" |
| 11 | Bloqueio na API | `curl -H "Authorization: Bearer <token editor>" …/api/admin/menu` sem menu.view → 403 |
| 12 | Acesso a outro blog | Token da KSports em `…ksports.…/api/*`; contra outro blog não autentica |
| 13 | Alterar a própria permissão | Editor em `PUT /api/admin/permissions/:key` → 403 (admin-only) |
| 14 | Logs de auditoria | Trocar permissão → `permission_enabled/disabled` nos logs |
| 15 | Textos legais do KSports | `/privacidade` e `/termos` mostram o texto NDPA (após §4) |
| 16 | Demais blogs intactos | sp011 sem settings próprias renderiza idêntico (fallback) |

Rodar também, por pacote (Windows): `pnpm run typecheck` e `pnpm run test`
(api-server 31/31, brasilia-agora 32/32). Build de produção (vite) só em Docker.

---

## 7. Pendências / próximos passos

- **Jurídico:** revisão do texto NDPA (§4) por profissional habilitado.
- **Tradução dos corpos** das 5 páginas do admin (Dashboard/Analytics/Menu/
  Configurações/Redes Sociais) — mecanismo pronto; entra por lote, com fallback
  pt-BR nas chaves ainda não traduzidas.
- **Retirada de consentimento (UI):** hoje o visitante retira limpando os cookies
  do site (o banner reaparece). Um botão "Preferências de cookies" reabrindo o
  banner é um refinamento recomendado.
- **Registro de consentimento no servidor:** hoje a escolha fica só no navegador
  (localStorage). Log server-side é uma melhoria opcional.
