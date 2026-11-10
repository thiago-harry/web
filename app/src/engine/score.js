// Scoring: the three "quadros" -> priority P per topic, with full breakdown.
//
//   P(a) = (wF·F + wB·B + wE·E) · (1 + wG·G) · M
//
//   F  recency-weighted share of the cargo's own past exams      (Quadro A)
//   B  same, over the banca's exams for similar cargos            (Quadro A)
//   E  normative weight of the edital (questions × depth)         (Quadro B)
//   G  the student's gap, from self-assessment and/or a quiz      (Quadro C)
//   M  multipliers: volatile legislation, eliminatory gap
//
// All constants come from the spec. Do not change them here; pass `options`.

export const DEFAULT_WEIGHTS = Object.freeze({ wF: 0.35, wB: 0.2, wE: 0.45, wG: 1.0 });

export const SCORE_DEFAULTS = Object.freeze({
  lambda: 0.15, // decay per year, half-life ≈ 4.6 years
  shrinkAlpha: 3, // quiz shrinkage: (erros + α·prior) / (respondidas + α)
  shrinkPrior: 0.5,
  quizWeightMin: 1, // hybrid: quiz weight when respondidas < quizStrongN
  quizWeightStrong: 2, // hybrid: quiz weight when respondidas >= quizStrongN
  quizStrongN: 5,
  selfWeight: 1,
  volatileMultiplier: 1.15,
  eliminatoryMultiplier: 1.3,
  eliminatoryGapThreshold: 0.6,
});

export const NEVER_STUDIED = "nunca";

const byId = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
const decay = (lambda, refYear, year) => Math.exp(-lambda * (refYear - year));

function normalizeByMax(values) {
  const max = Math.max(0, ...Object.values(values));
  const out = {};
  for (const [k, v] of Object.entries(values)) out[k] = max > 0 ? v / max : 0;
  return { normalized: out, max };
}

/** Quadro A for the cargo: recency-weighted share of questions. */
function rawHistoryShare(pack, refYear, lambda) {
  const totals = new Map(pack.provas_historico.map((p) => [p.ano, p.total_questoes]));
  const denom = pack.provas_historico.reduce((s, p) => s + p.total_questoes * decay(lambda, refYear, p.ano), 0);
  const raw = {};
  for (const a of pack.assuntos) {
    const num = a.incidencia_cargo.reduce((s, inc) => (totals.has(inc.ano) ? s + inc.questoes * decay(lambda, refYear, inc.ano) : s), 0);
    raw[a.id] = denom > 0 ? num / denom : 0;
  }
  return raw;
}

/** Quadro A for the banca: identical, over provas_banca / incidencia_banca. */
function rawBancaShare(pack, refYear, lambda) {
  const provas = new Map((pack.provas_banca ?? []).map((p) => [p.concurso, p]));
  const denom = [...provas.values()].reduce((s, p) => s + p.total_questoes * decay(lambda, refYear, p.ano), 0);
  const raw = {};
  for (const a of pack.assuntos) {
    const num = a.incidencia_banca.reduce((s, inc) => {
      const p = provas.get(inc.concurso);
      return p ? s + inc.questoes * decay(lambda, refYear, p.ano) : s;
    }, 0);
    raw[a.id] = denom > 0 ? num / denom : 0;
  }
  return raw;
}

export const materiaPoints = (m) => m.questoes * (m.peso ?? 1);

/** Quadro B: materia share of the exam points (questões × peso) × depth share inside the materia. */
function rawEditalWeight(pack) {
  const materias = byId(pack.estrutura_prova.materias);
  const totalPoints = pack.estrutura_prova.materias.reduce((s, m) => s + materiaPoints(m), 0);
  const depthSum = {};
  for (const a of pack.assuntos) depthSum[a.materia_id] = (depthSum[a.materia_id] ?? 0) + a.edital_profundidade;
  const raw = {};
  for (const a of pack.assuntos) {
    const m = materias[a.materia_id];
    raw[a.id] = totalPoints > 0 ? (materiaPoints(m) / totalPoints) * (a.edital_profundidade / depthSum[a.materia_id]) : 0;
  }
  return raw;
}

