// Caderno de prova text -> questions with matéria hint, shared context and alternatives.
// Heuristic by design: the output carries `anomalias` so a human can see where it slipped.
import { collapse, materiaMatcher } from "./text.js";

const Q_START = /^\s*(?:QUEST[ÃA]O\s+)?(\d{1,3})\s*(?:[.)\-–]|º|ª)?(?:\s+(.*))?$/i;
const ALT_START = /^\s*\(?([A-E])[).\-–]\s*(.*)$/;
const ALT_BARE = /^\s*([A-E])\s+(\S.*)$/; // Cebraspe style: "A Os entes da Federação…"
const ATTENTION = /^\s*(Aten[çc][ãa]o|Instru[çc][õo]es?|Texto\s+(?:para|I|II|III|1|2|3))\b/i;
const RANGE = /(\d{1,3})\s*(?:a|e|at[ée])\s*(\d{1,3})/i;
const NOISE = [
  /^\s*\f?\s*$/,
  /^\s*p[áa]gina\s+\d+/i,
  /^\s*\d{1,2}\s*\/\s*\d{1,2}\s*$/,
  /caderno\s+de\s+prova/i,
  /^\s*www\./i,
  /^\s*https?:\/\//i,
  /tipo\s+\d{3}/i,
  /^\s*[A-Z]{2,6}\d{0,4}-[A-Za-zÀ-ÿ.\- ]{3,40}\s*$/, // e.g. "TRT4-Téc.Jud.-Adm."
  /^\s*\d{6}_\d{2}N\d+/, // Cebraspe page header
  /CEBRASPE\s+[–-]/i,
  /^\s*INSTITUTO AOCP\s*$/i,
  /^\s*BLOCO\s+[IVX]+\s*$/i,
  /^\s*Espa[çc]o livre\s*$/i,
  /^\s*RASCUNHO\s*$/i,
];

function isNoise(line) {
  return NOISE.some((re) => re.test(line));
}

/**
 * parseProva(text, { materias }) -> {
 *   questoes: [{ numero, materia_id, materia_hint, contexto, enunciado, alternativas, completa }],
 *   anomalias: [{ numero, tipo, detalhe }],
 *   secoes: [{ linha, materia_id, texto }]
 * }
 */
