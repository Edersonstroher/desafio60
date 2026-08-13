// Service worker do Desafio 60.
// Faz cache do "app shell" (HTML/CSS/JS estáticos) para abrir rápido e
// funcionar offline. NUNCA faz cache de respostas da API do Supabase —
// dados sempre vêm da rede (ou da fila offline local do weighin.js).

const CACHE_NAME = 'desafio60-shell-v1';

const APP_SHELL = [
  '/', '/index.html', '/login.html', '/cadastro.html', '/dashboard.html',
  '/competicao.html', '/ranking.html', '/pesagem.html', '/perfil.html',
  '/admin.html', '/join.html',
  '/css/style.css', '/css/responsive.css', '/css/components.css',
  '/js/app.js', '/js/config.js', '/js/supabase.js', '/js/calculations.js',
  '/js/achievements.js', '/js/notifications.js',
  '/js/services/auth.js', '/js/services/competition.js', '/js/services/weighin.js',
  '/js/services/ranking.js', '/js/services/admin.js',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nunca cachear chamadas ao Supabase — dados sempre vêm da rede.
  if (url.hostname.endsWith('supabase.co')) return;

  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => cached);
    })
  );
});
