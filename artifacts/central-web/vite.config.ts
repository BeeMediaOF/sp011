import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
