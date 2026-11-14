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
  // A header is the name itself, optionally with a couple of extra tokens ("LÍNGUA PORTUGUESA 1", "NOÇÕES DE … :").
  // Long sentences that merely start with the name ("Redação incorrerá na …") are not headers.
  return (line) => {
    const raw = String(line ?? "").trim();
    // headers start with a capital letter and do not end like a sentence ("… em português.")
    if (!/^[A-ZÀ-Ý]/.test(raw) || /[.,;]$/.test(raw)) return null;
    const key = norm(raw);
    if (!key || key.length > 80) return null;
    const words = key.split(" ").length;
    for (const row of table) {
      const rowWords = row.key.split(" ").length;
      if (key === row.key) return row.id;
      if (words <= rowWords + 2 && key.startsWith(row.key + " ")) return row.id;
    }
    return null;
  };
}

/** Rounds to the nearest half. */
export const half = (x) => Math.round(x * 2) / 2;
