import { supabase } from '../supabase.js';

// Chave pública VAPID — segura para expor no frontend (é só a "identidade"
// do servidor de notificações; a chave privada nunca sai do backend).
const VAPID_PUBLIC_KEY = 'BP88hy0_nmagS5l1t3nVFnFUMAYYSg17V_OzPUqa5Xkx5oUKUwc-UPwQ-JGF_4malQ6bCC25HZ8UMUCqM2efamg';

function urlBase64ParaUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function suportaPush() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function statusPermissao() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

/** Pede permissão, inscreve no PushManager do navegador e salva a inscrição no Supabase. */
export async function ativarLembretePush() {
  if (!suportaPush()) {
    return { ok: false, motivo: 'Este navegador não suporta notificações push.' };
  }

  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') {
    return { ok: false, motivo: 'Permissão de notificação não concedida.' };
  }

  const registro = await navigator.serviceWorker.ready;
  let subscription = await registro.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ParaUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, motivo: 'Você precisa estar logado.' };

  const json = subscription.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: user.id,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    user_agent: navigator.userAgent,
  }, { onConflict: 'endpoint' });

  if (error) return { ok: false, motivo: 'Não foi possível salvar sua inscrição. Tente novamente.' };

  await supabase.from('profiles').update({ lembrete_ativo: true }).eq('id', user.id);
  return { ok: true };
}

/** Cancela a inscrição de push deste dispositivo. */
export async function desativarLembretePush() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!('serviceWorker' in navigator)) return { ok: true };

  const registro = await navigator.serviceWorker.ready;
  const subscription = await registro.pushManager.getSubscription();
  if (subscription) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
    await subscription.unsubscribe();
  }
  if (user) await supabase.from('profiles').update({ lembrete_ativo: false }).eq('id', user.id);
  return { ok: true };
}

export async function salvarHorarioLembrete(horario) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sessão expirada.');
  const { error } = await supabase.from('profiles').update({ horario_lembrete: horario }).eq('id', user.id);
  if (error) throw error;
}
