/**
 * trackingContext — estado de sessão/ambiente compartilhado entre o SDK de
 * analytics (hooks/useAnalytics) e as rotas de anúncio (components/ads/useAds).
 * Centraliza a chave de sessão (bee_session_id) e a decisão de "tráfego interno"
 * para não haver cópias divergentes espalhadas (PRD 02 RF7). A lógica de decisão
 * PURA (sem DOM no escopo de módulo, testável com `tsx --test`) vive em
 * analyticsClient.ts — aqui só o acesso a storage/window/import.meta.
 */
import { hasAdminPreviewParam } from "./analyticsClient";

const SESSION_KEY = "bee_session_id";
const ADMIN_PREVIEW_KEY = "bee_admin_preview";

/** Id de sessão do SDK (chave bee_session_id, em sessionStorage — a "sessão" de
 *  todo o sistema é a ABA). Reusado pelas rotas de anúncio para o dedup
 *  server-side (PRD 04) sem duplicar a chave. */
export function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

/** Marca a aba como prévia do admin quando a URL de ENTRADA tem ?adminPreview=1.
 *  A marca persiste na navegação SPA dentro da aba/iframe (o param some da URL ao
 *  navegar) — por isso é gravada uma única vez no mount do useAnalytics, antes de
 *  qualquer envio. */
export function captureAdminPreviewOnce(): void {
  try {
    if (sessionStorage.getItem(ADMIN_PREVIEW_KEY) === "1") return;
    if (hasAdminPreviewParam(window.location.search)) {
      sessionStorage.setItem(ADMIN_PREVIEW_KEY, "1");
    }
  } catch { /* storage indisponível — janela residual aceita (§11) */ }
}

/** Tráfego interno: ambiente dev, admin logado neste navegador OU prévia do admin
 *  (?adminPreview=1 capturado nesta aba). O servidor grava o evento MARCADO
 *  (auditável) e o exclui das métricas públicas — marcado, nunca dropado
 *  (invariante §17). Unifica os antigos isInternalClient()/isInternalTraffic(). */
export function isInternalContext(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    if (localStorage.getItem("admin_token")) return true;
  } catch { /* ignore */ }
  try {
    if (sessionStorage.getItem(ADMIN_PREVIEW_KEY) === "1") return true;
  } catch { /* ignore */ }
  return false;
}
