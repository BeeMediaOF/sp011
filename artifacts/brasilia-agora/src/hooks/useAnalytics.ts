import { useEffect, useRef, type RefObject } from "react";
import { useLocation } from "wouter";
import { getConsent } from "../components/LGPDConsent";
import {
  parseUtm, refHostOf, contentScrollPct, newMilestones,
  externalHrefOf, createLinkClickDebouncer, newSharePlatforms, type UtmSignals,
} from "../lib/analyticsClient";
import { getSessionId, isInternalContext, captureAdminPreviewOnce } from "../lib/trackingContext";

const VISITOR_KEY = "bee_visitor_id";
const REF_KEY     = "bee_ref_done";
const UTM_KEY     = "bee_utm";
/** Teto de duração de leitura — aba esquecida aberta não vira "leitura" de horas. */
const MAX_READ_SECONDS = 1800;
/** Heartbeat de leitura: envia a duração ACUMULADA (idempotente no servidor, que
 *  guarda o MAX por sessão+página) — fechar a aba sem pagehide perde no máximo 30s. */
const READ_HEARTBEAT_MS = 30_000;
/** Painel admin não é audiência do site. */
const ADMIN_RE   = /^\/admin(\/|$)/;
/** Páginas de artigo: o pageview sai de trackArticle (com id/categoria/título) —
 *  enviar também o pageview genérico contaria cada visita em dobro. */
const ARTICLE_RE = /^\/artigo\//;

/** Visitante anônimo persistente: UUID aleatório em localStorage, criado SÓ após
 *  o aceite LGPD (sem fingerprinting; rejeitou = nunca existe). */
function getVisitorId(): string | undefined {
  if (getConsent() !== "accepted") return undefined;
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return undefined;
  }
}

/** Captura UTM/gclid da URL DE ENTRADA uma única vez por sessão (navegação SPA
 *  perde a query string). Nada sai do dispositivo antes do consentimento — isto
 *  só guarda em sessionStorage. */
function captureUtmOnce(): void {
  try {
    if (sessionStorage.getItem(UTM_KEY) !== null) return;
    sessionStorage.setItem(UTM_KEY, JSON.stringify(parseUtm(window.location.search)));
  } catch { /* ignore */ }
}

/**
 * Origem é atribuída por SESSÃO: só o primeiro pageview enviado carrega os
 * sinais crus (hostname do referrer + UTM). document.referrer não muda em
 * navegação SPA — reenviar a cada página multiplicaria a origem pelo nº de
 * páginas vistas. `firstTouch: true` marca inclusive a entrada direta sem
 * nenhum sinal (o servidor classifica como "direto").
 */
function takeFirstTouch(): Record<string, unknown> | null {
  try {
    if (sessionStorage.getItem(REF_KEY)) return null;
  } catch { /* ignore */ }
  const out: Record<string, unknown> = { firstTouch: true };
  const host = refHostOf(document.referrer);
  const ownHost = window.location.hostname.toLowerCase().replace(/^www\./, "");
  if (host && host !== ownHost) out["refHost"] = host; // auto-referência não é origem externa
  try {
    const raw = sessionStorage.getItem(UTM_KEY);
    if (raw) {
      const u = JSON.parse(raw) as UtmSignals;
      if (u.utmSource)   out["utmSource"]   = u.utmSource;
      if (u.utmMedium)   out["utmMedium"]   = u.utmMedium;
      if (u.utmCampaign) out["utmCampaign"] = u.utmCampaign;
      if (u.paidClick)   out["paidClick"]   = true;   // legado (bundle antigo)
      if (u.gclid)       out["gclid"]        = true;
      if (u.fbclid)      out["fbclid"]       = true;
    }
  } catch { /* ignore */ }
  return out;
}

function markReferrerDone(): void {
  try { sessionStorage.setItem(REF_KEY, "1"); } catch { /* ignore */ }
}