/** 5-level band from a ratio in [0, 1] (value / max). 5 = muito alta … 1 = muito baixa. */
export const LEVEL_THRESHOLDS = Object.freeze([0.8, 0.6, 0.4, 0.2]);
export function levelOf(ratio) {
  if (!(ratio > 0)) return 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) if (ratio >= LEVEL_THRESHOLDS[i] - 1e-12) return 5 - i;
  return 1;
}

function rankBy(ids, valueOf) {
  const sorted = [...ids].sort((x, y) => valueOf(y) - valueOf(x) || (x < y ? -1 : x > y ? 1 : 0));
  const rank = {};
  sorted.forEach((id, i) => {
    rank[id] = i + 1;
  });
  return rank;
}

/**
 * Quadro C: gap in [0, 1].
 *   nivelamento = { autoavaliacao?: { [id]: 0..4 | "nunca" }, simulado?: { [id]: { respondidas, erros } } }
 * A topic with no information gets G = 0 (pure A+B plan), source "nenhum".
 */
export function computeGap(assuntoId, nivelamento, cfg) {
  const self = nivelamento?.autoavaliacao?.[assuntoId];
  const quiz = nivelamento?.simulado?.[assuntoId];

  let gSelf = null;
  if (self === NEVER_STUDIED) gSelf = 1;
  else if (Number.isInteger(self) && self >= 0 && self <= 4) gSelf = (4 - self) / 4;

  let gQuiz = null;
  let answered = 0;
  if (quiz && Number.isFinite(quiz.respondidas) && quiz.respondidas > 0) {
    answered = quiz.respondidas;
    const erros = Math.min(Math.max(quiz.erros ?? 0, 0), answered);
    gQuiz = (erros + cfg.shrinkAlpha * cfg.shrinkPrior) / (answered + cfg.shrinkAlpha);
  }

  if (gSelf === null && gQuiz === null) return { G: 0, source: "nenhum", self: null, quiz: null };
  if (gQuiz === null) return { G: gSelf, source: "autoavaliacao", self, quiz: null };
  if (gSelf === null) return { G: gQuiz, source: "simulado", self: null, quiz: { ...quiz, G: gQuiz } };
  const wq = answered >= cfg.quizStrongN ? cfg.quizWeightStrong : cfg.quizWeightMin;
  const G = (cfg.selfWeight * gSelf + wq * gQuiz) / (cfg.selfWeight + wq);
  return { G, source: "hibrido", self, quiz: { ...quiz, G: gQuiz, peso: wq } };
}

/**
 * score({ pack, nivelamento, options }) -> {
 *   byId: { [id]: { P, F, B, E, G, M, contrib, ... } },
 *   ranking: [id...] by P desc,
 *   weights, refYear, totals
 * }
 */
