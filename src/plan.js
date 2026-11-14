// Product layer over the engine (app/src/engine): pareto of the exam, generic vs
// personalized coverage, display blocks (videoaula / leitura / exercícios), ICS.
// Pure functions; React only renders what these return.
import { generate, score } from "../app/src/engine/index.js";
import { sampleQuiz, scoreQuiz } from "../app/src/engine/quiz.js";
import { normalizeAvailability, buildCalendar, planMocks, estimateReserves, ALLOCATION_DEFAULTS } from "../app/src/engine/allocate.js";

export { sampleQuiz, scoreQuiz, score };

export const STRENGTHS = [
  { id: "fraco", label: "Fraco", auto: 1 },
  { id: "medio", label: "Médio", auto: 2 },
  { id: "forte", label: "Forte", auto: 3 },
];
const STRENGTH_AUTO = Object.fromEntries(STRENGTHS.map((s) => [s.id, s.auto]));

export const MODES = {
  normal: { label: "Normal", hours: { seg: 2, ter: 2, qua: 2, qui: 2, sex: 2, sab: 4, dom: 0 } },
  hard: { label: "Hard", hours: { seg: 3, ter: 3, qua: 3, qui: 3, sex: 3, sab: 6, dom: 2 } },
  super: { label: "Super hard", hours: { seg: 5, ter: 5, qua: 5, qui: 5, sex: 5, sab: 8, dom: 4 } },
};
export const DAY_KEYS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
export const DAY_LABEL = { seg: "Seg", ter: "Ter", qua: "Qua", qui: "Qui", sex: "Sex", sab: "Sáb", dom: "Dom" };

// Share of theory time spent on video vs reading, by topic type.
const AULA_RATIO = { lei_seca: 0.3, memorizacao: 0.3, doutrina: 0.6, jurisprudencia: 0.5, calculo: 0.6, pratica: 0.5 };
export const PARETO_TARGET = 0.8;

const pad = (n) => String(n).padStart(2, "0");
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const addDaysISO = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
};
export const diffDaysISO = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/* ---------------- leveling input ---------------- */

export function nivelamentoInput(pack, strengths, quizScore) {
  const out = {};
  const auto = {};
  for (const a of pack.assuntos) {
    const s = strengths[a.materia_id];
    if (s && STRENGTH_AUTO[s] !== undefined) auto[a.id] = STRENGTH_AUTO[s];
  }
  if (Object.keys(auto).length) out.autoavaliacao = auto;
  if (quizScore && Object.keys(quizScore.porAssunto).length) out.simulado = quizScore.porAssunto;
  return out;
}

/* ---------------- engine call ---------------- */

export function buildPlan({ pack, nivelamento, hours, start, exam, excecoes = {} }) {
  return generate({
    pack,
    nivelamento,
    disponibilidade: { horas_por_dia_semana: hours, data_inicio: start, data_prova: exam, bloco_min_minutos: 30, bloco_max_minutos: 90, excecoes },
    options: { allocate: { leftover: "second_pass", accept_cut: true } },
  });
}

/* ---------------- expected points and pareto ---------------- */

const materiaPoints = (m) => m.questoes * (m.peso ?? 1);

/** Expected points per topic: matéria points split by the student-independent priority (edital + history). */
export function expectedPoints(pack, scores) {
  const base = (id) => scores.byId[id].base * scores.byId[id].multiplicadores.volatil;
  const sumByMateria = {};
  for (const a of pack.assuntos) sumByMateria[a.materia_id] = (sumByMateria[a.materia_id] ?? 0) + base(a.id);
  const pts = {};
  for (const m of pack.estrutura_prova.materias) {
    for (const a of pack.assuntos.filter((x) => x.materia_id === m.id)) {
      pts[a.id] = sumByMateria[m.id] > 0 ? (materiaPoints(m) * base(a.id)) / sumByMateria[m.id] : 0;
    }
  }
  return pts;
}

/** Hours this student needs for a topic: base load scaled by the gap (1× when there is no leveling). */
export function neededHours(assunto, sc) {
  const f = sc.gap_source === "nenhum" ? 1 : 0.6 + 0.8 * sc.G;
  return assunto.carga_horaria_base * f;
}

