import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { getConsent } from "../components/LGPDConsent";

const SESSION_KEY = "bee_session_id";
const REF_KEY     = "bee_ref_done";
/** Teto de duração de leitura — aba esquecida aberta não vira "leitura" de horas. */
const MAX_READ_SECONDS = 1800;
/** Painel admin não é audiência do site. */
const ADMIN_RE   = /^\/admin(\/|$)/;
/** Páginas de artigo: o pageview sai de trackArticle (com id/categoria/título) —
 *  enviar também o pageview genérico contaria cada visita em dobro. */
const ARTICLE_RE = /^\/artigo\//;

function getSessionId(): string {
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

function classifyReferrer(ref: string): string {
  if (!ref) return "direto";
  if (/google\.|bing\.|yahoo\.|duckduckgo\.|baidu\./i.test(ref)) return "busca";
  if (/facebook|instagram|twitter|x\.com|whatsapp|t\.me|telegram|linkedin|tiktok|youtube/i.test(ref)) return "social";
  return "outro";
}

/** Origem é atribuída por SESSÃO: só o primeiro pageview enviado carrega referrer.
 *  document.referrer não muda em navegação SPA — reenviar a cada página
 *  multiplicaria a origem pelo nº de páginas vistas na sessão. */
function takeReferrer(): string | null {
  try {
    if (sessionStorage.getItem(REF_KEY)) return null;
  } catch { /* ignore */ }
  return classifyReferrer(document.referrer);
}

function markReferrerDone(): void {
  try { sessionStorage.setItem(REF_KEY, "1"); } catch { /* ignore */ }
}

/** Retorna true se o evento foi de fato despachado (consentimento aceito). */
function send(payload: Record<string, unknown>): boolean {
  if (getConsent() !== "accepted") return false;
  const data = { ...payload, sessionId: getSessionId() };
  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      "/api/analytics/event",
      new Blob([JSON.stringify(data)], { type: "application/json" }),
    );
  } else {
    fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      keepalive: true,
    }).catch(() => {});
  }
  return true;
}

/** Pageview com referrer de sessão: marca como consumido só se o envio passou
 *  pelo gate de consentimento (senão a origem se perderia para sempre). */
function sendPageview(extra: Record<string, unknown>): void {
  const ref = takeReferrer();
  const ok = send({ type: "pageview", ...(ref ? { referrer: ref } : {}), ...extra });
  if (ok && ref) markReferrerDone();
}

export function useAnalytics() {
  const [location] = useLocation();
  const enterRef    = useRef<number>(Date.now());
  const prevPathRef = useRef<string>("");
  const articleIdRef = useRef<string | undefined>(undefined);

  // Consentimento aceito no meio da navegação: registra a página atual.
  useEffect(() => {
    const handler = () => {
      if (ADMIN_RE.test(location)) return;
      sendPageview({ path: location, title: document.title, articleId: articleIdRef.current });
    };
    window.addEventListener("bee_consent_change", handler);
    return () => window.removeEventListener("bee_consent_change", handler);
  }, [location]);

  useEffect(() => {
    const prev    = prevPathRef.current;
    const elapsed = Math.round((Date.now() - enterRef.current) / 1000);
    if (prev && !ADMIN_RE.test(prev) && elapsed > 2) {
      send({ type: "read", path: prev, duration: Math.min(elapsed, MAX_READ_SECONDS),
             articleId: articleIdRef.current });
    }

    articleIdRef.current = undefined;
    prevPathRef.current  = location;
    enterRef.current     = Date.now();
    if (!ADMIN_RE.test(location) && !ARTICLE_RE.test(location)) {
      sendPageview({ path: location, title: document.title });
    }

    const onUnload = () => {
      if (ADMIN_RE.test(location)) return;
      const dur = Math.round((Date.now() - enterRef.current) / 1000);
      if (dur > 2) {
        send({ type: "read", path: location, duration: Math.min(dur, MAX_READ_SECONDS),
               articleId: articleIdRef.current });
      }
    };
    // Volta do bfcache: zera o relógio — o read até o pagehide já foi enviado;
    // sem isso o tempo fora da página contaria de novo na próxima navegação.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) enterRef.current = Date.now();
    };
    window.addEventListener("pagehide", onUnload);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pagehide", onUnload);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [location]);

  function trackCategory(category: string) {
    send({ type: "category", path: location, category });
  }

  function trackArticle(articleId: string, title: string, category: string) {
    articleIdRef.current = articleId;
    sendPageview({ path: location, title, articleId, category });
  }

  function trackShare(platform: string) {
    send({ type: "share", path: location, platform,
           articleId: articleIdRef.current });
  }

  return { trackCategory, trackArticle, trackShare };
}

function sendBehavior(payload: Record<string, unknown>) {
  if (getConsent() !== "accepted") return;
  const data = { ...payload, sessionId: getSessionId() };
  fetch("/api/analytics/behavior", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    keepalive: true,
  }).catch(() => {});
}

export function trackSearch(query: string) {
  if (!query.trim()) return;
  sendBehavior({ eventType: "search", value: query.trim().slice(0, 200) });
}

export function trackLinkClick(url: string, articleId?: string) {
  sendBehavior({ eventType: "link_click", value: url.slice(0, 500), articleId });
}

/** Track scroll depth milestones (25/50/75/100%) on article pages. */
export function useScrollDepth(articleId: string | undefined) {
  const [location] = useLocation();
  const milestones  = useRef(new Set<number>());

  useEffect(() => {
    milestones.current.clear();
    const fire = (m: number) => {
      milestones.current.add(m);
      send({ type: "scroll", path: location, scrollDepth: m, articleId });
    };
    const onScroll = () => {
      const el = document.documentElement;
      const total = el.scrollHeight - el.clientHeight;
      if (total <= 0) return;
      const pct = Math.floor((el.scrollTop / total) * 100);
      for (const m of [25, 50, 75, 100]) {
        if (pct >= m && !milestones.current.has(m)) fire(m);
      }
    };
    // Artigo mais curto que a viewport nunca dispara scroll: se depois do
    // conteúdo renderizar não há o que rolar, o leitor já viu 100%.
    let shortTimer: number | undefined;
    if (articleId) {
      shortTimer = window.setTimeout(() => {
        const el = document.documentElement;
        if (el.scrollHeight - el.clientHeight <= 0) {
          for (const m of [25, 50, 75, 100]) {
            if (!milestones.current.has(m)) fire(m);
          }
        }
      }, 3000);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (shortTimer !== undefined) window.clearTimeout(shortTimer);
    };
  }, [location, articleId]);
}
