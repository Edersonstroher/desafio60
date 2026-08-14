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
  const { hora } = horaAtualEmBrasilia();
  const hoje = new Date().toISOString().slice(0, 10);

  // Só considera "no horário" quem tem horario_lembrete dentro da mesma
  // hora cheia em que essa função está rodando (agende o cron de hora em
  // hora — veja README.md — para cobrir qualquer minuto configurado).
  const { data: perfis, error: erroPerfis } = await supabase
    .from('profiles')
    .select('id, nome, apelido, horario_lembrete, lembrete_ativo, modo_provocacao, push_subscriptions(id, endpoint, p256dh, auth)')
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
    // Encontra a inscrição ativa do participante e sua posição no ranking oficial
    const { data: membros } = await supabase
      .from('competition_members')
      .select('id, competition_id, competitions!inner(status)')
      .eq('user_id', perfil.id)
      .eq('competitions.status', 'ACTIVE');

    if (!membros || membros.length === 0) { pulados++; continue; }
    const membro = membros[0];

    const { data: pesagemHoje } = await supabase
      .from('weigh_ins')
      .select('id')
      .eq('competition_member_id', membro.id)
      .eq('data_pesagem', hoje)
      .maybeSingle();

    if (pesagemHoje) { pulados++; continue; }

    const mensagem = await montarMensagem(supabase, perfil, membro);

    const payload = JSON.stringify({ title: mensagem.title, body: mensagem.body, url: '/pesagem.html' });

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

/**
 * Monta o texto da notificação. Se a pessoa tem modo_provocacao ativado,
 * usa o ranking atual para brincar de forma leve (nunca ofensiva) — ex.:
 * avisando que está perdendo posição. Sem modo provocação, usa um aviso
 * neutro e direto.
 */
async function montarMensagem(supabase, perfil, membro) {
  const nome = perfil.apelido || perfil.nome || 'Você';
  const neutro = {
    title: '⚖️ Hora de pesar!',
    body: `${nome}, ainda não vimos seu peso de hoje no Desafio 60.`,
  };

  if (!perfil.modo_provocacao) return neutro;

  try {
    const { data: ranking } = await supabase
      .from('view_ranking_oficial')
      .select('competition_member_id, apelido, nome, percentual_perdido, posicao')
      .eq('competition_id', membro.competition_id)
      .order('posicao', { ascending: true });

    if (!ranking || ranking.length < 2) return neutro;

    const minhaLinha = ranking.find((r) => r.competition_member_id === membro.id);
    const lider = ranking[0];

    // Se a pessoa nem apareceu no ranking ainda (zero pesagens), usa mensagem neutra de boas-vindas
    if (!minhaLinha) return neutro;

    const souLider = minhaLinha.competition_member_id === lider.competition_member_id;
    const proximoAtras = ranking.find((r, i) => ranking[i - 1]?.competition_member_id === membro.id && r.percentual_perdido != null);

    const templates = [];

    if (souLider && proximoAtras) {
      templates.push({
        title: '🏆 Segura a liderança!',
        body: `${nome}, você tá na frente, mas ${proximoAtras.apelido || proximoAtras.nome} não tira o olho de você. Bora pesar antes que ele(a) cole!`,
      });
    } else if (!souLider) {
      const diferenca = Math.abs((lider.percentual_perdido || 0) - (minhaLinha.percentual_perdido || 0)).toFixed(2).replace('.', ',');
      templates.push({
        title: '😏 Alguém tá na frente...',
        body: `${nome}, ${lider.apelido || lider.nome} tá ${diferenca} ponto% à sua frente. Vai deixar assim? Registra o peso!`,
      });
    }

    templates.push({
      title: '⏰ O relógio não para',
      body: `${nome}, seus concorrentes já devem estar de olho na balança. E você?`,
    });

    return templates[Math.floor(Math.random() * templates.length)];
  } catch {
    return neutro;
  }
}
