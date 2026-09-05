import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The API Worker sets Access-Control-Allow-Origin to SITE_ORIGIN (the deployed
// Pages URL), so a browser on localhost would be blocked by CORS. Proxying
// /api through the dev server keeps those calls same-origin instead of asking
// the Worker to loosen its origin policy for development.
const API_TARGET = process.env.VITE_API_PROXY || "https://thriftbyeugy-api.onyiah.workers.dev";
const IMAGE_TARGET = process.env.VITE_IMAGE_PROXY || "https://thriftbyeugy-images.onyiah.workers.dev";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true, secure: true },
      // Photo uploads are origin-locked to ADMIN_ORIGIN on the image Worker,
      // so they are proxied too, and the spin-frame list is a fetch() with the
      // same origin lock. Image DELIVERY (/img/, /spinimg/) is not proxied: an
      // <img> loads cross-origin without CORS and should hit the Worker's
      // cache directly.
      "/admin/upload": { target: IMAGE_TARGET, changeOrigin: true, secure: true },
      "/spin": { target: IMAGE_TARGET, changeOrigin: true, secure: true },
    },
  },
  preview: {
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true, secure: true },
      // Photo uploads are origin-locked to ADMIN_ORIGIN on the image Worker,
      // so they are proxied too, and the spin-frame list is a fetch() with the
      // same origin lock. Image DELIVERY (/img/, /spinimg/) is not proxied: an
      // <img> loads cross-origin without CORS and should hit the Worker's
      // cache directly.
      "/admin/upload": { target: IMAGE_TARGET, changeOrigin: true, secure: true },
      "/spin": { target: IMAGE_TARGET, changeOrigin: true, secure: true },
    },
  },
});
