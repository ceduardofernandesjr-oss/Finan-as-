// Service worker: deixa o app instalável e abre rápido.
// - Arquivos estáticos (/_next/static, /icons) ficam guardados no aparelho.
// - As telas do app abrem da última cópia guardada (sem tela branca esperando o servidor)
//   e são atualizadas em segundo plano. Os dados financeiros nunca ficam em cache:
//   sempre vêm do servidor, depois que a tela abre.
const CACHE = "financas-v1";
const PAGINAS = "financas-paginas-v1";
const PUBLICAS = ["/entrar", "/cadastro", "/recuperar-senha", "/auth", "/configurar", "/api", "/.well-known"];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== PAGINAS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      }),
    );
    return;
  }

  // telas do app: mostra a cópia guardada na hora e busca a versão nova para a próxima abertura
  if (e.request.mode === "navigate" && !PUBLICAS.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"))) {
    const chave = url.origin + url.pathname;
    e.respondWith(
      caches.open(PAGINAS).then(async (cache) => {
        const guardada = await cache.match(chave);
        const rede = fetch(e.request).then((res) => {
          // só guarda a tela certa (não guarda redirecionamento para o login nem erro)
          if (res.ok && !res.redirected && new URL(res.url).pathname === url.pathname) cache.put(chave, res.clone());
          return res;
        });
        if (guardada) {
          e.waitUntil(rede.catch(() => {}));
          return guardada;
        }
        return rede;
      }),
    );
  }
});
