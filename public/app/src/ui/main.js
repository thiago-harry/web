// App shell: routing, state, memoized engine calls. Screens are pure render functions.
import { generate, validatePack, score } from "../engine/index.js";
import { sampleQuiz, scoreQuiz } from "../engine/quiz.js";
import { loadState, saveState, clearState, lastConcurso, setLastConcurso, defaultState, MODE_PRESETS } from "../state.js";
import { t } from "./strings.pt-BR.js";
import { h, clear } from "./dom.js";
import * as concurso from "./screens/concurso.js";
import * as nivelamento from "./screens/nivelamento.js";
import * as disponibilidade from "./screens/disponibilidade.js";
import * as diagnostico from "./screens/diagnostico.js";
import * as cronograma from "./screens/cronograma.js";

const ROUTES = ["concurso", "nivelamento", "disponibilidade", "diagnostico", "cronograma"];
const SCREENS = { concurso, nivelamento, disponibilidade, diagnostico, cronograma };

const app = { packs: [], packsError: null, pack: null, packMeta: null, state: null, validation: null, loading: true };
const cache = {};

/* ---------------- derived data (memoized) ---------------- */

function getQuiz() {
  if (!app.pack) return null;
  if (cache.quizPack !== app.pack) {
    cache.quiz = sampleQuiz(app.pack);
    cache.quizPack = app.pack;
  }
  return cache.quiz;
}
function getQuizScore() {
  const quiz = getQuiz();
  if (!quiz) return null;
  const key = JSON.stringify(app.state.quiz.respostas);
  if (cache.quizScoreKey !== key || cache.quizScorePack !== app.pack) {
    cache.quizScore = scoreQuiz(quiz.itens, app.state.quiz.respostas);
    cache.quizScoreKey = key;
    cache.quizScorePack = app.pack;
  }
  return cache.quizScore;
}
function nivelamentoInput() {
  const out = {};
  const self = app.state.autoavaliacao;
  if (Object.keys(self).length) out.autoavaliacao = self;
  const qs = getQuizScore();
  if (qs && Object.keys(qs.porAssunto).length) out.simulado = qs.porAssunto;
  return out;
}
function getScores() {
  const niv = nivelamentoInput();
  const key = JSON.stringify(niv);
  if (cache.scoresKey !== key || cache.scoresPack !== app.pack) {
    cache.scores = score({ pack: app.pack, nivelamento: niv });
    cache.scoresKey = key;
    cache.scoresPack = app.pack;
  }
  return cache.scores;
}
function getResult() {
  const d = app.state.disponibilidade;
  const input = {
    nivelamento: nivelamentoInput(),
    disponibilidade: { horas_por_dia_semana: d.modos[d.modo], data_inicio: d.data_inicio, data_prova: d.data_prova },
    options: { allocate: { leftover: app.state.opcoes.preencher_sobra ? "second_pass" : "free", accept_cut: app.state.opcoes.aceitar_corte } },
  };
  const key = JSON.stringify(input);
  if (cache.resultKey !== key || cache.resultPack !== app.pack) {
    cache.result = generate({ pack: app.pack, ...input });
    cache.resultKey = key;
    cache.resultPack = app.pack;
  }
  return cache.result;
}

/* ---------------- actions ---------------- */

function commit() {
  saveState(app.state);
  render();
}
const actions = {
  go(route) {
    location.hash = `#${route}`;
  },
  async selectPack(id) {
    const meta = app.packs.find((p) => p.id === id);
    if (!meta) return;
    await loadPack(meta);
    if (app.pack) location.hash = "#nivelamento";
    else render();
  },
  clearData() {
    clearState(app.state.concurso_id);
    app.state = defaultState(app.pack);
    commit();
  },
  setSelf(id, value) {
    const self = { ...app.state.autoavaliacao };
    if (value === null || value === undefined) delete self[id];
    else self[id] = value;
    app.state.autoavaliacao = self;
    commit();
  },
  setSelfMateria(materiaId, value) {
    const self = { ...app.state.autoavaliacao };
    for (const a of app.pack.assuntos) if (a.materia_id === materiaId) self[a.id] = value;
    app.state.autoavaliacao = self;
    commit();
  },
  clearSelf() {
    app.state.autoavaliacao = {};
    commit();
  },
  setQuizAnswer(itemId, idx) {
    app.state.quiz = { ...app.state.quiz, respostas: { ...app.state.quiz.respostas, [itemId]: idx } };
    const quiz = getQuiz();
    const answered = quiz.itens.filter((i) => Number.isInteger(app.state.quiz.respostas[i.id])).length;
    if (answered === quiz.itens.length) app.state.quiz.concluido = true;
    commit();
  },
  finishQuiz() {
    app.state.quiz = { ...app.state.quiz, concluido: true };
    commit();
  },
  resetQuiz() {
    app.state.quiz = { respostas: {}, concluido: false };
    commit();
  },
  setMode(mode) {
    if (!MODE_PRESETS[mode]) return;
    app.state.disponibilidade = { ...app.state.disponibilidade, modo: mode };
    commit();
  },
  setModeHours(mode, day, raw) {
    const v = Math.max(0, Math.min(24, Number(String(raw).replace(",", ".")) || 0));
    const rounded = Math.round(v * 2) / 2;
    const modos = { ...app.state.disponibilidade.modos, [mode]: { ...app.state.disponibilidade.modos[mode], [day]: rounded } };
    app.state.disponibilidade = { ...app.state.disponibilidade, modos };
    commit();
  },
  setModeDays(mode, days, value) {
    const cur = { ...app.state.disponibilidade.modos[mode] };
    for (const d of days) cur[d] = value;
    app.state.disponibilidade = { ...app.state.disponibilidade, modos: { ...app.state.disponibilidade.modos, [mode]: cur } };
    commit();
  },
  setAvail(patch) {
    app.state.disponibilidade = { ...app.state.disponibilidade, ...patch };
    commit();
  },
  setOption(key, value) {
    app.state.opcoes = { ...app.state.opcoes, [key]: value };
    commit();
  },
};

