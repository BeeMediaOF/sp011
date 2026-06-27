import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// ── Service worker (push + kill-switch que limpa caches antigos) ───────────────
// Registra cedo para que um SW antigo/"preso" de uma versão anterior seja
// substituído e os caches obsoletos removidos. Se ESTA página estava sendo
// controlada por um SW antigo, quando o novo assume (controllerchange) recarrega
// uma única vez para pegar o app fresco da rede. Em quem nunca teve SW, não há
// reload (a página já veio da rede).
if ("serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing || !hadController) return;
    refreshing = true;
    window.location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
