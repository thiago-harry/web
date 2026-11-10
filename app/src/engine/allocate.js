// Allocation: priority + availability -> week-by-week schedule.
//
// Steps (spec §4):
//   1. capacity  = study minutes until the exam, minus a 10% buffer per week
//   2. budgets   = capacity × P/ΣP per topic, clamped to [0.5, 2] × carga_horaria_base,
//                  surplus redistributed until it converges
//   3. order     = topological by prereq, ties by P desc
//   4. fill      = day by day; revisions first (≤ 15% of the week), mock exams on
//                  cadence, then study blocks; final stretch = no new topics
//
// Constants not given by the spec are grouped in ALLOCATION_DEFAULTS with a
// "not in spec" marker so they can be confirmed or changed in one place.

import { parseDate, toISO, addDays, diffDays, weekdayKey, WEEKDAY_KEYS } from "./dates.js";
import { RevisionQueue, REVISION_INTERVALS } from "./revision.js";
import { explainStudy, explainRevision, explainMock } from "./explain.js";

export const ALLOCATION_DEFAULTS = Object.freeze({
  buffer: 0.1, // spec §4.1
  clamp: [0.5, 2], // spec §4.2, × carga_horaria_base
  max_new_per_week: 2, // spec §4.4
  ratio_first_pass: [0.6, 0.4], // spec §4.4 (teoria, questões)
  ratio_next_pass: [0.3, 0.7], // spec §4.4
  revision_intervals: REVISION_INTERVALS, // spec §4.4
  revision_week_cap: 0.15, // spec §4.4
  mock_every_weeks: 4, // spec §4.4
  mock_every_weeks_final: 2, // spec §4.4
  mock_final_window_days: 60, // spec §4.4
  final_stretch_fraction: 0.15, // spec §4.4
  revision_minutes: 30, // NOT IN SPEC: length of one revision block
  mock_minutes_per_question: 3, // NOT IN SPEC: mock duration = questions × 3 min, capped by the day
  leftover: "free", // NOT IN SPEC: "free" keeps spare capacity empty; "second_pass" fills it at ratio_next_pass
  accept_cut: false, // when capacity is insufficient, also build the schedule without the cut topics
});

const cmpId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const floorTo = (v, step) => Math.floor(v / step + 1e-9) * step;
const roundTo = (v, step) => Math.round(v / step) * step;
const round1 = (v) => Math.round(v * 10) / 10;
const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + f(x), 0);

/* ------------------------------------------------------------------ */
/* Input                                                                */
/* ------------------------------------------------------------------ */

export function normalizeAvailability(d, pack) {
  const erros = [];
  const hours = d?.horas_por_dia_semana ?? {};
  const perDay = {};
  for (const k of WEEKDAY_KEYS) {
    const v = hours[k] ?? 0;
    if (!Number.isFinite(v) || v < 0 || v > 24) erros.push({ path: `/horas_por_dia_semana/${k}`, message: "use um número de horas entre 0 e 24" });
    perDay[k] = v;
  }
  for (const k of Object.keys(hours)) {
    if (!WEEKDAY_KEYS.includes(k)) erros.push({ path: `/horas_por_dia_semana/${k}`, message: "dia desconhecido (use seg, ter, qua, qui, sex, sab, dom)" });
  }
  const start = parseDate(d?.data_inicio);
  if (start === null) erros.push({ path: "/data_inicio", message: "data inválida (AAAA-MM-DD)" });
  const examIso = d?.data_prova ?? pack.concurso.data_prova;
  const exam = parseDate(examIso);
  if (exam === null) erros.push({ path: "/data_prova", message: "data inválida (AAAA-MM-DD)" });
  const blocoMin = d?.bloco_min_minutos ?? 30;
  const blocoMax = d?.bloco_max_minutos ?? 90;
  if (!Number.isInteger(blocoMin) || blocoMin < 5) erros.push({ path: "/bloco_min_minutos", message: "inteiro, mínimo 5" });
  if (!Number.isInteger(blocoMax) || blocoMax < blocoMin || blocoMax % blocoMin !== 0) {
    erros.push({ path: "/bloco_max_minutos", message: "deve ser múltiplo de bloco_min_minutos e maior ou igual a ele" });
  }
  if (start !== null && exam !== null && start >= exam) erros.push({ path: "/data_inicio", message: "deve ser anterior à data da prova" });
  if (Object.values(perDay).every((v) => v === 0)) erros.push({ path: "/horas_por_dia_semana", message: "nenhuma hora disponível na semana" });
  if (erros.length) return { ok: false, erros };
  return { ok: true, perDay, start, exam, blocoMin, blocoMax };
}

