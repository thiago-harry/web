// Deterministic "motivo" strings for schedule blocks. Templates only, no LLM.
// Returns both the rendered pt-BR string and a code + params for the UI.

const ACTIVITY_LABEL = { teoria: "Teoria", questoes: "Questões", revisao: "Revisão", simulado: "Simulado" };

const fmtPct = (x) => `${Math.round(x * 100)}%`;
const fmtDate = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const DEPTH_LABEL = { 3: "o edital desdobra o item em subtópicos", 2: "item detalhado no edital", 1: "item citado no edital" };

function termReason(term, sc, assunto) {
  if (term === "F") return `${fmtPct(sc.raw.F)} das questões nas provas anteriores do cargo`;
  if (term === "B") return `a banca cobra o tema em outros concursos (${fmtPct(sc.raw.B)} das questões)`;
  const extra = sc.F === 0 && sc.B === 0 ? ", sem histórico de prova" : "";
  return `${DEPTH_LABEL[assunto.edital_profundidade]}${extra}`;
}

/** The dominant quadro-A/B term, plus the runner-up when it carries at least 60% as much weight. */
function priorityReasons(sc, assunto) {
  const ranked = Object.entries(sc.contrib)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  if (!ranked.length) return [termReason("E", sc, assunto)];
  const out = [termReason(ranked[0][0], sc, assunto)];
  if (ranked[1] && ranked[1][1] >= 0.6 * ranked[0][1]) out.push(termReason(ranked[1][0], sc, assunto));
  return out;
}

function gapReason(sc) {
  if (sc.gap_source === "nenhum") return null;
  if (sc.gap_source === "autoavaliacao" || sc.gap_source === "hibrido") {
    if (sc.autoavaliacao === "nunca") return "você nunca estudou o tema";
    if (sc.autoavaliacao <= 1) return `domínio baixo na autoavaliação (${sc.autoavaliacao}/4)`;
    if (sc.autoavaliacao >= 3) return `domínio alto na autoavaliação (${sc.autoavaliacao}/4), carga reduzida`;
    return `domínio médio na autoavaliação (${sc.autoavaliacao}/4)`;
  }
  const q = sc.simulado;
  return `${q.erros} erro(s) em ${q.respondidas} questão(ões) do simulado`;
}

function multiplierReasons(sc) {
  const out = [];
  if (sc.multiplicadores.volatil > 1) out.push("legislação alterada nos últimos 24 meses");
  if (sc.multiplicadores.eliminatoria > 1) out.push("matéria eliminatória com lacuna");
  return out;
}

/** Study block (teoria / questões) of a topic. */
export function explainStudy({ atividade, assunto, score, total, pass, finalStretch }) {
  const reasons = priorityReasons(score, assunto);
  const gap = gapReason(score);
  if (gap) reasons.push(gap);
  reasons.push(...multiplierReasons(score));
  const prefix = finalStretch ? "Reta final, sem conteúdo novo. " : pass >= 2 ? "Segunda passada, foco em questões. " : "";
  const motivo = `${prefix}${ACTIVITY_LABEL[atividade]} de "${assunto.nome}": prioridade ${score.rank}ª de ${total}. ${capitalize(reasons.join("; "))}.`;
  return {
    motivo,
    motivo_codigo: finalStretch ? "reta_final" : pass >= 2 ? "segunda_passada" : "estudo",
    motivo_params: { rank: score.rank, total, razoes: reasons },
  };
}

/** Spaced revision block. */
export function explainRevision({ assunto, intervaloDias, closedAt }) {
  return {
    motivo: `Revisão de ${intervaloDias} dia${intervaloDias === 1 ? "" : "s"}: "${assunto.nome}" foi concluído em ${fmtDate(closedAt)}.`,
    motivo_codigo: "revisao",
    motivo_params: { intervalo_dias: intervaloDias, concluido_em: closedAt },
  };
}

/** Full mock exam. */
export function explainMock({ questoes, minutos, weeksToExam }) {
  return {
    motivo: `Simulado completo (${questoes} questões, ${minutos} min). ${weeksToExam === 1 ? "Falta 1 semana" : `Faltam ${weeksToExam} semanas`} para a prova.`,
    motivo_codigo: "simulado",
    motivo_params: { questoes, minutos, semanas_para_prova: weeksToExam },
  };
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
