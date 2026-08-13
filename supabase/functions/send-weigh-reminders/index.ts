// =====================================================================
// send-weigh-reminders
// Edge Function do Desafio 60. Roda periodicamente (agendada via cron —
// veja README.md) e envia notificação push para todo participante que:
//   1) tem uma inscrição push_subscriptions cadastrada;
//   2) está com lembrete_ativo = true;
//   3) o horário atual (UTC) bate com o horario_lembrete configurado
//      (considerando o fuso de Brasília, UTC-3, sem horário de verão);
//   4) ainda não registrou peso hoje na competição ativa em que participa.
//
// Chamada via HTTP POST, protegida pelo cabeçalho Authorization com a
// service_role key (configurada automaticamente pelo Supabase como
// variável de ambiente desta função).
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:contato@desafio60.app';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const FUSO_BRASILIA_HORAS = -3; // sem horário de verão desde 2019

function horaAtualEmBrasilia() {
  const agora = new Date();
  const horaUTC = agora.getUTCHours();
  const minutoUTC = agora.getUTCMinutes();
  let horaBrasilia = (horaUTC + FUSO_BRASILIA_HORAS + 24) % 24;
  return { hora: horaBrasilia, minuto: minutoUTC };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { hora, minuto } = horaAtualEmBrasilia();
  const hoje = new Date().toISOString().slice(0, 10);

  // Só considera "no horário" quem tem horario_lembrete dentro da mesma
  // hora cheia em que essa função está rodando (agende o cron de hora em
  // hora — veja README.md — para cobrir qualquer minuto configurado).
  const { data: perfis, error: erroPerfis } = await supabase
    .from('profiles')
    .select('id, nome, horario_lembrete, lembrete_ativo, push_subscriptions(id, endpoint, p256dh, auth)')
    .eq('lembrete_ativo', true);

  if (erroPerfis) {
    return new Response(JSON.stringify({ erro: erroPerfis.message }), { status: 500 });
  }

  const candidatos = (perfis || []).filter((p) => {
    if (!p.push_subscriptions || p.push_subscriptions.length === 0) return false;
    const horaConfigurada = parseInt((p.horario_lembrete || '08:00:00').split(':')[0], 10);
    return horaConfigurada === hora;
  });

  let enviados = 0;
  let pulados = 0;
  let removidos = 0;
  const erros = [];

  for (const perfil of candidatos) {
    // Verifica se já se pesou hoje em alguma competição ativa
    const { data: membros } = await supabase
      .from('competition_members')
      .select('id, competitions!inner(status)')
      .eq('user_id', perfil.id)
      .eq('competitions.status', 'ACTIVE');

    if (!membros || membros.length === 0) { pulados++; continue; }

    let jaPesouHoje = false;
    for (const m of membros) {
      const { data: pesagemHoje } = await supabase
        .from('weigh_ins')
        .select('id')
        .eq('competition_member_id', m.id)
        .eq('data_pesagem', hoje)
        .maybeSingle();
      if (pesagemHoje) { jaPesouHoje = true; break; }
    }

    if (jaPesouHoje) { pulados++; continue; }

    const payload = JSON.stringify({
      title: '⚖️ Hora de pesar!',
      body: `${perfil.nome ? perfil.nome + ', ainda' : 'Ainda'} não vimos seu peso de hoje no Desafio 60.`,
      url: '/pesagem.html',
    });

    for (const sub of perfil.push_subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        enviados++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          // Inscrição expirada/inválida — remove para não tentar de novo
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
          removidos++;
        } else {
          erros.push({ user_id: perfil.id, erro: String(err) });
        }
      }
    }
  }

  return new Response(
    JSON.stringify({ enviados, pulados, removidos, candidatos: candidatos.length, erros }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