/** Retorna true se o evento foi de fato despachado (consentimento aceito). */
function send(payload: Record<string, unknown>): boolean {
  if (getConsent() !== "accepted") return false;
  const data: Record<string, unknown> = { ...payload, sessionId: getSessionId() };
  const visitorId = getVisitorId();
  if (visitorId) data["visitorId"] = visitorId;
  if (isInternalContext()) data["internal"] = true;
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

/** Pageview com first-touch de sessão: marca como consumido só se o envio passou
 *  pelo gate de consentimento (senão a origem se perderia para sempre). */
function sendPageview(extra: Record<string, unknown>): void {
  const firstTouch = takeFirstTouch();
  const ok = send({ type: "pageview", ...(firstTouch ?? {}), ...extra });
  if (ok && firstTouch) markReferrerDone();
}

// Dedup de share por (aba, conteúdo): sessionStorage com fallback em memória por
// página (mesma degradação do scroll quando o storage está bloqueado).
const memShares = new Map<string, Set<string>>();
function readShareSet(key: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(key);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return memShares.get(key) ?? new Set<string>();
  }
}
function writeShareSet(key: string, set: Set<string>): void {
  try {
    sessionStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    memShares.set(key, set);
  }
}

export function useAnalytics() {
  const [location] = useLocation();
  const prevPathRef  = useRef<string>("");
  const articleIdRef = useRef<string | undefined>(undefined);
  // Tempo ATIVO VISÍVEL: acumulado (ms) + início do trecho visível corrente.
  // Aba em segundo plano não conta como leitura.
  const activeMsRef     = useRef(0);
  const visibleSinceRef = useRef<number | null>(null);

  // Captura UTM + marca de prévia do admin da URL de entrada antes de qualquer
  // envio (efeitos rodam na ordem de definição — este é o primeiro).
  useEffect(() => { captureAdminPreviewOnce(); captureUtmOnce(); }, []);

  // link_click de SITE INTEIRO: um único listener delegado em capture (não o
  // corpo do artigo isolado). Só conta href http(s) de outro origin, fora de
  // /admin e de qualquer contêiner de anúncio ([data-bee-ad]); debounce de 1s
  // por href (RF2). O gate LGPD/interno é aplicado dentro de trackLinkClick.
  useEffect(() => {
    const debouncer = createLinkClickDebouncer(1000);
    const handler = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const path = window.location.pathname;
      if (ADMIN_RE.test(path)) return;
      if (a.closest("[data-bee-ad]")) return;              // clique de anúncio ≠ link externo
      const href = externalHrefOf(a.href, window.location.origin);
      if (!href) return;
      if (!debouncer.shouldCount(href)) return;
      trackLinkClick(href, ARTICLE_RE.test(path) ? articleIdRef.current : undefined);
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);

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
    const activeSecs = (): number => {
      let ms = activeMsRef.current;
      if (visibleSinceRef.current !== null) ms += Date.now() - visibleSinceRef.current;
      return Math.round(ms / 1000);
    };

    // Leitura da página ANTERIOR (navegação SPA) — só o tempo em que esteve visível.
    const prev = prevPathRef.current;
    const prevSecs = activeSecs();
    if (prev && !ADMIN_RE.test(prev) && prevSecs > 2) {
      send({ type: "read", path: prev, duration: Math.min(prevSecs, MAX_READ_SECONDS),
             articleId: articleIdRef.current });
    }

    articleIdRef.current  = undefined;
    prevPathRef.current   = location;
    activeMsRef.current   = 0;
    visibleSinceRef.current = document.hidden ? null : Date.now();

    // Envia a duração CUMULATIVA da página atual (heartbeat/troca de aba/saída).
    const sendReadIfWorth = () => {
      if (ADMIN_RE.test(location)) return;
      const secs = activeSecs();
      if (secs > 2) {
        send({ type: "read", path: location, duration: Math.min(secs, MAX_READ_SECONDS),
               articleId: articleIdRef.current });
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        if (visibleSinceRef.current !== null) {
          activeMsRef.current += Date.now() - visibleSinceRef.current;
          visibleSinceRef.current = null;
        }
        // Aba escondida pode nunca voltar: garante o parcial já acumulado.
        sendReadIfWorth();
      } else {
        visibleSinceRef.current = Date.now();
      }
    };

    const onPageHide = () => { sendReadIfWorth(); };

    // Volta do bfcache: zera o relógio — o read até o pagehide já foi enviado;
    // sem isso o tempo fora da página contaria de novo na próxima navegação.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        activeMsRef.current = 0;
        visibleSinceRef.current = document.hidden ? null : Date.now();
      }
    };

    // Heartbeat: fechamento abrupto (sem pagehide) perde no máximo 30s de leitura.
    const heartbeat = window.setInterval(() => {
      if (!document.hidden) sendReadIfWorth();
    }, READ_HEARTBEAT_MS);

    if (!ADMIN_RE.test(location) && !ARTICLE_RE.test(location)) {
      sendPageview({ path: location, title: document.title });
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      window.clearInterval(heartbeat);
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
    // 1× por (aba, conteúdo, plataforma): repetir a MESMA plataforma não é novo
    // compartilhamento; plataforma diferente conta (RF4).
    const key = `bee_share_${articleIdRef.current ?? location}`;
    const already = readShareSet(key);
    if (newSharePlatforms(platform, already).length === 0) return;
    already.add(platform);
    writeShareSet(key, already);
    send({ type: "share", path: location, platform, articleId: articleIdRef.current });
  }

  return { trackCategory, trackArticle, trackShare };
}

