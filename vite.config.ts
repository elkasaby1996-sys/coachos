import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@supabase/") || id.includes("@sentry/")) {
            return "vendor-backend-observability";
          }

          if (id.includes("framer-motion")) {
            return "vendor-motion";
          }

          if (id.includes("recharts")) {
            return "vendor-charts";
          }

          if (
            id.includes("react-hook-form") ||
            id.includes("@hookform/resolvers") ||
            id.includes("/node_modules/zod/")
          ) {
            return "vendor-forms";
          }

          if (id.includes("canvas-confetti")) {
            return "vendor-effects";
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
