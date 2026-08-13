import { supabase } from '../supabase.js';

export async function isCurrentUserAdmin() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (error) return false;
  return !!data.is_admin;
}

/** Corrige uma pesagem via função do banco — grava auditoria automaticamente (item 23). */
export async function correctWeighIn(weighInId, novoPeso, motivo) {
  if (!motivo || !motivo.trim()) throw new Error('Informe o motivo da correção.');
  const { error } = await supabase.rpc('admin_correct_weighin', {
    p_weighin_id: weighInId,
    p_novo_peso: novoPeso,
    p_motivo: motivo,
  });
  if (error) throw error;
}

export async function getAuditLogs(competitionId) {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*, profiles(nome)')
    .eq('competition_id', competitionId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getAllWeighIns(competitionId) {
  const { data, error } = await supabase
    .from('weigh_ins')
    .select('*, competition_members!inner(competition_id, profiles(nome))')
    .eq('competition_members.competition_id', competitionId)
    .order('data_pesagem', { ascending: false });
  if (error) throw error;
  return data;
}

export async function addParticipantByEmail(competitionId, email) {
  const { data: perfil, error: errPerfil } = await supabase
    .from('profiles').select('id').eq('email', email).maybeSingle();
  if (errPerfil) throw errPerfil;
  if (!perfil) throw new Error('Nenhum usuário cadastrado com esse e-mail ainda.');

  const { data, error } = await supabase
    .from('competition_members')
    .insert({ competition_id: competitionId, user_id: perfil.id, status: 'INVITED' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setEligibility(memberId, elegivel) {
  const { error } = await supabase
    .from('competition_members')
    .update({ elegivel_premio: elegivel })
    .eq('id', memberId);
  if (error) throw error;
}

export async function finishCompetition(competitionId) {
  const { error } = await supabase
    .from('competitions')
    .update({ status: 'FINISHED' })
    .eq('id', competitionId);
  if (error) throw error;
}
