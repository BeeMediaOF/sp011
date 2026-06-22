import React, { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";

const VAPID_URL = "/api/push/vapid-public-key";

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buf = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < rawData.length; i++) view[i] = rawData.charCodeAt(i);
  return buf;
}

export default function PushSubscribeButton() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setSupported(true);

    navigator.serviceWorker.register("/sw.js").catch(() => {});

    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setSubscribed(!!sub);
      });
    });
  }, []);

  if (!supported) return null;

  async function toggle() {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;

      if (subscribed) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push/unsubscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setSubscribed(false);
      } else {
        const { publicKey } = await fetch(VAPID_URL).then((r) => r.json()) as { publicKey: string };
        if (!publicKey) { setLoading(false); return; }

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToArrayBuffer(publicKey),
        });

        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: sub.endpoint,
            keys: {
              p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("p256dh")!))),
              auth:   btoa(String.fromCharCode(...new Uint8Array(sub.getKey("auth")!))),
            },
          }),
        });
        setSubscribed(true);
      }
    } catch {
      // ignore — user may have denied permission
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={subscribed ? "Desativar notificações" : "Ativar notificações"}
      className="text-gray-500 hover:text-gray-900 p-1.5 transition-colors rounded disabled:opacity-50"
      aria-label={subscribed ? "Desativar notificações push" : "Ativar notificações push"}
    >
      {loading ? (
        <Loader2 size={17} className="animate-spin" />
      ) : subscribed ? (
        <Bell size={17} className="text-[#c8102e]" />
      ) : (
        <BellOff size={17} />
      )}
    </button>
  );
}
