// Service worker do Desafio 60.
// Estratégia: HTML e JS sempre buscam da rede primeiro (network-first) —
// garante que o usuário nunca fique preso numa versão antiga da lógica
// de login/cadastro. CSS e ícones usam cache-first (mudam pouco).
// NUNCA faz cache de respostas da API do Supabase — dados sempre vêm da
// rede (ou da fila offline local do weighin.js).

const CACHE_NAME = 'desafio60-shell-v2';

const APP_SHELL = [
  '/', '/index.html', '/login.html', '/cadastro.html', '/dashboard.html',
  '/competicao.html', '/ranking.html', '/pesagem.html', '/perfil.html',
  '/admin.html', '/join.html', '/regras.html',
  '/css/style.css', '/css/responsive.css', '/css/components.css',
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

function ehArquivoDinamico(url) {
  // HTML e JS mudam com frequência durante o desenvolvimento — nunca
  // servir versão em cache sem checar a rede primeiro.
  return url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname === '/';
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nunca cachear chamadas ao Supabase — dados sempre vêm da rede.
  if (url.hostname.endsWith('supabase.co')) return;
  if (event.request.method !== 'GET') return;

  if (ehArquivoDinamico(url)) {
    // Network-first: tenta a rede; só usa cache se estiver offline.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first para CSS/ícones/manifest (mudam pouco, prioriza velocidade).
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return response;
      });
    })
  );
});