/** Topics by expected points per hour this student needs (best return first). */
function efficiencyOrder(pack, scores, pts) {
  const byId = Object.fromEntries(pack.assuntos.map((a) => [a.id, a]));
  const rate = (id) => pts[id] / Math.max(0.25, neededHours(byId[id], scores.byId[id]));
  return pack.assuntos.map((a) => a.id).sort((x, y) => rate(y) - rate(x) || pts[y] - pts[x] || (x < y ? -1 : 1));
}

/**
 * Top of the exam: the smallest study load that reaches `target` of the expected points.
 * Greedy by points per hour, so a cheap law worth half a question beats a long chapter worth one.
 */
export function pareto(pack, scores, target = PARETO_TARGET) {
  const pts = expectedPoints(pack, scores);
  const total = Object.values(pts).reduce((s, v) => s + v, 0);
  const byId = Object.fromEntries(pack.assuntos.map((a) => [a.id, a]));
  const order = efficiencyOrder(pack, scores, pts);
  let cum = 0;
  let cumHours = 0;
  let topCount = 0;
  let topHours = 0;
  const items = order.map((id) => {
    const a = byId[id];
    const sc = scores.byId[id];
    const horas = neededHours(a, sc);
    const inTop = cum / total < target - 1e-9;
    cum += pts[id];
    cumHours += horas;
    if (inTop) {
      topCount += 1;
      topHours += horas;
    }
    return { id, assunto: a, score: sc, pts: pts[id], cumPct: cum / total, horas, cumHours, inTop };
  });
  const top = new Set(items.filter((x) => x.inTop).map((x) => x.id));
  const topPts = items.filter((x) => x.inTop).reduce((s, x) => s + x.pts, 0);
  return { items, total, top, topPts, topCount, topHours, totalHours: cumHours };
}

/** Same pack restricted to a set of topics (prereqs and quiz items outside it are dropped). */
export function scopePack(pack, keep) {
  return {
    ...pack,
    assuntos: pack.assuntos.filter((a) => keep.has(a.id)).map((a) => ({ ...a, prereq: a.prereq.filter((p) => keep.has(p)) })),
    nivelamento: { ...pack.nivelamento, itens: pack.nivelamento.itens.filter((it) => keep.has(it.assunto_id)) },
  };
}

/* ---------------- generic vs personalized ---------------- */

function curve(steps, total) {
  let h = 0;
  let got = 0;
  const pointsOut = [{ h: 0, pct: 0 }];
  for (const s of steps) {
    h += s.alloc;
    got += s.pts * Math.min(1, s.alloc / s.need);
    pointsOut.push({ h, pct: got / total });
  }
  return pointsOut;
}

export function coverageAt(points, hours) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (hours <= b.h) return a.pct + ((b.pct - a.pct) * (hours - a.h)) / Math.max(b.h - a.h, 1e-9);
  }
  return points[points.length - 1].pct;
}

export function hoursTo(points, pct) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (b.pct >= pct - 1e-9) return a.h + ((b.h - a.h) * (pct - a.pct)) / Math.max(b.pct - a.pct, 1e-9);
  }
  return null;
}

/**
 * Generic plan: edital order, the same base hours for every topic (ignores banca, history and the
 * student). Personalized: best points per hour first (pareto order), each topic gets the hours this student needs.
 * Both are credited against what the student actually needs, so the generic plan wastes time on
 * mastered topics and underserves weak ones.
 */
export function compare(pack, scores) {
  const pts = expectedPoints(pack, scores);
  const total = Object.values(pts).reduce((s, v) => s + v, 0);
  const byId = Object.fromEntries(pack.assuntos.map((a) => [a.id, a]));
  const need = (id) => neededHours(byId[id], scores.byId[id]);
  const generic = curve(pack.assuntos.map((a) => ({ pts: pts[a.id], alloc: a.carga_horaria_base, need: need(a.id) })), total);
  const order = efficiencyOrder(pack, scores, pts);
  const personalized = curve(order.map((id) => ({ pts: pts[id], alloc: need(id), need: need(id) })), total);
  return { generic, personalized, total };
}

/** Raw hours until `exam` and the hours the engine leaves for new content (after buffer, final stretch, mocks, revisions). */
export function capacity(pack, hours, start, exam, nTopics = pack.assuntos.length, excecoes = {}) {
  const cfg = { ...ALLOCATION_DEFAULTS };
  const input = normalizeAvailability({ horas_por_dia_semana: hours, data_inicio: start, data_prova: exam, excecoes }, pack);
  if (!input.ok) return { raw: 0, content: 0 };
  const cal = buildCalendar(input, cfg);
  const mocks = planMocks(cal, cfg, input, pack.estrutura_prova.total_questoes);
  return { raw: cal.rawMin / 60, content: estimateReserves(cal, cfg, input, mocks, nTopics).content_min / 60 };
}

