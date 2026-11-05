import { SUBJECTS_TRT4_TECNICO_2026 } from "../data/editalTRT4Tecnico2026";

// Illustrative FCC weights (1–5) for the pitch demo only; not real incidence data.
export const FCC_SUBJECT_WEIGHT: Record<string, number> = {
  "LÍNGUA PORTUGUESA": 5,
  "MATEMÁTICA E RACIOCÍNIO LÓGICO": 3,
  "NOÇÕES DE LEGISLAÇÃO": 3,
  "NOÇÕES DE DIREITOS HUMANOS": 2,
  "NOÇÕES DE INFORMÁTICA": 3,
  "NOÇÕES DE DIREITO CONSTITUCIONAL": 4,
  "NOÇÕES DE DIREITO ADMINISTRATIVO": 5,
  "NOÇÕES DE ADMINISTRAÇÃO PÚBLICA": 2,
  "NOÇÕES DE DIREITO DO TRABALHO": 5,
  "NOÇÕES DE DIREITO PROCESSUAL DO TRABALHO": 4,
};

export type Profile = "iniciante" | "intermediario" | "avancado";

export interface PlanTopic {
  id: string;
  subject: string;
  title: string;
  priority: number; // 1..5
  hours: number;
  score: number;
}

const short = (s: string) => s.replace(/^NOÇÕES DE /, "").replace("MATEMÁTICA E RACIOCÍNIO LÓGICO", "RLM");

export function buildTopics(profile: Profile): PlanTopic[] {
  const gap = { iniciante: 1, intermediario: 0.7, avancado: 0.45 }[profile];
  const out: PlanTopic[] = [];
  SUBJECTS_TRT4_TECNICO_2026.forEach((s) => {
    const base = FCC_SUBJECT_WEIGHT[s.name] ?? 3;
    s.groups.forEach((g, i) => {
      const wobble = [0, -1, 1, 0, -1, 0, 1, -1][i % 8];
      const priority = Math.max(1, Math.min(5, base + wobble));
      const hours = Math.round((2 + priority * 0.8) * (0.6 + gap * 0.6) * 2) / 2;
      out.push({
        id: `${s.name}-${i}`,
        subject: short(s.name),
        title: g.title.replace(/^\d+\.\d+ — /, ""),
        priority,
        hours,
        score: (priority * priority * gap) / hours,
      });
    });
  });
  return out.sort((a, b) => b.score - a.score);
}

export function weeksUntil(exam: Date, from: Date): number {
  return Math.max(0, (exam.getTime() - from.getTime()) / (7 * 86400000));
}

export interface PlanOptions {
  done?: Set<string>;
  forceIn?: Set<string>;
  forceOut?: Set<string>;
}

/**
 * Greedy knapsack: studied topics cost nothing and count as covered; forced-in topics enter first,
 * forced-out topics are always cut; the rest fill by score (6 study days/week, 20% kept for review).
 */
export function planSchedule(topics: PlanTopic[], hoursPerDay: number, weeks: number, opts: PlanOptions = {}) {
  const done = opts.done ?? new Set<string>();
  const forceIn = opts.forceIn ?? new Set<string>();
  const forceOut = opts.forceOut ?? new Set<string>();
  const available = hoursPerDay * 6 * weeks * 0.8;
  let used = 0;
  const studied = topics.filter((t) => done.has(t.id));
  const pending = topics.filter((t) => !done.has(t.id));
  const included: PlanTopic[] = [];
  const cut: PlanTopic[] = [];
  for (const t of pending.filter((t) => forceIn.has(t.id))) { included.push(t); used += t.hours; }
  for (const t of topics) {
    if (done.has(t.id)) { if (!forceOut.has(t.id)) included.push(t); else cut.push(t); continue; }
    if (forceIn.has(t.id)) continue;
    if (!forceOut.has(t.id) && used + t.hours <= available) { included.push(t); used += t.hours; } else cut.push(t);
  }
  const totalWeight = topics.reduce((a, t) => a + t.priority, 0);
  const covered = [...new Set([...studied, ...included])].reduce((a, t) => a + t.priority, 0);
  return { available, used, included, cut, studied, overBudget: used > available, coverage: totalWeight ? covered / totalWeight : 0 };
}

export interface TierSummary {
  priority: number;
  total: number;
  pending: number;
  hours: number;
  perDay: number;
  weightShare: number;
  reachable: number;
}

/**
 * Hours/day still required to close each priority tier (levels 5, 4, 3 by default) by the exam date.
 * Studied topics drop out of the tier's hours; `reachable` is how much of the tier the current
 * daily budget (`available` hours) could actually deliver, capped at 1.
 */
export function tierSummaries(
  topics: PlanTopic[],
  done: Set<string>,
  studyDays: number,
  available: number,
  priorities = [5, 4, 3],
): TierSummary[] {
  const totalWeight = topics.reduce((a, t) => a + t.priority, 0);
  return priorities.map((priority) => {
    const list = topics.filter((t) => t.priority === priority);
    const pend = list.filter((t) => !done.has(t.id));
    const hours = pend.reduce((a, t) => a + t.hours, 0);
    const weight = list.reduce((a, t) => a + t.priority, 0);
    return {
      priority,
      total: list.length,
      pending: pend.length,
      hours,
      perDay: studyDays ? hours / studyDays : 0,
      weightShare: totalWeight ? weight / totalWeight : 0,
      reachable: hours ? Math.min(1, available / hours) : 1,
    };
  });
}

export interface RoadmapItem { topic: PlanTopic; start: Date; end: Date }
/** Lays included topics day by day (Sundays off) using the daily study budget minus review reserve. */
export function buildRoadmap(included: PlanTopic[], hoursPerDay: number, from: Date, done: Set<string> = new Set()): RoadmapItem[] {
  const perDay = Math.max(0.5, hoursPerDay * 0.8);
  const day = new Date(from); day.setHours(12, 0, 0, 0);
  let left = perDay;
  const next = () => { do { day.setDate(day.getDate() + 1); } while (day.getDay() === 0); left = perDay; };
  if (day.getDay() === 0) next();
  return included.map((topic) => {
    if (done.has(topic.id)) return { topic, start: new Date(day), end: new Date(day) };
    let need = topic.hours;
    if (left <= 0) next();
    const start = new Date(day);
    while (need > left + 1e-9) { need -= left; next(); }
    left -= need;
    return { topic, start, end: new Date(day) };
  });
}
