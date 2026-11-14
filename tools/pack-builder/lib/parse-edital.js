// Edital text -> matérias with items -> proposed assuntos (one per top-level item).
// Two layouts are common: numbered items ("1. … 1.1 …") and plain sentence lists
// ("Ortografia oficial. Acentuação gráfica. …"). Both produce a draft the curator edits.
import { norm, collapse, slug, materiaMatcher } from "./text.js";

const ITEM = /^\s*(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+(.+)$/;

/** Slice of the text between `inicio` and `fim` markers (accent/case-insensitive). */
export function sliceSection(text, { inicio, fim } = {}) {
  if (!inicio) return text;
  const lines = text.split("\n");
  const keys = lines.map(norm);
  const start = keys.findIndex((k) => k.includes(norm(inicio)));
  if (start < 0) return null;
  let end = lines.length;
  if (fim) {
    const e = keys.findIndex((k, i) => i > start && k.includes(norm(fim)));
    if (e > start) end = e;
  }
  return lines.slice(start, end).join("\n");
}

/**
 * parseEdital(text, { materias }) -> { materias: [{ id, nome, modo, itens: [{ codigo, nivel, texto }] }], semMateria: [linhas] }
 */
export function parseEdital(text, { materias = [] } = {}) {
  const match = materiaMatcher(materias);
  const out = new Map(materias.map((m) => [m.id, { id: m.id, nome: m.nome, modo: null, itens: [], bruto: [] }]));
  let cur = null;
  const semMateria = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\f/g, "").trim();
    if (!line) continue;
    // "LÍNGUA PORTUGUESA: Ortografia. Acentuação." — header followed by content on the same line
    const colon = line.indexOf(":");
    const head = colon > 0 && colon < 80 ? line.slice(0, colon) : line.replace(/[:.]+$/, "");
    const mid = match(head);
    if (mid) {
      cur = out.get(mid);
      const rest = colon > 0 && colon < 80 ? line.slice(colon + 1).trim() : "";
      if (rest) cur.bruto.push(rest);
      continue;
    }
    if (!cur) {
      semMateria.push(line);
      continue;
    }
    cur.bruto.push(line);
  }

  for (const m of out.values()) {
    // sub-items written inline ("1. Ato: 1.1 conceito; 1.2 atributos") go to their own lines
    const joined = m.bruto
      .join("\n")
      .replace(/\s+(?=\d{1,2}(?:\.\d{1,2}){1,3}\.?\s+[A-Za-zÀ-ÿ(])/g, "\n") // inline sub-items
      .replace(/(?<=[.;:)])\s+(?=\d{1,2}\.\s+[A-ZÀ-Ý])/g, "\n"); // inline top-level items: "… final. 2. Poder Constituinte"
    const numbered = [];
    for (const line of joined.split("\n")) {
      const it = ITEM.exec(line);
      if (it) numbered.push({ codigo: it[1], nivel: it[1].split(".").length, texto: collapse(it[2]) });
      else if (numbered.length) numbered[numbered.length - 1].texto += " " + collapse(line);
    }
    if (numbered.length >= 2) {
      m.modo = "numerado";
      m.itens = numbered;
    } else {
      m.modo = "frases";
      m.itens = collapse(joined)
        .split(/(?<=[.;])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/)
        .map((s) => s.replace(/[.;]\s*$/, "").trim())
        .filter((s) => s.length > 2)
        .map((texto, i) => ({ codigo: String(i + 1), nivel: 1, texto }));
    }
    delete m.bruto;
  }
  return { materias: [...out.values()], semMateria };
}

/**
 * Proposed assuntos: one per top-level item; depth from sub-items.
 * profundidade: 1 = citado, 2 = has sub-items, 3 = has sub-sub-items.
 */
export function proposeAssuntos(edital) {
  const assuntos = [];
  for (const m of edital.materias) {
    const used = new Set();
    let current = null;
    for (const it of m.itens) {
      if (it.nivel === 1) {
        let id = `${m.id}.${slug(it.texto) || `item_${it.codigo}`}`;
        let k = 2;
        while (used.has(id)) id = `${m.id}.${slug(it.texto, 36)}_${k++}`;
        used.add(id);
        current = { id, materia_id: m.id, nome: titleOf(it.texto), edital_literal: `${it.codigo}. ${it.texto}`, edital_profundidade: 1, subitens: 0 };
        assuntos.push(current);
      } else if (current) {
        current.edital_literal += ` ${it.codigo} ${it.texto}`;
        current.subitens += 1;
        current.edital_profundidade = Math.max(current.edital_profundidade, Math.min(3, it.nivel));
      }
    }
  }
  return assuntos;
}

function titleOf(texto) {
  const t = collapse(texto).replace(/[.:;]\s*$/, "");
  return t.length <= 70 ? t : `${t.slice(0, 67).replace(/\s+\S*$/, "")}…`;
}
