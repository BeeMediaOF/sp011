import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { getConsent } from "../components/LGPDConsent";

const SESSION_KEY = "bee_session_id";

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

function send(payload: Record<string, unknown>) {
  if (getConsent() !== "accepted") return;
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
}

export function useAnalytics() {
  const [location] = useLocation();
  const enterRef    = useRef<number>(Date.now());
  const prevPathRef = useRef<string>("");
  const articleIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const handler = () => {
      if (getConsent() === "accepted") {
        send({ type: "pageview", path: location, title: document.title,
               referrer: classifyReferrer(document.referrer) });
      }
    };
    window.addEventListener("bee_consent_change", handler);
    return () => window.removeEventListener("bee_consent_change", handler);
  }, [location]);

  useEffect(() => {
    const prev    = prevPathRef.current;
    const elapsed = Math.round((Date.now() - enterRef.current) / 1000);
    if (prev && elapsed > 2) {
      send({ type: "read", path: prev, duration: elapsed,
             articleId: articleIdRef.current });
    }

    articleIdRef.current = undefined;
    prevPathRef.current  = location;
    enterRef.current     = Date.now();
    send({ type: "pageview", path: location, title: document.title,
           referrer: classifyReferrer(document.referrer) });

    const onUnload = () => {
      const dur = Math.round((Date.now() - enterRef.current) / 1000);
      if (dur > 2) {
        send({ type: "read", path: location, duration: dur,
               articleId: articleIdRef.current });
      }
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, [location]);

  function trackCategory(category: string) {
    send({ type: "category", path: location, category });
  }

  function trackArticle(articleId: string, title: string, category: string) {
    articleIdRef.current = articleId;
    send({ type: "pageview", path: location, title, articleId, category,
           referrer: classifyReferrer(document.referrer) });
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
    const onScroll = () => {
      const el = document.documentElement;
      const total = el.scrollHeight - el.clientHeight;
      if (total <= 0) return;
      const pct = Math.floor((el.scrollTop / total) * 100);
      for (const m of [25, 50, 75, 100]) {
        if (pct >= m && !milestones.current.has(m)) {
          milestones.current.add(m);
          send({ type: "scroll", path: location, scrollDepth: m, articleId });
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [location, articleId]);
}
