// Content pack validation.
//
// Two layers:
//   1. Structural: PACK_SCHEMA (a JSON Schema 2020-12 subset) checked by a small
//      built-in validator, so the browser needs no dependency.
//   2. Semantic: cross references, prerequisite cycles, question totals.
//
// `packs/_schema.json` must be byte-for-byte JSON.stringify(PACK_SCHEMA, null, 2);
// the test suite enforces that.

const DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";
const ID_PATTERN = "^[a-z0-9_]+$";

export const TOPIC_TYPES = ["lei_seca", "doutrina", "jurisprudencia", "calculo", "memorizacao", "pratica"];
export const EXAM_TYPES = ["multipla_escolha_4", "multipla_escolha_5", "certo_errado"];
export const LEVELING_MODES = ["autoavaliacao", "simulado", "hibrido"];

export const PACK_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "cronograma-direcionado/pack.schema.json",
  title: "Content pack - Cronograma Direcionado",
  type: "object",
  required: ["pack_version", "concurso", "estrutura_prova", "assuntos", "provas_historico", "nivelamento", "notas_banca"],
  additionalProperties: false,
  properties: {
    pack_version: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$" },
    concurso: {
      type: "object",
      required: ["id", "nome", "orgao", "banca", "cargo", "data_prova", "fonte_edital", "curado_em"],
      additionalProperties: false,
      properties: {
        id: { type: "string", pattern: "^[a-z0-9][a-z0-9-]*$" },
        nome: { type: "string", minLength: 1 },
        orgao: { type: "string", minLength: 1 },
        banca: { type: "string", minLength: 1 },
        cargo: { type: "string", minLength: 1 },
        data_prova: { type: "string", pattern: DATE_PATTERN },
        fonte_edital: { type: "string" },
        curado_em: { type: "string", pattern: DATE_PATTERN },
      },
    },
    estrutura_prova: {
      type: "object",
      required: ["total_questoes", "tipo", "penalidade_erro", "nota_corte_estimada", "materias"],
      additionalProperties: false,
      properties: {
        total_questoes: { type: "integer", minimum: 1 },
        tipo: { type: "string", enum: EXAM_TYPES },
        penalidade_erro: { type: "boolean" },
        nota_corte_estimada: { type: "number", minimum: 0, maximum: 1 },
        materias: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["id", "nome", "questoes", "eliminatoria", "min_acertos"],
            additionalProperties: false,
            properties: {
              id: { type: "string", pattern: ID_PATTERN },
              nome: { type: "string", minLength: 1 },
              questoes: { type: "integer", minimum: 0 },
              eliminatoria: { type: "boolean" },
              min_acertos: { type: ["integer", "null"], minimum: 0 },
            },
          },
        },
      },
    },
    assuntos: { type: "array", minItems: 1, items: { $ref: "#/$defs/assunto" } },
    provas_historico: { type: "array", items: { $ref: "#/$defs/prova_cargo" } },
    provas_banca: { type: "array", items: { $ref: "#/$defs/prova_banca" } },
    nivelamento: {
      type: "object",
      required: ["modo", "itens"],
      additionalProperties: false,
      properties: {
        modo: { type: "string", enum: LEVELING_MODES },
        itens: { type: "array", items: { $ref: "#/$defs/item_simulado" } },
      },
    },
    notas_banca: {
      type: "object",
      required: ["estilo", "formato_questao", "ratio_teoria_questoes_sugerido", "recomendacoes_estudo"],
      additionalProperties: false,
      properties: {
        estilo: { type: "array", items: { type: "string" } },
        formato_questao: { type: "string" },
        ratio_teoria_questoes_sugerido: {
          type: ["array", "null"],
          minItems: 2,
          maxItems: 2,
          items: { type: "number", minimum: 0, maximum: 1 },
        },
        recomendacoes_estudo: { type: "array", items: { type: "string" } },
      },
    },
  },
  $defs: {
    assunto: {
      type: "object",
      required: [
        "id", "materia_id", "nome", "edital_literal", "edital_profundidade",
        "incidencia_cargo", "incidencia_banca", "carga_horaria_base", "prereq", "tipo", "volatil",
      ],
      additionalProperties: false,
      properties: {
        id: { type: "string", pattern: "^[a-z0-9_]+\\.[a-z0-9_]+$" },
        materia_id: { type: "string", pattern: ID_PATTERN },
        nome: { type: "string", minLength: 1 },
        edital_literal: { type: "string" },
        edital_profundidade: { type: "integer", enum: [1, 2, 3] },
        incidencia_cargo: {
          type: "array",
          items: {
            type: "object",
            required: ["ano", "questoes"],
            additionalProperties: false,
            properties: {
              ano: { type: "integer", minimum: 1990, maximum: 2100 },
              questoes: { type: "integer", minimum: 0 },
            },
          },
        },
        incidencia_banca: {
          type: "array",
          items: {
            type: "object",
            required: ["concurso", "ano", "questoes"],
            additionalProperties: false,
            properties: {
              concurso: { type: "string", minLength: 1 },
              ano: { type: "integer", minimum: 1990, maximum: 2100 },
              questoes: { type: "integer", minimum: 0 },
            },
          },
        },
        carga_horaria_base: { type: "number", exclusiveMinimum: 0 },
        prereq: { type: "array", items: { type: "string" } },
        tipo: { type: "string", enum: TOPIC_TYPES },
        volatil: { type: "boolean" },
      },
    },
    prova_cargo: {
      type: "object",
      required: ["ano", "total_questoes", "fonte"],
      additionalProperties: false,
      properties: {
        ano: { type: "integer", minimum: 1990, maximum: 2100 },
        total_questoes: { type: "integer", minimum: 1 },
        fonte: { type: "string" },
      },
    },
    prova_banca: {
      type: "object",
      required: ["concurso", "ano", "total_questoes", "fonte"],
      additionalProperties: false,
      properties: {
        concurso: { type: "string", minLength: 1 },
        ano: { type: "integer", minimum: 1990, maximum: 2100 },
        total_questoes: { type: "integer", minimum: 1 },
        fonte: { type: "string" },
      },
    },
    item_simulado: {
      type: "object",
      required: ["id", "assunto_id", "enunciado", "alternativas", "gabarito"],
      additionalProperties: false,
      properties: {
        id: { type: "string", minLength: 1 },
        assunto_id: { type: "string" },
        enunciado: { type: "string", minLength: 1 },
        alternativas: { type: "array", minItems: 2, items: { type: "string" } },
        gabarito: { type: "integer", minimum: 0 },
        fonte: { type: "string" },
      },
    },
  },
};

