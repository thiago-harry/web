// Leveling quiz: deterministic sample of N items from the pack, stratified by the
// edital weight of each topic, and scoring of the answers into { respondidas, erros }.

import { materiaPoints } from "./score.js";

export const QUIZ_DEFAULTS = Object.freeze({ n: 40 });

/** FNV-1a hash of a string -> uint32, used as PRNG seed. */
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: small deterministic PRNG. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rnd) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Largest-remainder apportionment of `total` among `weights`, honoring per-slot caps. */
function apportion(weights, caps, total) {
  const n = weights.length;
  const out = new Array(n).fill(0);
  let remaining = total;
  let open = weights.map((_, i) => i).filter((i) => caps[i] > 0);
  for (let round = 0; round < 10 && remaining > 0 && open.length; round++) {
    const wsum = open.reduce((s, i) => s + weights[i], 0);
    const exact = open.map((i) => (wsum > 0 ? (remaining * weights[i]) / wsum : remaining / open.length));
    const base = exact.map((x, k) => Math.min(Math.floor(x), caps[open[k]] - out[open[k]]));
    let given = base.reduce((s, x) => s + x, 0);
    const frac = exact.map((x, k) => ({ k, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.k - b.k);
    for (const { k } of frac) {
      if (given >= remaining) break;
      if (out[open[k]] + base[k] < caps[open[k]]) {
        base[k] += 1;
        given += 1;
      }
    }
    open.forEach((i, k) => {
      out[i] += base[k];
    });
    remaining -= given;
    open = open.filter((i) => out[i] < caps[i]);
    if (given === 0) break;
  }
  return out;
}

/**
 * sampleQuiz(pack, { n, seed }) -> { itens: [...], cotas: { [assunto_id]: n }, cobertos: [ids], sem_itens: [ids] }
 * Topics are weighted by edital points × depth (the same signal as E); every topic with
 * items gets at least one question while N allows. Items of different topics are interleaved.
 */
export function sampleQuiz(pack, options = {}) {
  const n = options.n ?? QUIZ_DEFAULTS.n;
  const itens = (pack.nivelamento?.itens ?? []).filter((it) => !it.desatualizada);
  const seed = hashSeed(options.seed ?? `${pack.concurso.id}|${pack.pack_version}|quiz`);
  const rnd = mulberry32(seed);
  const materias = Object.fromEntries(pack.estrutura_prova.materias.map((m) => [m.id, m]));
  const depthSum = {};
  for (const a of pack.assuntos) depthSum[a.materia_id] = (depthSum[a.materia_id] ?? 0) + a.edital_profundidade;

  const byTopic = new Map(pack.assuntos.map((a) => [a.id, []]));
  for (const it of itens) if (byTopic.has(it.assunto_id)) byTopic.get(it.assunto_id).push(it);
  const topics = pack.assuntos.filter((a) => byTopic.get(a.id).length > 0);
  const semItens = pack.assuntos.filter((a) => byTopic.get(a.id).length === 0).map((a) => a.id);
  if (!topics.length) return { itens: [], cotas: {}, cobertos: [], sem_itens: semItens, seed };

  const weights = topics.map((a) => materiaPoints(materias[a.materia_id]) * (a.edital_profundidade / depthSum[a.materia_id]));
  const caps = topics.map((a) => byTopic.get(a.id).length);
  // guarantee one per topic first, then apportion the rest by weight
  const quotas = topics.map(() => 0);
  let left = n;
  if (n >= topics.length) {
    topics.forEach((_, i) => {
      quotas[i] = 1;
    });
    left = n - topics.length;
  }
  const extra = apportion(weights, caps.map((c, i) => c - quotas[i]), left);
  const finalQuota = quotas.map((q, i) => q + extra[i]);
  // if n < topics, give the single slots to the heaviest topics
  if (n < topics.length) {
    const order = topics.map((_, i) => i).sort((a, b) => weights[b] - weights[a] || a - b);
    order.slice(0, n).forEach((i) => {
      finalQuota[i] = 1;
    });
  }

  const picked = topics.map((a, i) => shuffle([...byTopic.get(a.id)].sort((x, y) => (x.id < y.id ? -1 : 1)), rnd).slice(0, finalQuota[i]));
  const out = [];
  for (let k = 0; out.length < picked.reduce((s, p) => s + p.length, 0); k++) {
    for (const list of picked) if (list[k]) out.push(list[k]);
  }
  const cotas = Object.fromEntries(topics.map((a, i) => [a.id, finalQuota[i]]).filter(([, q]) => q > 0));
  return { itens: out, cotas, cobertos: Object.keys(cotas), sem_itens: semItens, seed };
}

/**
 * scoreQuiz(itens, respostas) -> { porAssunto: { [id]: { respondidas, erros, acertos } }, total: {...} }
 * `respostas` maps item id -> chosen alternative index. Unanswered items are ignored.
 */
export function scoreQuiz(itens, respostas = {}) {
  const porAssunto = {};
  const total = { respondidas: 0, acertos: 0, erros: 0, itens: itens.length };
  for (const it of itens) {
    const r = respostas[it.id];
    if (!Number.isInteger(r)) continue;
    const slot = (porAssunto[it.assunto_id] ??= { respondidas: 0, erros: 0, acertos: 0 });
    slot.respondidas += 1;
    total.respondidas += 1;
    if (r === it.gabarito) {
      slot.acertos += 1;
      total.acertos += 1;
    } else {
      slot.erros += 1;
      total.erros += 1;
    }
  }
  return { porAssunto, total };
}
