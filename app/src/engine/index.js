// Public API of the engine. Pure functions, no DOM, no network.
//
//   generate({ pack, nivelamento, disponibilidade, options })
//     -> { ok, validacao, scores, capacidade, orcamentos, cronograma, resumo, avisos,
//          cobertura_parcial, assuntos_cortados, deficit_horas, mensagem_id }
//
//   nivelamento    = { autoavaliacao?: { [assunto_id]: 0..4 | "nunca" },
//                      simulado?:      { [assunto_id]: { respondidas, erros } } }
//   disponibilidade = { horas_por_dia_semana: { seg..dom }, data_inicio, data_prova?,
//                       bloco_min_minutos?, bloco_max_minutos? }
//   options        = { score?: {...SCORE_DEFAULTS, weights}, allocate?: {...ALLOCATION_DEFAULTS} }

import { validatePack, PACK_SCHEMA, formatIssues } from "./schema.js";
import { score, DEFAULT_WEIGHTS, SCORE_DEFAULTS, NEVER_STUDIED } from "./score.js";
import { allocate, ALLOCATION_DEFAULTS } from "./allocate.js";
import { planRevisions, REVISION_INTERVALS } from "./revision.js";

export function generate({ pack, nivelamento = {}, disponibilidade, options = {} }) {
  const validacao = validatePack(pack);
  if (!validacao.ok) return { ok: false, etapa: "validacao", erros: validacao.errors, avisos: validacao.warnings };
  const scores = score({ pack, nivelamento, options: options.score ?? {} });
  const alloc = allocate({ pack, scores, disponibilidade, options: options.allocate ?? {} });
  if (!alloc.ok) return { ...alloc, validacao: { avisos: validacao.warnings }, scores };
  return { ...alloc, validacao: { avisos: validacao.warnings }, scores };
}

export {
  validatePack,
  PACK_SCHEMA,
  formatIssues,
  score,
  allocate,
  planRevisions,
  DEFAULT_WEIGHTS,
  SCORE_DEFAULTS,
  ALLOCATION_DEFAULTS,
  REVISION_INTERVALS,
  NEVER_STUDIED,
};
