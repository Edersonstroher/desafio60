// =====================================================================
// achievements.js — badges puramente informativos (item 29).
// Derivadas das estatísticas já calculadas pelo banco; não persistem
// como uma nova fonte de verdade (podem ser recalculadas a qualquer
// momento a partir de fn_member_stats).
// =====================================================================

export function calcularConquistas(stats, { posicaoAtual, entrouNoTop3, assumiuLideranca } = {}) {
  const badges = [];

  if (stats.melhor_sequencia >= 7) badges.push({ icone: '🔥', texto: '7 dias seguidos' });
  if (stats.melhor_sequencia >= 14) badges.push({ icone: '🔥', texto: '14 dias seguidos' });
  if (stats.melhor_sequencia >= 30) badges.push({ icone: '🔥', texto: '30 dias seguidos' });
  if (stats.total_pesagens >= 7) badges.push({ icone: '⚡', texto: 'Primeira semana completa' });
  if (stats.kg_perdidos > 0) badges.push({ icone: '📉', texto: 'Primeiro kg perdido' });
  if (entrouNoTop3) badges.push({ icone: '🏆', texto: 'Entrou no TOP 3' });
  if (assumiuLideranca) badges.push({ icone: '🥇', texto: 'Assumiu a liderança' });

  return badges;
}
