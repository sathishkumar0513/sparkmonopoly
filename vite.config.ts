import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const requestedBase = env.VITE_BASE || "/";
  const base = `/${requestedBase.replace(/^\/+|\/+$/g, "")}/`.replace(/^\/\/$/, "/");
  const contentSecurityPolicy =
    "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'; form-action 'self'; frame-ancestors 'none'";

  return {
    base,
    preview: {
      headers: {
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "Content-Security-Policy": contentSecurityPolicy,
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "prompt",
        includeAssets: [
          "robots.txt",
          "sitemap.xml",
          "icons/spark-monopoly-192.png",
          "icons/spark-monopoly-512.png",
        ],
        manifest: {
          name: "Spark Monopoly",
          short_name: "Spark Monopoly",
          description: "A colorful, turn-based business strategy board game.",
          theme_color: "#101a2b",
          background_color: "#101a2b",
          display: "standalone",
          start_url: "./",
          scope: "./",
          icons: [
            {
              src: "icons/spark-monopoly-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "icons/spark-monopoly-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,webp,gif,json}"],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          navigateFallback: "index.html",
          runtimeCaching: [
            {
              urlPattern: /\/themes\/[^/]+\.json$/,
              handler: "CacheFirst",
              options: {
                cacheName: "business-tycoon-themes",
                expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
          ],
        },
      }),
      ...(mode === "analyze"
        ? [visualizer({
            filename: "dist/bundle-report.html",
            template: "treemap",
            gzipSize: true,
            brotliSize: true,
            open: false,
          })]
        : []),
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/react-dom") ||
                id.includes("node_modules/react/") ||
                id.includes("node_modules/scheduler/")) {
              return "react-vendor";
            }
            if (id.includes("node_modules/framer-motion") ||
                id.includes("node_modules/motion-dom") ||
                id.includes("node_modules/motion-utils")) {
              return "motion-vendor";
            }
            return undefined;
          },
        },
      },
    },
  };
});
