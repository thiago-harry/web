/**
 * Cronograma Inteligente · Mentoria 2G
 * MVP de validação interna. Arquivo único: React 18 + Tailwind CSS + lucide-react.
 *
 * Fluxo de cálculo:
 *  Fase 1  pontos esperados do assunto = pontos da disciplina × incidência histórica na banca
 *          → prioridade 1–5 por faixa; prioridade 1 = descarte sugerido.
 *  Fase 2  demanda da disciplina = Σ prioridades dos assuntos ativos × fator de nível.
 *  Fase 3  horas da disciplina = horas líquidas até a prova × participação na demanda,
 *          fatiadas em blocos de 30 min por semana (com arrasto de arredondamento entre semanas).
 *
 * Os dados do edital e da banca são de exemplo.
 */
import React, { useMemo, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  CalendarCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Flag,
  ListChecks,
  Minus,
  Repeat,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

/* ───────────────────────────── Tokens de tema ───────────────────────────── */

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

const CSS = `
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

/* ───────────────────────────── Dados de exemplo ─────────────────────────── */

const EXAM = {
  cargo: "Analista Administrativo",
  banca: "Banca-modelo",
  provas: 6,
  periodo: "2019–2025",
};

// [assunto, incidência % nas provas anteriores da banca, dentro da disciplina]
const RAW_DISCIPLINES = [
  {
    id: "port", nome: "Língua Portuguesa", curto: "Português", bloco: "Básica", questoes: 15, peso: 1, simulado: 82,
    assuntos: [
      ["Interpretação e compreensão de texto", 30], ["Concordância verbal e nominal", 14], ["Pontuação", 13],
      ["Regência e crase", 12], ["Classes de palavras", 12], ["Sintaxe da oração e do período", 11],
      ["Ortografia e acentuação", 8],
    ],
  },
  {
    id: "rlm", nome: "Raciocínio Lógico-Matemático", curto: "RLM", bloco: "Básica", questoes: 8, peso: 1, simulado: 58,
    assuntos: [
      ["Proposições e conectivos", 24], ["Equivalências e negações", 20], ["Porcentagem, razão e proporção", 18],
      ["Análise combinatória", 14], ["Probabilidade", 12], ["Sequências e padrões", 7], ["Geometria básica", 5],
    ],
  },
  {
    id: "info", nome: "Noções de Informática", curto: "Informática", bloco: "Básica", questoes: 6, peso: 1, simulado: 71,
    assuntos: [
      ["Segurança da informação", 28], ["Planilhas eletrônicas", 22], ["Redes e internet", 20],
      ["Editores de texto", 12], ["Sistemas operacionais", 10], ["Hardware", 8],
    ],
  },
  {
    id: "dcon", nome: "Direito Constitucional", curto: "D. Constitucional", bloco: "Específica", questoes: 10, peso: 2, simulado: 63,
    assuntos: [
      ["Direitos e garantias fundamentais", 26], ["Administração Pública (arts. 37 a 41)", 18],
      ["Organização do Estado", 16], ["Poder Legislativo", 12], ["Poder Judiciário", 10], ["Poder Executivo", 9],
      ["Controle de constitucionalidade", 6], ["Princípios fundamentais", 3],
    ],
  },
  {
    id: "dadm", nome: "Direito Administrativo", curto: "D. Administrativo", bloco: "Específica", questoes: 15, peso: 2, simulado: 38,
    assuntos: [
      ["Licitações e contratos (Lei 14.133/2021)", 22], ["Atos administrativos", 20],
      ["Agentes públicos e Lei 8.112/1990", 16], ["Poderes administrativos", 10], ["Organização administrativa", 10],
      ["Improbidade administrativa", 9], ["Responsabilidade civil do Estado", 7], ["Controle da Administração", 6],
    ],
  },
  {
    id: "afo", nome: "Administração Financeira e Orçamentária", curto: "AFO", bloco: "Específica", questoes: 8, peso: 2, simulado: 31,
    assuntos: [
      ["Ciclo orçamentário (PPA, LDO, LOA)", 22], ["Princípios orçamentários", 18], ["Despesa pública", 18],
      ["Receita pública", 16], ["Créditos adicionais", 12], ["Lei de Responsabilidade Fiscal", 10],
      ["Restos a pagar e despesas de exercícios anteriores", 4],
    ],
  },
  {
    id: "admp", nome: "Administração Pública", curto: "Adm. Pública", bloco: "Específica", questoes: 8, peso: 2, simulado: 54,
    assuntos: [
      ["Gestão de pessoas", 20], ["Modelos de administração pública", 18], ["Planejamento estratégico", 16],
      ["Gestão de processos", 14], ["Governança e accountability", 14], ["Gestão de projetos", 10],
      ["Comportamento organizacional", 8],
    ],
  },
];

const DISCIPLINES = RAW_DISCIPLINES.map((d, i) => ({
  ...d,
  cor: `var(--s${i + 1})`,
  assuntos: d.assuntos.map(([nome, incidencia], j) => ({ id: `${d.id}-${j + 1}`, nome, incidencia })),
}));
const DISC_BY_ID = Object.fromEntries(DISCIPLINES.map((d) => [d.id, d]));
const TOTAL_PONTOS = DISCIPLINES.reduce((s, d) => s + d.questoes * d.peso, 0);
const TOTAL_QUESTOES = DISCIPLINES.reduce((s, d) => s + d.questoes, 0);
const MAX_INCIDENCIA = Math.max(...DISCIPLINES.flatMap((d) => d.assuntos.map((a) => a.incidencia)));
const MAX_SHARE = Math.max(...DISCIPLINES.map((d) => (d.questoes * d.peso) / TOTAL_PONTOS));

/* ───────────────────────────── Regras de negócio ────────────────────────── */

const LEVELS = [
  { id: "ini", label: "Iniciante", fator: 1.6, mix: { T: 0.45, Q: 0.35, R: 0.2 } },
  { id: "int", label: "Intermediário", fator: 1.0, mix: { T: 0.3, Q: 0.45, R: 0.25 } },
  { id: "ava", label: "Avançado", fator: 0.5, mix: { T: 0.1, Q: 0.7, R: 0.2 } },
];
const LEVEL_BY_ID = Object.fromEntries(LEVELS.map((l) => [l.id, l]));
const BASE_LEVEL = "int"; // referência "sem nivelamento"

const TYPES = {
  T: { label: "Teoria", Icon: BookOpen, color: "var(--mix-t)" },
  Q: { label: "Questões", Icon: ListChecks, color: "var(--mix-q)" },
  R: { label: "Revisão", Icon: Repeat, color: "var(--mix-r)" },
};
const TYPE_KEYS = ["T", "Q", "R"];

const SLOT_MIN = 30;
const RETA_FINAL_DIAS = 14; // nas duas últimas semanas, 70% da teoria migra para questões e revisão
const MAX_DIAS = 1095;
const DIAS_SEMANA = [
  { value: 5, label: "5", hint: "Seg–Sex" },
  { value: 6, label: "6", hint: "Seg–Sáb" },
  { value: 7, label: "7", hint: "Todos" },
];

const prioridadeDisciplina = (pct) => (pct >= 20 ? 5 : pct >= 15 ? 4 : pct >= 10 ? 3 : pct >= 6 ? 2 : 1);
const prioridadeAssunto = (pts) => (pts >= 4 ? 5 : pts >= 2.5 ? 4 : pts >= 1.5 ? 3 : pts >= 0.8 ? 2 : 1);
const faixa = (p) => (p >= 4 ? "hi" : p === 3 ? "md" : "lo");
const FAIXA_LABEL = { hi: "Alta", md: "Média", lo: "Baixa" };
const levelFromScore = (s) => (s >= 75 ? "ava" : s >= 50 ? "int" : "ini");

function computeDossier(included) {
  return DISCIPLINES.map((d) => {
    const pontos = d.questoes * d.peso;
    const share = pontos / TOTAL_PONTOS;
    const topics = d.assuntos
      .map((a) => {
        const esperado = (pontos * a.incidencia) / 100;
        return { ...a, discId: d.id, esperado, prioridade: prioridadeAssunto(esperado), ativo: included ? !!included[a.id] : true };
      })
      .sort((a, b) => b.esperado - a.esperado);
    const ativos = topics.filter((t) => t.ativo);
    return {
      ...d,
      pontos,
      share,
      prioridade: prioridadeDisciplina(share * 100),
      topics,
      ativos: ativos.length,
      top3: topics.slice(0, 3).reduce((s, t) => s + t.incidencia, 0) / 100,
    };
  });
}

function computeCoverage(dossier) {
  const all = dossier.flatMap((d) => d.topics);
  const ativos = all.filter((t) => t.ativo);
  const pontos = ativos.reduce((s, t) => s + t.esperado, 0);
  return { total: all.length, ativos: ativos.length, descartados: all.length - ativos.length, share: pontos / TOTAL_PONTOS };
}

function computePlan(dossier, levels, totalHours) {
  const rows = dossier.map((d) => {
    const somaP = d.topics.filter((t) => t.ativo).reduce((s, t) => s + t.prioridade, 0);
    return {
      id: d.id,
      somaP,
      demanda: somaP * LEVEL_BY_ID[levels[d.id]].fator,
      demandaBase: somaP * LEVEL_BY_ID[BASE_LEVEL].fator,
    };
  });
  const total = rows.reduce((s, r) => s + r.demanda, 0);
  const totalBase = rows.reduce((s, r) => s + r.demandaBase, 0);
  const byId = {};
  for (const r of rows) {
    const share = total > 0 ? r.demanda / total : 0;
    const shareBase = totalBase > 0 ? r.demandaBase / totalBase : 0;
    byId[r.id] = { ...r, share, horas: totalHours * share, horasBase: totalHours * shareBase, delta: totalHours * (share - shareBase) };
  }
  const list = Object.values(byId);
  return {
    byId,
    totalDemanda: total,
    realocado: list.reduce((s, r) => s + Math.max(0, r.delta), 0),
    maxHoras: Math.max(0, ...list.map((r) => r.horas)),
  };
}

function mixFor(levelId, retaFinal) {
  const m = LEVEL_BY_ID[levelId].mix;
  if (!retaFinal) return m;
  const moved = m.T * 0.7;
  return { T: m.T - moved, Q: m.Q + moved / 2, R: m.R + moved / 2 };
}

/* ───────────────────────────── Datas e formatos ─────────────────────────── */

const pad = (n) => String(n).padStart(2, "0");
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const diffDays = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 ? d : null;
};
const parseTime = (s) => {
  const m = /^(\d{2}):(\d{2})/.exec(s || "");
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return +m[1] * 60 + +m[2];
};
const isStudyDay = (date, dpw) => {
  const w = date.getDay();
  if (dpw >= 7) return true;
  if (dpw === 6) return w !== 0;
  return w !== 0 && w !== 6;
};

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const fmtH = (h) => `${nf1.format(Math.round(h * 10) / 10)}h`;
const fmtPct = (x, digits = 1) => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(x * 100)}%`;
const fmtDM = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
const fmtDMY = (d) => `${fmtDM(d)}/${d.getFullYear()}`;
const fmtClock = (min) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};
const fmtSlots = (slots) => {
  const min = slots * SLOT_MIN;
  const h = Math.floor(min / 60);
  const r = min % 60;
  if (!h) return `${r}min`;
  return r ? `${h}h${pad(r)}` : `${h}h`;
};