export function score({ pack, nivelamento = {}, options = {} }) {
  const cfg = { ...SCORE_DEFAULTS, ...options };
  const weights = { ...DEFAULT_WEIGHTS, ...(options.weights ?? {}) };
  const refYear = options.refYear ?? Number(pack.concurso.data_prova.slice(0, 4));
  const materias = byId(pack.estrutura_prova.materias);

  const F = normalizeByMax(rawHistoryShare(pack, refYear, cfg.lambda));
  const B = normalizeByMax(rawBancaShare(pack, refYear, cfg.lambda));
  const E = normalizeByMax(rawEditalWeight(pack));

  const result = {};
  for (const a of pack.assuntos) {
    const f = F.normalized[a.id];
    const b = B.normalized[a.id];
    const e = E.normalized[a.id];
    const gap = computeGap(a.id, nivelamento, cfg);
    const g = gap.G;
    const eliminatory = materias[a.materia_id].eliminatoria && g >= cfg.eliminatoryGapThreshold;
    const mVolatile = a.volatil ? cfg.volatileMultiplier : 1;
    const mElim = eliminatory ? cfg.eliminatoryMultiplier : 1;
    const M = mVolatile * mElim;
    const base = weights.wF * f + weights.wB * b + weights.wE * e;
    const gapFactor = 1 + weights.wG * g;
    const P = base * gapFactor * M;
    result[a.id] = {
      assunto_id: a.id,
      materia_id: a.materia_id,
      P,
      F: f,
      B: b,
      E: e,
      G: g,
      M,
      // absolute contribution of each quadro-A/B term to P (they sum to P)
      contrib: {
        F: weights.wF * f * gapFactor * M,
        B: weights.wB * b * gapFactor * M,
        E: weights.wE * e * gapFactor * M,
      },
      base,
      gap_factor: gapFactor,
      gap_source: gap.source,
      autoavaliacao: gap.self,
      simulado: gap.quiz,
      multiplicadores: { volatil: mVolatile, eliminatoria: mElim },
      raw: { F: F.normalized[a.id] * F.max, B: B.normalized[a.id] * B.max, E: E.normalized[a.id] * E.max },
    };
  }

  const ids = pack.assuntos.map((a) => a.id);
  const ranking = [...ids].sort((x, y) => result[y].P - result[x].P || (x < y ? -1 : x > y ? 1 : 0));
  const rankHist = rankBy(ids, (id) => weights.wF * result[id].F + weights.wB * result[id].B);
  const rankEdital = rankBy(ids, (id) => result[id].E);
  const rankBase = rankBy(ids, (id) => result[id].base);
  const maxP = Math.max(0, ...ids.map((id) => result[id].P));
  const maxHist = Math.max(0, ...ids.map((id) => weights.wF * result[id].F + weights.wB * result[id].B));
  ranking.forEach((id, i) => {
    const r = result[id];
    r.rank = i + 1;
    r.rank_hist = rankHist[id];
    r.rank_edital = rankEdital[id];
    r.rank_base = rankBase[id];
    r.nivel = levelOf(maxP > 0 ? r.P / maxP : 0);
    r.nivel_hist = levelOf(maxHist > 0 ? (weights.wF * r.F + weights.wB * r.B) / maxHist : 0);
    r.nivel_edital = levelOf(r.E);
  });
  const totalP = ranking.reduce((s, id) => s + result[id].P, 0);
  for (const id of ranking) result[id].share = totalP > 0 ? result[id].P / totalP : 0;

  // per-matéria aggregates (for the diagnosis screen)
  const totalPoints = pack.estrutura_prova.materias.reduce((s, m) => s + materiaPoints(m), 0);
  const materiasOut = {};
  for (const m of pack.estrutura_prova.materias) {
    const topics = pack.assuntos.filter((a) => a.materia_id === m.id);
    const pTotal = topics.reduce((s, a) => s + result[a.id].P, 0);
    materiasOut[m.id] = {
      id: m.id,
      nome: m.nome,
      questoes: m.questoes,
      peso: m.peso ?? 1,
      pontos: materiaPoints(m),
      share_prova: totalPoints > 0 ? materiaPoints(m) / totalPoints : 0,
      eliminatoria: m.eliminatoria,
      min_acertos: m.min_acertos,
      P_total: pTotal,
      share_P: totalP > 0 ? pTotal / totalP : 0,
      horas_base: topics.reduce((s, a) => s + a.carga_horaria_base, 0),
      assuntos: topics.map((a) => a.id).sort((x, y) => result[y].P - result[x].P || (x < y ? -1 : x > y ? 1 : 0)),
    };
  }
  const maxMateria = Math.max(0, ...Object.values(materiasOut).map((m) => m.P_total));
  const materiaRanking = Object.keys(materiasOut).sort((x, y) => materiasOut[y].P_total - materiasOut[x].P_total || (x < y ? -1 : 1));
  materiaRanking.forEach((id, i) => {
    materiasOut[id].rank = i + 1;
    materiasOut[id].nivel = levelOf(maxMateria > 0 ? materiasOut[id].P_total / maxMateria : 0);
  });

  return { byId: result, ranking, materias: materiasOut, materiaRanking, weights, refYear, totalP, totalPoints, config: cfg };
}