export const contentHours = (pack, hours, start, exam, nTopics, excecoes) => capacity(pack, hours, start, exam, nTopics, excecoes).content;

/** Share of the top 80% that `contentH` hours of new content cover (points-weighted, best return first). */
export function topCoverage(par, cmp, contentH) {
  const share = par.total > 0 ? par.topPts / par.total : 1;
  const examPct = coverageAt(cmp.personalized, contentH);
  const cov = Math.min(1, examPct / share);
  return { cov, examPct, pts: cov * par.topPts, hours: Math.min(contentH, par.topHours) };
}

// Ceiling for suggestions: 6h on weekdays, 10h on Saturday, 6h on Sunday.
export const LOAD_CAP = Object.freeze({ weekday: 6, sab: 10, dom: 6 });
const halfStep = (x) => Math.round(x * 2) / 2;
const loadPattern = (x, dom) => ({ seg: x, ter: x, qua: x, qui: x, sex: x, sab: Math.min(LOAD_CAP.sab, halfStep(x * 1.5)), dom });
export const weeklyOf = (hours) => DAY_KEYS.reduce((s, k) => s + (hours[k] ?? 0), 0);

/**
 * Lightest weekly load (weekdays x, Saturday 1.5x, Sunday off; Sunday only after weekdays hit the cap)
 * whose content hours cover the whole top 80% by `exam`. When even the cap falls short, returns the cap
 * with feasible = false and the coverage it reaches.
 */
export function suggestLoad({ pack, par, cmp, start, exam, nTopics, excecoes = {} }) {
  const candidates = [];
  for (let x = 0.5; x <= LOAD_CAP.weekday + 1e-9; x += 0.5) candidates.push(loadPattern(x, 0));
  for (let dom = 1; dom <= LOAD_CAP.dom; dom += 1) candidates.push(loadPattern(LOAD_CAP.weekday, dom));
  let pick = null;
  for (const hours of candidates) {
    const cap = capacity(pack, hours, start, exam, nTopics, excecoes);
    const cov = topCoverage(par, cmp, cap.content);
    pick = { hours, weekly: weeklyOf(hours), raw: cap.raw, content: cap.content, cov: cov.cov, feasible: cov.cov >= 0.999 };
    if (pick.feasible) break;
  }
  return pick;
}

/** Earliest exam date whose content hours reach `needH` (binary search, up to 3 years). */
export function dateToCover(pack, hours, start, needH, nTopics, excecoes = {}) {
  const weekly = DAY_KEYS.reduce((s, k) => s + (hours[k] ?? 0), 0);
  if (weekly <= 0 || needH <= 0) return null;
  let lo = 7;
  let hi = 1095;
  if (contentHours(pack, hours, start, addDaysISO(start, hi), nTopics, excecoes) < needH) return null;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (contentHours(pack, hours, start, addDaysISO(start, mid), nTopics, excecoes) >= needH) hi = mid;
    else lo = mid + 1;
  }
  return addDaysISO(start, lo);
}

/* ---------------- display blocks ---------------- */

const parseClock = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : 19 * 60;
};
export const fmtClock = (min) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};
export const fmtMin = (min) => {
  const h = Math.floor(min / 60);
  const r = min % 60;
  if (!h) return `${r}min`;
  return r ? `${h}h${pad(r)}` : `${h}h`;
};

function videoFor(assunto) {
  const list = assunto?.materiais ?? [];
  return list.find((m) => m.tipo === "video") ?? list.find((m) => m.tipo === "busca_video") ?? null;
}

