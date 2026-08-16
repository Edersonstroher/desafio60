import { supabase } from '../supabase.js';

/** Todas as competições em que o usuário logado participa. */
export async function getMyCompetitions() {
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError) throw authError;

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from('competition_members')
    .select(`
      id,
      competition_id,
      user_id,
      peso_inicial_kg,
      peso_inicial_congelado,
      data_entrada,
      elegivel_premio,
      status,
      created_at,
      competitions (
        id,
        nome,
        descricao,
        data_inicio,
        data_fim,
        duracao_dias,
        status,
        valor_inscricao,
        janela_inicio,
        janela_fim,
        consistencia_minima_pct,
        codigo_convite
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Proteção adicional contra duplicação visual
  const unicas = [];
  const ids = new Set();

  for (const item of data || []) {
    if (!item.competitions) continue;

    if (!ids.has(item.competitions.id)) {
      ids.add(item.competitions.id);
      unicas.push(item);
    }
  }

  return unicas;
}

/**
 * Escolhe qual competição usar nas telas (dashboard, ranking, pesagem, etc.).
 * Se o usuário participa de mais de uma competição ATIVA ao mesmo tempo,
 * respeita a última escolhida manualmente em "Minhas competições"
 * (localStorage) em vez de sempre pegar a primeira encontrada — evita
 * misturar dados entre competições (item 33 do briefing).
 */
export function escolherCompeticaoAtiva(minhas) {
  const ativas = minhas.filter((m) => m.competitions?.status === 'ACTIVE');
  if (ativas.length === 0) return minhas[0] || null;
  if (ativas.length === 1) return ativas[0];

  const idSalvo = localStorage.getItem('desafio60_competicao_ativa_id');
  const escolhida = ativas.find((m) => m.competition_id === idSalvo);
  return escolhida || ativas[0];
}

export function definirCompeticaoAtiva(competitionId) {
  localStorage.setItem('desafio60_competicao_ativa_id', competitionId);
}

export async function getCompetition(competitionId) {
  const { data, error } = await supabase
    .from('competitions')
    .select('*')
    .eq('id', competitionId)
    .single();
  if (error) throw error;
  return data;
}

export async function getCompetitionByInviteCode(codigo) {
  const { data, error } = await supabase
    .from('competitions')
    .select('*, competition_members(count)')
    .eq('codigo_convite', codigo.toUpperCase())
    .single();
  if (error) throw error;
  return data;
}

export async function getMyMembership(competitionId) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return null;
  const { data, error } = await supabase
    .from('competition_members')
    .select('*')
    .eq('competition_id', competitionId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Participante entra numa competição usando o código de convite. */
export async function joinCompetition(competitionId) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('Você precisa estar logado.');
  const { data, error } = await supabase
    .from('competition_members')
    .insert({ competition_id: competitionId, user_id: user.id, status: 'INVITED' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Lista de membros ativos de uma competição (para "outros participantes"). */
export async function getCompetitionMembers(competitionId) {
  const { data, error } = await supabase
    .from('competition_members')
    .select('*, profiles(nome, apelido, avatar_url)')
    .eq('competition_id', competitionId)
    .in('status', ['ACTIVE', 'FINISHED']);
  if (error) throw error;
  return data;
}

// ---- Admin ----

export async function createCompetition(payload) {
  const { data, error } = await supabase.from('competitions').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateCompetition(id, patch) {
  const { data, error } = await supabase
    .from('competitions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeMemberBeforeStart(memberId) {
  const { error } = await supabase
    .from('competition_members')
    .update({ status: 'WITHDRAWN' })
    .eq('id', memberId);
  if (error) throw error;
}

export async function listAllCompetitionsAdmin() {
  const { data, error } = await supabase
    .from('competitions')
    .select('*, competition_members(count)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
