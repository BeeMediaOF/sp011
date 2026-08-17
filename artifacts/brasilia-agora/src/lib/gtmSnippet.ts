/**
 * Snippet do Google Tag Manager — montado NO SERVIDOR.
 *
 * Por que existe (2026-08-14): o GTM acusava "container não encontrado" mesmo
 * com o ID salvo e o admin mostrando "GTM ativo". O container era injetado só
 * no cliente (`SEOHead.tsx`, dentro de um `useEffect`, adiado para o idle e
 * atrás do "Aceitar" do banner). No HTML servido o `GTM-XXXX` aparecia apenas
 * DENTRO do JSON de hidratação (`"gtmId":"GTM-…"`), como texto — nunca como
 * tag executável. O verificador do GTM (e todo crawler) faz um GET simples, sem
 * rodar JS e sem clicar em banner: não achava nada, e estava certo.
 *
 * Estas funções são puras de propósito: quem as chama é o rewrite de <head> do
 * `vite.config.ts` (`applyHead`), o mesmo funil por onde JÁ passa todo HTML
 * servido pelos 8 blogs — cada um com o `gtmId` do seu próprio /api/site.
 *
 * CONSENTIMENTO: o container passa a carregar para todo visitante, mas o
 * Consent Mode entra ANTES dele negando ad_storage/analytics_storage. O
 * container em si não grava cookie nem dispara tag; as tags de dentro ficam
 * seguradas até o "Aceitar", que o `SEOHead` transforma num `consent update`.
 * É o que permite ser detectável por um GET e continuar sem rastrear antes do
 * aceite — as duas coisas que o modelo anterior não conseguia ao mesmo tempo.
 */

/** Formato do ID de container. Fora dele, nada é injetado (o valor entra
 *  interpolado num <script> inline — ID torto quebraria a página ou abriria
 *  injeção de HTML no <head>). */
const GTM_ID_RE = /^GTM-[A-Z0-9]{4,12}$/;

/** Devolve o ID normalizado (maiúsculas) ou "" se não for um container válido. */
export function sanitizeGtmId(raw: string | undefined | null): string {
  const t = (raw ?? "").trim().toUpperCase();
  return GTM_ID_RE.test(t) ? t : "";
}

/**
 * Chave/valor do banner LGPD (`LGPDConsent.tsx`). Repetidos aqui como string
 * porque este trecho vira JS inline no HTML, não import.
 */
const CONSENT_KEY = "bee_analytics_consent";

/**
 * Tags do `<head>`: defaults de consentimento + carregador do container.
 *
 * A ordem importa — o `consent default` precisa estar na dataLayer ANTES do
 * gtm.js, senão a primeira leva de tags roda sem restrição. O `wait_for_update`
 * dá 500 ms para o update chegar antes de as tags decidirem.
 *
 * O `j.async=true` do snippet oficial é mantido: o container não bloqueia o
 * parser, então não entra no caminho de renderização nem mexe em CLS.
 */
export function gtmHeadTag(id: string): string {
  const gid = sanitizeGtmId(id);
  if (!gid) return "";
  return `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{'ad_storage':'denied','ad_user_data':'denied','ad_personalization':'denied','analytics_storage':'denied','functionality_storage':'granted','security_storage':'granted','wait_for_update':500});
try{if(localStorage.getItem('${CONSENT_KEY}')==='accepted'){gtag('consent','update',{'ad_storage':'granted','ad_user_data':'granted','ad_personalization':'granted','analytics_storage':'granted'});}}catch(e){}</script>
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gid}');</script>
<!-- End Google Tag Manager -->`;
}

/** `<noscript>` que vai logo depois da abertura do `<body>`. */
export function gtmBodyTag(id: string): string {
  const gid = sanitizeGtmId(id);
  if (!gid) return "";
  return `<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${gid}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->`;
}

/**
 * O MESMO container já está no HTML?
 *
 * O operador costuma preencher os dois campos do painel: o "Container ID" e,
 * por segurança, o "Código personalizado" com o snippet inteiro colado do GTM
 * (foi o caso do oleysports). Com o container agora vindo do servidor, injetar
 * o código personalizado por cima carregaria o mesmo container DUAS vezes —
 * pageview dobrado em todos os relatórios. Quem chama usa isto para pular.
 */
/**
 * Coloca as duas tags no documento: o carregador antes de `</head>` e o
 * `<noscript>` logo depois da abertura do `<body>`, que é onde o GTM manda.
 * ID inválido/ausente devolve o HTML intocado.
 */
export function injectGtm(html: string, id: string): string {
  const gid = sanitizeGtmId(id);
  if (!gid) return html;
  const fimHead = html.indexOf("</head>");
  if (fimHead < 0) return html; // documento sem <head>: não há onde ancorar

  /* O `<body>` é procurado SÓ no que vem DEPOIS do `</head>`. O index.html
     traz a string "<body>" dentro de um comentário de script no próprio
     <head> ("os dados foram para o fim do <body>…"), e ancorar no primeiro
     match jogava o <noscript> para dentro daquele script — sem erro nenhum,
     só um GTM que continuaria não sendo encontrado. */
  return html.slice(0, fimHead)
    + `    ${gtmHeadTag(gid)}\n  `
    + html.slice(fimHead).replace(/(<body[^>]*>)/, `$1\n${gtmBodyTag(gid)}`);
}

export function containsGtmContainer(code: string | undefined | null, id: string): boolean {
  const gid = sanitizeGtmId(id);
  if (!gid || !code) return false;
  return code.toUpperCase().includes(gid);
}
