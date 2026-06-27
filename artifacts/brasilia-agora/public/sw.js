// Service worker do portal — SOMENTE push/notificações. NÃO faz cache de conteúdo.
//
// "Kill switch": ao instalar/ativar, assume o controle imediatamente e remove
// quaisquer caches deixados por versões antigas (ex.: app shell de um template
// anterior que ficava "preso" em abas normais, servindo o site errado). Como não
// há fetch handler, toda requisição vai direto à rede — nunca serve HTML/JS antigo.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {}
    await self.clients.claim();
  })());
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = data.title || "SBC Agora";
  const options = {
    body: data.body || "",
    icon: "/favicon.jpg",
    badge: "/favicon.jpg",
    data: { url: data.url || "/" },
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url === url && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