/** Engine blocks -> display blocks with exact times; first-pass theory starts with videoaula, then leitura. */
export function displayWeeks(result, pack, { inicio = "19:00", inicioFds = "09:00" } = {}) {
  if (!result?.cronograma) return [];
  const byId = Object.fromEntries(pack.assuntos.map((a) => [a.id, a]));
  // Video budget per topic: a share of its first-pass theory, watched first; the rest is reading.
  const theory = {};
  for (const w of result.cronograma)
    for (const d of w.dias)
      for (const b of d.blocos) if (b.atividade === "teoria" && (b.passada ?? 1) < 2) theory[b.assunto_id] = (theory[b.assunto_id] ?? 0) + b.minutos;
  const videoLeft = {};
  for (const [id, min] of Object.entries(theory)) {
    const ratio = AULA_RATIO[byId[id]?.tipo] ?? 0.5;
    videoLeft[id] = min >= 30 ? Math.max(15, Math.round((min * ratio) / 15) * 15) : 0;
  }
  return result.cronograma.map((w) => ({
    ...w,
    dias: w.dias.map((d) => {
      const used = d.blocos.reduce((s, b) => s + b.minutos, 0);
      let cursor = Math.max(0, Math.min(parseClock(d.dia_semana === "sab" || d.dia_semana === "dom" ? inicioFds : inicio), 1440 - used));
      const blocks = [];
      const push = (b) => {
        blocks.push({ ...b, start: cursor, end: cursor + b.minutos });
        cursor += b.minutos;
      };
      for (const b of d.blocos) {
        const a = b.assunto_id ? byId[b.assunto_id] : null;
        const common = { assunto: a, materia_id: b.materia_id, motivo: b.motivo, passada: b.passada };
        if (b.atividade === "teoria" && (b.passada ?? 1) < 2 && videoLeft[b.assunto_id] > 0) {
          const aula = Math.min(videoLeft[b.assunto_id], b.minutos);
          videoLeft[b.assunto_id] -= aula;
          push({ ...common, atividade: "videoaula", minutos: aula, video: videoFor(a) });
          if (b.minutos > aula) push({ ...common, atividade: "leitura", minutos: b.minutos - aula });
        } else if (b.atividade === "teoria") push({ ...common, atividade: "leitura", minutos: b.minutos });
        else if (b.atividade === "questoes") push({ ...common, atividade: "exercicios", minutos: b.minutos });
        else push({ ...common, atividade: b.atividade, minutos: b.minutos, intervalo_dias: b.intervalo_dias });
      }
      return { ...d, blocks };
    }),
  }));
}

export const ACTIVITY_LABEL = { videoaula: "Videoaula", leitura: "Leitura", exercicios: "Exercícios", revisao: "Revisão", simulado: "Simulado" };

/* ---------------- ICS (Google Agenda / Apple / Outlook) ---------------- */

const icsEscape = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsLocal = (iso, minOfDay) => {
  const day = addDaysISO(iso, Math.floor(minOfDay / 1440)).replace(/-/g, "");
  const m = ((minOfDay % 1440) + 1440) % 1440;
  return `${day}T${pad(Math.floor(m / 60))}${pad(m % 60)}00`;
};

export function toICS({ weeks, pack, materias, appName }) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${appName}//PT`, "CALSCALE:GREGORIAN", `X-WR-CALNAME:${icsEscape(`${appName} · ${pack.concurso.nome}`)}`];
  for (const w of weeks) {
    for (const d of w.dias) {
      d.blocks.forEach((b, i) => {
        const title = b.assunto ? b.assunto.nome : ACTIVITY_LABEL.simulado;
        const desc = [b.materia_id ? materias[b.materia_id] : "", b.video ? `Aula: ${b.video.url}` : "", b.motivo ?? ""].filter(Boolean).join("\n");
        lines.push(
          "BEGIN:VEVENT",
          `UID:${pack.concurso.id}-${d.data}-${i}@cronograma-personalizado`,
          `DTSTAMP:${stamp}`,
          `DTSTART:${icsLocal(d.data, b.start)}`,
          `DTEND:${icsLocal(d.data, b.end)}`,
          `SUMMARY:${icsEscape(`[${ACTIVITY_LABEL[b.atividade]}] ${title}`)}`,
          `DESCRIPTION:${icsEscape(desc)}`,
          ...(b.video ? [`URL:${b.video.url}`] : []),
          "END:VEVENT"
        );
      });
    }
  }
  lines.push("END:VCALENDAR");
  return lines
    .map((l) => {
      const parts = [];
      let s = l;
      while (s.length > 60) {
        parts.push(s.slice(0, 60));
        s = " " + s.slice(60);
      }
      parts.push(s);
      return parts.join("\r\n");
    })
    .join("\r\n");
}

export function download(filename, text, mime) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
