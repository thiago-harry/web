import { h, fmtH, fmtPct, fmtNum } from "../dom.js";
import { t } from "../strings.pt-BR.js";
import { btn, notice, segmented, sectionHead, kpi, dots, swatch, materiaSlot, tag, bar } from "../components.js";
import { explainStudy } from "../../engine/explain.js";

let view = "materia";
let open = null;

export function render(ctx) {
  const { app, derived, actions } = ctx;
  const scores = derived.scores;
  const r = derived.result;
  const pack = app.pack;
  const orc = Object.fromEntries((r.orcamentos ?? []).map((o) => [o.assunto_id, o]));
  const cut = new Set(r.assuntos_cortados ?? []);
  const nomes = Object.fromEntries(pack.assuntos.map((a) => [a.id, a]));

  const root = h(
    "section",
    { class: "screen" },
    sectionHead(
      t.diagnostico.titulo,
      t.diagnostico.sub,
      segmented(
        [
          { value: "materia", label: t.diagnostico.porMateria },
          { value: "ranking", label: t.diagnostico.ranking },
        ],
        view,
        (v) => {
          view = v;
          ctx.rerender();
        },
        { label: t.diagnostico.titulo }
      )
    )
  );

  const sources = Object.values(scores.byId).reduce((acc, s) => ((acc[s.gap_source] = (acc[s.gap_source] ?? 0) + 1), acc), {});
  const srcLabel = Object.entries(sources)
    .filter(([k]) => k !== "nenhum")
    .map(([k, n]) => `${t.diagnostico.fonteG[k]} (${n})`)
    .join(" · ");
  root.append(
    h(
      "div",
      { class: "kpis" },
      kpi(t.diagnostico.kpis.uteis, r.ok ? fmtH(r.capacidade.horas_uteis) : "—"),
      kpi(t.diagnostico.kpis.conteudo, r.ok ? fmtH(r.capacidade.horas_para_conteudo) : "—"),
      kpi(t.diagnostico.kpis.cobertura, `${pack.assuntos.length - cut.size}/${pack.assuntos.length}`, cut.size ? t.diagnostico.cortados : null),
      kpi(t.diagnostico.kpis.nivelamento, srcLabel || t.diagnostico.fonteG.nenhum)
    )
  );

  root.append(
    h(
      "div",
      { class: "quadros" },
      quadro("A", t.diagnostico.quadroA, t.diagnostico.quadroAdesc),
      quadro("B", t.diagnostico.quadroB, t.diagnostico.quadroBdesc),
      quadro("C", t.diagnostico.quadroC, t.diagnostico.quadroCdesc)
    )
  );
  root.append(h("p", { class: "small muted" }, dots(5), " ", t.diagnostico.legendaNivel, " · ", t.diagnostico.deltaDica));

  const row = (a, { withMateria = false } = {}) => {
    const s = scores.byId[a.id];
    const o = orc[a.id];
    const delta = s.rank_base - s.rank;
    const isCut = cut.has(a.id);
    const tr = h(
      "tr",
      { class: `row-click${open === a.id ? " open" : ""}${isCut ? " row-cut" : ""}`, onClick: () => toggle(ctx, a.id) },
      h("td", { class: "td-name" }, withMateria ? swatch(materiaSlot(pack, a.materia_id)) : null, h("span", {}, a.nome), isCut ? tag(t.diagnostico.cortados, "tag-warn") : null),
      h("td", { class: "td-q" }, dots(s.nivel_hist), h("div", { class: "small muted" }, s.F === 0 && s.B === 0 ? t.diagnostico.semHistorico : `${fmtPct(s.raw.F)} · ${fmtPct(s.raw.B)}`)),
      h("td", { class: "td-q" }, dots(s.nivel_edital), h("div", { class: "small muted" }, t.diagnostico.profundidade[a.edital_profundidade])),
      h("td", { class: "td-q" }, dots(s.nivel), h("div", { class: "small muted" }, `#${s.rank} · G ${fmtPct(s.G)}`)),
      h("td", { class: `td-num delta ${delta > 0 ? "up" : delta < 0 ? "down" : ""}` }, delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${-delta}` : "="),
      h("td", { class: "td-num" }, o ? fmtH(o.hours) : "—", h("div", { class: "small muted" }, `${fmtH(a.carga_horaria_base)} ${t.diagnostico.tempoMedio}`))
    );
    const rows = [tr];
    if (open === a.id) rows.push(h("tr", { class: "row-detail" }, h("td", { colspan: "6" }, breakdown(a, s, o, pack, scores))));
    return rows;
  };
  const header = () =>
    h(
      "thead",
      {},
      h(
        "tr",
        {},
        h("th", {}, t.diagnostico.assunto),
        h("th", {}, t.diagnostico.quadroA),
        h("th", {}, t.diagnostico.quadroB),
        h("th", {}, t.diagnostico.quadroC),
        h("th", { class: "td-num" }, t.diagnostico.delta),
        h("th", { class: "td-num" }, t.diagnostico.horas)
      )
    );

  if (view === "materia") {
    for (const mid of scores.materiaRanking) {
      const m = scores.materias[mid];
      const card = h(
        "div",
        { class: "card materia-card" },
        h(
          "div",
          { class: "materia-head" },
          h("div", { class: "materia-title" }, swatch(materiaSlot(pack, mid)), h("h2", { class: "h2" }, m.nome), dots(m.nivel, { showLabel: true })),
          h(
            "div",
            { class: "materia-facts small" },
            h("span", {}, t.diagnostico.pontos(m.questoes, m.peso, m.pontos), " · ", h("b", {}, fmtPct(m.share_prova)), ` ${t.diagnostico.daProva}`),
            h("span", {}, `${fmtH(m.horas_base)} ${t.diagnostico.tempoMedio}`),
            m.eliminatoria ? tag(t.diagnostico.eliminatoria(m.min_acertos), "tag-danger") : null
          )
        ),
        h("div", { class: "tbl-wrap" }, h("table", { class: "tbl diag" }, header(), h("tbody", {}, m.assuntos.map((id) => row(nomes[id])))))
      );
      root.append(card);
    }
  } else {
    root.append(
      h(
        "div",
        { class: "card" },
        h("div", { class: "tbl-wrap" }, h("table", { class: "tbl diag" }, header(), h("tbody", {}, scores.ranking.map((id) => row(nomes[id], { withMateria: true })))))
      )
    );
  }

  if (r.ok && r.cobertura_parcial) root.append(notice("warn", t.cronograma.cortadosAviso(cut.size)));
  root.append(h("div", { class: "actions-row" }, btn(`${t.diagnostico.continuar} →`, { kind: "primary", onClick: () => actions.go("cronograma"), disabled: !r.ok })));
  return root;
}

function toggle(ctx, id) {
  open = open === id ? null : id;
  ctx.rerender();
}

function quadro(letter, title, desc) {
  return h("div", { class: "quadro" }, h("span", { class: "quadro-letter" }, letter), h("div", {}, h("b", {}, title.replace(/^[ABC] · /, "")), h("p", { class: "small muted" }, desc)));
}

function breakdown(a, s, o, pack, scores) {
  const w = scores.weights;
  const total = pack.assuntos.length;
  const motivo = explainStudy({ atividade: "teoria", assunto: a, score: s, total, pass: 1, finalStretch: false }).motivo;
  const maxC = Math.max(s.contrib.F, s.contrib.B, s.contrib.E, 1e-9);
  const line = (label, value, sub) => h("div", { class: "bd-row" }, h("span", { class: "bd-label" }, label), bar(value, maxC), h("span", { class: "bd-val" }, fmtNum(value, 3)), sub ? h("span", { class: "small muted" }, sub) : null);
  return h(
    "div",
    { class: "breakdown" },
    h("p", { class: "mono small" }, `${t.diagnostico.formula}`),
    h(
      "p",
      { class: "mono small" },
      `P = (${w.wF}·${fmtNum(s.F)} + ${w.wB}·${fmtNum(s.B)} + ${w.wE}·${fmtNum(s.E)}) · (1 + ${fmtNum(s.G)}) · ${fmtNum(s.M)} = `,
      h("b", {}, fmtNum(s.P, 3))
    ),
    h("p", { class: "small" }, h("b", {}, t.diagnostico.contrib)),
    line("F", s.contrib.F, `${fmtPct(s.raw.F)} das questões do cargo`),
    line("B", s.contrib.B, `${fmtPct(s.raw.B)} das questões da banca`),
    line("E", s.contrib.E, `${fmtPct(s.raw.E)} do peso do edital`),
    h(
      "p",
      { class: "small" },
      `${t.diagnostico.lacuna} G = ${fmtNum(s.G)} (${t.diagnostico.fonteG[s.gap_source]})`,
      s.multiplicadores.volatil > 1 ? ` · volátil ×${s.multiplicadores.volatil}` : "",
      s.multiplicadores.eliminatoria > 1 ? ` · eliminatória ×${s.multiplicadores.eliminatoria}` : "",
      o ? ` · ${t.diagnostico.orcamento}: ${fmtH(o.hours)} (${fmtH(a.carga_horaria_base)} base${o.clamp ? `, limite ${o.clamp === "max" ? "2×" : "0,5×"}` : ""})` : ""
    ),
    h("p", { class: "small" }, h("b", {}, t.diagnostico.motivo), h("br"), h("em", {}, motivo))
  );
}
