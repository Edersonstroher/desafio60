import { supabase } from '../supabase.js';

/** Todas as competições em que o usuário logado participa. */
export async function getMyCompetitions() {
  const { data, error } = await supabase
    .from('competition_members')
    .select('*, competitions(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
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
