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
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        // Se já existe um SW ativo controlando a página, força checar
        // atualização imediatamente (evita ficar preso em versão antiga).
        reg.update();
      }).catch(() => {
        /* ambiente sem suporte (ex.: file://) — ignora silenciosamente */
      });

      // Se o SW mudou, recarrega a página uma única vez para usar a versão nova.
      let jaRecarregou = sessionStorage.getItem('desafio60_sw_reloaded');
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!jaRecarregou) {
          sessionStorage.setItem('desafio60_sw_reloaded', '1');
          window.location.reload();
        }
      });
    });
  }
}

export async function encerrarSessaoEVoltarLogin() {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
}

// ---------------------------------------------------------------------
// Instalação do app (PWA)
// ---------------------------------------------------------------------
let promptDeInstalacaoCapturado = null;

/** Chame no carregamento de qualquer página para capturar o prompt nativo de instalação (Android/Chrome). */
export function capturarPromptDeInstalacao() {
  window.addEventListener('beforeinstallprompt', (evento) => {
    evento.preventDefault();
    promptDeInstalacaoCapturado = evento;
    document.querySelectorAll('[data-instalar-app]').forEach((btn) => { btn.style.display = ''; });
  });

  window.addEventListener('appinstalled', () => {
    promptDeInstalacaoCapturado = null;
    mostrarToast('App instalado! Procure o ícone do Desafio 60 na sua tela inicial.', 'success');
  });
}

function detectarPlataforma() {
  const ua = navigator.userAgent || '';
  const ehIOS = /iphone|ipad|ipod/i.test(ua);
  const ehStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  return { ehIOS, ehStandalone };
}

/** Chame ao clicar no botão "Instalar app". Usa o prompt nativo quando disponível; senão mostra instrução manual (iOS). */
export async function acionarInstalacaoDoApp() {
  const { ehIOS, ehStandalone } = detectarPlataforma();

  if (ehStandalone) {
    mostrarToast('O app já está instalado neste dispositivo.', 'info');
    return;
  }

  if (promptDeInstalacaoCapturado) {
    promptDeInstalacaoCapturado.prompt();
    const escolha = await promptDeInstalacaoCapturado.userChoice;
    promptDeInstalacaoCapturado = null;
    if (escolha.outcome !== 'accepted') {
      mostrarToast('Instalação cancelada. Você pode tentar de novo quando quiser.', 'info');
    }
    return;
  }

  if (ehIOS) {
    mostrarToast('No Safari: toque no botão de compartilhar (□↑) e depois em "Adicionar à Tela de Início".', 'info', 6000);
    return;
  }

  mostrarToast('No menu do navegador (⋮), toque em "Adicionar à tela inicial" ou "Instalar app".', 'info', 6000);
}
