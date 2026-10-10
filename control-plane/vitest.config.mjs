import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["control-plane/tests/**/*.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    // Bounded setup for a new offline PostgreSQL container; no release clock.
    hookTimeout: 30_000,
  },
});
