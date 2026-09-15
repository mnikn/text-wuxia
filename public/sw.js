/* 清河江湖 Service Worker：导航（HTML）网络优先，带内容 hash 的静态资源缓存优先。
 * 版本变更后旧缓存整体清除，避免旧壳引用失效资源导致白屏。 */
const VERSION = "twx-v2";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || !req.url.startsWith(self.location.origin)) return;
  const url = new URL(req.url);
  const isAsset = url.pathname.startsWith("/assets/");

  if (req.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith("/index.html")) {
    // 导航请求：网络优先，失败回退缓存（离线可玩）
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit ?? caches.match("./index.html")))
    );
    return;
  }

  // 静态资源：缓存优先（文件名带 hash，内容不变）
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok && isAsset) {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
