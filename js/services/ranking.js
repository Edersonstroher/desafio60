import { supabase } from '../supabase.js';

/** Ranking oficial completo de uma competição (já ordenado pelo banco). */
export async function getRanking(competitionId) {
  const { data, error } = await supabase
    .from('view_ranking_oficial')
    .select('*')
    .eq('competition_id', competitionId)
    .order('posicao', { ascending: true });
  if (error) throw error;
  return data;
}

/** Estatísticas de uma inscrição específica (dashboard do participante). */
export async function getMemberStats(competitionMemberId) {
  const { data, error } = await supabase
    .rpc('fn_member_stats', { p_member_id: competitionMemberId });
  if (error) throw error;
  return data?.[0] ?? null;
}

/** Estatísticas agregadas da competição (para o admin). */
export async function getCompetitionStats(competitionId) {
  const ranking = await getRanking(competitionId);
  const total = ranking.length;
  const elegiveis = ranking.filter((r) => r.elegivel_premio && r.consistencia_pct >= 80).length;
  const mediaConsistencia = total
    ? Math.round((ranking.reduce((s, r) => s + Number(r.consistencia_pct || 0), 0) / total) * 100) / 100
    : 0;
  return { total, elegiveis, mediaConsistencia, ranking };
}

/**
 * Calcula a distância do participante até o líder e uma estimativa de peso
 * necessário para assumir a liderança. Deixado explícito como estimativa
 * matemática simples (item 19) — não é uma fórmula oficial de ranking.
 */
/** Histórico de pesagens de qualquer membro da MESMA competição — usado no gráfico de comparação. */
export async function getMemberHistoryForChart(competitionMemberId) {
  const { data, error } = await supabase.rpc('fn_weighin_history', { p_member_id: competitionMemberId });
  if (error) throw error;
  return data || [];
}

export function calcularDistanciaParaLider(minhasStats, statsDoLider) {
  if (!minhasStats || !statsDoLider) return null;
  const diferencaPct = Math.round((statsDoLider.percentual_perdido - minhasStats.percentual_perdido) * 100) / 100;
  if (diferencaPct <= 0) {
    return { jaELider: true };
  }
  // percentual do líder convertido para peso equivalente no meu peso inicial
  const pesoEstimado = minhasStats.peso_inicial_kg != null
    ? Math.round((minhasStats.peso_inicial_kg * (1 - statsDoLider.percentual_perdido / 100)) * 100) / 100
    : null;
  return {
    jaELider: false,
    diferencaPct,
    pesoEstimado,
    mensagem: `Você está ${diferencaPct.toFixed(2).replace('.', ',')} ponto percentual atrás do líder.`,
    mensagemPeso: pesoEstimado != null
      ? `Você precisa chegar a aproximadamente ${pesoEstimado.toFixed(2).replace('.', ',')} kg na média de 7 dias para assumir a liderança. (Estimativa matemática.)`
      : null,
  };
}
