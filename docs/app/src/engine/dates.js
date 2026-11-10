// Date helpers. Dates are epoch milliseconds at UTC midnight, so arithmetic
// never depends on the host timezone or DST.

const DAY_MS = 86_400_000;
const WEEKDAY_KEYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

/** "YYYY-MM-DD" -> UTC midnight (ms), or null when the string is not a real date. */
export function parseDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return t;
}

export function toISO(t) {
  return new Date(t).toISOString().slice(0, 10);
}

export function addDays(t, n) {
  return t + n * DAY_MS;
}

/** Whole days from a to b (positive when b is later). */
export function diffDays(a, b) {
  return Math.round((b - a) / DAY_MS);
}

/** Weekday key as used in `horas_por_dia_semana`: dom, seg, ter, qua, qui, sex, sab. */
export function weekdayKey(t) {
  return WEEKDAY_KEYS[new Date(t).getUTCDay()];
}

export { WEEKDAY_KEYS };
