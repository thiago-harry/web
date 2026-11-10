// Shared text helpers for the pack builder.

/** Accent-insensitive, case-insensitive, whitespace-collapsed key. */
export function norm(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

export function slug(s, max = 40) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, max)
    .replace(/_+$/g, "");
}

export function collapse(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

/** Builds a matcher for matéria headers from config aliases. Returns materia id or null. */
export function materiaMatcher(materias) {
  const table = [];
  for (const m of materias) {
    const names = [m.nome, ...(m.aliases ?? [])].map(norm).filter(Boolean);
    for (const n of names) table.push({ key: n, id: m.id });
  }
  table.sort((a, b) => b.key.length - a.key.length);
  return (line) => {
    const key = norm(line);
    if (!key || key.length > 80) return null;
    for (const row of table) {
      if (key === row.key || key.startsWith(row.key + " ") || key.endsWith(" " + row.key)) return row.id;
    }
    return null;
  };
}

/** Rounds to the nearest half. */
export const half = (x) => Math.round(x * 2) / 2;