/* ───────────────────────────── Prazo e carga ────────────────────────────── */

function computeTimebox({ examDate, hoursPerDay, daysPerWeek, startTime }, today) {
  const errors = {};
  const exam = parseISO(examDate);
  const h = Number(String(hoursPerDay).replace(",", "."));
  const startMin = parseTime(startTime);

  if (!exam) errors.examDate = "Informe uma data válida.";
  else {
    const n = diffDays(today, exam);
    if (n <= 0) errors.examDate = "A prova precisa ser depois de hoje.";
    else if (n > MAX_DIAS) errors.examDate = "Horizonte máximo de 3 anos.";
  }
  if (!Number.isFinite(h) || h < 0.5 || h > 14) errors.hoursPerDay = "Use entre 0,5h e 14h por dia.";
  else if (Math.abs(h * 2 - Math.round(h * 2)) > 1e-9) errors.hoursPerDay = "Use múltiplos de 30 min (ex.: 2,5).";
  if (startMin === null) errors.startTime = "Informe um horário válido.";
  if (Object.keys(errors).length) return { ok: false, errors };

  const daysUntil = diffDays(today, exam);
  let studyDays = 0;
  for (let i = 0; i < daysUntil; i++) if (isStudyDay(addDays(today, i), daysPerWeek)) studyDays++;
  if (!studyDays) return { ok: false, errors: { examDate: "Não há dia de estudo antes da prova." } };

  return {
    ok: true,
    errors,
    exam,
    daysUntil,
    studyDays,
    daysPerWeek,
    hoursPerDay: h,
    slotsPerDay: Math.round(h * 2),
    totalHours: studyDays * h,
    weeks: Math.ceil((daysUntil + 1) / 7),
    startMin,
    retaFinal: addDays(exam, -RETA_FINAL_DIAS),
  };
}

