// Theme tokens and component classes (moved out of App.jsx).
const DARK_TOKENS = `
  --bg: #0b0f17; --surface: #121826; --sunken: #182031; --track: #222c40;
  --ink: #e7ebf3; --ink-2: #aeb7c8; --muted: #8b94a7;
  --line: #243047; --line-strong: #34415c;
  --accent: #8da6ff; --accent-hover: #a7bbff; --on-accent: #0b1020; --accent-soft: #1b2648; --accent-ink: #a3b7ff;
  --mark: #5e5212; --knob: #e7ebf3;
  --hi: #ff8f86; --hi-soft: #3b1b1e; --md: #f0b455; --md-soft: #33270f; --lo: #a9b2c4; --lo-soft: #1f2737;
  --warn-soft: #2b2310; --warn-line: #6e5622;
  --bar: #3987e5; --mix-t: #9ec5f4; --mix-q: #5598e7; --mix-r: #256abf;
  --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #c98500; --s5: #d55181; --s6: #008300; --s7: #9085e9;
  color-scheme: dark;
`;

export const CSS = `
@import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Public+Sans:wght@400;500;600;700;800&display=swap");

/* Layout: barra fixa no topo + coluna única de painéis (resumo → Fase 1 → Fase 2 → Fase 3 → Roteiro). */
:root {
  --bg: #f3f5f9; --surface: #ffffff; --sunken: #eef1f6; --track: #e2e7ef;
  --ink: #0f1729; --ink-2: #465068; --muted: #636c82;
  --line: #dde2ea; --line-strong: #c2c9d6;
  --accent: #1d3fa8; --accent-hover: #16338c; --on-accent: #ffffff; --accent-soft: #e6ebf9; --accent-ink: #1d3fa8;
  --mark: #ffe45e; --knob: #ffffff;
  --hi: #b02424; --hi-soft: #fbe9e8; --md: #8a5208; --md-soft: #fcf0dc; --lo: #4b556c; --lo-soft: #edf0f5;
  --warn-soft: #fdf3dd; --warn-line: #e6c06d;
  --bar: #2a78d6; --mix-t: #184f95; --mix-q: #3987e5; --mix-r: #86b6ef;
  --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a; --s4: #eda100; --s5: #e87ba4; --s6: #008300; --s7: #6250d6;
  --font-sans: "Public Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${DARK_TOKENS} } }
:root[data-theme="dark"] { ${DARK_TOKENS} }

body { margin: 0; background: var(--bg); color: var(--ink); }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 50; background: var(--surface); pointer-events: none; }

.cg-app { font-family: var(--font-sans); background: var(--bg); color: var(--ink); line-height: 1.5; -webkit-font-smoothing: antialiased; }
.cg-app h1, .cg-app h2, .cg-app h3 { text-wrap: balance; }
.cg-mono { font-family: var(--font-mono); }
.cg-num { font-variant-numeric: tabular-nums; }
.cg-eyebrow { font-family: var(--font-mono); font-size: 11px; font-weight: 500; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
.cg-gutter { padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
@media (min-width: 768px) { .cg-gutter { padding-left: max(32px, env(safe-area-inset-left, 0px)); padding-right: max(32px, env(safe-area-inset-right, 0px)); } }
.cg-header { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 40; }
.cg-anchor { scroll-margin-top: 84px; }
.cg-wrap { max-width: 1440px; margin-left: auto; margin-right: auto; }

.cg-surface { background: var(--surface); }
.cg-sunken { background: var(--sunken); }
.cg-track { background: var(--track); }
.cg-hairlines { background: var(--line); }
.cg-ink { color: var(--ink); }
.cg-ink2 { color: var(--ink-2); }
.cg-muted { color: var(--muted); }
.cg-accent-ink { color: var(--accent-ink); }
.cg-error { color: var(--hi); }
.cg-line { border-color: var(--line); }
.cg-rows > * + * { border-top: 1px solid var(--line); }
.cg-row-hover:hover { background: var(--sunken); }

.cg-brand { background: var(--accent); color: var(--on-accent); }
.cg-nav a { color: var(--ink-2); }
.cg-nav a:hover { color: var(--ink); background: var(--sunken); }

.cg-btn-primary { background: var(--accent); color: var(--on-accent); }
.cg-btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.cg-btn-primary:disabled { background: var(--line-strong); color: var(--ink-2); cursor: not-allowed; }
.cg-btn-ghost { background: var(--surface); color: var(--ink); border: 1px solid var(--line-strong); }
.cg-btn-ghost:hover:not(:disabled) { background: var(--sunken); }
.cg-btn-ghost:disabled { opacity: .4; cursor: not-allowed; }

.cg-seg { background: var(--sunken); border: 1px solid var(--line); }
.cg-seg-opt { color: var(--ink-2); }
.cg-seg-opt:hover { color: var(--ink); background: var(--surface); }
.cg-seg-opt[aria-checked="true"] { background: var(--accent); color: var(--on-accent); }

.cg-input { background: var(--surface); color: var(--ink); border: 1px solid var(--line-strong); }
.cg-input[aria-invalid="true"] { border-color: var(--hi); }

.cg-switch { background: var(--line-strong); }
.cg-switch[aria-checked="true"] { background: var(--accent); }
.cg-knob { background: var(--knob); }

.cg-pri-hi { background: var(--hi-soft); color: var(--hi); }
.cg-pri-md { background: var(--md-soft); color: var(--md); }
.cg-pri-lo { background: var(--lo-soft); color: var(--lo); }
.cg-bubble { border: 1.5px solid var(--line-strong); }
.cg-bubble-on { background: var(--accent); border-color: var(--accent); }
.cg-mark { background: linear-gradient(transparent 50%, var(--mark) 50%, var(--mark) 94%, transparent 94%); padding: 0 .12em; }
.cg-pill-base { background: var(--accent-soft); color: var(--accent-ink); }
.cg-pill-final { background: var(--hi-soft); color: var(--hi); }
.cg-warn { background: var(--warn-soft); border: 1px solid var(--warn-line); color: var(--ink); }
.cg-warn-icon { color: var(--md); }
.cg-exam { background: var(--accent-soft); color: var(--accent-ink); }

.cg-app :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .cg-app *, .cg-app *::before, .cg-app *::after { transition: none !important; animation: none !important; }
}
`;


