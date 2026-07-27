# Manual de Replicação — Integrações LabNews Pro / BeeMedia

Documento técnico para reconstruir o mesmo comportamento de integrações
(CMS + Redes Sociais) observado no painel `app.labnews.pro`.

## 1. Arquitetura geral

- **Frontend:** SPA (rota hash `#/settings?tab=integrations&scope=panel`).
- **Backend:** Supabase + Edge Functions. A função central observada é
  `POST https://<project>.supabase.co/functions/v1/organization-panel-admin`
  (usada para listar/salvar/testar/desconectar integrações).
- **Multi-tenant (Modo Agência):** cada "painel" guarda suas **próprias**
  integrações, independentes entre si. A conexão é sempre salva no painel ativo.
- **Cards de integração** têm 4 ações:
  1. **Testar Agora** — valida a comunicação com a plataforma.
  2. **Abrir externo (↗)** — link para a doc/painel da plataforma.
  3. **Configurar (engrenagem)** — abre o modal com as credenciais.
  4. **Desconectar (X)** — remove/inativa a conexão (cuidado!).
- Cada modal tem um toggle **"Publicação Automática"** (publicar posts
  automaticamente nessa plataforma) + botões **Manual / Cancelar / Salvar**.
- Status exibido no card: badge **ONLINE** + "Publicação Automática Ativa".

## 2. Integração WordPress (CMS)

**Mecanismo:** REST API do WordPress com **Application Passwords** (Basic Auth).

**Campos do modal "Configurar WordPress":**
| Campo                | Exemplo / formato            | Obrigatório |
|----------------------|------------------------------|-------------|
| URL do Site          | `https://meusite.com` (HTTPS)| sim         |
| Usuário              | `admin` ou e-mail            | sim         |
| Application Password | `xxxx xxxx xxxx xxxx` (24c)  | sim         |
| Publicação Automática| toggle on/off                | —           |

**Como gerar a credencial (lado WordPress):**
WP-Admin → Usuários → Perfil → seção *Senhas de Aplicativo* → nome
"LabNews Pro" → Adicionar → copiar a senha de 24 caracteres (exibida 1x).

**O que o sistema faz ao publicar:** envia post (HTML), faz upload da imagem
destacada, sincroniza categorias/tags, preenche SEO (Rank Math/Yoast/SEOPress),
incorpora vídeos e grava o link do post publicado.

**Erros tratados:** 401 (credenciais/firewall bloqueando Basic Auth),
403 (usuário sem permissão de publicar — exigir Admin/Editor).

## 3. Integração Blogger (CMS)

**Mecanismo:** API oficial Google Blogger v3 via OAuth com **Refresh Token**
(o Access Token sozinho expira em 1h — por isso exige refresh token).

**Campos do modal "Configurar Blogger":**
| Campo               | Origem                                   |
|---------------------|------------------------------------------|
| Blog ID             | ID numérico da URL do Blogger            |
| URL do Blog         | `https://seu-blog.blogspot.com`          |
| API Key             | GCP → Credenciais → Chave de API         |
| OAuth Client ID     | GCP → Credenciais → ID cliente OAuth (Web)|
| OAuth Client Secret | idem                                     |
| Refresh Token       | OAuth Playground (`1//0g...`)            |

**Setup Google Cloud:** ativar *Blogger API v3* → tela de consentimento OAuth
(Externo, adicionar e-mail como usuário de teste) → criar credencial tipo
*Aplicativo Web* com redirect `https://developers.google.com/oauthplayground`.
O Refresh Token é obtido no OAuth Playground usando as próprias credenciais
e o escopo `https://www.googleapis.com/auth/blogger`.

## 4. Integração Site Externo (PHP/API)

**Mecanismo:** site customizado via **REST API ou Webhooks**. Status observado:
ONLINE / Publicação Automática Ativa. Mesma estrutura de card (Testar/Configurar/
Desconectar) e toggle de publicação automática.

## 5. Integração Meta — Facebook + Instagram (Redes Sociais)  ⭐ FOCO

**Mecanismo:** login OAuth oficial da Meta via **popup**, usando um app criado
no Meta Developers. O fluxo replica exatamente o popup da Meta.

**Campos do modal "Configurar Meta (Facebook + Instagram)":**
| Campo                 | Exemplo / nota                                  |
|-----------------------|-------------------------------------------------|
| App ID                | ex.: `819328061112128` (visível)                |
| App Secret            | mascarado                                       |
| Conta ativa da Meta   | mostra a conta vinculada (ex.: Instagram @...)  |
| Botão "Selecionar conta" | **dispara o popup OAuth da Meta**            |
| Publicação Automática | toggle on/off                                   |

**Fluxo OAuth (replicar igual):**
1. Usuário informa **App ID** + **App Secret** e salva.
2. Sistema abre o **popup oficial da Meta** para login/autorização.
3. **Callback OAuth fixo** (no Meta Developers, OAuth Redirect URI):
   `https://app.labnews.pro/meta-auth-complete.html`
   > Importante: o callback deve apontar para o domínio do app oficial,
   > **nunca** para um domínio white-label do cliente. (Adapte para o domínio
   > do **seu** app oficial ao replicar.)
4. Após autorizar, o usuário clica em **"Selecionar páginas/conta"** e escolhe
   a Página do Facebook; se ela tiver Instagram Business vinculado, o sistema
   detecta o Instagram automaticamente no mesmo canal.
5. **Testar Agora** valida a comunicação.

**Permissões (scopes) do app Meta:**
`pages_show_list`, `pages_read_engagement`, `pages_manage_posts`,
`instagram_basic`, `instagram_content_publish`, `business_management`.

**Pré-requisitos:** conta com acesso real à Página + Instagram **Business**
vinculado à Página dentro do Business Manager. Conta errada no popup → lista de
páginas vem vazia. Se o popup não abrir → liberar popups/desativar bloqueadores.

**Multi-painel:** em Modo Agência, a conexão Meta é feita dentro do painel
operacional desejado (não na Central da Agência); cada painel publica só com os
canais Meta salvos nele.

## 6. Checklist para reproduzir no seu sistema

- [ ] Backend com endpoint para `list/save/test/disconnect` por painel (tenant).
- [ ] Cards com 4 ações (Testar / Abrir / Configurar / Desconectar) + toggle
      "Publicação Automática" + badge de status ONLINE.
- [ ] WordPress: Basic Auth (URL + usuário + Application Password) via REST API.
- [ ] Blogger: OAuth com Refresh Token + API Key (Blogger API v3).
- [ ] Site Externo: REST API / Webhooks.
- [ ] Meta: app no Meta Developers, App ID/Secret, **popup OAuth** com callback
      em `…/meta-auth-complete.html`, seleção de Página + Instagram Business,
      scopes acima. O comportamento de "abrir popup da Meta" deve ser idêntico.
- [ ] Isolamento por painel: cada painel guarda suas próprias credenciais.