/* ───────────────────────────── Gerador do roteiro ───────────────────────── */

// Distribui `total` slots entre direitos fracionários em passos de `step` (blocos de 1h quando possível).
function allocateInSteps(entitlement, total, step) {
  const out = entitlement.map(() => 0);
  let remaining = total;
  while (remaining > 0 && out.length) {
    const s = Math.min(step, remaining);
    let best = 0;
    for (let i = 1; i < out.length; i++) if (entitlement[i] - out[i] > entitlement[best] - out[best]) best = i;
    out[best] += s;
    remaining -= s;
  }
  return out;
}

// Divide n slots em blocos de no máximo `max` slots, com tamanhos equilibrados.
function chunk(n, max) {
  if (n <= 0) return [];
  const k = Math.ceil(n / max);
  const base = Math.floor(n / k);
  const rem = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < rem ? 1 : 0));
}

// Rodízio ponderado suave: assuntos aparecem na proporção da prioridade, intercalados.
function nextTopic(state, topics) {
  let total = 0;
  let best = null;
  for (const t of topics) {
    state[t.id] = (state[t.id] || 0) + t.prioridade;
    total += t.prioridade;
    if (!best || state[t.id] > state[best.id]) best = t;
  }
  state[best.id] -= total;
  return best;
}

// Preenche cada dia escolhendo a disciplina mais atrasada em relação à sua cota proporcional da semana.
function distribute(days, queues, rank, startMin) {
  const ids = Object.keys(queues);
  const total = Object.fromEntries(ids.map((id) => [id, queues[id].reduce((s, b) => s + b.slots, 0)]));
  const capTotal = days.reduce((s, d) => s + d.cap, 0);
  const placed = Object.fromEntries(ids.map((id) => [id, 0]));
  let cum = 0;
  for (const day of days) {
    if (!day.cap) continue;
    cum += day.cap;
    let rem = day.cap;
    let cursor = startMin;
    const used = new Set();
    const deficit = (id) => (total[id] * cum) / capTotal - placed[id];
    while (rem > 0) {
      const pending = ids.filter((id) => queues[id].length > 0);
      if (!pending.length) break;
      const fresh = pending.filter((id) => !used.has(id));
      let pool = fresh.length ? fresh : pending;
      const fits = pool.filter((id) => queues[id][0].slots <= rem);
      if (fits.length) pool = fits;
      pool.sort((a, b) => deficit(b) - deficit(a) || rank[a] - rank[b]);
      const id = pool[0];
      const head = queues[id][0];
      const take = Math.min(head.slots, rem);
      if (take === head.slots) queues[id].shift();
      else head.slots -= take;
      const last = day.blocks[day.blocks.length - 1];
      if (last && last.discId === id && last.type === head.type && last.topic.id === head.topic.id) {
        last.slots += take;
        last.end += take * SLOT_MIN;
      } else {
        day.blocks.push({ discId: id, type: head.type, topic: head.topic, slots: take, start: cursor, end: cursor + take * SLOT_MIN });
      }
      cursor += take * SLOT_MIN;
      rem -= take;
      placed[id] += take;
      used.add(id);
    }
  }
}

function buildWeek({ dossier, plan, levels, tb, week, today }) {
  const discs = dossier
    .filter((d) => plan.byId[d.id].share > 0)
    .map((d) => ({
      id: d.id,
      share: plan.byId[d.id].share,
      active: d.topics.filter((t) => t.ativo).sort((a, b) => b.prioridade - a.prioridade || b.esperado - a.esperado),
    }));
  const rank = Object.fromEntries([...discs].sort((a, b) => b.share - a.share).map((x, i) => [x.id, i]));
  const maxBlock = Math.max(1, Math.min(4, Math.ceil(tb.slotsPerDay / 2)));
  const step = Math.min(2, maxBlock);
  const state = Object.fromEntries(
    discs.map((x) => [x.id, { carry: 0, typeCarry: [0, 0, 0], rrT: {}, rrQ: {}, rrR: {}, studied: new Map(), tick: 0 }])
  );

  for (let w = 1; w <= week; w++) {
    const weekStart = addDays(today, (w - 1) * 7);
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      const toExam = diffDays(date, tb.exam);
      const status = toExam < 0 ? "after" : toExam === 0 ? "exam" : isStudyDay(date, tb.daysPerWeek) ? "study" : "rest";
      return { date, status, cap: status === "study" ? tb.slotsPerDay : 0, blocks: [] };
    });
    const capacity = days.reduce((s, d) => s + d.cap, 0);
    const retaFinal = diffDays(weekStart, tb.exam) <= RETA_FINAL_DIAS;

    const entitlement = discs.map((x) => capacity * x.share + state[x.id].carry);
    const alloc = allocateInSteps(entitlement, capacity, step);
    const queues = {};

    discs.forEach((x, i) => {
      const s = state[x.id];
      s.carry = entitlement[i] - alloc[i];
      queues[x.id] = [];
      const n = alloc[i];
      if (!n) return;
      const mix = mixFor(levels[x.id], retaFinal);
      const typeEnt = TYPE_KEYS.map((k, j) => n * mix[k] + s.typeCarry[j]);
      const [nT, nQ, nR] = allocateInSteps(typeEnt, n, step);
      s.typeCarry = typeEnt.map((v, j) => v - [nT, nQ, nR][j]);
      const theory = [];
      for (const size of chunk(nT, maxBlock)) {
        const topic = nextTopic(s.rrT, x.active);
        theory.push(topic);
        queues[x.id].push({ type: "T", slots: size, topic });
      }
      chunk(nQ, maxBlock).forEach((size, j) => {
        const topic = theory.length ? theory[j % theory.length] : nextTopic(s.rrQ, x.active);
        queues[x.id].push({ type: "Q", slots: size, topic });
      });
      chunk(nR, maxBlock).forEach((size, j) => {
        const pool = [...s.studied.values()];
        let topic;
        if (pool.length) {
          pool.sort((a, b) => a.last - b.last || b.topic.prioridade - a.topic.prioridade);
          pool[0].last = ++s.tick;
          topic = pool[0].topic;
        } else if (theory.length) topic = theory[j % theory.length];
        else topic = nextTopic(s.rrR, x.active);
        queues[x.id].push({ type: "R", slots: size, topic });
      });
      for (const t of theory) if (!s.studied.has(t.id)) s.studied.set(t.id, { topic: t, last: 0 });
    });

    if (w === week) {
      distribute(days, queues, rank, tb.startMin);
      const totals = discs
        .map((x, i) => ({ id: x.id, slots: alloc[i] }))
        .filter((t) => t.slots > 0)
        .sort((a, b) => b.slots - a.slots || rank[a.id] - rank[b.id]);
      return {
        days,
        weekStart,
        weekEnd: addDays(weekStart, 6),
        retaFinal,
        capacity,
        totals,
        blocks: days.reduce((s, d) => s + d.blocks.length, 0),
      };
    }
  }
  return null;
}

