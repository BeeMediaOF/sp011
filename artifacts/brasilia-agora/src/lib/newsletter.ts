/**
 * subscribeNewsletter — inscrição na newsletter (PRD-NEWSLETTER-01 RF1).
 *
 * DIFERENTE da métrica `trackNewsletter` (useAnalytics): a inscrição é um ato de
 * consentimento PRÓPRIO de marketing e NÃO passa pelo gate de cookies de
 * analytics — quem recusa cookies mas quer assinar não pode ser descartado
 * (correção do acoplamento indevido; ver 00-investigacao.md). O servidor guarda
 * a prova de consentimento (IP/UA/origem/timestamp) e dispara o double opt-in.
 *
 * Fire-and-forget: o formulário já validou o e-mail localmente e mostra "ok";
 * não bloqueia a UI nem depende da resposta.
 */
export function subscribeNewsletter(email: string, source: "footer" | "home_block"): void {
  const v = email.trim();
  if (!v) return;
  try {
    fetch("/api/newsletter/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: v, source }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore — captura nunca quebra o site */
  }
}
