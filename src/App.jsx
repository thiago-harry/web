/**
 * Cronograma Personalizado para Você · caso de estudo PMSC 2026 (Soldado).
 *
 *  Dossiê      edital 2026 + prova PMSC 2023 (cargo) + prova AOCP PM-PE 2024 (banca) -> prioridade por assunto
 *  Top 80%     assuntos em ordem de pontos esperados até somar 80% da prova
 *  Nivelamento matéria fraca/média/forte + simulado de 40 questões (reais e geradas por IA, marcadas)
 *  Prazo       horas por dia, data da prova (real ou simulada) -> capacidade
 *  Cronograma  engine determinístico (app/src/engine) -> blocos de videoaula, leitura, exercícios, revisão, simulado
 *  Resultado   genérico × personalizado
 *
 * Toda a lógica vive em ./plan.js e no engine; este arquivo só desenha.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  CalendarCheck,
  CalendarPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Coffee,
  FileDown,
  PencilLine,
  PlayCircle,
  Repeat,
  RotateCcw,
  Search,
  Sparkles,
  Target,
  TriangleAlert,
} from "lucide-react";
import pack from "../app/packs/pmsc-2026-soldado.json";
import { CSS, EXTRA_CSS } from "./theme.js";
import * as plan from "./plan.js";

/* ───────────────────────────── Dados fixos ───────────────────────────── */

const APP_NAME = "Cronograma Personalizado para Você";
const STORE_KEY = `cpv:${pack.concurso.id}:v1`;
const TODAY = plan.todayISO();
const EXAM_OFFICIAL = pack.concurso.data_prova;
const TOTAL_Q = pack.estrutura_prova.total_questoes;
const N_ASSUNTOS = pack.assuntos.length;
const QUIZ_N = 40;
const HARD_WEEKLY = plan.weeklyOf(plan.MODES.hard.hours);

const SHORT = {
  dconst: "D. Constitucional",
  dpenal: "D. Penal",
  dpp: "Proc. Penal",
  dpm: "Penal Militar",
  legesp: "Leg. Especial",
  transito: "Trânsito",
  inst: "Leg. Institucional",
  port: "Português",
  info: "Informática",
};
// Validated categorical order (light). Dark steps live in theme.js (--s1…--s9).
const HEX = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948", "#0e93a8"];
const MAT = Object.fromEntries(
  pack.estrutura_prova.materias.map((m, i) => [m.id, { ...m, curto: SHORT[m.id] ?? m.nome, cor: `var(--s${i + 1})`, hex: HEX[i] }])
);
const MAT_NAMES = Object.fromEntries(pack.estrutura_prova.materias.map((m) => [m.id, m.nome]));

const FONTES = {
  cargo: { nome: "PMSC 2023 · Soldado", banca: "Cebraspe", questoes: pack.provas_historico[0]?.total_questoes, url: pack.provas_historico[0]?.fonte },
  banca: { nome: "PM-PE 2024 · Soldado", banca: "Instituto AOCP", questoes: pack.provas_banca?.[0]?.total_questoes, url: pack.provas_banca?.[0]?.fonte },
};

// Student-independent view of the exam (no leveling): dossiê and top 80%.
const BASE_SCORES = plan.score({ pack });
const BASE_PTS = plan.expectedPoints(pack, BASE_SCORES);

const ACT = {
  videoaula: { label: "Videoaula", Icon: PlayCircle },
  leitura: { label: "Leitura", Icon: BookOpen },
  exercicios: { label: "Exercícios", Icon: PencilLine },
  revisao: { label: "Revisão", Icon: Repeat },
  simulado: { label: "Simulado", Icon: ClipboardCheck },
};
const ACT_KEYS = Object.keys(ACT);

const DEFAULTS = {
  strengths: {},
  quiz: null, // { attempt, answers: {id: idx}, done, idx }
  mode: "normal",
  hours: { ...plan.MODES.normal.hours },
  inicio: "19:00",
  inicioFds: "09:00",
  simulate: false,
  simDate: null,
  scope: "top80",
  aluno: "",
  applied: null, // leveling snapshot used by the plan: { strengths, q: { attempt, answers } | null }
  excecoes: {}, // per-date hours the student added or removed in the agenda
  log: {}, // blocks the student marked as studied: key -> { data, assunto_id, materia_id, atividade, minutos, consolidated }
  planStart: null, // the agenda runs from this date; "Reorganizar" moves it to today
};

/* ───────────────────────────── Formatação ───────────────────────────── */

const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const fmtH = (h) => `${nf1.format(Math.round(h * 10) / 10)}h`;
const fmtHr = (h) => `${Math.round(h)}h`;
const fmtPct = (x) => `${Math.round(x * 100)}%`;
const fmtDMY = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");
const fmtDM = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const weekdayOf = (iso) => ["dom", "seg", "ter", "qua", "qui", "sex", "sab"][new Date(`${iso}T12:00:00Z`).getUTCDay()];

function itemSource(it) {
  if (it.origem === "gerada_ia") return { label: "Gerada por IA", ia: true };
  const n = /q(\d+)$/.exec(it.id)?.[1];
  if (it.id.startsWith("pmsc")) return { label: `Prova PMSC ${it.ano ?? ""} · Cebraspe${n ? ` · Q${n}` : ""}` };
  return { label: `Prova PM-PE ${it.ano ?? ""} · AOCP${n ? ` · Q${n}` : ""}` };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = { ...DEFAULTS, ...JSON.parse(raw) };
      if (s.simDate && s.simDate <= TODAY) s.simDate = null;
      return s;
    }
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULTS };
}

/* ───────────────────────────── Peças de UI ───────────────────────────── */

const APP_CSS = `
.cg-alt[data-state="right"] { background: var(--good-soft); border-color: var(--good); }
.cg-alt[data-state="right"] .cg-alt-letter { background: var(--good); color: var(--surface); }
.cg-alt[data-state="wrong"] { border-color: var(--hi); }
.cg-alt[data-state="wrong"] .cg-alt-letter { background: var(--hi); color: var(--surface); }
.cg-ia { background: var(--warn-soft); color: var(--ink); border: 1px solid var(--warn-line); }
.cg-series-p { stroke: var(--s1); }
.cg-series-g { stroke: var(--s2); }
.cg-fill-p { fill: var(--s1); }
.cg-fill-g { fill: var(--s2); }
.cg-sw-p { background: var(--s1); }
.cg-sw-g { background: repeating-linear-gradient(90deg, var(--s2) 0 6px, transparent 6px 9px); }
.cg-sw-g-solid { background: var(--s2); }
.cg-ref { stroke: var(--muted); }
.cg-cross { stroke: var(--ink-2); }
.cg-area { fill: var(--accent); opacity: .08; }
.cg-tip { background: var(--surface); border: 1px solid var(--line-strong); box-shadow: 0 4px 16px rgba(0,0,0,.12); }
.cg-check { border: 1.5px solid var(--line-strong); background: var(--surface); color: var(--on-accent); }
.cg-check:hover { border-color: var(--good); }
.cg-check[aria-pressed="true"] { background: var(--good); border-color: var(--good); color: var(--surface); }
.cg-block[data-done] { background: var(--good-soft); border-color: transparent; }
.cg-block[data-done] p { opacity: .75; }
.cg-block[data-late] { border-style: dashed; border-color: var(--hi); }
[data-today] { box-shadow: inset 0 0 0 2px var(--accent); }
.cg-progress { background: var(--track); }
.cg-progress > span { background: var(--accent); }
`;

function Dot({ color, size = "h-2.5 w-2.5" }) {
  return <span aria-hidden="true" className={`${size} inline-block shrink-0 rounded-full`} style={{ background: color }} />;
}

function Bubbles({ value, label = "Prioridade" }) {
  return (
    <span className="inline-flex items-center gap-1.5" role="img" aria-label={`${label} ${value} de 5`}>
      <span className="inline-flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`h-2.5 w-2.5 rounded-full cg-bubble ${i <= value ? "cg-bubble-on" : ""}`} />
        ))}
      </span>
    </span>
  );
}

