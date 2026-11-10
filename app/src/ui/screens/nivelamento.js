import { h, fmtPct } from "../dom.js";
import { t } from "../strings.pt-BR.js";
import { btn, notice, segmented, sectionHead, bar, swatch, materiaSlot, tag } from "../components.js";

let tab = null; // "simulado" | "auto"
let current = null; // quiz question index

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const SELF_VALUES = [0, 1, 2, 3, 4, "nunca"];

export function render(ctx) {
  const { app, derived } = ctx;
  const hasQuiz = derived.quiz && derived.quiz.itens.length > 0;
  if (tab === null) tab = hasQuiz ? "simulado" : "auto";
  if (tab === "simulado" && !hasQuiz) tab = "auto";

  const answered = hasQuiz ? derived.quiz.itens.filter((i) => Number.isInteger(app.state.quiz.respostas[i.id])).length : 0;
  const selfCount = Object.keys(app.state.autoavaliacao).length;

  const root = h(
    "section",
    { class: "screen" },
    sectionHead(
      t.nivelamento.titulo,
      t.nivelamento.sub,
      segmented(
        [
          { value: "simulado", label: t.nivelamento.tabSimulado, hint: hasQuiz ? `${answered}/${derived.quiz.itens.length}` : "—", disabled: !hasQuiz },
          { value: "auto", label: t.nivelamento.tabAuto, hint: `${selfCount}/${app.pack.assuntos.length}` },
        ],
        tab,
        (v) => {
          tab = v;
          ctx.rerender();
        },
        { label: t.nivelamento.titulo }
      )
    )
  );
  root.append(tab === "simulado" ? renderQuiz(ctx) : renderSelf(ctx));
  if (!answered && !selfCount) root.append(notice("info", t.nivelamento.semNada));
  root.append(
    h("div", { class: "actions-row" }, btn(`${t.nivelamento.continuar} →`, { kind: "primary", onClick: () => ctx.actions.go("disponibilidade") }))
  );
  return root;
}

/* ---------------- simulado ---------------- */

