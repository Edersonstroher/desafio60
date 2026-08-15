// Service worker do Desafio 60.
// Estratégia: HTML e JS sempre buscam da rede primeiro (network-first) —
// garante que o usuário nunca fique preso numa versão antiga da lógica
// de login/cadastro. CSS e ícones usam cache-first (mudam pouco).
// NUNCA faz cache de respostas da API do Supabase — dados sempre vêm da
// rede (ou da fila offline local do weighin.js).

const CACHE_NAME = 'desafio60-shell-v3';

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

// ---------------------------------------------------------------------
// Notificações push — lembrete de pesagem (funciona com o app fechado)
// ---------------------------------------------------------------------
self.addEventListener('push', (event) => {
  let dados = { title: 'Desafio 60', body: 'Não esqueça de registrar seu peso hoje! ⚖️', url: '/pesagem.html' };
  try {
    if (event.data) dados = { ...dados, ...event.data.json() };
  } catch {
    /* payload não era JSON — usa os valores padrão */
  }

  event.waitUntil(
    self.registration.showNotification(dados.title, {
      body: dados.body,
      icon: '/assets/icons/icon-192.png',
      badge: '/assets/icons/icon-192.png',
      data: { url: dados.url || '/pesagem.html' },
      vibrate: [100, 50, 100],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/pesagem.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
