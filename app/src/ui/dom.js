// Tiny DOM helpers and formatters.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export const pad2 = (n) => String(n).padStart(2, "0");
export const fmtH = (hours) => `${nf1.format(Math.round(hours * 10) / 10)}h`;
export const fmtPct = (x, digits = 0) => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(x * 100)}%`;
export const fmtNum = (x, digits = 2) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(x);
export const fmtInt = (x) => nf0.format(x);

export function fmtMin(min) {
  const hh = Math.floor(min / 60);
  const mm = min % 60;
  if (!hh) return `${mm}min`;
  return mm ? `${hh}h${pad2(mm)}` : `${hh}h`;
}

/** "2027-04-11" -> "11/04" */
export const fmtDM = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** "2027-04-11" -> "11/04/2027" */
export const fmtDMY = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function fmtClock(minOfDay) {
  const m = ((minOfDay % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

export function parseClock(str) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(str ?? "");
  if (!m) return 19 * 60;
  return Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2]));
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function nowBR() {
  const d = new Date();
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
