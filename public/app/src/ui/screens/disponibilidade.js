import { h, fmtH } from "../dom.js";
import { t } from "../strings.pt-BR.js";
import { btn, notice, segmented, sectionHead, field, kpi } from "../components.js";
import { WEEKDAY_KEYS } from "../../engine/dates.js";

const DAY_ORDER = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];

export function render(ctx) {
  const { app, derived, actions } = ctx;
  const d = app.state.disponibilidade;
  const hours = d.modos[d.modo];
  const weekTotal = DAY_ORDER.reduce((s, k) => s + (Number(hours[k]) || 0), 0);
  const r = derived.result;
  const inputErrors = !r.ok && r.etapa === "disponibilidade" ? Object.fromEntries(r.erros.map((e) => [e.path, e.message])) : {};

  const root = h("section", { class: "screen" }, sectionHead(t.disponibilidade.titulo, t.disponibilidade.sub));

  const modeCard = h(
    "div",
    { class: "card" },
    segmented(
      Object.entries(t.disponibilidade.modos).map(([value, label]) => ({
        value,
        label,
        hint: fmtH(DAY_ORDER.reduce((s, k) => s + (Number(d.modos[value][k]) || 0), 0)) + "/sem",
      })),
      d.modo,
      (m) => actions.setMode(m),
      { label: t.disponibilidade.titulo }
    ),
    h("p", { class: "hint" }, t.disponibilidade.modoDica),
    h(
      "div",
      { class: "week-grid" },
      DAY_ORDER.map((k) =>
        h(
          "label",
          { class: "day-input" },
          h("span", { class: "day-name" }, t.disponibilidade.dias[k]),
          h("input", {
            type: "number",
            min: "0",
            max: "24",
            step: "0.5",
            inputmode: "decimal",
            value: String(hours[k] ?? 0),
            id: `h-${k}`,
            "data-focus": `avail:${k}`,
            "aria-invalid": inputErrors[`/horas_por_dia_semana/${k}`] ? "true" : null,
            onChange: (e) => actions.setModeHours(d.modo, k, e.target.value),
          })
        )
      )
    ),
    h("p", { class: `small ${weekTotal ? "" : "field-error"}` }, t.disponibilidade.totalSemana(fmtH(weekTotal))),
    inputErrors["/horas_por_dia_semana"] ? h("p", { class: "field-error" }, inputErrors["/horas_por_dia_semana"]) : null
  );
  if (!WEEKDAY_KEYS.length) modeCard.append();
  root.append(modeCard);

  root.append(
    h(
      "div",
      { class: "card grid-4" },
      field(
        t.disponibilidade.dataInicio,
        h("input", { type: "date", id: "data-inicio", value: d.data_inicio, "data-focus": "avail:inicio", onChange: (e) => actions.setAvail({ data_inicio: e.target.value }) }),
        { id: "data-inicio", error: inputErrors["/data_inicio"] }
      ),
      field(
        t.disponibilidade.dataProva,
        h("input", { type: "date", id: "data-prova", value: d.data_prova, "data-focus": "avail:prova", onChange: (e) => actions.setAvail({ data_prova: e.target.value }) }),
        { id: "data-prova", hint: t.disponibilidade.dataProvaDica, error: inputErrors["/data_prova"] }
      ),
      field(
        t.disponibilidade.inicioHora,
        h("input", { type: "time", id: "inicio-hora", value: d.inicio_hora, "data-focus": "avail:hora", onChange: (e) => actions.setAvail({ inicio_hora: e.target.value || "19:00" }) }),
        { id: "inicio-hora", hint: t.disponibilidade.inicioHoraDica }
      ),
      field(
        t.disponibilidade.inicioHoraFds,
        h("input", { type: "time", id: "inicio-hora-fds", value: d.inicio_hora_fds ?? "09:00", "data-focus": "avail:hora-fds", onChange: (e) => actions.setAvail({ inicio_hora_fds: e.target.value || "09:00" }) }),
        { id: "inicio-hora-fds" }
      )
    )
  );

  root.append(
    h(
      "label",
      { class: "check" },
      h("input", { type: "checkbox", checked: app.state.opcoes.preencher_sobra, onChange: (e) => actions.setOption("preencher_sobra", e.target.checked) }),
      h("span", {}, t.disponibilidade.sobra)
    )
  );

  // capacity preview
  const prev = h("div", { class: "card" }, h("h2", { class: "h2" }, t.disponibilidade.previa));
  if (!r.ok) {
    prev.append(notice("error", r.etapa === "disponibilidade" ? t.disponibilidade.erro : (r.erros ?? []).map((e) => `${e.path}: ${e.message}`).join("; ")));
  } else {
    const c = r.capacidade;
    prev.append(
      h(
        "div",
        { class: "kpis" },
        kpi(t.disponibilidade.dias_, String(c.dias), `${c.semanas} ${t.disponibilidade.semanas}`),
        kpi(t.disponibilidade.horasUteis, fmtH(c.horas_uteis), `${fmtH(c.horas_brutas)} brutas`),
        kpi(t.disponibilidade.horasConteudo, fmtH(c.horas_para_conteudo), t.disponibilidade.reservas(c.reservas_horas)),
        kpi(t.disponibilidade.minimo, fmtH(c.minimo_necessario_horas), r.cobertura_parcial ? null : "ok")
      )
    );
    if (r.cobertura_parcial) prev.append(notice("warn", t.disponibilidade.insuficiente(r.deficit_horas)));
  }
  root.append(prev);
  root.append(h("div", { class: "actions-row" }, btn(`${t.disponibilidade.continuar} →`, { kind: "primary", onClick: () => actions.go("diagnostico"), disabled: !r.ok })));
  return root;
}