/* ───────────────────────────── Estado inicial ───────────────────────────── */

const BASE_DOSSIER = computeDossier(null);
const SUGGESTED_INCLUDED = Object.fromEntries(BASE_DOSSIER.flatMap((d) => d.topics.map((t) => [t.id, t.prioridade >= 2])));
const DIAGNOSTIC_LEVELS = Object.fromEntries(DISCIPLINES.map((d) => [d.id, levelFromScore(d.simulado)]));

function makeDefaults() {
  return {
    levels: DIAGNOSTIC_LEVELS,
    included: SUGGESTED_INCLUDED,
    examDate: toISO(addDays(startOfDay(new Date()), 120)),
    hoursPerDay: "3",
    daysPerWeek: 6,
    startTime: "19:00",
  };
}

/* ───────────────────────────── Componentes de UI ────────────────────────── */

function Dot({ color, size = "h-2.5 w-2.5" }) {
  return <span aria-hidden="true" className={`${size} inline-block shrink-0 rounded-full`} style={{ background: color }} />;
}

function PriorityTag({ p }) {
  const f = faixa(p);
  return (
    <span className={`cg-pri-${f} inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold`}>{FAIXA_LABEL[f]}</span>
  );
}

// Prioridade 1–5 desenhada como bolhas de cartão-resposta.
function Bubbles({ value }) {
  return (
    <span className="inline-flex items-center gap-1.5" role="img" aria-label={`Prioridade ${value} de 5`}>
      <span className="inline-flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`h-2.5 w-2.5 rounded-full cg-bubble ${i <= value ? "cg-bubble-on" : ""}`} />
        ))}
      </span>
      <span className="cg-mono text-xs font-semibold cg-ink2">P{value}</span>
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