function renderQuiz(ctx) {
  const { app, derived, actions } = ctx;
  const quiz = derived.quiz;
  const resp = app.state.quiz.respostas;
  const total = quiz.itens.length;
  const answered = quiz.itens.filter((i) => Number.isInteger(resp[i.id])).length;
  if (app.state.quiz.concluido) return renderQuizResult(ctx);

  if (current === null || current >= total || current < 0) {
    const firstOpen = quiz.itens.findIndex((i) => !Number.isInteger(resp[i.id]));
    current = firstOpen >= 0 ? firstOpen : 0;
  }
  const item = quiz.itens[current];
  const assunto = app.pack.assuntos.find((a) => a.id === item.assunto_id);
  const materia = app.pack.estrutura_prova.materias.find((m) => m.id === assunto.materia_id);
  const chosen = resp[item.id];

  const goTo = (i) => {
    current = Math.max(0, Math.min(total - 1, i));
    ctx.rerender();
  };
  const answer = (idx) => {
    const next = quiz.itens.findIndex((it, k) => k > current && !Number.isInteger(resp[it.id]));
    const nextAny = quiz.itens.findIndex((it) => it.id !== item.id && !Number.isInteger(resp[it.id]));
    current = next >= 0 ? next : nextAny >= 0 ? nextAny : current;
    actions.setQuizAnswer(item.id, idx);
  };

  const card = h(
    "div",
    {
      class: "card quiz",
      tabindex: "0",
      "data-focus": "quiz-card",
      onKeydown: (e) => {
        const k = e.key.toLowerCase();
        const idxNum = "12345".indexOf(k);
        const idxLet = "abcde".indexOf(k);
        const idx = idxNum >= 0 ? idxNum : idxLet;
        if (idx >= 0 && idx < item.alternativas.length) {
          e.preventDefault();
          answer(idx);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          goTo(current + 1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          goTo(current - 1);
        }
      },
    },
    h(
      "div",
      { class: "quiz-top" },
      h("span", { class: "muted small" }, t.nivelamento.questoesDe(current + 1, total)),
      h("span", { class: "small" }, swatch(materiaSlot(app.pack, materia.id)), " ", materia.nome, " · ", assunto.nome)
    ),
    bar(answered, total, { height: 4 }),
    h("p", { class: "quiz-q" }, item.enunciado),
    h(
      "div",
      { class: "quiz-alts" },
      item.alternativas.map((alt, i) =>
        h(
          "button",
          { type: "button", class: `alt${chosen === i ? " chosen" : ""}`, "aria-pressed": String(chosen === i), onClick: () => answer(i) },
          h("span", { class: "alt-letter" }, LETTERS[i]),
          h("span", {}, alt)
        )
      )
    ),
    h(
      "div",
      { class: "quiz-nav" },
      btn(`← ${t.nivelamento.anterior}`, { onClick: () => goTo(current - 1), disabled: current === 0, small: true }),
      h("span", { class: "muted small" }, t.nivelamento.respondidas(answered, total)),
      current < total - 1 ? btn(`${t.nivelamento.proxima} →`, { onClick: () => goTo(current + 1), small: true }) : null,
      answered === total ? btn(t.nivelamento.concluir, { kind: "primary", onClick: () => actions.finishQuiz(), small: true }) : null
    ),
    h("p", { class: "hint" }, t.nivelamento.atalhos)
  );
  return card;
}

function renderQuizResult(ctx) {
  const { app, derived, actions } = ctx;
  const quiz = derived.quiz;
  const res = derived.quizScore;
  const scores = derived.scores;
  const root = h("div", { class: "card" });
  root.append(
    h(
      "div",
      { class: "result-top" },
      h("h2", { class: "h2" }, t.nivelamento.resultado),
      h("p", { class: "big-num" }, `${res.total.acertos}/${res.total.respondidas}`, h("span", { class: "muted small" }, ` ${t.nivelamento.acertos} · ${fmtPct(res.total.respondidas ? res.total.acertos / res.total.respondidas : 0)}`))
    )
  );
  for (const m of app.pack.estrutura_prova.materias) {
    const topics = app.pack.assuntos.filter((a) => a.materia_id === m.id && res.porAssunto[a.id]);
    if (!topics.length) continue;
    const mTot = topics.reduce((s, a) => ({ r: s.r + res.porAssunto[a.id].respondidas, ok: s.ok + res.porAssunto[a.id].acertos }), { r: 0, ok: 0 });
    const block = h("div", { class: "result-materia" }, h("h3", { class: "h3" }, swatch(materiaSlot(app.pack, m.id)), " ", m.nome, h("span", { class: "muted small" }, ` ${mTot.ok}/${mTot.r}`)));
    const table = h("table", { class: "tbl" });
    for (const a of topics) {
      const q = res.porAssunto[a.id];
      const sc = scores.byId[a.id];
      table.append(
        h(
          "tr",
          {},
          h("td", { class: "td-name" }, a.nome),
          h("td", { class: "td-num" }, t.nivelamento.simuladoLegenda(q.acertos, q.respondidas)),
          h("td", { class: "td-bar" }, bar(q.acertos, q.respondidas)),
          h("td", { class: "td-num muted small" }, `${t.diagnostico.lacuna} ${fmtPct(sc.G)}`, sc.gap_source === "hibrido" ? tag(t.diagnostico.fonteG.hibrido, "tag-soft") : null)
        )
      );
    }
    block.append(h("div", { class: "tbl-wrap" }, table));
    root.append(block);
  }
  if (quiz.sem_itens.length) {
    const nomes = Object.fromEntries(app.pack.assuntos.map((a) => [a.id, a.nome]));
    root.append(notice("info", t.nivelamento.semItensAssuntos, " ", quiz.sem_itens.map((id) => nomes[id]).join(", ")));
  }
  root.append(h("p", { class: "hint" }, t.nivelamento.fonteHibrido));
  root.append(
    h(
      "div",
      { class: "actions-row" },
      btn(t.nivelamento.refazer, {
        onClick: () => {
          current = 0;
          actions.resetQuiz();
        },
      }),
      btn(t.nivelamento.tabAuto, {
        onClick: () => {
          tab = "auto";
          ctx.rerender();
        },
      })
    )
  );
  return root;
}

/* ---------------- autoavaliação ---------------- */

function renderSelf(ctx) {
  const { app, actions, derived } = ctx;
  const self = app.state.autoavaliacao;
  const quizRes = derived.quizScore?.porAssunto ?? {};
  const total = app.pack.assuntos.length;
  const done = Object.keys(self).filter((id) => app.pack.assuntos.some((a) => a.id === id)).length;

  const root = h("div", { class: "card self" });
  root.append(
    h(
      "div",
      { class: "self-top" },
      h("ol", { class: "scale" }, t.nivelamento.escala.map((label, i) => h("li", {}, h("b", {}, i), " ", label)), h("li", {}, h("b", {}, "N"), " ", t.nivelamento.nunca)),
      h("div", { class: "self-meta" }, h("span", { class: "small muted" }, t.nivelamento.avaliados(done, total)), btn(t.nivelamento.limparAuto, { small: true, onClick: () => actions.clearSelf(), disabled: !done }))
    )
  );

  const list = h("div", {
    class: "self-list",
    onKeydown: (e) => {
      const rowEl = e.target.closest("[data-row]");
      if (!rowEl) return;
      const id = rowEl.dataset.row;
      if (/^[0-4]$/.test(e.key)) {
        e.preventDefault();
        actions.setSelf(id, Number(e.key));
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        actions.setSelf(id, "nunca");
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const rows = [...list.querySelectorAll("[data-row]")];
        const i = rows.indexOf(rowEl);
        const target = rows[i + (e.key === "ArrowDown" ? 1 : -1)];
        if (!target) return;
        const col = [...rowEl.querySelectorAll("button")].indexOf(e.target);
        const btns = target.querySelectorAll("button");
        (btns[Math.max(0, col)] ?? btns[0])?.focus();
      }
    },
  });

  for (const m of app.pack.estrutura_prova.materias) {
    const topics = app.pack.assuntos.filter((a) => a.materia_id === m.id);
    const head = h(
      "div",
      { class: "self-materia" },
      h("div", { class: "self-materia-name" }, swatch(materiaSlot(app.pack, m.id)), h("b", {}, m.nome)),
      h(
        "div",
        { class: "self-materia-fill" },
        h("span", { class: "small muted" }, t.nivelamento.materiaInteira),
        SELF_VALUES.map((v) => h("button", { type: "button", class: "mini", title: `${t.nivelamento.materiaInteira} ${v === "nunca" ? t.nivelamento.nunca : t.nivelamento.escala[v]}`, onClick: () => actions.setSelfMateria(m.id, v) }, v === "nunca" ? "N" : String(v)))
      )
    );
    list.append(head);
    for (const a of topics) {
      const v = self[a.id];
      const q = quizRes[a.id];
      list.append(
        h(
          "div",
          { class: "self-row", "data-row": a.id },
          h("div", { class: "self-name" }, a.nome, q ? h("span", { class: "muted small" }, ` · ${t.nivelamento.tabSimulado} ${q.acertos}/${q.respondidas}`) : null),
          h(
            "div",
            { class: "self-buttons", role: "radiogroup", "aria-label": a.nome },
            SELF_VALUES.map((val) =>
              h(
                "button",
                {
                  type: "button",
                  role: "radio",
                  class: `lvl${v === val ? " on" : ""}${val === "nunca" ? " lvl-never" : ""}`,
                  "aria-checked": String(v === val),
                  "data-focus": `self:${a.id}:${val}`,
                  title: val === "nunca" ? t.nivelamento.nunca : t.nivelamento.escala[val],
                  onClick: () => actions.setSelf(a.id, v === val ? null : val),
                },
                val === "nunca" ? t.nivelamento.nunca : String(val)
              )
            ),
            h("button", { type: "button", class: "link small", onClick: () => actions.setSelf(a.id, "nunca") }, t.nivelamento.naoSei)
          )
        )
      );
    }
  }
  root.append(list);
  root.append(h("p", { class: "hint" }, t.nivelamento.atalhosAuto));
  return root;
}