export function parseProva(text, { materias = [], noise = [] } = {}) {
  const extraNoise = noise.map((n) => (n instanceof RegExp ? n : new RegExp(n, "i")));
  const bareAlts = (text.match(/^\s*\([A-E]\)/gm) ?? []).length < 10; // no "(A)" markers -> bare letters
  const match = materiaMatcher(materias);
  const lines = text.split("\n");
  const questoes = [];
  const anomalias = [];
  const secoes = [];
  let materiaId = null;
  let materiaHint = null;
  let expected = 1;
  let cur = null; // current question
  let curAlt = null; // current alternative letter
  let context = null; // { texto, aplica: Set<number> | null (until next header) }
  let contextLines = null;

  const finish = () => {
    if (!cur) return;
    cur.enunciado = collapse(cur.enunciado);
    cur.alternativas = cur.alternativas.map(collapse);
    cur.completa = cur.alternativas.length === 5 && cur.enunciado.length > 0;
    if (cur.alternativas.length !== 5) anomalias.push({ numero: cur.numero, tipo: "alternativas", detalhe: `${cur.alternativas.length} alternativa(s)` });
    if (!cur.enunciado) anomalias.push({ numero: cur.numero, tipo: "enunciado_vazio", detalhe: "" });
    questoes.push(cur);
    cur = null;
    curAlt = null;
  };
  const applyContext = (q) => {
    if (!context) return;
    if (context.aplica && !context.aplica.has(q.numero)) return;
    q.contexto = context.texto;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/\f/g, "").trimEnd();
    if (isNoise(line) || extraNoise.some((re) => re.test(line))) continue;

    // matéria header
    const mid = match(line);
    if (mid && cur && cur.alternativas.length === 0) {
      // a "question" with no alternatives before a header was page furniture (e.g. a number on the cover)
      expected = cur.numero;
      cur = null;
      curAlt = null;
    }
    if (mid && (!cur || curAlt === "E" || cur.alternativas.length === 5)) {
      finish();
      materiaId = mid;
      materiaHint = collapse(line);
      secoes.push({ linha: i + 1, materia_id: mid, texto: materiaHint });
      context = null;
      contextLines = null;
      continue;
    }

    // shared context ("Atenção: Para responder às questões de números 1 a 5 ...")
    if (ATTENTION.test(line) && (!cur || cur.alternativas.length === 5)) {
      finish();
      contextLines = []; // the instruction line itself is not part of the passage
      const r = RANGE.exec(line);
      let aplica = null;
      if (r) {
        aplica = new Set();
        for (let n = Number(r[1]); n <= Number(r[2]) && n - Number(r[1]) < 60; n++) aplica.add(n);
      }
      context = { texto: "", aplica };
      continue;
    }

    // question start
    // a new question may start when the previous one is complete, or (recovery) when the
    // previous one has no alternatives yet and the line is a clean "N." / "N)" start
    // "Questão N" may come glued to page furniture ("OBJETIVA -Questão 4")
    const glued = /(?:^|[\s\-–])QUEST[ÃA]O\s+(\d{1,3})\s*$/i.exec(line);
    const qs = Q_START.exec(line) ?? (glued ? [line, glued[1], ""] : null);
    const cleanStart = Boolean(glued) || /^\s*(?:QUEST[ÃA]O\s+)?\d{1,3}\s*(?:[.)]|º|ª)(?:\s|$)/i.test(line);
    const sectionKnown = materias.length === 0 || materiaId !== null; // with matérias configured, questions start after the first header
    if (qs && sectionKnown && Number(qs[1]) === expected && (!cur || cur.alternativas.length >= 4 || (cur.alternativas.length === 0 && cleanStart))) {
      finish();
      cur = { numero: expected, materia_id: materiaId, materia_hint: materiaHint, contexto: null, enunciado: qs[2] ?? "", alternativas: [], completa: false };
      if (contextLines) {
        context.texto = collapse(contextLines.join(" "));
        contextLines = null;
      }
      applyContext(cur);
      expected += 1;
      continue;
    }

    // alternative start
    // bare letters only after the stem has some text (the first stem line may start with "A ")
    const as = ALT_START.exec(line) ?? (bareAlts && cur && cur.enunciado.trim() ? ALT_BARE.exec(line) : null);
    if (cur && as) {
      const letter = as[1];
      const next = curAlt === null ? "A" : String.fromCharCode(curAlt.charCodeAt(0) + 1);
      if (letter === next) {
        cur.alternativas.push(as[2] ?? "");
        curAlt = letter;
        continue;
      }
    }

    // continuation
    if (contextLines) contextLines.push(line);
    else if (cur) {
      if (curAlt === null) cur.enunciado += (cur.enunciado ? " " : "") + line.trim();
      else cur.alternativas[cur.alternativas.length - 1] += " " + line.trim();
    }
  }
  finish();

  if (questoes.length === 0) anomalias.push({ numero: null, tipo: "nenhuma_questao", detalhe: "nenhum início de questão reconhecido" });
  return { questoes, anomalias, secoes, total: questoes.length };
}

/** Attaches gabarito letters; returns the merged list plus unmatched numbers. */
export function mergeGabarito(questoes, gabarito) {
  const semGabarito = [];
  const out = questoes.map((q) => {
    const letra = gabarito.respostas[q.numero];
    if (letra === undefined) semGabarito.push(q.numero);
    return { ...q, gabarito: letra === undefined ? null : letra, anulada: letra === null };
  });
  return { questoes: out, semGabarito };
}
