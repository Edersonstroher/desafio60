import { supabase } from './supabase.js';
import { sincronizarFilaOffline, getFilaOfflinePendente } from './services/weighin.js';

/** Aplica o tema salvo (ou o do profile) na tag <html>. */
export function aplicarTema(tema) {
  document.documentElement.setAttribute('data-tema', tema === 'light' ? 'light' : 'dark');
  localStorage.setItem('desafio60_tema', tema);
}

export function temaSalvoLocalmente() {
  return localStorage.getItem('desafio60_tema') || 'dark';
}

export function mostrarToast(mensagem, tipo = 'info', duracaoMs = 3500) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.textContent = mensagem;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duracaoMs);
}

export function marcarNavAtiva(paginaAtual) {
  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.classList.toggle('active', el.dataset.nav === paginaAtual);
  });
}

/** Inicializa monitoramento de conexão e sincroniza a fila offline de pesagens. */
export function iniciarMonitorOffline() {
  const pendentes = getFilaOfflinePendente();
  if (pendentes.length > 0 && navigator.onLine) {
    sincronizarFilaOffline().then(({ sincronizadas }) => {
      if (sincronizadas > 0) mostrarToast(`${sincronizadas} pesagem(ns) offline sincronizada(s).`, 'success');
    });
  }

  window.addEventListener('online', async () => {
    mostrarToast('Conexão restabelecida. Sincronizando...', 'info');
    const { sincronizadas } = await sincronizarFilaOffline();
    if (sincronizadas > 0) mostrarToast(`${sincronizadas} pesagem(ns) sincronizada(s).`, 'success');
  });

  window.addEventListener('offline', () => {
    mostrarToast('Você está offline. Suas pesagens serão salvas e sincronizadas depois.', 'error');
  });
}

/** Registra o service worker (PWA). */
export function registrarServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* ambiente sem suporte (ex.: file://) — ignora silenciosamente */
      });
    });
  }
}

export async function encerrarSessaoEVoltarLogin() {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
}
