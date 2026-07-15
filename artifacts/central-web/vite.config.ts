import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Tailwind (utilities-only, ver tailwind.css) para o editor "Nova notícia"
  // portado do admin do blog. Oxide nativo só no Docker (Linux) — dev/build
  // local no Windows não roda, igual ao vite build do blog.
  plugins: [react(), tailwindcss()],
  server: {
    port: 3001,
    proxy: {
      // Dev local: API do central-hub
      "/api": { target: "http://localhost:8090", changeOrigin: true },
    },
  },
  preview: {
    port: 3001,
    host: true,
    // Atrás do Caddy (central.<dominio>) — hostnames variam por deploy.
    allowedHosts: true,
  },
});
