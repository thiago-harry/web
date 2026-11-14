// Gabarito text -> { respostas: { numero: "A".."E" | null }, anuladas: [numero], total }
// Handles "001 - C", "1) C", "12: D", "7 - *" / "7 - ANULADA" and, as a fallback,
// bare "n X" pairs in increasing order.

const PAIR = /(?<![\dA-Z])(\d{1,3})\s*[-–—:.)]\s*(?:\(?([A-E])\)?|(\*|ANULAD[AO]|NULA|X))(?![A-Za-z0-9])/gi;

/** Table layout: a "Questão 1 2 3 …" row followed by a "Gabarito C A X …" row (X = anulada). */
function parseTable(text, maxNumero) {
  const map = new Map();
  const anuladas = new Set();
  const lines = text.split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    const q = /^\s*Quest[ãa]o\s+(.+)$/i.exec(lines[i]);
    if (!q) continue;
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    const g = /^\s*Gabarito\s+(.+)$/i.exec(lines[j] ?? "");
    if (!g) continue;
    const nums = q[1].trim().split(/\s+/).map(Number);
    const vals = g[1].trim().split(/\s+/);
    nums.forEach((n, k) => {
      if (!Number.isInteger(n) || n < 1 || n > maxNumero || map.has(n)) return;
      const v = (vals[k] ?? "").toUpperCase();
      if (/^[A-E]$/.test(v)) map.set(n, v);
      else if (/^(X|\*|NULA|ANULADA)$/.test(v)) {
        map.set(n, null);
        anuladas.add(n);
      }
    });
  }
  return { map, anuladas };
}

export function parseGabarito(text, { maxNumero = 300 } = {}) {
  const table = parseTable(text, maxNumero);
  if (table.map.size > 0) {
    const respostas = Object.fromEntries([...table.map.entries()].sort((a, b) => a[0] - b[0]));
    return { respostas, anuladas: [...table.anuladas].sort((a, b) => a - b), total: table.map.size };
  }
  const map = new Map();
  const anuladas = new Set();
  for (const m of text.matchAll(PAIR)) {
    const n = Number(m[1]);
    if (n < 1 || n > maxNumero || map.has(n)) continue;
    if (m[2]) map.set(n, m[2].toUpperCase());
    else {
      map.set(n, null);
      anuladas.add(n);
    }
  }
  if (map.size === 0) {
    // fallback: "1 C 2 D 3 A ..." accepted only while the numbering stays sequential
    let expected = 1;
    for (const m of text.matchAll(/(?<![\dA-Z])(\d{1,3})\s+([A-E])(?![A-Za-z0-9])/g)) {
      const n = Number(m[1]);
      if (n !== expected) continue;
      map.set(n, m[2]);
      expected += 1;
    }
  }
  const respostas = Object.fromEntries([...map.entries()].sort((a, b) => a[0] - b[0]));
  return { respostas, anuladas: [...anuladas].sort((a, b) => a - b), total: map.size };
}