/* ---------------- loading ---------------- */

async function fetchJSON(path) {
  const res = await fetch(new URL(path, document.baseURI), { cache: "no-cache" });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

async function loadPack(meta) {
  app.loading = true;
  render();
  try {
    const pack = await fetchJSON(`./packs/${meta.arquivo}`);
    const validation = validatePack(pack);
    app.validation = validation;
    app.packMeta = meta;
    if (validation.ok) {
      app.pack = pack;
      app.state = loadState(pack);
      saveState(app.state);
      setLastConcurso(pack.concurso.id);
    } else {
      app.pack = null;
      app.state = null;
    }
  } catch (err) {
    app.pack = null;
    app.state = null;
    app.validation = { ok: false, errors: [{ path: `/packs/${meta.arquivo}`, message: String(err.message ?? err) }], warnings: [] };
  } finally {
    app.loading = false;
  }
}

async function init() {
  try {
    const index = await fetchJSON("./packs/index.json");
    app.packs = index.packs ?? [];
  } catch (err) {
    app.packsError = String(err.message ?? err);
  }
  const last = lastConcurso();
  const meta = app.packs.find((p) => p.id === last);
  if (meta) await loadPack(meta);
  app.loading = false;
  render();
}

/* ---------------- rendering ---------------- */

function currentRoute() {
  const r = (location.hash || "#concurso").slice(1);
  if (!ROUTES.includes(r)) return "concurso";
  if (r !== "concurso" && !app.pack) return "concurso";
  return r;
}

function nav(route) {
  const stepDone = {
    concurso: !!app.pack,
    nivelamento: !!app.pack && (Object.keys(app.state.autoavaliacao).length > 0 || app.state.quiz.concluido),
    disponibilidade: !!app.pack,
    diagnostico: !!app.pack,
    cronograma: false,
  };
  return h(
    "nav",
    { class: "steps", "aria-label": "Etapas" },
    h(
      "ol",
      {},
      ROUTES.map((r, i) =>
        h(
          "li",
          { class: `${route === r ? "active" : ""}${stepDone[r] ? " done" : ""}${!app.pack && r !== "concurso" ? " disabled" : ""}` },
          h("a", { href: `#${r}`, "aria-current": route === r ? "step" : null, tabindex: !app.pack && r !== "concurso" ? "-1" : null }, h("span", { class: "step-n" }, String(i + 1)), h("span", { class: "step-label" }, t.passos[r]))
        )
      )
    )
  );
}

function brandMark() {
  const span = h("span", { class: "brand-mark", "aria-hidden": "true" });
  span.innerHTML =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/><path d="m9 15 2 2 4-4"/></svg>';
  return span;
}

function render() {
  const root = document.getElementById("app");
  const focusKey = document.activeElement?.dataset?.focus ?? null;
  const scrollY = window.scrollY;
  const route = currentRoute();
  clear(root);

  const header = h(
    "header",
    { class: "top" },
    h(
      "div",
      { class: "wrap top-inner" },
      h(
        "div",
        { class: "brand" },
        brandMark(),
        h("div", {}, h("div", { class: "brand-name" }, t.app.nome), app.packMeta ? h("div", { class: "brand-pack" }, app.packMeta.nome) : null)
      ),
      nav(route)
    )
  );
  root.append(header);

  const main = h("main", { class: "wrap" });
  if (app.loading && !app.pack) main.append(h("p", { class: "muted" }, t.app.carregando));
  else {
    const ctx = {
      t,
      app,
      actions,
      rerender: render,
      derived: {
        get quiz() {
          return getQuiz();
        },
        get quizScore() {
          return getQuizScore();
        },
        get scores() {
          return getScores();
        },
        get result() {
          return getResult();
        },
      },
    };
    try {
      main.append(SCREENS[route].render(ctx));
    } catch (err) {
      console.error(err);
      main.append(h("div", { class: "notice notice-error", role: "alert" }, String(err.message ?? err)));
    }
  }
  root.append(main);
  root.append(h("footer", { class: "wrap foot small muted" }, t.app.rodape));

  if (focusKey) root.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
  window.scrollTo(0, scrollY);
}

window.addEventListener("hashchange", () => {
  window.scrollTo(0, 0);
  render();
});
init();
