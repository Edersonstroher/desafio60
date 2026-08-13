import { supabase } from '../supabase.js';
import { validarPeso, detectarVariacaoGrande } from '../calculations.js';

const OFFLINE_QUEUE_KEY = 'desafio60_pending_weighins';

function lerFilaOffline() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function salvarFilaOffline(fila) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(fila));
}

export function getFilaOfflinePendente() {
  return lerFilaOffline();
}

/**
 * Registra uma pesagem. Se estiver offline, guarda localmente (cache não
 * crítico, nunca como fonte definitiva) e sincroniza quando a conexão voltar.
 * Retorna { status: 'saved' | 'queued_offline' | 'needs_confirmation', ... }
 */
export async function registerWeighIn({ competitionMemberId, pesoBruto, observacao = '', confirmarVariacao = false }) {
  const validacao = validarPeso(pesoBruto);
  if (!validacao.ok) {
    return { status: 'invalid', erro: validacao.erro };
  }

  if (!confirmarVariacao) {
    const ultimo = await getUltimaPesagem(competitionMemberId);
    const variacao = detectarVariacaoGrande(validacao.valor, ultimo?.peso_kg);
    if (variacao.grande) {
      return { status: 'needs_confirmation', ...variacao, valor: validacao.valor };
    }
  }

  const agora = new Date();
  const payload = {
    competition_member_id: competitionMemberId,
    peso_kg: validacao.valor,
    data_pesagem: agora.toISOString().slice(0, 10),
    hora_pesagem: agora.toTimeString().slice(0, 8),
    observacao: observacao || null,
    variacao_confirmada: confirmarVariacao,
  };

  if (!navigator.onLine) {
    const fila = lerFilaOffline();
    fila.push(payload);
    salvarFilaOffline(fila);
    return { status: 'queued_offline' };
  }

  const { data, error } = await supabase.from('weigh_ins').insert(payload).select().single();
  if (error) {
    // Falha de rede mesmo com navigator.onLine=true: enfileira por segurança
    const fila = lerFilaOffline();
    fila.push(payload);
    salvarFilaOffline(fila);
    return { status: 'queued_offline', erroOriginal: error.message };
  }
  return { status: 'saved', data };
}

/** Tenta sincronizar pesagens pendentes salvas localmente. Chame ao reconectar. */
export async function sincronizarFilaOffline() {
  const fila = lerFilaOffline();
  if (fila.length === 0) return { sincronizadas: 0, restantes: 0 };

  const restantes = [];
  let sincronizadas = 0;
  for (const item of fila) {
    const { error } = await supabase.from('weigh_ins').insert(item);
    if (error) {
      restantes.push(item);
    } else {
      sincronizadas += 1;
    }
  }
  salvarFilaOffline(restantes);
  return { sincronizadas, restantes: restantes.length };
}

export async function getUltimaPesagem(competitionMemberId) {
  const { data, error } = await supabase
    .from('weigh_ins')
    .select('*')
    .eq('competition_member_id', competitionMemberId)
    .order('data_pesagem', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getHistory(competitionMemberId) {
  const { data, error } = await supabase
    .from('weigh_ins')
    .select('*')
    .eq('competition_member_id', competitionMemberId)
    .order('data_pesagem', { ascending: true });
  if (error) throw error;
  return data;
}
