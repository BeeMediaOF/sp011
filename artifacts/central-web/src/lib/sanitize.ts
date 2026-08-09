/**
 * Sanitização de HTML antes de renderizar no painel central (PRD-04b).
 * O conteúdo vem do pipeline de IA (fonte externa reescrita) e do editor
 * manual — nunca deve chegar ao DOM cru (XSS armazenado → sink da cadeia AP-1:
 * exfiltra o central_token do admin). central-web é 100% client-side, então
 * DOMPurify roda sempre (window existe) — não precisa da variante SSR do blog.
 */
import DOMPurify from "dompurify";

/**
 * Players cujo `<iframe>` sobrevive: é o que o bloco "Adicionar vídeo" grava no
 * corpo. Mesma allowlist do sanitizador do ingest
 * (`@workspace/news-engine/sanitize`) e do site
 * (`brasilia-agora/src/lib/sanitize.ts`) — sem ela a prévia daqui mostraria a
 * notícia sem o vídeo que o blog vai publicar.
 */
const VIDEO_EMBED_SRC =
  /^https:\/\/(?:www\.)?(?:youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/|player\.vimeo\.com\/video\/)/i;

export function isVideoEmbedSrc(src: string | null | undefined): boolean {
  return VIDEO_EMBED_SRC.test((src ?? "").trim());
}

export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ["iframe"],
    ADD_ATTR: [
      "allow", "allowfullscreen", "frameborder", "loading", "referrerpolicy",
      "controls", "playsinline", "poster", "preload",
    ],
    // `srcdoc` tem precedência sobre o src: um host permitido com srcdoc
    // executaria markup arbitrário.
    FORBID_ATTR: ["srcdoc"],
  });
  if (!clean.includes("<iframe")) return clean;
  const tpl = document.createElement("template");
  tpl.innerHTML = clean;
  for (const frame of Array.from(tpl.content.querySelectorAll("iframe"))) {
    if (!isVideoEmbedSrc(frame.getAttribute("src"))) frame.remove();
  }
  return tpl.innerHTML;
}
