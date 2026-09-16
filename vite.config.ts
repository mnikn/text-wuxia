import { defineConfig } from "vitest/config";
import { tweePlugin } from "./src/vite/twee-plugin";

export default defineConfig({
  base: "./",
  plugins: [tweePlugin()],
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 900,
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