function Segmented({ label, options, value, onChange, size = "sm" }) {
  const pad = size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm";
  return (
    <div role="radiogroup" aria-label={label} className="cg-seg inline-flex max-w-full rounded-lg p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`cg-seg-opt ${pad} whitespace-nowrap rounded-md font-semibold transition-colors`}
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

function Delta({ value }) {
  if (Math.abs(value) < 0.05) {
    return (
      <span className="inline-flex w-20 shrink-0 items-center justify-end gap-0.5 text-xs cg-muted cg-num">
        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
        0h
      </span>
    );
  }
  const up = value > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex w-20 shrink-0 items-center justify-end gap-0.5 text-xs font-semibold cg-num ${up ? "cg-accent-ink" : "cg-ink2"}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {up ? "+" : "−"}
      {fmtH(Math.abs(value))}
    </span>
  );
}

function MixBar({ mix, horas }) {
  const label = TYPE_KEYS.map((k) => `${TYPES[k].label} ${fmtPct(mix[k], 0)}`).join(", ");
  return (
    <div className="min-w-0">
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={label}>
        {TYPE_KEYS.map((k) =>
          mix[k] > 0 ? (
            <span
              key={k}
              title={`${TYPES[k].label}: ${fmtPct(mix[k], 0)} · ${fmtH(horas * mix[k])}`}
              style={{ width: `${mix[k] * 100}%`, background: TYPES[k].color }}
            />
          ) : null
        )}
      </div>
      <p className="mt-1 cg-mono text-xs cg-muted cg-num">
        T {Math.round(mix.T * 100)} · Q {Math.round(mix.Q * 100)} · R {Math.round(mix.R * 100)}
      </p>
    </div>
  );
}

function StatTile({ label, value, sub }) {
  return (
    <div className="cg-surface flex min-w-0 flex-col gap-1 p-4">
      <p className="text-xs font-semibold cg-ink2">{label}</p>
      <p className="text-2xl font-extrabold tracking-tight md:text-3xl">{value}</p>
      <p className="text-xs cg-muted">{sub}</p>
    </div>
  );
}

function Field({ id, label, error, hint, children }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold cg-ink2">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-erro`} className="text-xs font-medium cg-error">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs cg-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/* ── Fase 1 ── */

function DossierPanel({ dossier, coverage, expanded, onToggleExpand, onToggleTopic, onReset }) {
  return (
    <section id="dossie" className="cg-anchor flex flex-col gap-4">
      <SectionHead
        step="Fase 1 · Inteligência de dados"
        title="Dossiê da Banca"
        desc="Edital cruzado com o histórico da banca. Pontos esperados do assunto = pontos da disciplina × incidência. Prioridade 1 entra como descarte sugerido."
        right={
          <>
            <p className="text-sm cg-ink2">
              <b className="cg-ink">{coverage.descartados}</b> assuntos descartados · custo de{" "}
              <b className="cg-ink">{fmtPct(1 - coverage.share)}</b> dos pontos
            </p>
            <button type="button" onClick={onReset} className="cg-btn-ghost inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Restaurar sugestão
            </button>
          </>
        }
      />
      <div className="cg-surface overflow-x-auto rounded-xl border cg-line">
        <table className="w-full border-collapse text-sm" style={{ minWidth: 880 }}>
          <thead>
            <tr className="text-left text-xs cg-muted">
              <th className="px-4 py-2.5 font-semibold" style={{ width: "30%" }}>Disciplina</th>
              <th className="px-3 py-2.5 text-right font-semibold">Questões</th>
              <th className="px-3 py-2.5 text-right font-semibold">Peso</th>
              <th className="px-3 py-2.5 text-right font-semibold">Pontos</th>
              <th className="px-3 py-2.5 font-semibold">% da prova</th>
              <th className="px-3 py-2.5 font-semibold">Prioridade</th>
              <th className="px-4 py-2.5 text-right font-semibold">Assuntos ativos</th>
            </tr>
          </thead>
          <tbody>
            {dossier.map((d) => {
              const open = expanded.has(d.id);
              return (
                <React.Fragment key={d.id}>
                  <tr className="cg-row-hover border-t cg-line">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onToggleExpand(d.id)}
                        aria-expanded={open}
                        aria-controls={`assuntos-${d.id}`}
                        className="flex items-center gap-2.5 rounded text-left"
                      >
                        <ChevronDown className={`h-4 w-4 shrink-0 cg-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
                        <Dot color={d.cor} />
                        <span className="min-w-0">
                          <span className="block font-semibold leading-snug">{d.nome}</span>
                          <span className="block text-xs cg-muted">{d.bloco}</span>
                        </span>
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right cg-num">{d.questoes}</td>
                    <td className="px-3 py-3 text-right cg-num cg-ink2">×{d.peso}</td>
                    <td className="px-3 py-3 text-right font-bold cg-num">{d.pontos}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="cg-track h-2 w-24 overflow-hidden rounded-full">
                          <div className="h-full" style={{ width: `${(d.share / MAX_SHARE) * 100}%`, background: "var(--bar)", borderRadius: "0 4px 4px 0" }} />
                        </div>
                        <span className="w-12 text-xs cg-num cg-ink2">{fmtPct(d.share)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <PriorityTag p={d.prioridade} />
                        <Bubbles value={d.prioridade} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right cg-num">
                      <b>{d.ativos}</b>
                      <span className="cg-muted">/{d.topics.length}</span>
                    </td>
                  </tr>
                  {open ? (
                    <tr id={`assuntos-${d.id}`}>
                      <td colSpan={7} className="cg-sunken border-t cg-line px-4 py-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs cg-muted">
                          <span>
                            Incidência por assunto nas últimas {EXAM.provas} provas · {d.pontos} pontos em jogo
                          </span>
                          <span>3 assuntos concentram {fmtPct(d.top3, 0)} das questões</span>
                        </div>
                        <ul className="cg-rows">
                          {d.topics.map((t) => (
                            <li key={t.id} className="grid grid-cols-12 items-center gap-3 py-2">
                              <div className="col-span-5 min-w-0">
                                <p className={`text-sm leading-snug ${t.ativo ? "font-medium" : "cg-muted line-through"}`}>{t.nome}</p>
                                {t.prioridade === 1 ? <p className="cg-mono text-xs cg-muted">descarte sugerido</p> : null}
                              </div>
                              <div className="col-span-3 flex items-center gap-2">
                                <div className="cg-track h-1.5 flex-1 overflow-hidden rounded-full">
                                  <div
                                    className="h-full"
                                    style={{ width: `${(t.incidencia / MAX_INCIDENCIA) * 100}%`, background: d.cor, borderRadius: "0 4px 4px 0" }}
                                  />
                                </div>
                                <span className="w-9 text-right text-xs cg-num cg-ink2">{t.incidencia}%</span>
                              </div>
                              <div className="col-span-1 text-right text-xs cg-num cg-ink2">{nf1.format(t.esperado)} pts</div>
                              <div className="col-span-2 flex items-center gap-2">
                                <Bubbles value={t.prioridade} />
                              </div>
                              <div className="col-span-1 flex items-center justify-end gap-2">
                                <Switch checked={t.ativo} onChange={(v) => onToggleTopic(t.id, v)} label={`Incluir ${t.nome} no cronograma`} />
                              </div>
                            </li>
                          ))}
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
    </section>
  );
}

/* ── Fase 2 ── */

function LevelPanel({ dossier, plan, levels, onLevel, onReset, hasHours }) {
  return (
    <section id="nivelamento" className="cg-anchor flex flex-col gap-4">
      <SectionHead
        step="Fase 2 · Nivelamento e personalização"
        title="Nivelamento"
        desc="Nível inicial vem do simulado diagnóstico (≥ 75% Avançado · 50–74% Intermediário · < 50% Iniciante). Ajuste e as horas recalculam na hora."
        right={
          <button type="button" onClick={onReset} className="cg-btn-ghost inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Restaurar diagnóstico
          </button>
        }
      />
      <div className="cg-surface overflow-hidden rounded-xl border cg-line">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b cg-line px-4 py-3">
          <p className="text-sm cg-ink2">
            <b className="cg-mark cg-ink">{hasHours ? fmtH(plan.realocado) : "—"} realocadas</b> de disciplinas dominadas para lacunas de alta
            prioridade, comparado a um plano sem nivelamento.
          </p>
          <ul className="flex flex-wrap items-center gap-3 text-xs cg-ink2" aria-label="Legenda do mix de estudo">
            {TYPE_KEYS.map((k) => (
              <li key={k} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: TYPES[k].color }} aria-hidden="true" />
                {k} · {TYPES[k].label}
              </li>
            ))}
          </ul>
        </div>
        <div className="hidden grid-cols-12 gap-4 border-b cg-line px-4 py-2 text-xs font-semibold cg-muted lg:grid">
          <span className="col-span-3">Disciplina</span>
          <span className="col-span-4">Simulado e nível</span>
          <span className="col-span-3">Horas até a prova · vs. sem nivelamento</span>
          <span className="col-span-2">Mix de estudo (%)</span>
        </div>
        <ul className="cg-rows">
          {dossier.map((d) => {
            const r = plan.byId[d.id];
            const lvl = levels[d.id];
            const ajustado = lvl !== levelFromScore(d.simulado);
            const semAssuntos = r.somaP === 0;
            return (
              <li key={d.id} className="grid grid-cols-1 gap-3 px-4 py-3 lg:grid-cols-12 lg:items-center lg:gap-4">
                <div className="flex min-w-0 items-center gap-2 lg:col-span-3">
                  <Dot color={d.cor} />
                  <span className="min-w-0 text-sm font-semibold leading-snug">{d.nome}</span>
                  <PriorityTag p={d.prioridade} />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 lg:col-span-4">
                  <span className="w-24 shrink-0 cg-mono text-xs cg-num">
                    <span className="cg-muted">Simul.</span> <b>{d.simulado}%</b>
                    {ajustado ? <span className="block cg-muted">ajustado</span> : null}
                  </span>
                  <Segmented
                    label={`Nível em ${d.nome}`}
                    options={LEVELS.map((l) => ({ value: l.id, label: l.label }))}
                    value={lvl}
                    onChange={(v) => onLevel(d.id, v)}
                  />
                </div>
                <div className="flex items-center gap-3 lg:col-span-3">
                  <div className="cg-track h-2 min-w-0 flex-1 overflow-hidden rounded-full">
                    <div
                      className="h-full transition-all"
                      style={{ width: `${plan.maxHoras ? (r.horas / plan.maxHoras) * 100 : 0}%`, background: "var(--bar)", borderRadius: "0 4px 4px 0" }}
                    />
                  </div>
                  <span className="w-14 shrink-0 text-right text-sm font-bold cg-num">{hasHours ? fmtH(r.horas) : "—"}</span>
                  {hasHours ? <Delta value={r.delta} /> : <span className="w-20" />}
                </div>
                <div className="lg:col-span-2">
                  {semAssuntos ? (
                    <p className="text-xs cg-muted">Sem assuntos ativos</p>
                  ) : (
                    <MixBar mix={LEVEL_BY_ID[lvl].mix} horas={r.horas} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* ── Fase 3 ── */

function TimeboxPanel({ today, form, setForm, tb, canGenerate, genError, onGenerate }) {
  const set = (k) => (e) => setForm(k, e.target.value);
  return (
    <section id="prazo" className="cg-anchor flex flex-col gap-4">
      <SectionHead
        step="Fase 3 · Otimização de prazo e carga horária"
        title="Prazo e carga horária"
        desc="Horas líquidas até a prova divididas por prioridade × nível, em blocos de 30 min."
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onGenerate();
        }}
        className="cg-surface grid gap-5 rounded-xl border cg-line p-4 lg:grid-cols-3 lg:p-5"
        noValidate
      >
        <div className="grid content-start gap-4 sm:grid-cols-2 lg:col-span-2">
          <Field id="exam-date" label="Data da prova" error={tb.errors.examDate}>
            <input
              id="exam-date"
              type="date"
              min={toISO(addDays(today, 1))}
              value={form.examDate}
              onChange={set("examDate")}
              aria-invalid={!!tb.errors.examDate}
              aria-describedby={tb.errors.examDate ? "exam-date-erro" : undefined}
              className="cg-input h-10 w-full rounded-lg px-3 text-sm cg-num"
            />
          </Field>
          <Field id="hours-day" label="Horas disponíveis por dia" error={tb.errors.hoursPerDay} hint="Múltiplos de 0,5h">
            <input
              id="hours-day"
              type="number"
              inputMode="decimal"
              min="0.5"
              max="14"
              step="0.5"
              value={form.hoursPerDay}
              onChange={set("hoursPerDay")}
              aria-invalid={!!tb.errors.hoursPerDay}
              aria-describedby={tb.errors.hoursPerDay ? "hours-day-erro" : undefined}
              className="cg-input h-10 w-full rounded-lg px-3 text-sm cg-num"
            />
          </Field>
          <fieldset className="flex min-w-0 flex-col gap-1.5">
            <legend className="mb-1.5 text-xs font-semibold cg-ink2">Dias de estudo por semana</legend>
            <Segmented
              label="Dias de estudo por semana"
              size="md"
              options={DIAS_SEMANA}
              value={form.daysPerWeek}
              onChange={(v) => setForm("daysPerWeek", v)}
            />
          </fieldset>
          <Field id="start-time" label="Início dos estudos" error={tb.errors.startTime} hint="Horário do primeiro bloco do dia">
            <input
              id="start-time"
              type="time"
              value={form.startTime}
              onChange={set("startTime")}
              aria-invalid={!!tb.errors.startTime}
              aria-describedby={tb.errors.startTime ? "start-time-erro" : undefined}
              className="cg-input h-10 w-full rounded-lg px-3 text-sm cg-num"
            />
          </Field>
        </div>
        <div className="cg-sunken flex flex-col justify-between gap-4 rounded-lg p-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-xs cg-muted">Dias de estudo</dt>
              <dd className="font-bold cg-num">{tb.ok ? tb.studyDays : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs cg-muted">Horas por semana</dt>
              <dd className="font-bold cg-num">{tb.ok ? fmtH(tb.hoursPerDay * tb.daysPerWeek) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs cg-muted">Semanas até a prova</dt>
              <dd className="font-bold cg-num">{tb.ok ? tb.weeks : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs cg-muted">Reta final desde</dt>
              <dd className="font-bold cg-num">{tb.ok ? fmtDM(tb.retaFinal) : "—"}</dd>
            </div>
          </dl>
          <div className="flex flex-col gap-2">
            <button
              type="submit"
              disabled={!canGenerate}
              className="cg-btn-primary inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold transition-colors"
            >
              <CalendarCheck className="h-4 w-4" aria-hidden="true" />
              Gerar Cronograma Estratégico
            </button>
            {genError ? <p className="text-xs font-medium cg-error">{genError}</p> : null}
          </div>
        </div>
      </form>
    </section>
  );
}

/* ── Roteiro ── */

function BlockCard({ block }) {
  const d = DISC_BY_ID[block.discId];
  const type = TYPES[block.type];
  return (
    <article className="cg-surface rounded-lg border cg-line p-2.5" data-disc={block.discId} data-slots={block.slots}>
      <div className="flex items-center justify-between gap-2 cg-mono text-xs cg-num">
        <span className="cg-ink2">
          {fmtClock(block.start)}–{fmtClock(block.end)}
        </span>
        <span className="font-semibold">{fmtSlots(block.slots)}</span>
      </div>
      <p className="mt-1.5 flex items-center gap-1.5 text-sm font-bold leading-snug">
        <Dot color={d.cor} size="h-2 w-2" />
        <span className="min-w-0">{d.curto}</span>
      </p>
      <p className="mt-0.5 text-xs leading-snug cg-ink2">{block.topic.nome}</p>
      <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold cg-muted">
        <type.Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {type.label}
      </p>
    </article>
  );
}

function DayColumn({ day }) {
  const dow = day.date.getDay();
  return (
    <div className="cg-sunken flex min-w-0 flex-col gap-2 rounded-xl p-2" data-day-status={day.status} data-day-cap={day.cap}>
      <div className="flex items-baseline justify-between gap-2 px-1 pt-0.5">
        <p className="text-sm font-bold">
          {WEEKDAYS[dow]} <span className="cg-mono text-xs font-normal cg-muted">{fmtDM(day.date)}</span>
        </p>
        {day.status === "study" ? <span className="cg-mono text-xs font-semibold cg-ink2">{fmtSlots(day.cap)}</span> : null}
      </div>
      {day.status === "rest" ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed cg-line px-3 py-4 text-xs cg-muted">
          <Coffee className="h-4 w-4" aria-hidden="true" />
          Descanso
        </div>
      ) : null}
      {day.status === "exam" ? (
        <div className="cg-exam flex items-center gap-2 rounded-lg px-3 py-4 text-xs font-bold">
          <Flag className="h-4 w-4" aria-hidden="true" />
          Dia da prova
        </div>
      ) : null}
      {day.status === "after" ? <div className="rounded-lg border border-dashed cg-line px-3 py-4 text-xs cg-muted">Após a prova</div> : null}
      {day.blocks.map((b, i) => (
        <BlockCard key={i} block={b} />
      ))}
    </div>
  );
}

function RoadmapPanel({ sectionRef, schedule, snapInfo, week, setWeek, stale, canGenerate, onGenerate }) {
  if (!schedule) return null;
  const { weeks } = snapInfo;
  return (
    <section id="roteiro" ref={sectionRef} className="cg-anchor flex flex-col gap-4">
      <SectionHead
        step="Fase 3 · Entrega"
        title="Roteiro da Semana"
        desc={`Gerado às ${fmtClock(snapInfo.at.getHours() * 60 + snapInfo.at.getMinutes())}. Revisões puxam assuntos estudados em semanas anteriores.`}
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setWeek(week - 1)}
              disabled={week <= 1}
              aria-label="Semana anterior"
              className="cg-btn-ghost grid h-9 w-9 place-items-center rounded-lg"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="min-w-32 text-center" aria-live="polite">
              <p className="text-sm font-bold cg-num">
                Semana {week} de {weeks}
              </p>
              <p className="cg-mono text-xs cg-muted cg-num">
                {fmtDM(schedule.weekStart)} – {fmtDM(schedule.weekEnd)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWeek(week + 1)}
              disabled={week >= weeks}
              aria-label="Próxima semana"
              className="cg-btn-ghost grid h-9 w-9 place-items-center rounded-lg"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className={`${schedule.retaFinal ? "cg-pill-final" : "cg-pill-base"} rounded-md px-2 py-1 text-xs font-bold`}>
              {schedule.retaFinal ? "Reta final" : "Fase base"}
            </span>
          </div>
        }
      />

      {stale ? (
        <div role="status" className="cg-warn flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm">
          <span className="inline-flex items-center gap-2">
            <TriangleAlert className="cg-warn-icon h-4 w-4 shrink-0" aria-hidden="true" />
            Parâmetros alterados desde a última geração. O roteiro abaixo ainda usa os valores anteriores.
          </span>
          <button
            type="button"
            onClick={onGenerate}
            disabled={!canGenerate}
            className="cg-btn-primary inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold"
          >
            <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Gerar novamente
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm cg-ink2">
          <b className="cg-ink cg-num">{fmtSlots(schedule.capacity)}</b> na semana · <b className="cg-ink cg-num">{schedule.blocks}</b> blocos
        </p>
        <ul className="flex flex-wrap gap-2" aria-label="Horas por disciplina nesta semana">
          {schedule.totals.map((t) => {
            const d = DISC_BY_ID[t.id];
            return (
              <li key={t.id} className="cg-surface inline-flex items-center gap-1.5 rounded-md border cg-line px-2 py-1 text-xs" data-total-disc={t.id} data-total-slots={t.slots}>
                <Dot color={d.cor} size="h-2 w-2" />
                <span className="font-semibold">{d.curto}</span>
                <span className="cg-mono cg-ink2 cg-num">{fmtSlots(t.slots)}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {schedule.days.map((day) => (
          <DayColumn key={toISO(day.date)} day={day} />
        ))}
      </div>
    </section>
  );
}

function MethodNotes() {
  const items = [
    ["Prioridade do assunto", "Faixa de pontos esperados: ≥ 4 → P5 · ≥ 2,5 → P4 · ≥ 1,5 → P3 · ≥ 0,8 → P2 · abaixo → P1."],
    ["Horas por disciplina", "Horas líquidas × (Σ prioridades dos assuntos ativos × fator de nível) ÷ soma de todas as disciplinas."],
    ["Fator de nível", "Iniciante 1,6 · Intermediário 1,0 · Avançado 0,5. Avançado também reduz teoria e revisão no mix."],
    ["Blocos", "Slots de 30 min, alocados em passos de 1h e blocos de até 2h. Sobras de arredondamento passam para a semana seguinte. Reta final: 70% da teoria vira questões e revisão."],
  ];
  return (
    <section aria-labelledby="metodo" className="border-t cg-line pt-6">
      <h2 id="metodo" className="cg-eyebrow">
        Como o cálculo funciona
      </h2>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-sm font-bold">{k}</dt>
            <dd className="mt-0.5 text-xs leading-relaxed cg-ink2">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ───────────────────────────── App ──────────────────────────────────────── */

export default function App() {
  const [today] = useState(() => startOfDay(new Date()));
  const [defaults] = useState(makeDefaults);
  const [levels, setLevels] = useState(defaults.levels);
  const [included, setIncluded] = useState(defaults.included);
  const [form, setFormState] = useState({
    examDate: defaults.examDate,
    hoursPerDay: defaults.hoursPerDay,
    daysPerWeek: defaults.daysPerWeek,
    startTime: defaults.startTime,
  });
  const [expanded, setExpanded] = useState(() => new Set(["dadm"]));
  const [snapshot, setSnapshot] = useState(() => ({ config: defaults, at: new Date() }));
  const [week, setWeekState] = useState(1);
  const roadmapRef = useRef(null);

  const config = useMemo(() => ({ levels, included, ...form }), [levels, included, form]);

  // Estado ao vivo (Fases 1–3)
  const dossier = useMemo(() => computeDossier(included), [included]);
  const coverage = useMemo(() => computeCoverage(dossier), [dossier]);
  const tb = useMemo(() => computeTimebox(form, today), [form, today]);
  const plan = useMemo(() => computePlan(dossier, levels, tb.ok ? tb.totalHours : 0), [dossier, levels, tb]);

  // Roteiro gerado (congelado no último clique em "Gerar")
  const snap = useMemo(() => {
    const c = snapshot.config;
    const t = computeTimebox(c, today);
    if (!t.ok) return null;
    const d = computeDossier(c.included);
    const p = computePlan(d, c.levels, t.totalHours);
    if (!p.totalDemanda) return null;
    return { c, d, t, p, at: snapshot.at };
  }, [snapshot, today]);
  const weeks = snap ? snap.t.weeks : 1;
  const currentWeek = Math.min(Math.max(1, week), weeks);
  const schedule = useMemo(
    () => (snap ? buildWeek({ dossier: snap.d, plan: snap.p, levels: snap.c.levels, tb: snap.t, week: currentWeek, today }) : null),
    [snap, currentWeek, today]
  );

  const stale = JSON.stringify(snapshot.config) !== JSON.stringify(config);
  const genError = !tb.ok ? "Corrija os campos destacados." : !plan.totalDemanda ? "Nenhum assunto ativo na Fase 1." : null;
  const canGenerate = !genError;

  const setForm = (k, v) => setFormState((f) => ({ ...f, [k]: v }));
  const setWeek = (w) => setWeekState(Math.min(Math.max(1, w), weeks));
  const toggleExpand = (id) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleTopic = (id, v) => setIncluded((s) => ({ ...s, [id]: v }));
  const setLevel = (id, v) => setLevels((s) => ({ ...s, [id]: v }));

  const generate = () => {
    if (!canGenerate) return;
    setSnapshot({ config, at: new Date() });
    setWeekState(1);
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => roadmapRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }));
  };

  const nav = [
    ["#dossie", "1 · Dossiê"],
    ["#nivelamento", "2 · Nivelamento"],
    ["#prazo", "3 · Prazo e carga"],
    ["#roteiro", "Roteiro"],
  ];

  return (
    <div className="cg-app min-h-screen">
      <style>{CSS}</style>

      <header className="cg-header cg-surface border-b cg-line">
        <div className="cg-gutter cg-wrap flex items-center gap-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="cg-brand grid h-9 w-9 shrink-0 place-items-center rounded-md text-sm font-extrabold tracking-tight">2G</span>
            <div className="min-w-0 leading-tight">
              <p className="text-xs cg-muted">Mentoria 2G</p>
              <p className="truncate text-sm font-bold">Cronograma Inteligente</p>
            </div>
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
              <p className="cg-eyebrow">Edital-modelo · {EXAM.banca}</p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">{EXAM.cargo}</h1>
              <p className="mt-1 text-sm cg-ink2">
                {TOTAL_QUESTOES} questões · {TOTAL_PONTOS} pontos · histórico de {EXAM.provas} provas ({EXAM.periodo})
              </p>
            </div>
            <span className="cg-mono rounded-md border cg-line px-2 py-1 text-xs cg-muted">Dados de exemplo</span>
          </div>
          <div className="cg-hairlines grid grid-cols-2 gap-px overflow-hidden rounded-xl border cg-line lg:grid-cols-4">
            <StatTile label="Dias até a prova" value={tb.ok ? tb.daysUntil : "—"} sub={tb.ok ? `Prova em ${fmtDMY(tb.exam)}` : "Data inválida"} />
            <StatTile
              label="Horas líquidas"
              value={tb.ok ? fmtH(tb.totalHours) : "—"}
              sub={tb.ok ? `${tb.studyDays} dias de estudo × ${fmtH(tb.hoursPerDay)}` : "Revise a Fase 3"}
            />
            <StatTile label="Pontos esperados cobertos" value={fmtPct(coverage.share)} sub={`${coverage.ativos} de ${coverage.total} assuntos ativos`} />
            <StatTile label="Horas realocadas" value={tb.ok ? fmtH(plan.realocado) : "—"} sub="Pelo nivelamento, para lacunas de alta prioridade" />
          </div>
        </div>

        <DossierPanel
          dossier={dossier}
          coverage={coverage}
          expanded={expanded}
          onToggleExpand={toggleExpand}
          onToggleTopic={toggleTopic}
          onReset={() => setIncluded(SUGGESTED_INCLUDED)}
        />

        <LevelPanel
          dossier={dossier}
          plan={plan}
          levels={levels}
          onLevel={setLevel}
          onReset={() => setLevels(DIAGNOSTIC_LEVELS)}
          hasHours={tb.ok}
        />

        <TimeboxPanel today={today} form={form} setForm={setForm} tb={tb} canGenerate={canGenerate} genError={genError} onGenerate={generate} />

        {snap ? (
          <RoadmapPanel
            sectionRef={roadmapRef}
            schedule={schedule}
            snapInfo={{ weeks, at: snap.at }}
            week={currentWeek}
            setWeek={setWeek}
            stale={stale}
            canGenerate={canGenerate}
            onGenerate={generate}
          />
        ) : null}

        <MethodNotes />
      </main>
    </div>
  );
}