/* ------------------------------------------------------------------ */
/* Calendar                                                             */
/* ------------------------------------------------------------------ */

export function buildCalendar(input, cfg) {
  const { start, exam, perDay, blocoMin } = input;
  const nDays = diffDays(start, exam); // study days: start .. exam - 1
  const finalStart = nDays - Math.ceil(nDays * cfg.final_stretch_fraction);
  const days = [];
  for (let i = 0; i < nDays; i++) {
    const t = addDays(start, i);
    const wd = weekdayKey(t);
    days.push({ index: i, date: t, iso: toISO(t), weekday: wd, cap_min: floorTo(perDay[wd] * 60, blocoMin), final: i >= finalStart, blocks: [], livre_min: 0 });
  }
  const weeks = [];
  let carry = 0; // buffer rounding carried to the next week, so the 10% holds on average
  for (let w = 0; w * 7 < nDays; w++) {
    const slice = days.slice(w * 7, w * 7 + 7);
    const raw = sum(slice, (d) => d.cap_min);
    const target = raw * (1 - cfg.buffer) + carry;
    const usable = Math.min(raw, floorTo(target, blocoMin));
    carry = target - usable;
    weeks.push({
      numero: w + 1,
      start: slice[0].date,
      end: slice[slice.length - 1].date,
      days: slice,
      raw_min: raw,
      usable_min: usable,
    });
  }
  return {
    days,
    weeks,
    start,
    exam,
    nDays,
    finalStart,
    rawMin: sum(weeks, (w) => w.raw_min),
    usableMin: sum(weeks, (w) => w.usable_min),
  };
}

/* ------------------------------------------------------------------ */
/* Mock exams and reserves                                              */
/* ------------------------------------------------------------------ */

/** Which weeks get a full mock exam, on which day and for how long. Map numero -> { dayIndex, minutes }. */
export function planMocks(cal, cfg, input, examQuestoes) {
  const { blocoMin } = input;
  const plan = new Map();
  let since = 0;
  for (const week of cal.weeks) {
    since += 1;
    const cadence = diffDays(week.start, cal.exam) <= cfg.mock_final_window_days ? cfg.mock_every_weeks_final : cfg.mock_every_weeks;
    if (since < cadence) continue;
    const best = week.days.reduce((b, d) => (d.cap_min > (b ? b.cap_min : 0) ? d : b), null);
    if (!best) continue;
    const minutes = Math.min(best.cap_min, Math.max(blocoMin, roundTo(examQuestoes * cfg.mock_minutes_per_question, blocoMin)), week.usable_min);
    if (minutes < blocoMin) continue;
    plan.set(week.numero, { dayIndex: best.index, minutes, final: best.final });
    since = 0;
  }
  return plan;
}

/**
 * Capacity that first-pass study can count on: usable minutes minus the final
 * stretch (no new topics there), minus mock exams, minus a revision reserve.
 * Without this the lowest-priority topics never open.
 */
export function estimateReserves(cal, cfg, input, mocks, nTopics) {
  const { blocoMin } = input;
  let finalMin = 0;
  let revCapNonFinal = 0;
  for (const week of cal.weeks) {
    const finalCap = sum(week.days.filter((d) => d.final), (d) => d.cap_min);
    const share = week.raw_min > 0 ? finalCap / week.raw_min : 0;
    finalMin += floorTo(week.usable_min * share, blocoMin);
    if (share < 1) revCapNonFinal += week.usable_min * cfg.revision_week_cap * (1 - share);
  }
  const mockMin = sum([...mocks.values()].filter((m) => !m.final), (m) => m.minutes);
  const revisionMin = Math.min(revCapNonFinal, nTopics * cfg.revision_intervals.length * cfg.revision_minutes);
  const contentMin = Math.max(0, floorTo(cal.usableMin - finalMin - mockMin - revisionMin, blocoMin));
  return { final_min: finalMin, mock_min: mockMin, revision_min: revisionMin, content_min: contentMin };
}

