// Shared UI pieces: level dots, buttons, notices, segmented controls, KPIs.
import { h } from "./dom.js";
import { t } from "./strings.pt-BR.js";

export const SERIES = 8; // categorical slots defined in styles.css (--s1 … --s8)

/** Stable color slot per matéria (index order in the pack). Beyond 8 falls back to neutral. */
export function materiaSlot(pack, materiaId) {
  const i = pack.estrutura_prova.materias.findIndex((m) => m.id === materiaId);
  return i >= 0 && i < SERIES ? i + 1 : 0;
}
export const materiaVar = (slot) => (slot ? `var(--s${slot})` : "var(--muted)");

/** Five dots, `nivel` of them filled. Always paired with a text label for accessibility. */
export function dots(nivel, { showLabel = false, size = "" } = {}) {
  const label = `${t.nivelPrefixo}: ${t.niveis[nivel]}`;
  const wrap = h("span", { class: `dots ${size}`, role: "img", "aria-label": label, title: label });
  for (let i = 1; i <= 5; i++) wrap.append(h("i", { class: i <= nivel ? "on" : "" }));
  if (!showLabel) return wrap;
  return h("span", { class: "dots-wrap" }, wrap, h("span", { class: "dots-label" }, t.niveis[nivel]));
}

export function btn(label, { kind = "ghost", onClick, disabled = false, type = "button", title, small = false, attrs = {} } = {}) {
  return h("button", { type, class: `btn btn-${kind}${small ? " btn-sm" : ""}`, onClick, disabled, title, ...attrs }, label);
}

export function notice(kind, ...children) {
  return h("div", { class: `notice notice-${kind}`, role: kind === "error" ? "alert" : "status" }, ...children);
}

export function segmented(options, value, onChange, { label, small = false } = {}) {
  const group = h("div", { class: `seg${small ? " seg-sm" : ""}`, role: "radiogroup", "aria-label": label });
  for (const o of options) {
    group.append(
      h(
        "button",
        { type: "button", role: "radio", "aria-checked": String(o.value === value), class: "seg-opt", onClick: () => onChange(o.value), disabled: o.disabled },
        o.label,
        o.hint ? h("span", { class: "seg-hint" }, o.hint) : null
      )
    );
  }
  return group;
}

export function kpi(label, value, sub) {
  return h("div", { class: "kpi" }, h("p", { class: "kpi-label" }, label), h("p", { class: "kpi-value" }, value), sub ? h("p", { class: "kpi-sub" }, sub) : null);
}

export function bar(value, max, { color = "var(--bar)", height = 6 } = {}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return h("div", { class: "bar", style: { height: `${height}px` } }, h("div", { class: "bar-fill", style: { width: `${pct}%`, background: color } }));
}

export function swatch(slot) {
  return h("i", { class: "swatch", style: { background: materiaVar(slot) }, "aria-hidden": "true" });
}

export function sectionHead(title, sub, right) {
  return h(
    "div",
    { class: "section-head" },
    h("div", {}, h("h1", { class: "h1" }, title), sub ? h("p", { class: "sub" }, sub) : null),
    right ? h("div", { class: "section-right" }, right) : null
  );
}

export function field(label, control, { hint, error, id } = {}) {
  return h(
    "div",
    { class: "field" },
    h("label", { class: "label", for: id }, label),
    control,
    error ? h("p", { class: "field-error" }, error) : hint ? h("p", { class: "hint" }, hint) : null
  );
}

export function tag(text, cls = "") {
  return h("span", { class: `tag ${cls}` }, text);
}
