// =====================================================================
// notifications.js — mensagens internas de engajamento (itens 30 e 31).
// Nunca ofensivas; o modo provocação só troca o tom, nunca o conteúdo
// factual, e é uma preferência salva no profile (modo_provocacao).
// =====================================================================

export function gerarMensagens({ modoProvocacao, stats, posicaoAnterior, posicaoAtual, ehLider, jaPesouHoje, nomeConcorrenteProximo }) {
  const msgs = [];

  if (!jaPesouHoje) {
    msgs.push({ tipo: 'aviso', texto: '⚠️ Você ainda não registrou seu peso hoje.' });
  }

  if (posicaoAnterior != null && posicaoAtual != null && posicaoAtual < posicaoAnterior) {
    const subiu = posicaoAnterior - posicaoAtual;
    msgs.push({ tipo: 'positivo', texto: `🔥 Você subiu ${subiu} posiç${subiu > 1 ? 'ões' : 'ão'}!` });
  }

  if (ehLider) {
    msgs.push({ tipo: 'destaque', texto: '🏆 Você está em 1º lugar!' });
  }

  if (stats?.kg_perdidos > 0) {
    msgs.push({ tipo: 'positivo', texto: `📉 Você perdeu ${stats.kg_perdidos.toFixed(1).replace('.', ',')} kg desde o início.` });
  }

  if (stats?.sequencia_atual >= 3) {
    msgs.push({ tipo: 'positivo', texto: `🔥 Você está há ${stats.sequencia_atual} dias registrando seu peso.` });
  }

  if (modoProvocacao && nomeConcorrenteProximo) {
    msgs.push({ tipo: 'provocacao', texto: `🚨 ${nomeConcorrenteProximo} está se aproximando!` });
  }

  return msgs;
}