/* ------------------------------------------------------------------ */
/* Structural validator (JSON Schema subset)                           */
/* ------------------------------------------------------------------ */

function jsonType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function typeMatches(expected, actual) {
  if (expected === actual) return true;
  return expected === "number" && actual === "integer";
}

function resolveRef(ref, root) {
  if (!ref.startsWith("#/")) throw new Error(`Unsupported $ref: ${ref}`);
  return ref
    .slice(2)
    .split("/")
    .reduce((node, key) => (node == null ? undefined : node[key]), root);
}

/** Validates `value` against `schema`; returns an array of { path, message }. */
export function validateAgainst(schema, value, root = schema, path = "", errors = []) {
  if (schema.$ref) {
    const target = resolveRef(schema.$ref, root);
    if (!target) throw new Error(`Unresolved $ref: ${schema.$ref}`);
    return validateAgainst(target, value, root, path, errors);
  }
  const at = path || "/";
  const actual = jsonType(value);

  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowed.some((t) => typeMatches(t, actual))) {
      errors.push({ path: at, message: `esperado ${allowed.join(" | ")}, recebido ${actual}` });
      return errors;
    }
  }
  if (schema.enum !== undefined && !schema.enum.some((v) => v === value)) {
    errors.push({ path: at, message: `valor fora do permitido (${schema.enum.map(String).join(", ")})` });
  }
  if (actual === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({ path: at, message: `mínimo de ${schema.minLength} caractere(s)` });
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      errors.push({ path: at, message: `não corresponde ao padrão ${schema.pattern}` });
    }
  }
  if (actual === "number" || actual === "integer") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push({ path: at, message: `mínimo ${schema.minimum}` });
    if (schema.maximum !== undefined && value > schema.maximum) errors.push({ path: at, message: `máximo ${schema.maximum}` });
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
      errors.push({ path: at, message: `deve ser maior que ${schema.exclusiveMinimum}` });
    }
  }
  if (actual === "array") {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ path: at, message: `mínimo de ${schema.minItems} item(ns)` });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push({ path: at, message: `máximo de ${schema.maxItems} item(ns)` });
    }
    if (schema.items) value.forEach((item, i) => validateAgainst(schema.items, item, root, `${path}/${i}`, errors));
  }
  if (actual === "object") {
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push({ path: `${path}/${key}`, message: "campo obrigatório ausente" });
    }
    const props = schema.properties ?? {};
    for (const [key, sub] of Object.entries(props)) {
      if (key in value) validateAgainst(sub, value[key], root, `${path}/${key}`, errors);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in props)) errors.push({ path: `${path}/${key}`, message: "campo não previsto no schema" });
      }
    }
  }
  return errors;
}

