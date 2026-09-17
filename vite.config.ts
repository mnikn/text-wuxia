import { defineConfig, type Plugin } from "vitest/config";
import { tweePlugin } from "./src/vite/twee-plugin";

// 旧版 sw.js 已删；dev 下浏览器对它的更新检查若命中 SPA fallback（200 HTML），
// 旧 SW 会一直注销不掉、继续供旧缓存。这里给它一个真 404，浏览器即自动注销。
const swGone = (): Plugin => ({
  name: "sw-gone",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.split("?")[0] === "/sw.js") {
        res.statusCode = 404;
        res.end();
        return;
      }
      next();
    });
  },
});

export default defineConfig({
  base: "./",
  plugins: [tweePlugin(), swGone()],
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