// Additions for the product version: 9 matérias, sliders, chart, quiz.
export const EXTRA_CSS = `
:root { --s8: #e34948; --s9: #0e93a8; --good: #0a6b3a; --good-soft: #e3f3ea; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --s8: #e66767; --s9: #1aa3bb; --good: #5fd49a; --good-soft: #10301f; } }
:root[data-theme="dark"] { --s8: #e66767; --s9: #1aa3bb; --good: #5fd49a; --good-soft: #10301f; }
.cg-good { color: var(--good); }
.cg-good-bg { background: var(--good-soft); color: var(--good); }
.cg-chip { background: var(--surface); color: var(--ink-2); border: 1px solid var(--line-strong); }
.cg-chip[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent-ink); border-color: var(--accent); }
.cg-alt { background: var(--surface); border: 1px solid var(--line-strong); color: var(--ink); }
.cg-alt:hover { background: var(--sunken); }
.cg-alt[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); }
.cg-alt-letter { background: var(--sunken); }
.cg-alt[aria-pressed="true"] .cg-alt-letter { background: var(--accent); color: var(--on-accent); }
.cg-slider-track { position: relative; height: 28px; display: flex; align-items: center; }
.cg-slider-track::before { content: ""; position: absolute; left: 0; right: 0; height: 8px; border-radius: 999px; background: var(--track); }
.cg-slider-fill { position: absolute; left: 0; height: 8px; border-radius: 999px; background: var(--accent); pointer-events: none; }
.cg-slider-track input[type="range"] { position: relative; width: 100%; margin: 0; background: transparent; -webkit-appearance: none; appearance: none; height: 28px; cursor: pointer; }
.cg-slider-track input[type="range"]::-webkit-slider-runnable-track { background: transparent; height: 8px; }
.cg-slider-track input[type="range"]::-moz-range-track { background: transparent; height: 8px; }
.cg-slider-track input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; margin-top: -7px; border-radius: 50%; background: var(--surface); border: 3px solid var(--accent); box-shadow: 0 1px 3px rgba(0,0,0,.25); }
.cg-slider-track input[type="range"]::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: var(--surface); border: 3px solid var(--accent); }
.cg-block { background: var(--surface); border: 1px solid var(--line); }
.cg-block[data-act="videoaula"] { box-shadow: inset 3px 0 0 var(--accent); }
.cg-block[data-act="simulado"] { background: var(--accent-soft); }
.cg-act-videoaula { color: var(--accent-ink); }
.cg-act-leitura { color: var(--ink-2); }
.cg-act-exercicios { color: var(--good); }
.cg-act-revisao { color: var(--md); }
.cg-act-simulado { color: var(--accent-ink); }
.cg-chart-grid { stroke: var(--line); }
.cg-chart-axis { stroke: var(--line-strong); }
.cg-chart-text { fill: var(--muted); font-size: 11px; }
.cg-chart-ink { fill: var(--ink); }
.cg-link { color: var(--accent-ink); text-decoration: underline; text-underline-offset: 2px; }
`;
