// Spaced revision: due dates after a topic closes, plus a deterministic queue
// the allocator drains day by day.

import { addDays } from "./dates.js";

export const REVISION_INTERVALS = Object.freeze([1, 7, 21, 60]);

/**
 * Revision due dates for a topic closed on `closedAt` (UTC ms).
 * Dates on or after the exam are dropped.
 */
export function planRevisions(closedAt, examDate, intervals = REVISION_INTERVALS) {
  return intervals
    .map((days) => ({ days, due: addDays(closedAt, days) }))
    .filter((r) => r.due < examDate);
}

/** Pending revisions ordered by due date, then interval, then topic id. */
export class RevisionQueue {
  constructor() {
    this.items = [];
  }

  add(topic, closedAt, examDate, intervals) {
    for (const r of planRevisions(closedAt, examDate, intervals)) {
      this.items.push({ assunto_id: topic.id, materia_id: topic.materia_id, due: r.due, intervalo_dias: r.days, closedAt });
    }
    this.items.sort(
      (a, b) => a.due - b.due || a.intervalo_dias - b.intervalo_dias || (a.assunto_id < b.assunto_id ? -1 : a.assunto_id > b.assunto_id ? 1 : 0)
    );
  }

  /** Items due on or before `date` (overdue ones first). */
  due(date) {
    return this.items.filter((it) => it.due <= date);
  }

  remove(item) {
    const i = this.items.indexOf(item);
    if (i >= 0) this.items.splice(i, 1);
  }

  get pending() {
    return this.items.length;
  }
}