function sendBehavior(payload: Record<string, unknown>) {
  if (getConsent() !== "accepted") return;
  const data: Record<string, unknown> = { ...payload, sessionId: getSessionId() };
  if (isInternalContext()) data["internal"] = true;
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

/** Adesão à newsletter DENTRO do gate (RF1/QUICK WIN LGPD): antes os formulários
 *  faziam fetch direto a /behavior sem consentimento e sem marcação interna. O
 *  e-mail (dado pessoal) só sai com aceite; inscrição de admin vai internal:true
 *  (servidor descarta). É SÓ métrica — não há backend de mailing (§11). */
export function trackNewsletter(email: string) {
  const v = email.trim();
  if (!v) return;
  sendBehavior({ eventType: "newsletter", value: v.slice(0, 200) });
}

/**
 * Scroll depth (25/50/75/100%) relativo ao BLOCO DE CONTEÚDO quando `contentRef`
 * é passado (cabeçalho/lateral/rodapé não contam); cai para a página inteira sem
 * ref. Dedup por sessão+artigo em sessionStorage — remount/re-navegação no mesmo
 * artigo NÃO dispara de novo.
 */
export function useScrollDepth(
  articleId: string | undefined,
  contentRef?: RefObject<HTMLElement | null>,
  opts?: { waitForId?: boolean },
) {
  const [location] = useLocation();

  useEffect(() => {
    // RF3: em artigo (waitForId), não instala NADA até o articleId resolver —
    // rolar durante o skeleton não grava marcos sob a chave `path` que depois
    // seriam recontados sob a chave `articleId` (dupla contagem, item 18).
    if (opts?.waitForId && articleId === undefined) return;

    const storeKey = articleId ? `bee_scroll_${articleId}` : `bee_scroll_p:${location}`;
    const fired = new Set<number>();
    try {
      const raw = sessionStorage.getItem(storeKey);
      if (raw) {
        for (const n of JSON.parse(raw) as number[]) {
          if (n === 25 || n === 50 || n === 75 || n === 100) fired.add(n);
        }
      }
    } catch { /* storage indisponível → dedup só por mount (fallback) */ }

    const fire = (m: number) => {
      fired.add(m);
      try { sessionStorage.setItem(storeKey, JSON.stringify([...fired])); } catch { /* ignore */ }
      send({ type: "scroll", path: location, scrollDepth: m, articleId });
    };

    const measurePct = (): number | null => {
      const el = contentRef?.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const contentTop = rect.top + window.scrollY;
        return contentScrollPct(window.scrollY + window.innerHeight, contentTop, rect.height);
      }
      const doc = document.documentElement;
      const total = doc.scrollHeight - doc.clientHeight;
      if (total <= 0) return null;
      return Math.floor((doc.scrollTop / total) * 100);
    };

    const onScroll = () => {
      const pct = measurePct();
      if (pct === null) return;
      for (const m of newMilestones(pct, fired)) fire(m);
    };

    // Artigo mais curto que a viewport nunca dispara scroll: mede uma vez após o
    // conteúdo assentar — com contentRef o próprio measurePct devolve 100.
    let shortTimer: number | undefined;
    if (articleId) {
      shortTimer = window.setTimeout(() => {
        onScroll();
        if (!contentRef?.current) {
          const doc = document.documentElement;
          if (doc.scrollHeight - doc.clientHeight <= 0) {
            for (const m of newMilestones(100, fired)) fire(m);
          }
        }
      }, 3000);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (shortTimer !== undefined) window.clearTimeout(shortTimer);
    };
  }, [location, articleId, contentRef]);
}
