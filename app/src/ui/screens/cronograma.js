import { h, fmtH, fmtMin, fmtDM, fmtDMY, nowBR } from "../dom.js";
import { t } from "../strings.pt-BR.js";
import { btn, notice, sectionHead, kpi, swatch, materiaSlot, materiaVar, tag } from "../components.js";
import { blockTimes, toCSV, toICS, download, slug } from "../export.js";

let weekIdx = 0;
let filter = null;
let openBlock = null;

const DAY_ORDER_LABEL = (k) => t.disponibilidade.dias[k];

export function render(ctx) {
  const { app, derived, actions } = ctx;
  const r = derived.result;
  const pack = app.pack;
  const nomes = Object.fromEntries(pack.assuntos.map((a) => [a.id, a.nome]));
  const materias = Object.fromEntries(pack.estrutura_prova.materias.map((m) => [m.id, m.nome]));
  const root = h("section", { class: "screen" }, sectionHead(t.cronograma.titulo, t.cronograma.sub));

  if (!r.ok) {
    root.append(notice("error", t.disponibilidade.erro), h("div", { class: "actions-row" }, btn(t.cronograma.parcialVoltar, { onClick: () => actions.go("disponibilidade") })));
    return root;
  }
  if (r.cobertura_parcial && !r.cronograma) {
    root.append(
      h(
        "div",
        { class: "card" },
        h("h2", { class: "h2" }, t.cronograma.parcialTitulo),
        h("p", {}, t.cronograma.parcialTexto(r.deficit_horas)),
        h("p", { class: "small" }, h("b", {}, t.cronograma.parcialCortados)),
        h("ul", { class: "small" }, r.assuntos_cortados.map((id) => h("li", {}, nomes[id]))),
        h(
          "div",
          { class: "actions-row" },
          btn(t.cronograma.parcialVoltar, { onClick: () => actions.go("disponibilidade") }),
          btn(t.cronograma.parcialAceitar, { kind: "primary", onClick: () => actions.setOption("aceitar_corte", true) })
        )
      )
    );
    return root;
  }

  const weeks = r.cronograma;
  weekIdx = Math.max(0, Math.min(weeks.length - 1, weekIdx));
  const w = weeks[weekIdx];
  const s = r.resumo;

  root.append(
    h(
      "div",
      { class: "kpis" },
      kpi(t.cronograma.kpis.alocadas, fmtH(s.horas_alocadas), `${fmtH(s.horas_livres)} ${t.cronograma.livre}`),
      kpi(t.cronograma.kpis.concluidos, `${s.assuntos_concluidos}/${pack.assuntos.length - (r.assuntos_cortados?.length ?? 0)}`),
      kpi(t.cronograma.kpis.simulados, String(s.simulados)),
      kpi(t.cronograma.kpis.avisos, String(r.avisos.length))
    )
  );
  if (r.cobertura_parcial) root.append(notice("warn", t.cronograma.cortadosAviso(r.assuntos_cortados.length), " ", r.assuntos_cortados.map((id) => nomes[id]).join(", ")));

  // week navigation
  const select = h(
    "select",
    { class: "week-select", "aria-label": t.cronograma.semana(w.numero, weeks.length), onChange: (e) => setWeek(ctx, Number(e.target.value)) },
    weeks.map((wk, i) => h("option", { value: String(i), selected: i === weekIdx }, `${t.cronograma.semana(wk.numero, weeks.length)} · ${fmtDM(wk.inicio)}–${fmtDM(wk.fim)}`))
  );
  root.append(
    h(
      "div",
      { class: "week-nav" },
      btn("←", { onClick: () => setWeek(ctx, weekIdx - 1), disabled: weekIdx === 0, title: t.cronograma.anterior, attrs: { "aria-label": t.cronograma.anterior } }),
      select,
      btn("→", { onClick: () => setWeek(ctx, weekIdx + 1), disabled: weekIdx === weeks.length - 1, title: t.cronograma.proxima, attrs: { "aria-label": t.cronograma.proxima } }),
      h(
        "div",
        { class: "week-badges" },
        w.reta_final ? tag(t.cronograma.retaFinal, "tag-danger") : null,
        w.simulado ? tag(t.cronograma.simulado, "tag-accent") : null,
        w.novos_assuntos.length ? tag(`${t.cronograma.novos}: ${w.novos_assuntos.map((id) => nomes[id]).join(", ")}`, "tag-soft") : null,
        h("span", { class: "small muted" }, `${fmtMin(w.alocado_min)} / ${fmtMin(w.capacidade_util_min)}`)
      )
    )
  );

  // matéria filter
  root.append(
    h(
      "div",
      { class: "chips" },
      h("button", { type: "button", class: `chip${filter === null ? " on" : ""}`, onClick: () => setFilter(ctx, null) }, t.cronograma.todas),
      pack.estrutura_prova.materias.map((m) =>
        h("button", { type: "button", class: `chip${filter === m.id ? " on" : ""}`, onClick: () => setFilter(ctx, m.id) }, swatch(materiaSlot(pack, m.id)), m.nome)
      )
    )
  );

  // day grid
  const grid = h("div", { class: "days" });
  for (const d of w.dias) {
    const times = blockTimes(d, app.state.disponibilidade);
    const col = h(
      "div",
      { class: `day${d.reta_final ? " day-final" : ""}` },
      h("div", { class: "day-head" }, h("b", {}, DAY_ORDER_LABEL(d.dia_semana)), h("span", { class: "muted small" }, ` ${fmtDM(d.data)}`), h("span", { class: "day-cap small" }, d.capacidade_min ? fmtMin(d.alocado_min) : ""))
    );
    if (!d.capacidade_min) col.append(h("div", { class: "day-rest small muted" }, t.cronograma.descanso));
    d.blocos.forEach((b, i) => {
      const dim = filter !== null && b.materia_id !== filter && b.atividade !== "simulado";
      const key = `${d.data}:${i}`;
      const slot = b.materia_id ? materiaSlot(pack, b.materia_id) : 0;
      col.append(
        h(
          "button",
          {
            type: "button",
            class: `block act-${b.atividade}${dim ? " dim" : ""}${openBlock === key ? " open" : ""}`,
            style: { "--c": materiaVar(slot) },
            "aria-expanded": String(openBlock === key),
            onClick: () => {
              openBlock = openBlock === key ? null : key;
              ctx.rerender();
            },
          },
          h("div", { class: "block-top mono small" }, `${times[i].startLabel}–${times[i].endLabel}`, h("span", {}, fmtMin(b.minutos))),
          h("div", { class: "block-title" }, b.assunto_id ? nomes[b.assunto_id] : t.cronograma.atividade.simulado),
          h(
            "div",
            { class: "block-meta small" },
            h("span", { class: `act act-${b.atividade}` }, t.cronograma.atividade[b.atividade], b.intervalo_dias ? ` +${b.intervalo_dias}d` : ""),
            b.materia_id ? h("span", { class: "muted" }, materias[b.materia_id]) : null
          ),
          openBlock === key ? h("p", { class: "block-motivo small" }, b.motivo) : null
        )
      );
    });
    grid.append(col);
  }
  root.append(h("div", { class: "days-wrap" }, grid));

  // exports
  const base = `cronograma-${slug(pack.concurso.id)}`;
  root.append(
    h(
      "div",
      { class: "card export-row" },
      btn(t.cronograma.imprimir, { onClick: () => window.print() }),
      btn(t.cronograma.ics, { onClick: () => download(`${base}.ics`, toICS({ result: r, pack, inicioHora: app.state.disponibilidade, stamp: icsStamp() }), "text/calendar") }),
      btn(t.cronograma.csv, { onClick: () => download(`${base}.csv`, toCSV({ result: r, pack, inicioHora: app.state.disponibilidade }), "text/csv") }),
      h("span", { class: "small muted" }, t.cronograma.exportDica)
    )
  );

  if (r.avisos.length) {
    root.append(
      h(
        "details",
        { class: "card small" },
        h("summary", {}, `${t.cronograma.avisosTitulo} (${r.avisos.length})`),
        h("ul", {}, r.avisos.slice(0, 50).map((a) => h("li", {}, h("code", {}, a.codigo), " ", a.data ?? (a.semana ? `semana ${a.semana}` : ""), " · ", a.mensagem)))
      )
    );
  }

  root.append(renderPrint(ctx, r));
  return root;
}