/* ------------------------------------------------------------------ */
/* Budgets                                                              */
/* ------------------------------------------------------------------ */

/**
 * capacity × P/ΣP with clamps, redistributing until stable. When capacity is below
 * Σ 0.5 × base the lowest-P topics are cut (never compressed).
 */
export function computeBudgets(pack, scores, capacityHours, cfg, input) {
  const [lo, hi] = cfg.clamp;
  const items = pack.assuntos.map((a) => ({ id: a.id, base: a.carga_horaria_base, P: scores.byId[a.id].P }));
  const minTotal = sum(items, (i) => lo * i.base);
  let partial = false;
  let deficit = 0;
  const cut = [];
  let kept = items;
  if (capacityHours < minTotal - 1e-9) {
    partial = true;
    deficit = minTotal - capacityHours;
    let need = minTotal;
    for (const it of [...items].sort((a, b) => a.P - b.P || cmpId(a.id, b.id))) {
      if (need <= capacityHours + 1e-9) break;
      cut.push(it.id);
      need -= lo * it.base;
    }
    const cutSet = new Set(cut);
    kept = items.filter((i) => !cutSet.has(i.id));
  }

  const hours = {};
  const fixed = new Map();
  for (let iter = 0; iter < 200; iter++) {
    const free = kept.filter((i) => !fixed.has(i.id));
    if (!free.length) break;
    const capFree = capacityHours - sum([...fixed.values()]);
    const sumP = sum(free, (i) => i.P);
    let changed = false;
    // lower clamps first: a topic below its floor must get the floor
    for (const i of free) {
      const share = sumP > 0 ? i.P / sumP : 1 / free.length;
      if (capFree * share < lo * i.base - 1e-9) {
        fixed.set(i.id, lo * i.base);
        changed = true;
      }
    }
    if (changed) continue;
    for (const i of free) {
      const share = sumP > 0 ? i.P / sumP : 1 / free.length;
      const b = capFree * share;
      if (b > hi * i.base + 1e-9) {
        fixed.set(i.id, hi * i.base);
        changed = true;
      } else hours[i.id] = b;
    }
    if (!changed) break;
  }
  for (const [id, h] of fixed) hours[id] = h;
  const totalH = sum(kept, (i) => hours[i.id] ?? 0);
  if (totalH > capacityHours + 1e-6) {
    // only reachable through rounding; scale the non-floor budgets down
    const excess = totalH - capacityHours;
    const scalable = kept.filter((i) => hours[i.id] > lo * i.base + 1e-9);
    const pool = sum(scalable, (i) => hours[i.id] - lo * i.base);
    for (const i of scalable) hours[i.id] -= (excess * (hours[i.id] - lo * i.base)) / pool;
  }

  const [ratioT] = pack.notas_banca.ratio_teoria_questoes_sugerido ?? cfg.ratio_first_pass;
  const byId = {};
  const { blocoMin } = input;
  for (const i of kept) {
    const minutes = Math.max(blocoMin, roundTo(hours[i.id] * 60, blocoMin));
    const t = roundTo(minutes * ratioT, blocoMin);
    byId[i.id] = { hours: hours[i.id], min: minutes, t_min: t, q_min: minutes - t, base: i.base, clamp: hours[i.id] <= lo * i.base + 1e-9 ? "min" : hours[i.id] >= hi * i.base - 1e-9 ? "max" : null };
  }
  const table = kept
    .map((i) => ({ assunto_id: i.id, ...byId[i.id] }))
    .sort((a, b) => scores.byId[b.assunto_id].P - scores.byId[a.assunto_id].P || cmpId(a.assunto_id, b.assunto_id));
  return { byId, table, partial, cut, deficit, minTotal, capacityHours, sumHours: sum(kept, (i) => hours[i.id]) };
}