/* ------------------------------------------------------------------ */
/* Semantic checks                                                     */
/* ------------------------------------------------------------------ */

function isRealDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** Returns one cycle (array of ids, first === last) or null. Deterministic DFS in input order. */
export function findPrereqCycle(assuntos) {
  const next = new Map(assuntos.map((a) => [a.id, a.prereq]));
  const state = new Map(); // 1 = on stack, 2 = done
  const stack = [];
  const visit = (id) => {
    state.set(id, 1);
    stack.push(id);
    for (const dep of next.get(id) ?? []) {
      if (!next.has(dep)) continue; // dangling refs are reported elsewhere
      const s = state.get(dep);
      if (s === 1) return [...stack.slice(stack.indexOf(dep)), dep];
      if (s === undefined) {
        const found = visit(dep);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };
  for (const a of assuntos) {
    if (state.get(a.id) === undefined) {
      const found = visit(a.id);
      if (found) return found;
    }
  }
  return null;
}

function semanticChecks(pack, errors, warnings) {
  const materias = pack.estrutura_prova.materias;
  const materiaIds = new Set();
  materias.forEach((m, i) => {
    if (materiaIds.has(m.id)) errors.push({ path: `/estrutura_prova/materias/${i}/id`, message: `id duplicado: ${m.id}` });
    materiaIds.add(m.id);
    if (m.eliminatoria) {
      if (m.min_acertos === null) warnings.push({ path: `/estrutura_prova/materias/${i}/min_acertos`, message: "matéria eliminatória sem min_acertos" });
      else if (m.min_acertos > m.questoes) errors.push({ path: `/estrutura_prova/materias/${i}/min_acertos`, message: "maior que o número de questões da matéria" });
    }
  });
  const sumQ = materias.reduce((s, m) => s + m.questoes, 0);
  const total = pack.estrutura_prova.total_questoes;
  if (sumQ > total) errors.push({ path: "/estrutura_prova/materias", message: `soma das questões (${sumQ}) excede total_questoes (${total})` });
  else if (sumQ < total) warnings.push({ path: "/estrutura_prova/materias", message: `soma das questões (${sumQ}) abaixo de total_questoes (${total})` });

  for (const key of ["data_prova", "curado_em"]) {
    if (!isRealDate(pack.concurso[key])) errors.push({ path: `/concurso/${key}`, message: "data inexistente" });
  }

  const anosCargo = new Map();
  pack.provas_historico.forEach((p, i) => {
    if (anosCargo.has(p.ano)) errors.push({ path: `/provas_historico/${i}/ano`, message: `ano duplicado: ${p.ano}` });
    anosCargo.set(p.ano, p.total_questoes);
  });
  const bancaProvas = new Map();
  (pack.provas_banca ?? []).forEach((p, i) => {
    if (bancaProvas.has(p.concurso)) errors.push({ path: `/provas_banca/${i}/concurso`, message: `concurso duplicado: ${p.concurso}` });
    bancaProvas.set(p.concurso, p);
  });

  const assuntoIds = new Set();
  pack.assuntos.forEach((a, i) => {
    const base = `/assuntos/${i}`;
    if (assuntoIds.has(a.id)) errors.push({ path: `${base}/id`, message: `id duplicado: ${a.id}` });
    assuntoIds.add(a.id);
    if (!materiaIds.has(a.materia_id)) errors.push({ path: `${base}/materia_id`, message: `matéria desconhecida: ${a.materia_id}` });
    else if (!a.id.startsWith(`${a.materia_id}.`)) warnings.push({ path: `${base}/id`, message: `convenção: id deveria começar com "${a.materia_id}."` });
    if (a.prereq.includes(a.id)) errors.push({ path: `${base}/prereq`, message: "assunto é pré-requisito de si mesmo" });
    const seen = new Map();
    a.incidencia_cargo.forEach((inc, j) => {
      if (!anosCargo.has(inc.ano)) errors.push({ path: `${base}/incidencia_cargo/${j}/ano`, message: `ano ${inc.ano} não consta em provas_historico` });
      else if (inc.questoes > anosCargo.get(inc.ano)) errors.push({ path: `${base}/incidencia_cargo/${j}/questoes`, message: "maior que o total da prova" });
      if (seen.has(inc.ano)) errors.push({ path: `${base}/incidencia_cargo/${j}/ano`, message: `ano repetido: ${inc.ano}` });
      seen.set(inc.ano, true);
    });
    const seenB = new Map();
    a.incidencia_banca.forEach((inc, j) => {
      const prova = bancaProvas.get(inc.concurso);
      if (!prova) errors.push({ path: `${base}/incidencia_banca/${j}/concurso`, message: `concurso ${inc.concurso} não consta em provas_banca` });
      else {
        if (prova.ano !== inc.ano) errors.push({ path: `${base}/incidencia_banca/${j}/ano`, message: `ano difere de provas_banca (${prova.ano})` });
        if (inc.questoes > prova.total_questoes) errors.push({ path: `${base}/incidencia_banca/${j}/questoes`, message: "maior que o total da prova" });
      }
      if (seenB.has(inc.concurso)) errors.push({ path: `${base}/incidencia_banca/${j}/concurso`, message: `concurso repetido: ${inc.concurso}` });
      seenB.set(inc.concurso, true);
    });
  });
  pack.assuntos.forEach((a, i) => {
    a.prereq.forEach((p, j) => {
      if (!assuntoIds.has(p)) errors.push({ path: `/assuntos/${i}/prereq/${j}`, message: `pré-requisito desconhecido: ${p}` });
    });
  });
  const cycle = findPrereqCycle(pack.assuntos);
  if (cycle) errors.push({ path: "/assuntos", message: `ciclo em prereq: ${cycle.join(" -> ")}` });

  pack.nivelamento.itens.forEach((it, i) => {
    if (!assuntoIds.has(it.assunto_id)) errors.push({ path: `/nivelamento/itens/${i}/assunto_id`, message: `assunto desconhecido: ${it.assunto_id}` });
    if (it.gabarito >= it.alternativas.length) errors.push({ path: `/nivelamento/itens/${i}/gabarito`, message: "índice fora das alternativas" });
  });
  if (pack.nivelamento.modo !== "autoavaliacao" && pack.nivelamento.itens.length === 0) {
    warnings.push({ path: "/nivelamento/itens", message: `modo ${pack.nivelamento.modo} sem itens; nivelamento cai para autoavaliação` });
  }

  const ratio = pack.notas_banca.ratio_teoria_questoes_sugerido;
  if (Array.isArray(ratio) && Math.abs(ratio[0] + ratio[1] - 1) > 1e-6) {
    errors.push({ path: "/notas_banca/ratio_teoria_questoes_sugerido", message: "os dois valores devem somar 1" });
  }
}

/** Full validation. `ok` is false when there is at least one error. */
export function validatePack(pack) {
  const errors = [];
  const warnings = [];
  if (jsonType(pack) !== "object") {
    return { ok: false, errors: [{ path: "/", message: "pack deve ser um objeto" }], warnings };
  }
  validateAgainst(PACK_SCHEMA, pack, PACK_SCHEMA, "", errors);
  if (errors.length === 0) semanticChecks(pack, errors, warnings);
  return { ok: errors.length === 0, errors, warnings };
}

export function formatIssues(issues) {
  return issues.map((e) => `${e.path}: ${e.message}`).join("\n");
}
