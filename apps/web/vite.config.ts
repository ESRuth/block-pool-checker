import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const api = { "/api": "http://localhost:8080" };

export default defineConfig({
  server: { host: true, port: 5173, strictPort: true, proxy: api },
  preview: { host: true, port: 5173, strictPort: true, proxy: api },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Block Pool Checker",
        short_name: "Pool Checker",
        description: "Check your football squares pool during the game.",
        theme_color: "#14532d",
        background_color: "#14532d",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          // Everything else, scores especially, always goes to the network. A cached score must never look live.
          { urlPattern: ({ url }) => url.pathname.startsWith("/api/"), handler: "NetworkOnly" },
        ],
      },
    }),
  ],
});
