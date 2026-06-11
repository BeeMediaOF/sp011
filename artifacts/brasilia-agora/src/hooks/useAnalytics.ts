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

function send(payload: Record<string, unknown>) {
  if (getConsent() !== "accepted") return;
  const data = { ...payload, sessionId: getSessionId() };
  // Use sendBeacon for reliability (especially on page unload)
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/analytics/event", JSON.stringify(data));
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
  const enterRef = useRef<number>(Date.now());
  const prevPathRef = useRef<string>("");

  useEffect(() => {
    // On consent change, enable tracking immediately
    const handler = () => {
      if (getConsent() === "accepted") {
        send({ type: "pageview", path: location, title: document.title });
      }
    };
    window.addEventListener("bee_consent_change", handler);
    return () => window.removeEventListener("bee_consent_change", handler);
  }, [location]);

  useEffect(() => {
    // Send time-on-page for previous route
    const prev = prevPathRef.current;
    const elapsed = Math.round((Date.now() - enterRef.current) / 1000);
    if (prev && elapsed > 2) {
      send({ type: "read", path: prev, duration: elapsed });
    }

    // Track new pageview
    prevPathRef.current = location;
    enterRef.current = Date.now();
    send({ type: "pageview", path: location, title: document.title });

    // On unload: send final time-on-page
    const onUnload = () => {
      const dur = Math.round((Date.now() - enterRef.current) / 1000);
      if (dur > 2) send({ type: "read", path: location, duration: dur });
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, [location]);

  // Track article category
  function trackCategory(category: string) {
    send({ type: "category", path: location, category });
  }

  function trackArticle(articleId: string, title: string, category: string) {
    send({ type: "pageview", path: location, title, articleId, category });
  }

  return { trackCategory, trackArticle };
}
