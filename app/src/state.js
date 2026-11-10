// Per-concurso state in localStorage, key cron:v1:<concurso_id>. Versioned; an
// unknown version resets to defaults (no silent partial migrations).
import { todayISO } from "./ui/dom.js";

export const STATE_VERSION = 1;
const KEY = (id) => `cron:v${STATE_VERSION}:${id}`;
const LAST_KEY = `cron:v${STATE_VERSION}:last`;

export const MODE_PRESETS = Object.freeze({
  normal: { seg: 2, ter: 2, qua: 2, qui: 2, sex: 2, sab: 4, dom: 0 },
  hard: { seg: 4, ter: 4, qua: 4, qui: 4, sex: 4, sab: 6, dom: 2 },
  super: { seg: 6, ter: 6, qua: 6, qui: 6, sex: 6, sab: 8, dom: 4 },
});

export function defaultState(pack) {
  return {
    version: STATE_VERSION,
    concurso_id: pack.concurso.id,
    pack_version: pack.pack_version,
    autoavaliacao: {},
    quiz: { respostas: {}, concluido: false },
    disponibilidade: {
      modo: "normal",
      modos: { normal: { ...MODE_PRESETS.normal }, hard: { ...MODE_PRESETS.hard }, super: { ...MODE_PRESETS.super } },
      data_inicio: todayISO(),
      data_prova: pack.concurso.data_prova,
      inicio_hora: "19:00",
      inicio_hora_fds: "09:00",
    },
    opcoes: { preencher_sobra: true, aceitar_corte: false },
  };
}

function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadState(pack) {
  const base = defaultState(pack);
  const ls = safeStorage();
  if (!ls) return base;
  try {
    const raw = ls.getItem(KEY(pack.concurso.id));
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== STATE_VERSION) return base;
    return {
      ...base,
      ...parsed,
      quiz: { ...base.quiz, ...(parsed.quiz ?? {}) },
      disponibilidade: {
        ...base.disponibilidade,
        ...(parsed.disponibilidade ?? {}),
        modos: { ...base.disponibilidade.modos, ...(parsed.disponibilidade?.modos ?? {}) },
      },
      opcoes: { ...base.opcoes, ...(parsed.opcoes ?? {}) },
      autoavaliacao: parsed.autoavaliacao ?? {},
    };
  } catch {
    return base;
  }
}

export function saveState(state) {
  const ls = safeStorage();
  if (!ls) return false;
  try {
    ls.setItem(KEY(state.concurso_id), JSON.stringify(state));
    ls.setItem(LAST_KEY, state.concurso_id);
    return true;
  } catch {
    return false;
  }
}

export function clearState(concursoId) {
  const ls = safeStorage();
  if (!ls) return;
  try {
    ls.removeItem(KEY(concursoId));
  } catch {
    /* ignore */
  }
}

export function lastConcurso() {
  const ls = safeStorage();
  if (!ls) return null;
  try {
    return ls.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

export function setLastConcurso(id) {
  const ls = safeStorage();
  if (!ls) return;
  try {
    if (id) ls.setItem(LAST_KEY, id);
    else ls.removeItem(LAST_KEY);
  } catch {
    /* ignore */
  }
}