/* ------------------------------------------------------------------ */
/* Ordering                                                             */
/* ------------------------------------------------------------------ */

export function topoOrder(pack, scores, budgetById) {
  const byIdA = Object.fromEntries(pack.assuntos.map((a) => [a.id, a]));
  const ids = pack.assuntos.map((a) => a.id).filter((id) => budgetById[id]);
  const set = new Set(ids);
  const indeg = new Map(ids.map((id) => [id, 0]));
  const children = new Map(ids.map((id) => [id, []]));
  for (const id of ids) {
    for (const p of byIdA[id].prereq) {
      if (!set.has(p)) continue;
      indeg.set(id, indeg.get(id) + 1);
      children.get(p).push(id);
    }
  }
  const rank = (a, b) => scores.byId[b].P - scores.byId[a].P || cmpId(a, b);
  const ready = ids.filter((id) => indeg.get(id) === 0).sort(rank);
  const out = [];
  while (ready.length) {
    const id = ready.shift();
    out.push(id);
    for (const c of children.get(id)) {
      indeg.set(c, indeg.get(c) - 1);
      if (indeg.get(c) === 0) {
        ready.push(c);
        ready.sort(rank);
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Filling                                                              */
/* ------------------------------------------------------------------ */

class WeightedRoundRobin {
  constructor() {
    this.cur = new Map();
  }
  /** Smooth weighted round robin: picks ids in proportion to weight, interleaved. */
  next(ids, weightOf) {
    let total = 0;
    let best = null;
    for (const id of ids) {
      const w = Math.max(weightOf(id), 1e-9);
      const c = (this.cur.get(id) ?? 0) + w;
      this.cur.set(id, c);
      total += w;
      if (best === null || c > this.cur.get(best) + 1e-12) best = id;
    }
    this.cur.set(best, this.cur.get(best) - total);
    return best;
  }
}

function fillCalendar({ pack, scores, cal, budgets, order, cfg, input, mocks }) {
  const { blocoMin, blocoMax } = input;
  const assuntos = Object.fromEntries(pack.assuntos.map((a) => [a.id, a]));
  const total = order.length;
  const warnings = [];
  const orderIndex = new Map(order.map((id, i) => [id, i]));
  const byPriority = (a, b) => scores.byId[b].P - scores.byId[a].P || orderIndex.get(a) - orderIndex.get(b);
  const examQuestoes = pack.estrutura_prova.total_questoes;
  const [ratioNextT] = pack.notas_banca.ratio_teoria_questoes_sugerido ?? cfg.ratio_next_pass;

  const st = {};
  for (const id of order) {
    const b = budgets.byId[id];
    st[id] = {
      id,
      materia_id: assuntos[id].materia_id,
      t_target: b.t_min,
      q_target: b.q_min,
      t_done: 0,
      q_done: 0,
      opened: null,
      closed: null,
      p2_t: 0,
      p2_q: 0,
      extra_min: 0,
      rev_count: 0,
    };
  }
  const left = (s) => s.t_target - s.t_done + (s.q_target - s.q_done);
  const opened = [];
  const isOpen = (id) => st[id].opened !== null;
  const isReady = (id) => !isOpen(id) && assuntos[id].prereq.every((p) => !(p in st) || isOpen(p));
  const activeWithWork = () => opened.filter((id) => left(st[id]) > 0);
  const revQueue = new RevisionQueue();
  const rr = new WeightedRoundRobin();
  const rr2 = new WeightedRoundRobin();
  const weeksOut = [];
  let revCarry = 0; // unused revision allowance (≤ one block) carried to the next week

  const close = (s, day) => {
    s.closed = day.date;
    revQueue.add(assuntos[s.id], day.date, cal.exam, cfg.revision_intervals);
  };
  const nextActivity = (s) => {
    const tl = s.t_target - s.t_done;
    const ql = s.q_target - s.q_done;
    if (tl <= 0) return "questoes";
    if (ql <= 0) return "teoria";
    if (s.t_done / s.t_target < 0.5) return "teoria"; // front-load theory, then alternate by progress
    return s.t_done / s.t_target <= s.q_done / s.q_target ? "teoria" : "questoes";
  };
  // With two or more topics in play, no single block takes more than half the day.
  const blockCap = (day, nTopics) => (nTopics >= 2 ? Math.min(blocoMax, Math.max(blocoMin, floorTo(day.cap_min / 2, blocoMin))) : blocoMax);
  const studyBlock = (id, atividade, minutos, extra) => ({
    assunto_id: id,
    materia_id: st[id].materia_id,
    atividade,
    minutos,
    passada: extra.pass,
    ...explainStudy({ atividade, assunto: assuntos[id], score: scores.byId[id], total, pass: extra.pass, finalStretch: extra.finalStretch }),
  });

  for (const week of cal.weeks) {
    let newCount = 0;
    const weekNew = [];
    // 15% of the week, strict; weeks too small for one block accumulate their share
    const revOwn = week.usable_min * cfg.revision_week_cap;
    const revAllowance = revOwn >= cfg.revision_minutes ? revOwn : revOwn + revCarry;
    const revCap = floorTo(revAllowance, cfg.revision_minutes);
    let revUsed = 0;
    let weekUsed = 0;

    const mock = mocks.get(week.numero) ?? null;
    const mockDay = mock ? mock.dayIndex : null;
    const mockMin = mock ? mock.minutes : 0;

    const tryOpen = (day, avoidMaterias, force) => {
      if (!force && newCount >= cfg.max_new_per_week) return null;
      const ready = order.filter(isReady);
      if (!ready.length) return null;
      const pick = ready.find((id) => !avoidMaterias.has(st[id].materia_id)) ?? ready[0];
      st[pick].opened = day.date;
      opened.push(pick);
      newCount += 1;
      weekNew.push(pick);
      if (force) {
        warnings.push({ codigo: "cap_novos_relaxado", semana: week.numero, data: day.iso, assunto_id: pick, mensagem: "Limite de 2 assuntos novos por semana relaxado para não deixar o dia vazio." });
      }
      return pick;
    };

    for (const day of week.days) {
      let remaining = Math.min(day.cap_min, week.usable_min - weekUsed);
      let lastMat = null;
      const push = (block) => {
        day.blocks.push(block);
        remaining -= block.minutos;
        weekUsed += block.minutos;
        lastMat = block.materia_id;
      };

      // 1. spaced revisions (precedence over new content, capped per week)
      let due = revQueue.due(day.date);
      while (due.length && revUsed + cfg.revision_minutes <= revCap && remaining >= cfg.revision_minutes) {
        const item = due.find((it) => it.materia_id !== lastMat);
        if (!item) break; // same matéria as the previous block: leave it for the next day
        const a = assuntos[item.assunto_id];
        push({
          assunto_id: a.id,
          materia_id: a.materia_id,
          atividade: "revisao",
          minutos: cfg.revision_minutes,
          intervalo_dias: item.intervalo_dias,
          ...explainRevision({ assunto: a, intervaloDias: item.intervalo_dias, closedAt: toISO(item.closedAt) }),
        });
        st[a.id].rev_count += 1;
        revUsed += cfg.revision_minutes;
        revQueue.remove(item);
        due = revQueue.due(day.date);
      }

      // 2. mock exam
      if (day.index === mockDay && remaining >= mockMin) {
        push({
          assunto_id: null,
          materia_id: null,
          atividade: "simulado",
          minutos: mockMin,
          ...explainMock({ questoes: examQuestoes, minutos: mockMin, weeksToExam: Math.max(1, Math.ceil(diffDays(day.date, cal.exam) / 7)) }),
        });
      }

      // 3. study blocks
      let guard = 0;
      while (remaining >= blocoMin && guard++ < 10_000) {
        if (day.final) {
          // final stretch: no new topics, no theory; finish started topics as questões, then extra questões by priority
          if (!opened.length) break;
          const cands = activeWithWork();
          const candPool = cands.filter((id) => st[id].materia_id !== lastMat);
          const extraPool = opened.filter((id) => st[id].materia_id !== lastMat);
          const forced = !candPool.length && !extraPool.length;
          if (forced && lastMat !== null) {
            warnings.push({ codigo: "materia_consecutiva", data: day.iso, materia_id: lastMat, mensagem: "Reta final: só havia uma matéria disponível; blocos consecutivos da mesma matéria." });
          }
          if (candPool.length || (forced && cands.length)) {
            const chosen = (candPool.length ? candPool : cands).sort(byPriority)[0];
            const s = st[chosen];
            const size = Math.min(blockCap(day, opened.length), remaining, left(s));
            const fromQ = Math.min(size, s.q_target - s.q_done);
            s.q_done += fromQ;
            s.t_done += size - fromQ; // remaining theory budget is spent as questões
            push(studyBlock(chosen, "questoes", size, { pass: 1, finalStretch: true }));
            if (left(s) === 0) close(s, day);
          } else {
            const chosen = rr.next(extraPool.length ? extraPool : opened, (id) => scores.byId[id].P);
            const size = Math.min(blockCap(day, opened.length), remaining);
            st[chosen].extra_min += size;
            push(studyBlock(chosen, "questoes", size, { pass: 1, finalStretch: true }));
          }
          continue;
        }

        // keep at least two topics of different matérias in progress when possible
        let active = activeWithWork();
        let mats = new Set(active.map((id) => st[id].materia_id));
        while (active.length < 2 && tryOpen(day, mats, false)) {
          active = activeWithWork();
          mats = new Set(active.map((id) => st[id].materia_id));
        }
        if (active.length === 0) {
          const forced = tryOpen(day, mats, true);
          if (!forced) {
            if (cfg.leftover === "second_pass" && opened.length) {
              const pool = opened.filter((id) => st[id].materia_id !== lastMat);
              const chosen = rr2.next(pool.length ? pool : opened, (id) => scores.byId[id].P);
              const s = st[chosen];
              const doneP2 = s.p2_t + s.p2_q;
              const atividade = doneP2 === 0 || s.p2_t / doneP2 < ratioNextT ? "teoria" : "questoes";
              const size = Math.min(blockCap(day, opened.length), remaining);
              if (atividade === "teoria") s.p2_t += size;
              else s.p2_q += size;
              push(studyBlock(chosen, atividade, size, { pass: 2, finalStretch: false }));
              continue;
            }
            break; // free time
          }
          active = activeWithWork();
        }
        let pool = active.filter((id) => st[id].materia_id !== lastMat);
        if (!pool.length) {
          const o = tryOpen(day, new Set([lastMat]), false);
          if (o && st[o].materia_id !== lastMat) pool = [o];
          else {
            pool = active;
            if (lastMat !== null) warnings.push({ codigo: "materia_consecutiva", data: day.iso, materia_id: lastMat, mensagem: "Só havia uma matéria com trabalho pendente; blocos consecutivos da mesma matéria." });
          }
        }
        const chosen = pool.sort(byPriority)[0];
        const s = st[chosen];
        const atividade = nextActivity(s);
        const avail = atividade === "teoria" ? s.t_target - s.t_done : s.q_target - s.q_done;
        const size = Math.min(blockCap(day, active.length), remaining, avail);
        if (atividade === "teoria") s.t_done += size;
        else s.q_done += size;
        push(studyBlock(chosen, atividade, size, { pass: 1, finalStretch: false }));
        if (left(s) === 0) close(s, day);
      }
      day.livre_min = remaining;
    }

    revCarry = revOwn >= cfg.revision_minutes ? 0 : Math.min(Math.max(revAllowance - revUsed, 0), cfg.revision_minutes);

    weeksOut.push({
      numero: week.numero,
      inicio: toISO(week.start),
      fim: toISO(week.end),
      capacidade_min: week.raw_min,
      capacidade_util_min: week.usable_min,
      alocado_min: weekUsed,
      livre_min: week.usable_min - weekUsed,
      reta_final: week.days.some((d) => d.final),
      simulado: mockDay !== null,
      novos_assuntos: weekNew,
      revisoes: sum(week.days, (d) => d.blocks.filter((b) => b.atividade === "revisao").length),
      dias: week.days.map((d) => ({
        data: d.iso,
        dia_semana: d.weekday,
        capacidade_min: d.cap_min,
        alocado_min: sum(d.blocks, (b) => b.minutos),
        reta_final: d.final,
        blocos: d.blocks,
      })),
    });
  }

  const porAssunto = order.map((id) => {
    const s = st[id];
    return {
      assunto_id: id,
      materia_id: s.materia_id,
      prioridade: scores.byId[id].rank,
      orcamento_min: s.t_target + s.q_target,
      teoria_min: s.t_done,
      questoes_min: s.q_done,
      segunda_passada_min: s.p2_t + s.p2_q,
      questoes_extra_min: s.extra_min,
      revisoes: s.rev_count,
      revisoes_min: s.rev_count * cfg.revision_minutes,
      nao_alocado_min: left(s),
      aberto_em: s.opened === null ? null : toISO(s.opened),
      fechado_em: s.closed === null ? null : toISO(s.closed),
      status: s.closed !== null ? "concluido" : s.opened !== null ? "em_andamento" : "nao_iniciado",
    };
  });
  const summary = {
    semanas: weeksOut.length,
    horas_uteis: round1(cal.usableMin / 60),
    horas_alocadas: round1(sum(weeksOut, (w) => w.alocado_min) / 60),
    horas_livres: round1(sum(weeksOut, (w) => w.livre_min) / 60),
    horas_nao_alocadas: round1(sum(porAssunto, (a) => a.nao_alocado_min) / 60),
    assuntos_concluidos: porAssunto.filter((a) => a.status === "concluido").length,
    assuntos_nao_iniciados: porAssunto.filter((a) => a.status === "nao_iniciado").map((a) => a.assunto_id),
    revisoes_pendentes: revQueue.pending,
    simulados: weeksOut.filter((w) => w.simulado).length,
    por_assunto: porAssunto,
  };
  return { weeks: weeksOut, summary, warnings };
}

/* ------------------------------------------------------------------ */
/* Public entry                                                         */
/* ------------------------------------------------------------------ */

export function allocate({ pack, scores, disponibilidade, options = {} }) {
  const cfg = { ...ALLOCATION_DEFAULTS, ...options };
  const input = normalizeAvailability(disponibilidade, pack);
  if (!input.ok) return { ok: false, etapa: "disponibilidade", erros: input.erros };

  const cal = buildCalendar(input, cfg);
  const mocks = planMocks(cal, cfg, input, pack.estrutura_prova.total_questoes);
  const reserves = estimateReserves(cal, cfg, input, mocks, pack.assuntos.length);
  const budgets = computeBudgets(pack, scores, reserves.content_min / 60, cfg, input);
  const capacidade = {
    data_inicio: toISO(cal.start),
    data_prova: toISO(cal.exam),
    dias: cal.nDays,
    semanas: cal.weeks.length,
    horas_brutas: round1(cal.rawMin / 60),
    horas_uteis: round1(cal.usableMin / 60),
    buffer_horas: round1((cal.rawMin - cal.usableMin) / 60),
    reservas_horas: {
      reta_final: round1(reserves.final_min / 60),
      simulados: round1(reserves.mock_min / 60),
      revisoes: round1(reserves.revision_min / 60),
    },
    horas_para_conteudo: round1(reserves.content_min / 60),
    reta_final_inicio: cal.nDays > 0 ? cal.days[cal.finalStart].iso : null,
    minimo_necessario_horas: round1(budgets.minTotal),
  };
  const partial = {
    cobertura_parcial: budgets.partial,
    assuntos_cortados: budgets.cut,
    deficit_horas: round1(budgets.deficit),
    mensagem_id: budgets.partial ? "cobertura_parcial" : null,
  };
  if (budgets.partial && !cfg.accept_cut) {
    return { ok: true, ...partial, capacidade, orcamentos: null, cronograma: null, resumo: null, avisos: [] };
  }
  const { weeks, summary, warnings } = fillCalendar({ pack, scores, cal, budgets, order: topoOrder(pack, scores, budgets.byId), cfg, input, mocks });
  return { ok: true, ...partial, capacidade, orcamentos: budgets.table, cronograma: weeks, resumo: summary, avisos: warnings };
}
