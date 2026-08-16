// =====================================================================
// calculations.js
// Regra do projeto (item 45 do prompt mestre): média móvel, percentual,
// kg perdido, consistência e ranking são calculados UMA ÚNICA VEZ, no
// banco (fn_moving_avg_7, fn_member_stats, view_ranking_oficial).
// Este arquivo só contém validação de entrada e formatação — nada aqui
// decide quem vence.
// =====================================================================

const PESO_MIN = 20;
const PESO_MAX = 400;
const VARIACAO_ALERTA_KG = 4; // acima disso, pede confirmação

/** Valida o valor digitado no campo de pesagem. Retorna { ok, erro } */
export function validarPeso(valorBruto) {
  const texto = String(valorBruto).trim().replace(',', '.');
  const numero = Number(texto);

  if (texto === '' || Number.isNaN(numero)) {
    return { ok: false, erro: 'Digite um número válido para o peso.' };
  }
  if (numero <= 0) {
    return { ok: false, erro: 'O peso não pode ser zero ou negativo.' };
  }
  if (numero < PESO_MIN || numero > PESO_MAX) {
    return { ok: false, erro: 'Esse peso está fora de uma faixa realista. Confira o valor digitado.' };
  }
  return { ok: true, valor: Math.round(numero * 100) / 100 };
}

/** Compara o novo peso com o último registrado e sinaliza variação grande. */
export function detectarVariacaoGrande(pesoNovo, pesoUltimoRegistro) {
  if (pesoUltimoRegistro == null) return { grande: false };
  const diff = Math.abs(pesoNovo - pesoUltimoRegistro);
  if (diff >= VARIACAO_ALERTA_KG) {
    return {
      grande: true,
      diferenca: Math.round(diff * 100) / 100,
      mensagem: 'Esse peso representa uma variação muito grande em relação ao seu último registro. Confirme antes de salvar.',
    };
  }
  return { grande: false };
}

/** Verifica se um horário (HH:MM) está dentro da janela recomendada da competição. */
export function dentroDaJanela(horaAtual, janelaInicio, janelaFim) {
  return horaAtual >= janelaInicio && horaAtual <= janelaFim;
}

/** IMC — informativo apenas, não influencia ranking (item 17). */
export function calcularIMC(pesoKg, alturaCm) {
  if (!pesoKg || !alturaCm) return null;
  const alturaM = alturaCm / 100;
  return Math.round((pesoKg / (alturaM * alturaM)) * 10) / 10;
}

export function classificarIMC(imc) {
  if (imc == null) return '—';
  if (imc < 18.5) return 'Abaixo do peso';
  if (imc < 25) return 'Peso normal';
  if (imc < 30) return 'Sobrepeso';
  if (imc < 35) return 'Obesidade grau I';
  if (imc < 40) return 'Obesidade grau II';
  return 'Obesidade grau III';
}

/** Faixa de peso considerada "normal" (IMC 18,5–24,9) para uma altura — apenas informativo, nunca prescritivo. */
export function faixaDePesoSaudavel(alturaCm) {
  if (!alturaCm) return null;
  const alturaM = alturaCm / 100;
  const min = Math.round(18.5 * alturaM * alturaM * 10) / 10;
  const max = Math.round(24.9 * alturaM * alturaM * 10) / 10;
  return { min, max };
}

export function formatarKg(valor) {
  if (valor == null || Number.isNaN(valor)) return '—';
  return `${valor.toFixed(2).replace('.', ',')} kg`;
}

export function formatarPercentual(valor) {
  if (valor == null || Number.isNaN(valor)) return '—';
  const sinal = valor > 0 ? '-' : valor < 0 ? '+' : '';
  return `${sinal}${Math.abs(valor).toFixed(2).replace('.', ',')}%`;
}

export function formatarData(dataISO) {
  if (!dataISO) return '—';
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Velocidade de evolução: kg perdidos por semana decorrida. Apenas informativo (item 18), não influencia ranking. */
export function velocidadeEvolucao(kgPerdidos, diasDecorridos) {
  if (kgPerdidos == null || !diasDecorridos) return null;
  const semanas = diasDecorridos / 7;
  if (semanas < 0.5) return null; // dados insuficientes na primeira semana
  return Math.round((kgPerdidos / semanas) * 100) / 100;
}
export function diaDaCompeticao(dataInicioISO, hoje = new Date()) {
  const inicio = new Date(dataInicioISO + 'T00:00:00');
  const diffMs = hoje.setHours(0, 0, 0, 0) - inicio.setHours(0, 0, 0, 0);
  const dia = Math.floor(diffMs / 86400000) + 1;
  return Math.max(1, dia);
}
