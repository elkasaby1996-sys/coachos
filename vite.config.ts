import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/src/pages/pt/")) {
            return "pages-pt";
          }

          if (id.includes("/src/pages/client/")) {
            return "pages-client";
          }

          if (id.includes("/src/pages/public/")) {
            return "pages-public";
          }

          if (id.includes("@supabase/") || id.includes("@sentry/")) {
            return "vendor-backend-observability";
          }

          if (id.includes("framer-motion") || id.includes("recharts")) {
            return "vendor-visuals";
          }

          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/scheduler/")
          ) {
            return "vendor-react";
          }

          if (id.includes("react-router")) {
            return "vendor-router";
          }

          if (id.includes("@tanstack/react-query")) {
            return "vendor-query";
          }

          if (id.includes("@radix-ui/")) {
            return "vendor-radix";
          }

          if (id.includes("@dnd-kit/")) {
            return "vendor-dnd";
          }

          if (id.includes("node_modules")) {
            return "vendor-misc";
          }
        },
      },
    },
  },
});