function setWeek(ctx, i) {
  weekIdx = i;
  openBlock = null;
  ctx.rerender();
}
function setFilter(ctx, m) {
  filter = m;
  ctx.rerender();
}
function icsStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00Z`;
}

/** Full plan for print (@media print shows it, screen hides it). */
function renderPrint(ctx, r) {
  const { app } = ctx;
  const pack = app.pack;
  const nomes = Object.fromEntries(pack.assuntos.map((a) => [a.id, a.nome]));
  const materias = Object.fromEntries(pack.estrutura_prova.materias.map((m) => [m.id, m.nome]));
  const root = h(
    "div",
    { class: "print-only" },
    h("h1", {}, `${t.cronograma.printTitulo} · ${pack.concurso.nome}`),
    h("p", {}, `${pack.concurso.cargo} · ${pack.concurso.banca} · ${t.concurso.prova} ${fmtDMY(r.capacidade.data_prova)} · ${t.cronograma.geradoEm(nowBR())}`)
  );
  for (const w of r.cronograma) {
    const table = h(
      "table",
      { class: "print-table" },
      h(
        "thead",
        {},
        h(
          "tr",
          {},
          h("th", { colspan: "7" }, `${t.cronograma.semana(w.numero, r.cronograma.length)} · ${fmtDM(w.inicio)} a ${fmtDM(w.fim)}`, w.reta_final ? ` · ${t.cronograma.retaFinal}` : "", w.simulado ? ` · ${t.cronograma.simulado}` : "")
        ),
        h(
          "tr",
          {},
          h("th", {}, t.cronograma.colunas.dia),
          h("th", {}, t.cronograma.colunas.horario),
          h("th", {}, t.cronograma.colunas.materia),
          h("th", {}, t.cronograma.colunas.assunto),
          h("th", {}, t.cronograma.colunas.atividade),
          h("th", {}, t.cronograma.colunas.duracao),
          h("th", {}, t.cronograma.printFeito)
        )
      )
    );
    const body = h("tbody");
    for (const d of w.dias) {
      if (!d.capacidade_min) {
        body.append(h("tr", {}, h("td", {}, `${DAY_ORDER_LABEL(d.dia_semana)} ${fmtDM(d.data)}`), h("td", { colspan: "6", class: "muted" }, t.cronograma.descanso)));
        continue;
      }
      const times = blockTimes(d, app.state.disponibilidade);
      d.blocos.forEach((b, i) => {
        body.append(
          h(
            "tr",
            {},
            h("td", {}, i === 0 ? `${DAY_ORDER_LABEL(d.dia_semana)} ${fmtDM(d.data)}` : ""),
            h("td", { class: "mono" }, `${times[i].startLabel}–${times[i].endLabel}`),
            h("td", {}, b.materia_id ? materias[b.materia_id] : ""),
            h("td", {}, b.assunto_id ? nomes[b.assunto_id] : t.cronograma.atividade.simulado),
            h("td", {}, t.cronograma.atividade[b.atividade], b.intervalo_dias ? ` +${b.intervalo_dias}d` : ""),
            h("td", {}, fmtMin(b.minutos)),
            h("td", { class: "check-cell" }, "☐")
          )
        );
      });
    }
    table.append(body);
    root.append(table);
  }
  return root;
}
