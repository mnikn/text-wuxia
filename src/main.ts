import "./ui/twee-app";

// 旧入口注册过 sw.js（同源 GET 缓存优先）；dev 下它会一直供着旧模块，改代码也不生效。
// 进来先注销并清掉缓存，只影响开发；构建版的离线缓存不受影响（构建版入口自己注册）。
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((rs) => {
    for (const r of rs) void r.unregister();
  });
  void caches.keys().then((ks) => {
    for (const k of ks) void caches.delete(k);
  });
}