function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="cg-switch relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
    >
      <span className={`cg-knob inline-block h-4 w-4 rounded-full shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );
}

function Segmented({ label, options, value, onChange }) {
  return (
    <div role="radiogroup" aria-label={label} className="cg-seg inline-flex max-w-full flex-wrap rounded-lg p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className="cg-seg-opt whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
        >
          {o.label}
          {o.hint ? <span className="ml-1 font-normal opacity-75">{o.hint}</span> : null}
        </button>
      ))}
    </div>
  );
}

function SectionHead({ step, title, desc, right }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 max-w-2xl">
        <p className="cg-eyebrow">{step}</p>
        <h2 className="mt-1 text-xl font-extrabold tracking-tight md:text-2xl">{title}</h2>
        {desc ? <p className="mt-1 text-sm cg-ink2">{desc}</p> : null}
      </div>
      {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
    </div>
  );
}

function StatTile({ label, value, sub }) {
  return (
    <div className="cg-surface flex min-w-0 flex-col gap-1 p-4">
      <p className="text-xs font-semibold cg-ink2">{label}</p>
      <p className="text-2xl font-extrabold tracking-tight md:text-3xl cg-num">{value}</p>
      <p className="text-xs cg-muted">{sub}</p>
    </div>
  );
}

function Card({ children, className = "" }) {
  return <div className={`cg-surface rounded-xl border cg-line p-4 md:p-5 ${className}`}>{children}</div>;
}

function VideoLink({ m, compact = false }) {
  if (!m) return null;
  const isVideo = m.tipo === "video";
  const Icon = isVideo ? PlayCircle : Search;
  return (
    <a
      href={m.url}
      target="_blank"
      rel="noopener noreferrer"
      className="cg-link inline-flex items-center gap-1 text-xs font-semibold"
      title={isVideo ? `${m.titulo}${m.canal ? ` · ${m.canal}` : ""}` : m.titulo}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {compact ? (isVideo ? "Abrir" : "Buscar") : isVideo ? "Assistir aula" : "Buscar aula"}
    </a>
  );
}

const videoOf = (a) => a.materiais?.find((m) => m.tipo === "video") ?? a.materiais?.find((m) => m.tipo === "busca_video") ?? null;

/* ───────────────────────────── Gráficos ───────────────────────────── */

const niceStep = (max) => {
  const raw = max / 5;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw);
};

/** Real pixel width of a container, so chart text stays 11px at any size. */
function useWidth(fallback = 640) {
  const ref = useRef(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function useHover() {
  const [hover, setHover] = useState(null);
  const onMove = (e, toValue) => {
    const svg = e.currentTarget;
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * svg.viewBox.baseVal.width;
    setHover(toValue(x, (e.clientX - r.left) / r.width));
  };
  return [hover, onMove, () => setHover(null)];
}

/** Coverage (% of expected points) by hours of study, generic vs personalized. */
function CompareChart({ cmp, contentH }) {
  const [box, W] = useWidth();
  const Hh = W < 500 ? 220 : 280;
  const pad = { l: 40, r: 12, t: 14, b: 30 };
  const xMaxRaw = Math.max(cmp.generic.at(-1).h, cmp.personalized.at(-1).h);
  const step = niceStep(xMaxRaw * (W < 500 ? 1.6 : 1));
  const xMax = Math.ceil(xMaxRaw / step) * step;
  const sx = (h) => pad.l + (h / xMax) * (W - pad.l - pad.r);
  const sy = (p) => pad.t + (1 - p) * (Hh - pad.t - pad.b);
  const path = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${sx(p.h).toFixed(1)},${sy(p.pct).toFixed(1)}`).join("");
  const [hover, onMove, onLeave] = useHover();
  const toValue = (x) => {
    const h = Math.min(xMax, Math.max(0, ((x - pad.l) / (W - pad.l - pad.r)) * xMax));
    return { h, p: plan.coverageAt(cmp.personalized, h), g: plan.coverageAt(cmp.generic, h) };
  };
  // direct labels where the two lines are furthest apart
  let best = { h: xMax / 3, gap: -1 };
  for (let h = step / 2; h < xMax; h += step / 4) {
    const gap = plan.coverageAt(cmp.personalized, h) - plan.coverageAt(cmp.generic, h);
    if (gap > best.gap) best = { h, gap };
  }
  const showMarker = contentH > 0 && contentH < xMax;
  const ticksX = [];
  for (let h = 0; h <= xMax + 1e-9; h += step) ticksX.push(h);
  return (
    <figure className="relative m-0" ref={box}>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs cg-ink2" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5">
          <span className="cg-sw-p inline-block h-0.5 w-5 rounded" /> Seu cronograma
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="cg-sw-g inline-block h-0.5 w-5 rounded" /> Cronograma genérico
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${Hh}`}
        className="block h-auto w-full touch-none select-none"
        role="img"
        aria-label="Pontos esperados cobertos por horas de estudo: cronograma personalizado contra genérico"
        width={W}
        height={Hh}
        onPointerMove={(e) => onMove(e, toValue)}
        onPointerLeave={onLeave}
      >
        {[0, 0.2, 0.4, 0.6, 0.8, 1].map((p) => (
          <g key={p}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(p)} y2={sy(p)} className="cg-chart-grid" strokeWidth="1" />
            <text x={pad.l - 8} y={sy(p) + 4} textAnchor="end" className="cg-chart-text">
              {Math.round(p * 100)}%
            </text>
          </g>
        ))}
        {ticksX.map((h, i) => (
          <text key={h} x={sx(h)} y={Hh - pad.b + 16} textAnchor={i === ticksX.length - 1 ? "end" : i === 0 ? "start" : "middle"} className="cg-chart-text">
            {h}h
          </text>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={sy(0)} y2={sy(0)} className="cg-chart-axis" strokeWidth="1" />
        <line x1={pad.l} x2={W - pad.r} y1={sy(0.8)} y2={sy(0.8)} className="cg-ref" strokeWidth="1" strokeDasharray="4 4" />
        {showMarker ? (
          <g>
            <line x1={sx(contentH)} x2={sx(contentH)} y1={pad.t} y2={sy(0)} className="cg-cross" strokeWidth="1.5" />
            <text x={sx(contentH) + 6} y={sy(0) - 8} className="cg-chart-text">
              até a prova: {fmtHr(contentH)}
            </text>
          </g>
        ) : null}
        <path d={path(cmp.generic)} fill="none" className="cg-series-g" strokeWidth="2" strokeDasharray="6 3" strokeLinejoin="round" />
        <path d={path(cmp.personalized)} fill="none" className="cg-series-p" strokeWidth="2" strokeLinejoin="round" />
        <text x={sx(best.h) - 6} y={sy(plan.coverageAt(cmp.personalized, best.h)) - 8} textAnchor="end" className="cg-chart-text cg-chart-ink" fontWeight="600">
          Seu cronograma
        </text>
        <text x={sx(best.h) + 6} y={sy(plan.coverageAt(cmp.generic, best.h)) + 16} className="cg-chart-text cg-chart-ink" fontWeight="600">
          Genérico
        </text>
        {hover ? (
          <g>
            <line x1={sx(hover.h)} x2={sx(hover.h)} y1={pad.t} y2={sy(0)} className="cg-cross" strokeWidth="1" strokeDasharray="2 3" />
            <circle cx={sx(hover.h)} cy={sy(hover.g)} r="4.5" className="cg-fill-g" stroke="var(--surface)" strokeWidth="2" />
            <circle cx={sx(hover.h)} cy={sy(hover.p)} r="4.5" className="cg-fill-p" stroke="var(--surface)" strokeWidth="2" />
          </g>
        ) : null}
      </svg>
      {hover ? (
        <div
          className="cg-tip pointer-events-none absolute top-8 z-10 rounded-lg px-3 py-2 text-xs"
          style={{ left: Math.min(W - 170, sx(hover.h) + 12) }}
          role="status"
        >
          <p className="font-bold cg-num">{fmtHr(hover.h)} de estudo</p>
          <p className="cg-num">
            <span className="cg-sw-p mr-1.5 inline-block h-0.5 w-3 align-middle" />
            Seu: <b>{fmtPct(hover.p)}</b>
          </p>
          <p className="cg-num">
            <span className="cg-sw-g mr-1.5 inline-block h-0.5 w-3 align-middle" />
            Genérico: <b>{fmtPct(hover.g)}</b>
          </p>
        </div>
      ) : null}
      <details className="mt-2 text-xs cg-ink2">
        <summary className="cursor-pointer font-semibold">Ver em tabela</summary>
        <table className="mt-2 w-full max-w-md text-left cg-num">
          <thead>
            <tr className="cg-muted">
              <th className="py-1 font-semibold">Cobertura</th>
              <th className="py-1 text-right font-semibold">Seu</th>
              <th className="py-1 text-right font-semibold">Genérico</th>
            </tr>
          </thead>
          <tbody>
            {[0.25, 0.5, 0.8, 1].map((p) => (
              <tr key={p} className="border-t cg-line">
                <td className="py-1">{fmtPct(p)} dos pontos</td>
                <td className="py-1 text-right">{fmtHr(plan.hoursTo(cmp.personalized, p) ?? 0)}</td>
                <td className="py-1 text-right">{fmtHr(plan.hoursTo(cmp.generic, p) ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Cumulative share of the exam by topic, in order of expected points. */
function ParetoChart({ items, topCount }) {
  const [box, W] = useWidth();
  const Hh = W < 500 ? 200 : 240;
  const pad = { l: 40, r: 12, t: 12, b: 30 };
  const n = items.length;
  const sx = (i) => pad.l + (i / n) * (W - pad.l - pad.r);
  const sy = (p) => pad.t + (1 - p) * (Hh - pad.t - pad.b);
  const d = `M${sx(0)},${sy(0)}` + items.map((x, i) => `L${sx(i + 1).toFixed(1)},${sy(x.cumPct).toFixed(1)}`).join("");
  const area = `${d}`;
  const [hover, onMove, onLeave] = useHover();
  const toValue = (x) => {
    const i = Math.min(n, Math.max(1, Math.round(((x - pad.l) / (W - pad.l - pad.r)) * n)));
    return { i, item: items[i - 1] };
  };
  const topClip = `M${sx(0)},${sy(0)}` + items.slice(0, topCount).map((x, i) => `L${sx(i + 1).toFixed(1)},${sy(x.cumPct).toFixed(1)}`).join("") + `L${sx(topCount)},${sy(0)}Z`;
  return (
    <figure className="relative m-0" ref={box}>
      <svg
        viewBox={`0 0 ${W} ${Hh}`}
        className="block h-auto w-full touch-none select-none"
        role="img"
        aria-label={`Curva acumulada: os ${topCount} primeiros assuntos somam 80% dos pontos esperados`}
        width={W}
        height={Hh}
        onPointerMove={(e) => onMove(e, toValue)}
        onPointerLeave={onLeave}
      >
        {[0, 0.2, 0.4, 0.6, 0.8, 1].map((p) => (
          <g key={p}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(p)} y2={sy(p)} className="cg-chart-grid" strokeWidth="1" />
            <text x={pad.l - 8} y={sy(p) + 4} textAnchor="end" className="cg-chart-text">
              {Math.round(p * 100)}%
            </text>
          </g>
        ))}
        {(W < 500 ? [1, 25, 50, n] : [1, 15, 30, 45, 60, n]).map((i) => (
          <text key={i} x={sx(i)} y={Hh - pad.b + 16} textAnchor="middle" className="cg-chart-text">
            {i}
          </text>
        ))}
        <path d={topClip} className="cg-area" />
        <line x1={pad.l} x2={W - pad.r} y1={sy(0.8)} y2={sy(0.8)} className="cg-ref" strokeWidth="1" strokeDasharray="4 4" />
        <line x1={sx(topCount)} x2={sx(topCount)} y1={sy(0.8)} y2={sy(0)} className="cg-ref" strokeWidth="1" strokeDasharray="4 4" />
        <text x={sx(topCount) + 6} y={sy(0.8) + 14} className="cg-chart-text cg-chart-ink" fontWeight="600">
          {topCount} assuntos = 80%
        </text>
        <path d={area} fill="none" className="cg-series-p" strokeWidth="2" strokeLinejoin="round" />
        <line x1={pad.l} x2={W - pad.r} y1={sy(0)} y2={sy(0)} className="cg-chart-axis" strokeWidth="1" />
        {hover ? (
          <g>
            <line x1={sx(hover.i)} x2={sx(hover.i)} y1={pad.t} y2={sy(0)} className="cg-cross" strokeWidth="1" strokeDasharray="2 3" />
            <circle cx={sx(hover.i)} cy={sy(hover.item.cumPct)} r="4.5" className="cg-fill-p" stroke="var(--surface)" strokeWidth="2" />
          </g>
        ) : null}
      </svg>
      {hover ? (
        <div className="cg-tip pointer-events-none absolute top-2 z-10 w-56 rounded-lg px-3 py-2 text-xs" style={{ left: Math.max(0, Math.min(W - 230, sx(hover.i) + 12)) }} role="status">
          <p className="font-bold">
            {hover.i}º · {hover.item.assunto.nome}
          </p>
          <p className="cg-ink2">{MAT[hover.item.assunto.materia_id].curto}</p>
          <p className="cg-num">
            Acumulado: <b>{fmtPct(hover.item.cumPct)}</b> · {nf1.format(hover.item.pts)} pts
          </p>
        </div>
      ) : null}
      <figcaption className="mt-1 text-xs cg-muted">Assuntos em ordem de pontos por hora de estudo (eixo horizontal) × % acumulado da prova.</figcaption>
    </figure>
  );
}

/* ───────────────────────────── Resultado no topo ───────────────────────────── */

function CompareBars({ title, hint, rows, max, fmt }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-bold">{title}</p>
      <p className="text-xs cg-muted">{hint}</p>
      <ul className="mt-3 flex flex-col gap-2.5">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3">
            <span className={`text-sm ${r.mine ? "font-bold" : "cg-ink2"}`}>{r.label}</span>
            <span className="cg-track h-3 overflow-hidden rounded-full" aria-hidden="true">
              <span className={`${r.mine ? "cg-sw-p" : "cg-sw-g-solid"} block h-full`} style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, borderRadius: "0 4px 4px 0" }} />
            </span>
            <span className={`text-sm cg-num ${r.mine ? "font-extrabold" : "font-semibold cg-ink2"}`}>{fmt(r.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResultHero({ examISO, simulated, daysLeft, contentH, weekly, modeLabel, nums, cov, applied }) {
  const qP = Math.round(nums.persAt * TOTAL_Q);
  const qG = Math.round(nums.genAt * TOTAL_Q);
  const gain = qP - qG;
  const saved = nums.gen80 ? Math.max(0, nums.gen80 - nums.pers80) : 0;
  return (
    <div className="cg-surface rounded-2xl border cg-line p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="cg-eyebrow">Genérico × personalizado</p>
        <p className="text-xs cg-ink2 cg-num">
          Prova em <b className="cg-ink">{fmtDMY(examISO)}</b> ({simulated ? "simulada" : "edital"}) · faltam {daysLeft} dias · {fmtH(weekly)}/semana ({modeLabel})
        </p>
      </div>
      <p className="mt-2 max-w-3xl text-xl font-extrabold leading-snug tracking-tight md:text-2xl">
        {gain >= 3 ? (
          <>
            Com as mesmas {fmtHr(contentH)} de estudo até a prova, seu cronograma alcança <span className="cg-accent-ink">{qP} questões</span>. O genérico, {qG}.
          </>
        ) : (
          <>
            Para dominar 80% da prova, seu cronograma precisa de <span className="cg-accent-ink">{fmtHr(nums.pers80)}</span>. O genérico, {fmtHr(nums.gen80 ?? 0)}.
          </>
        )}
      </p>
      <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
        <CompareBars
          title="Questões no seu alcance até a prova"
          hint={`De ${TOTAL_Q}. Maior é melhor.`}
          max={TOTAL_Q}
          fmt={(v) => `${v}`}
          rows={[
            { label: "Seu cronograma", value: qP, mine: true },
            { label: "Genérico", value: qG },
          ]}
        />
        <CompareBars
          title="Horas para dominar 80% da prova"
          hint="Menor é melhor."
          max={Math.max(nums.gen80 ?? 0, nums.pers80)}
          fmt={(v) => fmtHr(v)}
          rows={[
            { label: "Seu cronograma", value: nums.pers80, mine: true },
            { label: "Genérico", value: nums.gen80 ?? 0 },
          ]}
        />
      </div>
      <div className="mt-5 grid grid-cols-1 gap-px overflow-hidden rounded-xl border cg-line cg-hairlines sm:grid-cols-3">
        <div className="cg-surface p-3">
          <p className="text-2xl font-extrabold cg-num">{gain > 0 ? `+${gain}` : "0"}</p>
          <p className="text-xs cg-ink2">questões a mais no alcance até a prova</p>
        </div>
        <div className="cg-surface p-3">
          <p className="text-2xl font-extrabold cg-num">−{fmtHr(saved)}</p>
          <p className="text-xs cg-ink2">de estudo para chegar a 80% da prova</p>
        </div>
        <div className="cg-surface p-3">
          <p className={`text-2xl font-extrabold cg-num ${cov.cov >= 0.999 ? "cg-good" : ""}`}>{fmtPct(cov.cov)}</p>
          <p className="text-xs cg-ink2">do top 80% coberto na sua agenda</p>
        </div>
      </div>
      {!applied ? (
        <p className="mt-3 text-xs cg-ink2">
          Números sem nivelamento.{" "}
          <a href="#nivelamento" className="cg-link font-semibold">
            Faça o nivelamento
          </a>{" "}
          para ajustar ao seu nível.
        </p>
      ) : null}
    </div>
  );
}

function Steps({ items }) {
  return (
    <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Passos">
      {items.map((it, i) => (
        <li key={it.href}>
          <a href={it.href} className="cg-surface flex h-full items-start gap-2.5 rounded-xl border cg-line p-3 hover:shadow-sm">
            <span className={`${it.done ? "cg-good-bg" : it.warn ? "cg-pill-final" : "cg-sunken"} grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold`}>{it.done ? "✓" : i + 1}</span>
            <span className="min-w-0">
              <span className="block text-sm font-bold">{it.title}</span>
              <span className="block text-xs cg-ink2">{it.status}</span>
            </span>
          </a>
        </li>
      ))}
    </ol>
  );
}

/* ───────────────────────────── 1 · Dossiê ───────────────────────────── */

function DossierCards() {
  const notas = pack.notas_banca ?? {};
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Card>
        <p className="cg-eyebrow">Dossiê da banca</p>
        <h3 className="mt-1 text-lg font-extrabold tracking-tight">{pack.concurso.banca}</h3>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          <li>
            <span className="cg-ink2">Prova de referência: </span>
            <a className="cg-link font-semibold" href={FONTES.banca.url} target="_blank" rel="noopener noreferrer">
              {FONTES.banca.nome}
            </a>
            <span className="cg-muted"> · {FONTES.banca.questoes} questões</span>
          </li>
          <li>
            <span className="cg-ink2">Formato: </span>
            {notas.formato_questao ?? "múltipla escolha"}
          </li>
          {(notas.estilo ?? []).concat(notas.recomendacoes_estudo ?? []).map((s) => (
            <li key={s} className="cg-ink2">
              · {s}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <p className="cg-eyebrow">Dossiê do cargo</p>
        <h3 className="mt-1 text-lg font-extrabold tracking-tight">{pack.concurso.cargo}</h3>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          <li>
            <span className="cg-ink2">Edital 2026: </span>
            <a className="cg-link font-semibold" href={pack.concurso.fonte_edital} target="_blank" rel="noopener noreferrer">
              {TOTAL_Q} questões objetivas, {pack.estrutura_prova.materias.length} matérias
            </a>
          </li>
          <li>
            <span className="cg-ink2">Prova anterior: </span>
            <a className="cg-link font-semibold" href={FONTES.cargo.url} target="_blank" rel="noopener noreferrer">
              {FONTES.cargo.nome}
            </a>
            <span className="cg-muted">
              {" "}
              · {FONTES.cargo.banca} · {FONTES.cargo.questoes} questões
            </span>
          </li>
          <li>
            <span className="cg-ink2">Nota de corte estimada: </span>
            {fmtPct(pack.estrutura_prova.nota_corte_estimada ?? 0.5)} · sem penalidade por erro
          </li>
          <li className="cg-ink2">· Considera só a prova objetiva (sem redação e sem TAF)</li>
        </ul>
      </Card>
    </div>
  );
}

function DossierTable({ topSet, expanded, onToggle }) {
  const mats = BASE_SCORES.materiaRanking.map((id) => BASE_SCORES.materias[id]);
  const maxShare = Math.max(...mats.map((m) => m.share_prova));
  return (
    <div className="cg-surface overflow-x-auto rounded-xl border cg-line">
      <table className="w-full border-collapse text-sm" style={{ minWidth: 860 }}>
        <thead>
          <tr className="text-left text-xs cg-muted">
            <th className="px-4 py-2.5 font-semibold" style={{ width: "30%" }}>
              Matéria
            </th>
            <th className="px-3 py-2.5 text-right font-semibold">Questões</th>
            <th className="px-3 py-2.5 font-semibold">% da prova</th>
            <th className="px-3 py-2.5 font-semibold">Prioridade</th>
            <th className="px-3 py-2.5 text-right font-semibold">No top 80%</th>
            <th className="px-4 py-2.5 text-right font-semibold">Horas-base</th>
          </tr>
        </thead>
        <tbody>
          {mats.map((m) => {
            const open = expanded.has(m.id);
            const assuntos = pack.assuntos.filter((a) => a.materia_id === m.id).sort((x, y) => BASE_PTS[y.id] - BASE_PTS[x.id]);
            const inTop = assuntos.filter((a) => topSet.has(a.id)).length;
            return (
              <React.Fragment key={m.id}>
                <tr className="cg-row-hover border-t cg-line">
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => onToggle(m.id)} aria-expanded={open} aria-controls={`assuntos-${m.id}`} className="flex items-center gap-2.5 rounded text-left">
                      <ChevronDown className={`h-4 w-4 shrink-0 cg-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
                      <Dot color={MAT[m.id].cor} />
                      <span className="font-semibold leading-snug">{m.nome}</span>
                    </button>
                  </td>
                  <td className="px-3 py-3 text-right cg-num">{m.questoes}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="cg-track h-2 w-24 overflow-hidden rounded-full">
                        <div className="h-full" style={{ width: `${(m.share_prova / maxShare) * 100}%`, background: "var(--bar)", borderRadius: "0 4px 4px 0" }} />
                      </div>
                      <span className="w-10 text-xs cg-num cg-ink2">{fmtPct(m.share_prova)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Bubbles value={m.nivel} />
                  </td>
                  <td className="px-3 py-3 text-right cg-num">
                    <b>{inTop}</b>
                    <span className="cg-muted">/{assuntos.length}</span>
                  </td>
                  <td className="px-4 py-3 text-right cg-num cg-ink2">{fmtH(m.horas_base)}</td>
                </tr>
                {open ? (
                  <tr id={`assuntos-${m.id}`}>
                    <td colSpan={6} className="cg-sunken border-t cg-line px-4 py-2">
                      <ul className="cg-rows">
                        {assuntos.map((a) => {
                          const sc = BASE_SCORES.byId[a.id];
                          const cargo = a.incidencia_cargo.reduce((s, x) => s + x.questoes, 0);
                          const banca = a.incidencia_banca.reduce((s, x) => s + x.questoes, 0);
                          return (
                            <li key={a.id} className="grid grid-cols-12 items-center gap-3 py-2">
                              <div className="col-span-5 min-w-0">
                                <p className="text-sm font-medium leading-snug">
                                  {a.nome}
                                  {topSet.has(a.id) ? <span className="cg-pill-base ml-2 rounded px-1.5 py-0.5 align-middle text-[10px] font-bold">TOP 80%</span> : null}
                                </p>
                                <p className="cg-mono text-xs cg-muted">
                                  PMSC 2023: {cargo}q · AOCP 2024: {banca}q · edital {"●".repeat(a.edital_profundidade)}
                                  {a.volatil ? " · lei alterada" : ""}
                                </p>
                              </div>
                              <div className="col-span-2">
                                <Bubbles value={sc.nivel} />
                              </div>
                              <div className="col-span-2 text-right text-xs cg-num cg-ink2">{nf1.format(BASE_PTS[a.id])} pts</div>
                              <div className="col-span-1 text-right text-xs cg-num cg-ink2">{fmtH(a.carga_horaria_base)}</div>
                              <div className="col-span-2 text-right">
                                <VideoLink m={videoOf(a)} />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TopPanel({ par }) {
  const rows = pack.estrutura_prova.materias
    .map((m) => {
      const items = par.items.filter((x) => x.inTop && x.assunto.materia_id === m.id);
      return { m, n: items.length, total: pack.assuntos.filter((a) => a.materia_id === m.id).length, horas: items.reduce((s, x) => s + x.horas, 0), pts: items.reduce((s, x) => s + x.pts, 0) };
    })
    .sort((a, b) => b.pts - a.pts);
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <ParetoChart items={par.items} topCount={par.topCount} />
      </Card>
      <Card className="lg:col-span-2">
        <p className="text-xs font-semibold cg-ink2">Matérias críticas no top 80%</p>
        <ul className="cg-rows mt-2">
          {rows.map((r) => (
            <li key={r.m.id} className="flex items-center gap-3 py-2 text-sm">
              <Dot color={MAT[r.m.id].cor} />
              <span className="min-w-0 flex-1 truncate font-medium">{MAT[r.m.id].curto}</span>
              <span className="w-14 text-right text-xs cg-num cg-ink2">
                {r.n}/{r.total}
              </span>
              <span className="w-16 text-right text-xs cg-num cg-ink2">{nf1.format(r.pts)} pts</span>
              <span className="w-12 text-right text-xs font-semibold cg-num">{fmtHr(r.horas)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs cg-muted">assuntos no top · pontos esperados · horas no seu nível</p>
      </Card>
    </div>
  );
}

/* ───────────────────────────── 2 · Nivelamento ───────────────────────────── */

function StrengthGrid({ strengths, onSet, quizByMateria }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {pack.estrutura_prova.materias.map((m) => {
        const q = quizByMateria?.[m.id];
        return (
          <div key={m.id} className="cg-surface flex flex-col gap-2 rounded-xl border cg-line p-3">
            <div className="flex items-center gap-2">
              <Dot color={MAT[m.id].cor} />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">{m.nome}</p>
              {q ? (
                <span className="cg-mono text-xs cg-ink2 cg-num" title="Acertos no simulado">
                  {q.acertos}/{q.respondidas}
                </span>
              ) : null}
            </div>
            <div className="flex gap-1.5" role="group" aria-label={`Seu nível em ${m.nome}`}>
              {plan.STRENGTHS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={strengths[m.id] === s.id}
                  onClick={() => onSet(m.id, strengths[m.id] === s.id ? null : s.id)}
                  className="cg-chip flex-1 rounded-md px-2 py-1.5 text-xs font-semibold"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QuizPanel({ quiz, items, score, onStart, onAnswer, onGo, onFinish, onReset }) {
  const [reviewing, setReviewing] = useState(false);
  if (!quiz) {
    const ia = pack.nivelamento.itens.filter((i) => i.origem === "gerada_ia").length;
    return (
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 max-w-xl">
          <p className="text-sm font-bold">Simulado de nivelamento · {QUIZ_N} questões</p>
          <p className="mt-1 text-sm cg-ink2">
            Questões reais da PMSC 2023 e da AOCP (PM-PE 2024), mais {ia} geradas por IA para matérias sem prova anterior. Cada questão mostra a origem. O resultado ajusta as horas por assunto.
          </p>
        </div>
        <button type="button" onClick={onStart} className="cg-btn-primary inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold">
          <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
          Fazer simulado
        </button>
      </Card>
    );
  }
  const done = quiz.done;
  if (done && !reviewing) {
    const byMat = {};
    for (const it of items) {
      const m = pack.assuntos.find((a) => a.id === it.assunto_id).materia_id;
      const slot = (byMat[m] ??= { n: 0, ok: 0 });
      if (Number.isInteger(quiz.answers[it.id])) {
        slot.n += 1;
        if (quiz.answers[it.id] === it.gabarito) slot.ok += 1;
      }
    }
    return (
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold cg-ink2">Resultado do simulado</p>
            <p className="text-3xl font-extrabold tracking-tight cg-num">
              {score.total.acertos}/{score.total.respondidas}
              <span className="ml-2 text-base font-semibold cg-ink2">{score.total.respondidas ? fmtPct(score.total.acertos / score.total.respondidas) : "—"}</span>
            </p>
            <p className="text-xs cg-muted">{QUIZ_N - score.total.respondidas} sem resposta (não contam)</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setReviewing(true)} className="cg-btn-ghost inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold">
              Revisar respostas
            </button>
            <button type="button" onClick={onStart} className="cg-btn-ghost inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Novo simulado
            </button>
            <button type="button" onClick={onReset} className="cg-btn-ghost inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold">
              Descartar
            </button>
          </div>
        </div>
        <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {pack.estrutura_prova.materias
            .filter((m) => byMat[m.id]?.n)
            .map((m) => {
              const r = byMat[m.id];
              return (
                <li key={m.id} className="flex items-center gap-2 text-sm">
                  <Dot color={MAT[m.id].cor} />
                  <span className="min-w-0 flex-1 truncate">{MAT[m.id].curto}</span>
                  <div className="cg-track h-1.5 w-20 overflow-hidden rounded-full">
                    <div className="h-full" style={{ width: `${(r.ok / r.n) * 100}%`, background: MAT[m.id].cor }} />
                  </div>
                  <span className="w-10 text-right text-xs cg-num cg-ink2">
                    {r.ok}/{r.n}
                  </span>
                </li>
              );
            })}
        </ul>
      </Card>
    );
  }
  const idx = Math.min(quiz.idx ?? 0, items.length - 1);
  const it = items[idx];
  const src = itemSource(it);
  const assunto = pack.assuntos.find((a) => a.id === it.assunto_id);
  const answered = Object.keys(quiz.answers).filter((k) => items.some((x) => x.id === k)).length;
  const chosen = quiz.answers[it.id];
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold cg-ink2 cg-num">
          {reviewing ? "Revisão · " : ""}Questão {idx + 1} de {items.length} · {answered} respondidas
        </p>
        <div className="flex items-center gap-2">
          <span className={`${src.ia ? "cg-ia" : "cg-pill-base"} inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold`}>
            {src.ia ? <Sparkles className="h-3 w-3" aria-hidden="true" /> : null}
            {src.label}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs cg-ink2">
            <Dot color={MAT[assunto.materia_id].cor} size="h-2 w-2" />
            {MAT[assunto.materia_id].curto}
          </span>
        </div>
      </div>
      <div className="cg-progress mt-2 h-1.5 overflow-hidden rounded-full">
        <span className="block h-full" style={{ width: `${((idx + 1) / items.length) * 100}%` }} />
      </div>
      <p className="mt-4 whitespace-pre-line text-sm leading-relaxed md:text-base">{it.enunciado}</p>
      <div className="mt-3 flex flex-col gap-2" role={reviewing ? undefined : "radiogroup"} aria-label="Alternativas">
        {it.alternativas.map((alt, i) => {
          const state = reviewing ? (i === it.gabarito ? "right" : i === chosen ? "wrong" : undefined) : undefined;
          return (
            <button
              key={i}
              type="button"
              disabled={reviewing}
              aria-pressed={!reviewing && chosen === i}
              data-state={state}
              onClick={() => onAnswer(it.id, i)}
              className="cg-alt flex items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm"
            >
              <span className="cg-alt-letter grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold">{"ABCDE"[i]}</span>
              <span className="min-w-0 pt-0.5">{alt}</span>
            </button>
          );
        })}
      </div>
      {reviewing ? (
        <p className="mt-2 text-xs cg-ink2">
          Gabarito: <b>{"ABCDE"[it.gabarito]}</b>
          {Number.isInteger(chosen) ? (chosen === it.gabarito ? " · você acertou" : ` · você marcou ${"ABCDE"[chosen]}`) : " · sem resposta"} · assunto: {assunto.nome}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <button type="button" disabled={idx === 0} onClick={() => onGo(idx - 1)} className="cg-btn-ghost inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-semibold">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Anterior
        </button>
        <div className="flex gap-2">
          {reviewing ? (
            <button type="button" onClick={() => setReviewing(false)} className="cg-btn-ghost inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold">
              Fechar revisão
            </button>
          ) : (
            <button type="button" onClick={onFinish} className="cg-btn-ghost inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold">
              Finalizar ({answered}/{items.length})
            </button>
          )}
          <button
            type="button"
            disabled={idx >= items.length - 1}
            onClick={() => onGo(idx + 1)}
            className="cg-btn-primary inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-bold"
          >
            {!reviewing && !Number.isInteger(chosen) ? "Pular" : "Próxima"}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </Card>
  );
}

/* ───────────────────────────── Ajuste ao nível ───────────────────────────── */

function ApplyBar({ applied, pending, marked, quizDone, onApply }) {
  const status = !applied
    ? "Marque as matérias e/ou faça o simulado. Depois, reajuste: as horas por assunto mudam e você recebe a carga sugerida para cobrir o top 80%."
    : pending
      ? "Você alterou o nivelamento. Reajuste para atualizar prioridades, carga sugerida e agenda."
      : `Cronograma ajustado ao seu nível (${marked} matéria${marked === 1 ? "" : "s"} marcada${marked === 1 ? "" : "s"}${quizDone ? " + simulado" : ""}).`;
  return (
    <div className={`${applied && !pending ? "cg-surface border cg-line" : "cg-warn"} flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3`} role="status">
      <p className="min-w-0 max-w-2xl text-sm">{status}</p>
      <button type="button" onClick={onApply} className="cg-btn-primary inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold">
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Reajustar cronograma ao meu nível
      </button>
    </div>
  );
}

function SuggestionCard({ suggestion, examISO, mode, covHard, onUse, dates, onSimDate }) {
  const fits = suggestion.feasible && suggestion.weekly <= HARD_WEEKLY;
  const h = suggestion.hours;
  const chips = [
    ["Seg–Sex", h.seg],
    ["Sáb", h.sab],
    ["Dom", h.dom],
  ];
  return (
    <Card className="lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <p className="cg-eyebrow">{fits ? "Carga sugerida" : "Carga padrão: Hard"}</p>
          {fits ? (
            <p className="mt-1 text-lg font-extrabold tracking-tight">
              <span className="cg-num">{fmtH(suggestion.weekly)} por semana</span> cobrem todo o top 80% até {fmtDMY(examISO)}.
            </p>
          ) : (
            <p className="mt-1 text-lg font-extrabold tracking-tight">
              <span className="cg-num">{fmtH(HARD_WEEKLY)} por semana</span> cobrem {fmtPct(covHard)} do top 80% até {fmtDMY(examISO)}.
            </p>
          )}
          {fits ? (
            <ul className="mt-2 flex flex-wrap gap-2" aria-label="Carga sugerida por dia">
              {chips.map(([label, v]) => (
                <li key={label} className="cg-sunken rounded-md px-2.5 py-1 text-xs">
                  <span className="cg-ink2">{label} </span>
                  <b className="cg-num">{v ? fmtH(v) : "folga"}</b>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2 text-sm cg-ink2">
            {fits
              ? `O resto do tempo vai para revisões, simulados e reta final.`
              : suggestion.feasible
                ? `Referência: para cobrir 100% seriam necessárias ${fmtH(suggestion.weekly)} por semana.`
                : `Referência: nem a carga máxima (${fmtH(suggestion.weekly)} por semana) cobre tudo até essa data; chegaria a ${fmtPct(suggestion.cov)}.`}
            {!fits && dates.top ? ` Com a carga atual, o top 80% fica completo em ${fmtDMY(dates.top)}.` : ""}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2">
          {fits ? (
            mode === "sugestao" ? (
              <span className="cg-good-bg rounded-md px-2.5 py-1 text-xs font-bold">Em uso na agenda</span>
            ) : (
              <button type="button" onClick={() => onUse("sugestao")} className="cg-btn-primary inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold">
                <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                Usar sugestão
              </button>
            )
          ) : (
            <>
              {mode === "hard" ? (
                <span className="cg-good-bg rounded-md px-2.5 py-1 text-xs font-bold">Hard em uso na agenda</span>
              ) : (
                <button type="button" onClick={() => onUse("hard")} className="cg-btn-primary inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold">
                  Voltar ao Hard
                </button>
              )}
              {mode !== "sugestao" ? (
                <button type="button" onClick={() => onUse("sugestao")} className="cg-btn-ghost inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold">
                  Testar {fmtH(suggestion.weekly)}/semana
                </button>
              ) : null}
              {dates.top ? (
                <button type="button" onClick={() => onSimDate(dates.top)} className="cg-btn-ghost inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold">
                  Simular prova em {fmtDMY(dates.top)}
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Live answer to "how much of the top 80% does my schedule cover?". */
function CoverageBar({ cov, topPts, needH, weekly, raw, suggestion, refLabel = "sugestão", manual, onUndoManual, sticky = false }) {
  const done = cov.cov >= 0.999;
  const dW = suggestion ? weekly - suggestion.weekly : 0;
  const dRaw = suggestion ? raw - suggestion.raw : 0;
  const sign = (v) => (v > 0 ? "+" : v < 0 ? "−" : "±");
  return (
    <div
      className={`cg-surface rounded-xl border cg-line px-4 py-3 ${sticky ? "sticky z-30 shadow-sm" : ""}`}
      style={sticky ? { top: "calc(env(safe-area-inset-top, 0px) + 61px)" } : undefined}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold cg-ink2">Top 80% coberto</span>
          <span className={`text-2xl font-extrabold tracking-tight cg-num ${done ? "cg-good" : ""}`}>{fmtPct(cov.cov)}</span>
          <span className={`${done ? "cg-good-bg" : "cg-pill-final"} rounded px-1.5 py-0.5 text-[11px] font-bold`}>{done ? "completo" : "parcial"}</span>
        </div>
        <div className="cg-track relative h-2 min-w-32 flex-1 overflow-hidden rounded-full" role="img" aria-label={`${fmtPct(cov.cov)} do top 80% coberto`}>
          <div className="h-full" style={{ width: `${cov.cov * 100}%`, background: done ? "var(--good)" : "var(--accent)", borderRadius: "0 4px 4px 0" }} />
        </div>
        <p className="text-xs cg-ink2 cg-num">
          ≈ <b className="cg-ink">{Math.round(cov.pts)}</b> de {Math.round(topPts)} questões · {fmtHr(cov.hours)} de {fmtHr(needH)} de conteúdo
        </p>
      </div>
      {suggestion || manual.add || manual.del ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t cg-line pt-2 text-xs cg-ink2">
          {suggestion ? (
            <span className="cg-num">
              Sua carga <b className="cg-ink">{fmtH(weekly)}/sem</b> · {refLabel} {fmtH(suggestion.weekly)}/sem
              {Math.abs(dRaw) >= 0.5 ? (
                <>
                  {" "}
                  ·{" "}
                  <b className={refLabel !== "sugestão" ? "cg-ink" : dRaw < 0 ? "cg-error" : "cg-good"}>
                    {sign(dRaw)}
                    {fmtH(Math.abs(dRaw))} até a prova
                  </b>{" "}
                  {Math.abs(dW) >= 0.5 ? `(${sign(dW)}${fmtH(Math.abs(dW))}/sem)` : "(ajustes por dia)"}
                </>
              ) : (
                ` · igual à ${refLabel}`
              )}
            </span>
          ) : null}
          {manual.add || manual.del ? (
            <span className="inline-flex items-center gap-2 cg-num">
              Ajustes em dias: {manual.add ? <b className="cg-good">+{plan.fmtMin(manual.add)}</b> : null}
              {manual.del ? <b className="cg-error">−{plan.fmtMin(manual.del)}</b> : null}
              <button type="button" onClick={onUndoManual} className="cg-link font-semibold">
                desfazer
              </button>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ───────────────────────────── 3 · Prazo ───────────────────────────── */

function HourSlider({ day, value, onChange }) {
  const max = 10;
  return (
    <div className="grid grid-cols-[3rem_1fr_3.5rem] items-center gap-3">
      <label htmlFor={`h-${day}`} className="text-sm font-semibold">
        {plan.DAY_LABEL[day]}
      </label>
      <div className="cg-slider-track">
        <span className="cg-slider-fill" style={{ width: `${(value / max) * 100}%` }} />
        <input
          id={`h-${day}`}
          type="range"
          min="0"
          max={max}
          step="0.5"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-valuetext={`${nf1.format(value)} horas`}
        />
      </div>
      <span className="text-right text-sm font-bold cg-num">{value ? fmtH(value) : "folga"}</span>
    </div>
  );
}

function TimePanel({ state, set, setHour, hours, weekly, cap, need, cov, covHard, dates, topCount, suggestion, coverageBar }) {
  const examISO = state.simulate && state.simDate ? state.simDate : EXAM_OFFICIAL;
  const minSim = plan.addDaysISO(TODAY, 14);
  const weeks = Math.max(2, Math.round(plan.diffDaysISO(TODAY, examISO) / 7));
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {suggestion ? (
        <SuggestionCard
          suggestion={suggestion}
          examISO={examISO}
          mode={state.mode}
          covHard={covHard}
          onUse={(m) => set(m === "hard" ? { mode: m, hours: { ...plan.MODES.hard.hours } } : { mode: m })}
          dates={dates}
          onSimDate={(iso) => set({ simulate: true, simDate: iso })}
        />
      ) : null}
      <div className="lg:col-span-2">{coverageBar}</div>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-bold">Horas por dia</p>
          <Segmented
            label="Ritmo"
            value={state.mode}
            onChange={(v) =>
              v === "sugestao" ? set({ mode: v }) : v === "custom" ? set({ mode: v, hours: { ...hours } }) : set({ mode: v, hours: { ...plan.MODES[v].hours } })
            }
            options={[
              ...(suggestion ? [{ value: "sugestao", label: suggestion.feasible && suggestion.weekly <= HARD_WEEKLY ? "Sugestão" : `Ref. ${fmtH(suggestion.weekly)}` }] : []),
              ...Object.entries(plan.MODES).map(([k, m]) => ({ value: k, label: m.label })),
              { value: "custom", label: "Personalizado" },
            ]}
          />
        </div>
        <div className="mt-4 flex flex-col gap-1.5">
          {plan.DAY_KEYS.map((d) => (
            <HourSlider key={d} day={d} value={hours[d] ?? 0} onChange={(v) => setHour(d, v)} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t cg-line pt-3">
          <p className="text-sm cg-ink2">
            <b className="cg-ink cg-num text-lg">{fmtH(weekly)}</b> por semana
          </p>
          <div className="flex gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold cg-ink2">
              Começa (seg–sex)
              <input type="time" value={state.inicio} onChange={(e) => set({ inicio: e.target.value || "19:00" })} className="cg-input h-9 rounded-lg px-2 text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold cg-ink2">
              Começa (sáb–dom)
              <input type="time" value={state.inicioFds} onChange={(e) => set({ inicioFds: e.target.value || "09:00" })} className="cg-input h-9 rounded-lg px-2 text-sm" />
            </label>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold">Data da prova</p>
            <p className="text-xs cg-ink2">
              Edital: <b className="cg-num">{fmtDMY(EXAM_OFFICIAL)}</b>
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-semibold">
            Simular outra data
            <Switch checked={state.simulate} onChange={(v) => set({ simulate: v, simDate: state.simDate ?? dates.top ?? plan.addDaysISO(TODAY, 180) })} label="Simular outra data da prova" />
          </label>
        </div>
        {state.simulate ? (
          <div className="mt-3 flex flex-col gap-2">
            <div className="grid grid-cols-[1fr_auto] items-center gap-3">
              <div className="cg-slider-track">
                <span className="cg-slider-fill" style={{ width: `${((Math.min(weeks, 104) - 2) / 102) * 100}%` }} />
                <input
                  type="range"
                  min="2"
                  max="104"
                  step="1"
                  value={Math.min(weeks, 104)}
                  onChange={(e) => set({ simDate: plan.addDaysISO(TODAY, Number(e.target.value) * 7) })}
                  aria-label="Semanas até a prova simulada"
                  aria-valuetext={`${weeks} semanas`}
                />
              </div>
              <input
                type="date"
                min={minSim}
                value={state.simDate ?? ""}
                onChange={(e) => e.target.value && e.target.value >= minSim && set({ simDate: e.target.value })}
                className="cg-input h-9 rounded-lg px-2 text-sm"
                aria-label="Data simulada da prova"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {dates.top ? (
                <button type="button" onClick={() => set({ simDate: dates.top })} className="cg-chip rounded-md px-2.5 py-1 text-xs font-semibold" aria-pressed={state.simDate === dates.top}>
                  Top 80% pronto: {fmtDMY(dates.top)}
                </button>
              ) : null}
              {dates.all ? (
                <button type="button" onClick={() => set({ simDate: dates.all })} className="cg-chip rounded-md px-2.5 py-1 text-xs font-semibold" aria-pressed={state.simDate === dates.all}>
                  Edital completo: {fmtDMY(dates.all)}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <p className="mt-4 text-sm cg-ink2 cg-num">
          Até a prova: <b className="cg-ink">{weeks} semanas</b> · {fmtHr(cap.raw)} de estudo, {fmtHr(cap.content)} para conteúdo novo.
        </p>
        <p className="mt-3 text-xs font-semibold cg-ink2">No seu ritmo ({fmtH(weekly)}/semana), fica pronto em:</p>
        <ul className="mt-1.5 grid grid-cols-2 gap-2 text-sm">
          <li className="cg-sunken rounded-lg px-3 py-2">
            <span className="block text-xs cg-ink2">Top 80% · {fmtHr(need.top)}</span>
            <b className="cg-num">{dates.top ? fmtDMY(dates.top) : "mais de 3 anos"}</b>
          </li>
          <li className="cg-sunken rounded-lg px-3 py-2">
            <span className="block text-xs cg-ink2">Edital completo · {fmtHr(need.all)}</span>
            <b className="cg-num">{dates.all ? fmtDMY(dates.all) : "mais de 3 anos"}</b>
          </li>
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t cg-line pt-3">
          <p className="text-xs font-semibold cg-ink2">Escopo da agenda</p>
          <Segmented
            label="Escopo da agenda"
            value={state.scope}
            onChange={(v) => set({ scope: v })}
            options={[
              { value: "top80", label: "Top 80%", hint: `${topCount} assuntos` },
              { value: "all", label: "Edital completo", hint: `${N_ASSUNTOS}` },
            ]}
          />
        </div>
      </Card>
    </div>
  );
}

/* ───────────────────────────── 4 · Cronograma ───────────────────────────── */

function BlockCard({ b, done, late, onToggle }) {
  const a = ACT[b.atividade];
  const mat = b.materia_id ? MAT[b.materia_id] : null;
  const what = b.assunto ? b.assunto.nome : "simulado completo";
  return (
    <article className="cg-block rounded-lg p-2.5" data-act={b.atividade} data-done={done || undefined} data-late={late || undefined}>
      <div className="flex items-center justify-between gap-2 cg-mono text-xs cg-num">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap cg-ink2">
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={done}
            aria-label={`${done ? "Desmarcar" : "Marcar como estudado"}: ${a.label} de ${what}`}
            className="cg-check grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold"
          >
            {done ? "✓" : ""}
          </button>
          {plan.fmtClock(b.start)}–{plan.fmtClock(b.end)}
        </span>
        {late ? <span className="cg-error text-[11px] font-semibold">atrasado</span> : null}
      </div>
      {mat ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-sm font-bold leading-snug">
          <Dot color={mat.cor} size="h-2 w-2" />
          <span className="min-w-0">{mat.curto}</span>
        </p>
      ) : (
        <p className="mt-1.5 text-sm font-bold">Prova completa</p>
      )}
      <p className="mt-0.5 text-xs leading-snug cg-ink2">{b.assunto ? b.assunto.nome : `${TOTAL_Q} questões no tempo de prova`}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <p className={`cg-act-${b.atividade} inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold`}>
          <a.Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {a.label}
          <span className="font-normal cg-muted cg-num">
            · {plan.fmtMin(b.minutos)}
            {b.atividade === "revisao" && b.intervalo_dias ? ` · ${b.intervalo_dias}d` : ""}
          </span>
        </p>
        {b.video ? <VideoLink m={b.video} compact /> : null}
      </div>
    </article>
  );
}

function DayColumn({ d, edited, onAdjust, onReset, isDone, onToggle }) {
  const total = d.blocks.reduce((s, b) => s + b.minutos, 0);
  const label = `${plan.DAY_LABEL[d.dia_semana]} ${fmtDM(d.data)}`;
  const today = d.data === TODAY;
  const past = d.data < TODAY;
  const doneN = d.blocks.filter((b, i) => isDone(b, i)).length;
  return (
    <div className="cg-sunken flex min-w-0 flex-col gap-2 rounded-xl p-2" data-edited={edited || undefined} data-today={today || undefined}>
      <div className="flex items-center justify-between gap-1 px-1 pt-0.5">
        <p className="min-w-0 truncate whitespace-nowrap text-sm font-bold">
          {plan.DAY_LABEL[d.dia_semana]} <span className="cg-mono text-xs font-normal cg-muted">{fmtDM(d.data)}</span>
        </p>
        <div className="flex shrink-0 items-center gap-0.5">
          <button type="button" onClick={() => onAdjust(-0.5)} disabled={!d.capacidade_min} aria-label={`Tirar 30 min de ${label}`} className="cg-btn-ghost grid h-6 w-6 place-items-center rounded text-sm font-bold leading-none">
            −
          </button>
          <span className={`cg-mono w-10 text-center text-xs font-semibold cg-num ${edited ? "cg-accent-ink" : "cg-ink2"}`} title="Tempo disponível neste dia">
            {d.capacidade_min ? plan.fmtMin(d.capacidade_min) : "0h"}
          </span>
          <button type="button" onClick={() => onAdjust(0.5)} aria-label={`Adicionar 30 min em ${label}`} className="cg-btn-ghost grid h-6 w-6 place-items-center rounded text-sm font-bold leading-none">
            +
          </button>
        </div>
      </div>
      {edited ? (
        <button type="button" onClick={onReset} className="cg-link self-start px-1 text-[11px] font-semibold">
          ajustado · voltar ao padrão
        </button>
      ) : null}
      {!d.blocks.length ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed cg-line px-3 py-4 text-xs cg-muted">
          <Coffee className="h-4 w-4" aria-hidden="true" />
          {d.capacidade_min ? "Livre" : "Folga"}
        </div>
      ) : null}
      {d.blocks.length || today ? (
        <p className="px-1 text-[11px] cg-muted cg-num">
          {today ? <b className="cg-accent-ink">Hoje · </b> : null}
          {d.blocks.length ? `${doneN}/${d.blocks.length} estudados` : ""}
        </p>
      ) : null}
      {d.blocks.map((b, i) => (
        <BlockCard key={i} b={b} done={isDone(b, i)} late={past && !isDone(b, i)} onToggle={() => onToggle(b, i)} />
      ))}
      {d.blocks.length > 0 && d.capacidade_min - total >= 15 ? (
        <div className="rounded-lg border border-dashed cg-line px-2.5 py-2 text-xs cg-muted">
          <span className="cg-mono cg-num">{plan.fmtMin(d.capacidade_min - total)}</span> de margem para imprevistos
        </div>
      ) : null}
    </div>
  );
}

function SchedulePanel({ weeks, week, setWeek, result, examISO, dates, onSimTop, exportBar, coverageBar, dayProps, progressPanel }) {
  if (!weeks.length) return null;
  const w = weeks[Math.min(week, weeks.length) - 1];
  const totals = Object.fromEntries(ACT_KEYS.map((k) => [k, 0]));
  for (const d of w.dias) for (const b of d.blocks) totals[b.atividade] += b.minutos;
  const days = w.dias;
  return (
    <section id="cronograma" className="cg-anchor flex flex-col gap-4">
      <SectionHead
        step="4 · Cronograma"
        title="Sua agenda, semana a semana"
        desc="Cada assunto começa com videoaula, segue com leitura e depois exercícios. Marque ✓ no que estudar; use − e + para tirar ou incluir tempo em um dia."
        right={
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setWeek(week - 1)} disabled={week <= 1} aria-label="Semana anterior" className="cg-btn-ghost grid h-9 w-9 place-items-center rounded-lg">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="min-w-32 text-center" aria-live="polite">
              <p className="text-sm font-bold cg-num">
                Semana {w.numero} de {weeks.length}
              </p>
              <p className="cg-mono text-xs cg-muted cg-num">
                {fmtDM(w.inicio)} – {fmtDM(w.fim)}
              </p>
            </div>
            <button type="button" onClick={() => setWeek(week + 1)} disabled={week >= weeks.length} aria-label="Próxima semana" className="cg-btn-ghost grid h-9 w-9 place-items-center rounded-lg">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className={`${w.reta_final ? "cg-pill-final" : "cg-pill-base"} rounded-md px-2 py-1 text-xs font-bold`}>{w.reta_final ? "Reta final" : "Fase base"}</span>
          </div>
        }
      />
      {coverageBar}
      {progressPanel}
      {result.cobertura_parcial ? (
        <div role="status" className="cg-warn flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm">
          <span className="inline-flex items-start gap-2">
            <TriangleAlert className="cg-warn-icon mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Até {fmtDMY(examISO)} não cabe tudo: <b>{result.assuntos_cortados.length}</b> assuntos de menor prioridade ficaram fora (faltam {fmtHr(result.deficit_horas)}). O restante recebe o mínimo e a ordem segue o que mais cai.
            </span>
          </span>
          {dates.top ? (
            <button type="button" onClick={onSimTop} className="cg-btn-primary inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold">
              Simular prova em {fmtDMY(dates.top)}
            </button>
          ) : null}
        </div>
      ) : null}
      {exportBar}
      <ul className="flex flex-wrap gap-2" aria-label="Tempo por atividade nesta semana">
        {ACT_KEYS.filter((k) => totals[k]).map((k) => {
          const A = ACT[k];
          return (
            <li key={k} className="cg-surface inline-flex items-center gap-1.5 rounded-md border cg-line px-2 py-1 text-xs">
              <A.Icon className={`cg-act-${k} h-3.5 w-3.5`} aria-hidden="true" />
              <span className="font-semibold">{A.label}</span>
              <span className="cg-mono cg-ink2 cg-num">{plan.fmtMin(totals[k])}</span>
            </li>
          );
        })}
      </ul>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {days.map((d) => (
          <DayColumn key={d.data} d={d} {...dayProps(d)} />
        ))}
      </div>
    </section>
  );
}

function ProgressPanel({ info, onReorganize }) {
  const { studied, overdue, pendingLog, finished, planStart, reorganized } = info;
  const urgent = overdue.n > 0 || pendingLog > 0;
  return (
    <div className={`${overdue.n ? "cg-warn" : "cg-surface border cg-line"} flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3`}>
      <div className="min-w-0 max-w-3xl">
        <p className="text-sm font-bold">Seu progresso</p>
        <p className="text-sm cg-ink2 cg-num">
          {studied.n ? (
            <>
              Estudado: <b className="cg-ink">{plan.fmtMin(studied.min)}</b> em {studied.n} bloco{studied.n === 1 ? "" : "s"}
              {finished ? ` · ${finished} assunto${finished === 1 ? "" : "s"} concluído${finished === 1 ? "" : "s"}` : ""}
            </>
          ) : (
            "Marque ✓ em cada bloco que estudar, mesmo que não tenha feito o dia todo."
          )}
          {overdue.n ? (
            <>
              {" "}
              · <b className="cg-error">{overdue.n} bloco{overdue.n === 1 ? "" : "s"} atrasado{overdue.n === 1 ? "" : "s"}</b> ({plan.fmtMin(overdue.min)})
            </>
          ) : null}
        </p>
        <p className="text-xs cg-muted">
          Reorganizar tira da agenda o que você já estudou e redistribui o que falta de hoje até a prova.{reorganized ? ` Agenda atual desde ${fmtDMY(planStart)}.` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={onReorganize}
        className={`${urgent ? "cg-btn-primary" : "cg-btn-ghost"} inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold`}
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Reorganizar agenda
      </button>
    </div>
  );
}

function ExportBar({ aluno, setAluno, onPdf, onIcs, busy, error, summary }) {
  return (
    <div className="cg-surface flex flex-wrap items-end gap-3 rounded-xl border cg-line p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5" style={{ minWidth: 200 }}>
        <label htmlFor="aluno" className="text-xs font-semibold cg-ink2">
          Nome do aluno no PDF (opcional)
        </label>
        <input id="aluno" type="text" value={aluno} onChange={(e) => setAluno(e.target.value)} maxLength={80} placeholder="Ex.: Maria Souza" className="cg-input h-10 rounded-lg px-3 text-sm" />
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onPdf} disabled={busy} className="cg-btn-primary inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold">
            <FileDown className="h-4 w-4" aria-hidden="true" />
            {busy ? "Gerando PDF…" : "PDF completo"}
          </button>
          <button type="button" onClick={onIcs} className="cg-btn-ghost inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold">
            <CalendarPlus className="h-4 w-4" aria-hidden="true" />
            Google Agenda (.ics)
          </button>
        </div>
        <p className="text-xs cg-muted">{error ? <span className="cg-error">{error}</span> : summary}</p>
      </div>
    </div>
  );
}

/* ───────────────────────────── 5 · Resultado ───────────────────────────── */

function ComparePanel({ cmp, contentH }) {
  const reasons = [
    { Icon: Target, title: "Começa pelo que mais rende", text: "Assuntos em ordem de pontos esperados por hora. O genérico segue a ordem do edital, do primeiro ao último." },
    { Icon: Sparkles, title: "Tempo onde você precisa", text: "Matéria fraca ganha mais horas, matéria forte perde. O genérico dá a mesma carga para todo mundo." },
    { Icon: Repeat, title: "Revisão e simulado no calendário", text: "Revisões em 1, 7, 21 e 60 dias e simulados periódicos já reservados, sem roubar o conteúdo novo." },
  ];
  return (
    <section id="comparativo" className="cg-anchor flex flex-col gap-4">
      <SectionHead step="5 · Resultado" title="Por que o seu cronograma rende mais" desc="As mesmas horas, em outra ordem e outra dosagem." />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {reasons.map(({ Icon, title, text }, i) => (
          <Card key={title}>
            <p className="flex items-center gap-2 text-sm font-bold">
              <span className="cg-brand grid h-7 w-7 shrink-0 place-items-center rounded-md text-xs" aria-hidden="true">
                {i + 1}
              </span>
              <Icon className="h-4 w-4 cg-ink2" aria-hidden="true" />
              {title}
            </p>
            <p className="mt-2 text-sm cg-ink2">{text}</p>
          </Card>
        ))}
      </div>
      <Card>
        <p className="mb-1 text-sm font-bold">Questões no alcance a cada hora de estudo</p>
        <p className="mb-3 text-xs cg-ink2">Passe o mouse ou o dedo na curva para comparar em qualquer ponto. A linha vertical marca as suas horas de conteúdo novo até a prova.</p>
        <CompareChart cmp={cmp} contentH={contentH} />
      </Card>
    </section>
  );
}

function MethodNotes() {
  return (
    <section className="flex flex-col gap-2 text-xs cg-muted">
      <p className="cg-eyebrow">Como calculamos</p>
      <ul className="flex max-w-3xl list-disc flex-col gap-1 pl-4">
        <li>Prioridade do assunto = 35% prova anterior do cargo + 20% última prova da banca + 45% peso no edital, ampliada pela sua lacuna (nivelamento) e por lei alterada recentemente.</li>
        <li>Pontos esperados = pontos da matéria divididos entre os assuntos pela prioridade. Top 80% = assuntos em ordem de pontos por hora de estudo até somar 80% da prova (menor carga para 80%).</li>
        <li>Penal Militar, Legislação Especial e Trânsito não têm prova anterior no histórico usado: a prioridade vem só do edital.</li>
        <li>Capacidade: 10% de folga, reta final nos últimos 15% dos dias, revisões e simulados reservados antes do conteúdo novo.</li>
        <li>Caso de estudo com dados públicos (edital e provas oficiais). Questões geradas por IA estão marcadas. Confira datas no edital.</li>
      </ul>
    </section>
  );
}

/* ───────────────────────────── App ───────────────────────────── */

export default function App() {
  const [state, setState] = useState(loadState);
  const [expanded, setExpanded] = useState(() => new Set());
  const [week, setWeekState] = useState(null); // null = the week that contains today
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState(null);
  const quizRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable */
    }
  }, [state]);

  const set = (patch) => setState((s) => ({ ...s, ...patch }));

  // leveling
  const quizItems = useMemo(() => (state.quiz ? plan.sampleQuiz(pack, { n: QUIZ_N, seed: `${pack.concurso.id}|${state.quiz.attempt}` }).itens : null), [state.quiz?.attempt]);
  const quizScore = useMemo(() => (state.quiz?.done && quizItems ? plan.scoreQuiz(quizItems, state.quiz.answers) : null), [state.quiz?.done, state.quiz?.answers, quizItems]);
  const quizByMateria = useMemo(() => {
    if (!quizScore) return null;
    const out = {};
    for (const [id, r] of Object.entries(quizScore.porAssunto)) {
      const m = pack.assuntos.find((a) => a.id === id).materia_id;
      const slot = (out[m] ??= { acertos: 0, respondidas: 0 });
      slot.acertos += r.acertos;
      slot.respondidas += r.respondidas;
    }
    return out;
  }, [quizScore]);
  // the plan follows the leveling the student applied with "Reajustar", not every click
  const levelNow = { strengths: state.strengths, q: state.quiz?.done ? { attempt: state.quiz.attempt, answers: state.quiz.answers } : null };
  const pending = !state.applied || JSON.stringify(state.applied) !== JSON.stringify(levelNow);
  const appliedKey = JSON.stringify(state.applied);
  const nivelamento = useMemo(() => {
    const a = state.applied;
    if (!a) return {};
    const q = a.q ? plan.scoreQuiz(plan.sampleQuiz(pack, { n: QUIZ_N, seed: `${pack.concurso.id}|${a.q.attempt}` }).itens, a.q.answers) : null;
    return plan.nivelamentoInput(pack, a.strengths, q);
  }, [appliedKey]);
  const scores = useMemo(() => plan.score({ pack, nivelamento }), [nivelamento]);
  const par = useMemo(() => plan.pareto(pack, scores), [scores]);
  const cmp = useMemo(() => plan.compare(pack, scores), [scores]);

  // time
  const examISO = state.simulate && state.simDate ? state.simDate : EXAM_OFFICIAL;
  const start = state.planStart && state.planStart <= TODAY && state.planStart < examISO ? state.planStart : TODAY;
  const nTopics = state.scope === "top80" ? par.topCount : N_ASSUNTOS;
  const excecoes = useMemo(() => Object.fromEntries(Object.entries(state.excecoes ?? {}).filter(([iso]) => iso >= start && iso < examISO)), [state.excecoes, start, examISO]);
  // progress: consolidated entries (before the last reorganization) shape the plan; the others are checkmarks on it
  const logKey = JSON.stringify(state.log ?? {});
  const progress = useMemo(() => plan.progressOf(Object.values(state.log ?? {}).filter((e) => e.consolidated)), [logKey]);
  const progressAll = useMemo(() => plan.progressOf(Object.values(state.log ?? {})), [logKey]);
  const suggestion = useMemo(
    () => (state.applied ? plan.suggestLoad({ pack, par, cmp, start, exam: examISO, nTopics, progress }) : null),
    [appliedKey, par, cmp, start, examISO, nTopics, progress]
  );
  // "auto" (after Reajustar): the suggestion when it fits in Hard, otherwise Hard; the suggestion stays as reference
  const autoMode = suggestion && suggestion.feasible && suggestion.weekly <= HARD_WEEKLY ? "sugestao" : "hard";
  const mode = state.mode === "auto" ? autoMode : state.mode === "sugestao" && !suggestion ? "custom" : state.mode;
  const hours = mode === "sugestao" ? suggestion.hours : state.mode === "auto" ? plan.MODES.hard.hours : state.hours;
  const weekly = plan.weeklyOf(hours);
  const setHour = (d, v) => setState((s) => ({ ...s, mode: "custom", hours: { ...hours, [d]: v } }));
  const remaining = useMemo(
    () => plan.remainingPack(pack, scores, state.scope === "top80" ? par.top : new Set(pack.assuntos.map((a) => a.id)), progress),
    [scores, state.scope, par, progress]
  );
  const hasHours = weekly > 0 || Object.values(excecoes).some((v) => v > 0);
  const result = useMemo(
    () =>
      !hasHours
        ? { ok: false, erros: [{ message: "Sem horas na semana" }] }
        : !remaining.pack.assuntos.length
          ? { ok: false, erros: [{ message: "todos os assuntos do escopo já foram estudados" }] }
          : plan.buildPlan({ pack: remaining.pack, nivelamento, hours, start, exam: examISO, excecoes, concluidos: remaining.finished }),
    [remaining, nivelamento, hours, start, examISO, excecoes, hasHours, weekly]
  );
  const weeks = useMemo(
    () => (result.ok && result.cronograma ? plan.displayWeeks(result, pack, { inicio: state.inicio, inicioFds: state.inicioFds, studied: progress }) : []),
    [result, state.inicio, state.inicioFds, progress]
  );
  const studiedAllH = Object.values(progressAll).reduce((s2, p) => s2 + p.min, 0) / 60;
  const dates = useMemo(() => {
    const topLeft = plan.coverageNow(par, cmp, 0, progressAll).remainingH;
    return {
      top: topLeft > 0 ? plan.dateToCover(pack, hours, TODAY, topLeft, par.topCount) : TODAY,
      all: plan.dateToCover(pack, hours, TODAY, Math.max(1, par.totalHours - studiedAllH), N_ASSUNTOS),
    };
  }, [hours, par, cmp, progressAll, studiedAllH]);
  const cap = {
    raw: result.ok ? result.capacidade.horas_brutas : 0,
    content: result.ok ? result.capacidade.horas_para_conteudo : 0,
  };
  const need = { top: par.topHours, all: par.totalHours };
  const cov = plan.coverageNow(par, cmp, cap.content, progress);
  const covHard = useMemo(
    () => plan.coverageNow(par, cmp, plan.contentHours(pack, plan.MODES.hard.hours, start, examISO, nTopics, excecoes), progress).cov,
    [par, cmp, start, examISO, nTopics, excecoes, progress]
  );
  // minutes the student added/removed on specific dates, against the weekday hours
  const manual = { add: 0, del: 0 };
  for (const [iso, h] of Object.entries(excecoes)) {
    const diff = Math.round((h - (hours[weekdayOf(iso)] ?? 0)) * 60);
    if (diff > 0) manual.add += diff;
    else manual.del -= diff;
  }
  const adjustDay = (iso, delta) =>
    setState((s) => {
      const base = hours[weekdayOf(iso)] ?? 0;
      const cur = s.excecoes?.[iso] ?? base;
      const next = Math.min(12, Math.max(0, cur + delta));
      const ex = { ...(s.excecoes ?? {}) };
      if (Math.abs(next - base) < 1e-9) delete ex[iso];
      else ex[iso] = next;
      return { ...s, excecoes: ex };
    });
  const resetDay = (iso) =>
    setState((s) => {
      const ex = { ...(s.excecoes ?? {}) };
      delete ex[iso];
      return { ...s, excecoes: ex };
    });
  // studied blocks
  const logged = state.log ?? {};
  const isDone = (key) => Boolean(logged[key] && !logged[key].consolidated);
  const toggleDone = (key, d, b) =>
    setState((s) => {
      const log = { ...(s.log ?? {}) };
      if (log[key] && !log[key].consolidated) delete log[key];
      else log[key] = { data: d.data, assunto_id: b.assunto?.id ?? null, materia_id: b.materia_id ?? null, atividade: b.atividade, minutos: b.minutos, consolidated: false };
      return { ...s, log };
    });
  const consolidate = (s) => Object.fromEntries(Object.entries(s.log ?? {}).map(([k, e]) => [k, { ...e, consolidated: true }]));
  const reorganize = () => {
    setState((s) => ({ ...s, log: consolidate(s), planStart: TODAY }));
    requestAnimationFrame(() => document.getElementById("cronograma")?.scrollIntoView({ block: "start" }));
  };
  const applyLevel = () => {
    setState((s) => ({ ...s, applied: levelNow, mode: "auto", log: consolidate(s), planStart: TODAY }));
    requestAnimationFrame(() => document.getElementById("prazo")?.scrollIntoView({ block: "start" }));
  };
  let overdue = { n: 0, min: 0 };
  let pendingLog = 0;
  for (const w of weeks)
    for (const d of w.dias)
      d.blocks.forEach((b, i) => {
        const k = plan.blockKey(d.data, b, i);
        if (isDone(k)) pendingLog += 1;
        else if (d.data < TODAY) overdue = { n: overdue.n + 1, min: overdue.min + b.minutos };
      });
  const studied = Object.values(logged).reduce((acc, e) => ({ n: acc.n + 1, min: acc.min + e.minutos }), { n: 0, min: 0 });
  const progressInfo = { studied, overdue, pendingLog, finished: remaining.finished.length, planStart: start, reorganized: Boolean(state.planStart) };
  const coverageProps = {
    cov,
    topPts: par.topPts,
    needH: par.topHours,
    weekly,
    raw: cap.raw,
    suggestion,
    refLabel: suggestion && suggestion.feasible && suggestion.weekly <= HARD_WEEKLY ? "sugestão" : "referência",
    manual,
    onUndoManual: () => set({ excecoes: {} }),
  };
  const nums = {
    genAt: plan.coverageAt(cmp.generic, cap.content),
    persAt: plan.coverageAt(cmp.personalized, cap.content),
    gen80: plan.hoursTo(cmp.generic, plan.PARETO_TARGET),
    pers80: par.topHours,
  };
  const todayWeek = Math.max(1, weeks.findIndex((w) => w.inicio <= TODAY && TODAY <= w.fim) + 1);
  const currentWeek = Math.min(Math.max(1, week ?? todayWeek), Math.max(1, weeks.length));
  const setWeek = (w) => setWeekState(Math.min(Math.max(1, w), weeks.length));
  useEffect(() => setWeekState(null), [examISO, state.scope, start]);

  const toggleExpand = (id) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const quizActions = {
    onStart: () => {
      set({ quiz: { attempt: (state.quiz?.attempt ?? 0) + 1, answers: {}, done: false, idx: 0 } });
      requestAnimationFrame(() => quizRef.current?.scrollIntoView({ block: "start" }));
    },
    onAnswer: (id, i) => setState((s) => ({ ...s, quiz: { ...s.quiz, answers: { ...s.quiz.answers, [id]: i } } })),
    onGo: (idx) => setState((s) => ({ ...s, quiz: { ...s.quiz, idx } })),
    onFinish: () => setState((s) => ({ ...s, quiz: { ...s.quiz, done: true, idx: 0 } })),
    onReset: () => set({ quiz: null }),
  };

  const materiasInfo = Object.fromEntries(Object.values(MAT).map((m) => [m.id, { nome: m.nome, curto: m.curto, hex: m.hex }]));
  const scopeLabel = state.scope === "top80" ? `Top 80% (${par.topCount} de ${N_ASSUNTOS} assuntos)` : `Edital completo (${N_ASSUNTOS} assuntos)`;
  const modeLabel = mode === "custom" ? "Personalizado" : mode === "sugestao" ? "Sugerido para o top 80%" : plan.MODES[mode].label;

  const exportPdf = async () => {
    if (busy || !weeks.length) return;
    setBusy(true);
    setExportError(null);
    try {
      const { exportPdf: run } = await import("./pdf.js");
      await run({
        appName: APP_NAME,
        pack,
        weeks,
        materias: materiasInfo,
        info: { examISO, simulated: state.simulate, modeLabel, weeklyH: weekly, rawH: cap.raw, contentH: cap.content, scopeLabel, startISO: TODAY, todayISO: TODAY, coverage: cov.cov, manual },
        top: par.items.filter((x) => x.inTop).map((x, i) => ({ rank: i + 1, materia_id: x.assunto.materia_id, nome: x.assunto.nome, nivel: BASE_SCORES.byId[x.id].nivel, pts: x.pts, horas: x.horas })),
        cmp: nums,
        aluno: state.aluno,
      });
    } catch (err) {
      console.error(err);
      setExportError("Não foi possível gerar o PDF. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };
  const exportIcs = () => {
    if (!weeks.length) return;
    const ics = plan.toICS({ weeks, pack, materias: MAT_NAMES, appName: APP_NAME });
    plan.download(`cronograma-${pack.concurso.id}.ics`, ics, "text/calendar");
  };

  const nav = [
    ["#dossie", "Dossiê"],
    ["#top80", "Top 80%"],
    ["#nivelamento", "Nivelamento"],
    ["#prazo", "Carga"],
    ["#cronograma", "Agenda"],
    ["#comparativo", "Resultado"],
  ];
  const daysLeft = plan.diffDaysISO(TODAY, examISO);
  const totalBlocks = weeks.reduce((s, w) => s + w.dias.reduce((t, d) => t + d.blocks.length, 0), 0);

  return (
    <div className="cg-app min-h-screen">
      <style>{CSS + EXTRA_CSS + APP_CSS}</style>

      <header className="cg-header cg-surface border-b cg-line">
        <div className="cg-gutter cg-wrap flex items-center gap-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="cg-brand grid h-9 w-9 shrink-0 place-items-center rounded-md" aria-hidden="true">
              <CalendarCheck className="h-5 w-5" />
            </span>
            <p className="min-w-0 truncate text-sm font-extrabold tracking-tight md:text-base">{APP_NAME}</p>
          </div>
          <nav className="cg-nav ml-auto hidden items-center gap-1 md:flex" aria-label="Seções">
            {nav.map(([href, label]) => (
              <a key={href} href={href} className="rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors">
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="cg-gutter cg-wrap flex flex-col gap-10 py-6 md:py-8">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="cg-eyebrow">Caso de estudo · {pack.concurso.banca}</p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">{pack.concurso.nome}</h1>
              <p className="mt-1 text-sm cg-ink2">
                {pack.concurso.orgao} · {TOTAL_Q} questões · {pack.estrutura_prova.materias.length} matérias · {N_ASSUNTOS} assuntos
              </p>
            </div>
            <span className="cg-mono rounded-md border cg-line px-2 py-1 text-xs cg-muted">Edital real · curado em {fmtDMY(pack.concurso.curado_em)}</span>
          </div>
          <ResultHero
            examISO={examISO}
            simulated={state.simulate}
            daysLeft={daysLeft}
            contentH={cap.content}
            weekly={weekly}
            modeLabel={modeLabel}
            nums={nums}
            cov={cov}
            applied={Boolean(state.applied)}
          />
          <Steps
            items={[
              { href: "#dossie", title: "Dossiê da prova", status: `${N_ASSUNTOS} assuntos · top 80% = ${par.topCount}`, done: true },
              {
                href: "#nivelamento",
                title: "Seu nível",
                status: !state.applied ? "pendente" : pending ? "alterado: reajuste" : "aplicado",
                done: Boolean(state.applied) && !pending,
                warn: Boolean(state.applied) && pending,
              },
              { href: "#prazo", title: "Carga horária", status: `${fmtH(weekly)}/semana · ${modeLabel}`, done: Boolean(state.applied) },
              { href: "#cronograma", title: "Agenda", status: weeks.length ? `${weeks.length} semanas · top 80% ${fmtPct(cov.cov)}` : "sem horas", done: Boolean(state.applied) && cov.cov >= 0.999 },
            ]}
          />
        </div>

        <section id="dossie" className="cg-anchor flex flex-col gap-4">
          <SectionHead step="1 · Dossiê" title="O que mais cai nesta prova" desc="Edital 2026 cruzado com a prova anterior do cargo e com a prova mais recente da banca para o mesmo cargo." />
          <DossierCards />
          <DossierTable topSet={par.top} expanded={expanded} onToggle={toggleExpand} />
        </section>

        <section id="top80" className="cg-anchor flex flex-col gap-4">
          <SectionHead
            step="Painel"
            title="Top 80% da prova"
            desc={`Os ${par.topCount} assuntos com melhor retorno (pontos esperados por hora de estudo no seu nível) somam 80% da prova. A agenda cobre esses primeiro.`}
            right={
              <p className="inline-flex items-center gap-1.5 text-sm cg-ink2">
                <Target className="h-4 w-4" aria-hidden="true" />
                <b className="cg-ink cg-num">{nf1.format(par.topPts)}</b> de {TOTAL_Q} pontos
              </p>
            }
          />
          <TopPanel par={par} />
        </section>

        <section id="nivelamento" className="cg-anchor flex flex-col gap-4" ref={quizRef}>
          <SectionHead
            step="2 · Nivelamento"
            title="Seu ponto de partida"
            desc="Marque cada matéria (opcional) e faça o simulado. Matéria fraca recebe mais horas; forte, menos. Sem marcação, vale o peso da prova."
            right={
              Object.keys(state.strengths).length ? (
                <button type="button" onClick={() => set({ strengths: {} })} className="cg-btn-ghost inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold">
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Limpar marcações
                </button>
              ) : null
            }
          />
          <StrengthGrid
            strengths={state.strengths}
            quizByMateria={quizByMateria}
            onSet={(id, v) =>
              setState((s) => {
                const next = { ...s.strengths };
                if (v) next[id] = v;
                else delete next[id];
                return { ...s, strengths: next };
              })
            }
          />
          <QuizPanel quiz={state.quiz} items={quizItems} score={quizScore} {...quizActions} />
          <ApplyBar applied={Boolean(state.applied)} pending={pending} marked={Object.keys(state.applied?.strengths ?? {}).length} quizDone={Boolean(state.applied?.q)} onApply={applyLevel} />
        </section>

        <section id="prazo" className="cg-anchor flex flex-col gap-4">
          <SectionHead
            step="3 · Carga horária"
            title={suggestion ? "Carga sugerida e seus ajustes" : "Seu tempo até a prova"}
            desc="Partimos da carga que cobre o top 80% até a prova. Mude as horas de cada dia ou a data: a cobertura do top 80% e a agenda se recalculam na hora."
          />
          <TimePanel
            state={{ ...state, mode }}
            set={set}
            setHour={setHour}
            hours={hours}
            weekly={weekly}
            cap={cap}
            need={need}
            cov={{ ...cov, examPct: state.scope === "top80" ? Math.min(cov.examPct, par.topPts / par.total) : cov.examPct }}
            covHard={covHard}
            dates={dates}
            topCount={par.topCount}
            suggestion={suggestion}
            coverageBar={<CoverageBar {...coverageProps} />}
          />
        </section>

        {result.ok && weeks.length ? (
          <SchedulePanel
            weeks={weeks}
            week={currentWeek}
            setWeek={setWeek}
            result={result}
            examISO={examISO}
            dates={dates}
            onSimTop={() => set({ simulate: true, simDate: dates.top })}
            coverageBar={<CoverageBar {...coverageProps} sticky />}
            dayProps={(d) => ({
              edited: d.data in excecoes,
              onAdjust: (delta) => adjustDay(d.data, delta),
              onReset: () => resetDay(d.data),
              isDone: (b, i) => isDone(plan.blockKey(d.data, b, i)),
              onToggle: (b, i) => toggleDone(plan.blockKey(d.data, b, i), d, b),
            })}
            progressPanel={<ProgressPanel info={progressInfo} onReorganize={reorganize} />}
            exportBar={
              <ExportBar
                aluno={state.aluno}
                setAluno={(v) => set({ aluno: v })}
                onPdf={exportPdf}
                onIcs={exportIcs}
                busy={busy}
                error={exportError}
                summary={`${weeks.length} semanas · ${totalBlocks} blocos · .ics: Google Agenda › Configurações › Importar e exportar`}
              />
            }
          />
        ) : (
          <section id="cronograma" className="cg-anchor">
            <div role="status" className="cg-warn flex items-center gap-2 rounded-lg px-4 py-3 text-sm">
              <TriangleAlert className="cg-warn-icon h-4 w-4 shrink-0" aria-hidden="true" />
              {!hasHours ? "Defina ao menos um dia com horas de estudo." : `Não foi possível montar a agenda: ${result.erros?.[0]?.message ?? "verifique a data"}.`}
            </div>
          </section>
        )}

        <ComparePanel cmp={cmp} contentH={cap.content} />

        <MethodNotes />
      </main>
    </div>
  );
}

