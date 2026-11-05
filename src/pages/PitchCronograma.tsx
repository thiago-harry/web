import { useEffect, useMemo, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Target, Crosshair, Brain, CalendarClock, Scissors, Sparkles, Check, ArrowRight, ArrowLeft, RotateCcw, ChevronDown } from "lucide-react";
import { buildTopics, planSchedule, buildRoadmap, tierSummaries, type Profile, type PlanTopic } from "@/lib/pitch-planner";

const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const DOT = ["", "text-priority-1", "text-priority-2", "text-priority-3", "text-priority-4", "text-priority-5"];
const Dots = ({ n }: { n: number }) => <span className={`text-xs ${DOT[n]}`} title={`Prioridade ${n}`}>{"●".repeat(n)}</span>;
const toggle = (set: Set<string>, id: string, on?: boolean) => { const n = new Set(set); (on ?? !n.has(id)) ? n.add(id) : n.delete(id); return n; };

const TODAY = new Date();
const DEFAULT_EXAM = new Date("2027-01-31T08:00:00-03:00");
const toInput = (d: Date) => d.toISOString().slice(0, 10);

const steps = [
  { icon: Target, title: "Edital verticalizado", text: "Os 99 tópicos oficiais do TRT4 Técnico 2026 viram a matéria-prima do plano." },
  { icon: Crosshair, title: "Raio-X da banca", text: "Cada tópico recebe peso 1–5 conforme a incidência histórica da FCC e as provas mais recentes." },
  { icon: Brain, title: "Diagnóstico do aluno", text: "O simulado de nivelamento mostra onde o aluno já domina e onde está a lacuna." },
  { icon: CalendarClock, title: "Tempo até a prova", text: "Horas por dia × dias até a prova definem o orçamento real de estudo." },
  { icon: Scissors, title: "Corte estratégico", text: "O algoritmo escolhe o que rende mais pontos por hora e corta o resto com consciência." },
];

const profiles: { id: Profile; label: string }[] = [
  { id: "iniciante", label: "Iniciante" },
  { id: "intermediario", label: "Intermediário" },
  { id: "avancado", label: "Avançado" },
];

export default function PitchCronograma() {
  const [hours, setHours] = useState(3);
  const [exam, setExam] = useState(toInput(DEFAULT_EXAM));
  const [profile, setProfile] = useState<Profile>("intermediario");
  const [done, setDone] = useState<Set<string>>(new Set());
  const [forceIn, setForceIn] = useState<Set<string>>(new Set());
  const [forceOut, setForceOut] = useState<Set<string>>(new Set());
  const [subjectsOpen, setSubjectsOpen] = useState(true);
  const markDone = (id: string, on?: boolean) => setDone((s) => toggle(s, id, on));
  const moveIn = (id: string) => { setForceOut((s) => toggle(s, id, false)); setForceIn((s) => toggle(s, id, true)); };
  const moveOut = (id: string) => { setForceIn((s) => toggle(s, id, false)); setForceOut((s) => toggle(s, id, true)); };
  const reset = () => { setDone(new Set()); setForceIn(new Set()); setForceOut(new Set()); };

  useEffect(() => {
    document.title = "Cronograma Inteligente · Pitch interno";
    const m = document.createElement("meta");
    m.name = "robots"; m.content = "noindex, nofollow";
    document.head.appendChild(m);
    return () => { m.remove(); };
  }, []);

  const topics = useMemo(() => buildTopics(profile), [profile]);
  const studyDays = (() => { const e = new Date(exam + "T08:00:00-03:00"); const d = new Date(TODAY); let n = 0; d.setDate(d.getDate() + 1); while (d < e) { if (d.getDay() !== 0) n++; d.setDate(d.getDate() + 1); } return n; })();
  const weeks = studyDays / 6;
  const plan = useMemo(() => planSchedule(topics, hours, weeks, { done, forceIn, forceOut }), [topics, hours, weeks, done, forceIn, forceOut]);
  const days = Math.max(0, Math.round((new Date(exam + "T08:00:00-03:00").getTime() - TODAY.getTime()) / 86400000));
  const roadmap = useMemo(() => buildRoadmap(plan.included, hours, TODAY, done), [plan.included, hours, done]);
  const remaining = plan.included.reduce((a, t) => a + (done.has(t.id) ? 0 : t.hours), 0);
  const totalNeeded = topics.reduce((a, t) => a + (done.has(t.id) ? 0 : t.hours), 0);
  const neededPerDay = studyDays ? totalNeeded / studyDays : 0;
  const neededPerDayTxt = neededPerDay.toFixed(1).replace(".", ",");
  const tiers = useMemo(() => tierSummaries(topics, done, studyDays, plan.available), [topics, done, studyDays, plan.available]);
  const tierHours = tiers.reduce((a, t) => a + t.hours, 0);
  const tierPerDayTxt = (studyDays ? tierHours / studyDays : 0).toFixed(1).replace(".", ",");
  const tierWeight = Math.round(tiers.reduce((a, t) => a + t.weightShare, 0) * 100);
  const studiedHours = plan.studied.reduce((a, t) => a + t.hours, 0);
  const subjects = useMemo(() => {
    const m = new Map<string, PlanTopic[]>();
    topics.forEach((t) => m.set(t.subject, [...(m.get(t.subject) ?? []), t]));
    return [...m.entries()];
  }, [topics]);
  const weeksGroups = useMemo(() => {
    const g = new Map<string, typeof roadmap>();
    roadmap.forEach((r) => {
      const monday = new Date(r.start); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      const k = fmt(monday); g.set(k, [...(g.get(k) ?? []), r]);
    });
    return [...g.entries()];
  }, [roadmap]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto max-w-6xl px-6 pt-24 pb-16">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/40 px-3 py-1 text-xs uppercase tracking-[0.2em] text-primary">
          <Sparkles className="h-3 w-3" /> Mentorias 2G · Projeto interno
        </p>
        <h1 className="max-w-4xl text-4xl font-bold leading-tight md:text-6xl">
          O cronograma que estuda <span className="text-primary">a banca</span> antes do aluno.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          Edital + perfil da banca + diagnóstico individual + tempo até a prova. Um plano que entrega o máximo de pontos possíveis em cada hora de estudo.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {steps.map((s, i) => (
            <div key={s.title} className="relative rounded-2xl border border-border bg-card p-5">
              <span className="absolute right-4 top-4 text-3xl font-bold text-primary/20">{i + 1}</span>
              <s.icon className="mb-4 h-6 w-6 text-primary" />
              <h3 className="font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-card/40">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-3xl font-bold">Simulação ao vivo · TRT4 Técnico</h2>
          <p className="mt-2 text-muted-foreground">Mexa nos controles e veja o plano se reorganizar.</p>

          <div className="mt-8 grid gap-6 rounded-2xl border border-border bg-background p-6 md:grid-cols-3">
            <div>
              <label className="text-sm text-muted-foreground">Horas por dia</label>
              <p className="text-3xl font-bold text-primary">{hours}h</p>
              <Slider min={1} max={10} step={1} value={[hours]} onValueChange={(v) => setHours(v[0])} className="mt-3" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground" htmlFor="exam">Data da prova</label>
              <p className="text-3xl font-bold text-primary">{days} dias</p>
              <input id="exam" type="date" min={toInput(TODAY)} value={exam} onChange={(e) => setExam(e.target.value)}
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2" />
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Resultado do nivelamento</span>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {profiles.map((p) => (
                  <button key={p.id} onClick={() => setProfile(p.id)}
                    className={`rounded-md border px-2 py-2 text-sm transition ${profile === p.id ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/60"}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-5">
            {[
              ["Horas disponíveis", `${Math.round(plan.available)}h`, `${studyDays} dias × ${hours}h, 20% reservado p/ revisão`],
              ["Horas necessárias", `${neededPerDayTxt}h/dia`, `${Math.round(totalNeeded)}h ÷ ${studyDays} dias de estudo até a prova`],
              ["No cronograma", `${Math.round(remaining)}h`, `${plan.included.length - plan.studied.length} tópicos pendentes`],
              ["Já estudado", `${plan.studied.length} tópicos · ${Math.round(studiedHours)}h`],
              ["Peso da prova coberto", `${Math.round(plan.coverage * 100)}%`],
            ].map(([k, v, note]) => (
              <div key={k} className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{k}</p>
                <p className="mt-1 text-2xl font-bold">{v}</p>
                {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
              </div>
            ))}
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all duration-500" style={{ width: `${plan.coverage * 100}%` }} />
          </div>
          {plan.overBudget && (
            <p className="mt-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              Os tópicos incluídos manualmente passam do tempo disponível em {Math.round(plan.used - plan.available)}h. Aumente as horas por dia, adie a prova ou mova algo para o corte.
            </p>
          )}

          <div className="mt-6 rounded-2xl border border-border bg-background p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Horas por dia para fechar cada nível</p>
              <p className="text-xs text-muted-foreground">nível = peso do tópico na prova · {studyDays} dias até a data</p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {tiers.map((t) => (
                <div key={t.priority} className="rounded-xl border border-border bg-card/40 p-4">
                  <div className="flex items-center gap-2">
                    <Dots n={t.priority} />
                    <span className="text-sm font-semibold">Nível {t.priority}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{Math.round(t.weightShare * 100)}% do peso</span>
                  </div>
                  <p className={`mt-2 text-3xl font-bold ${DOT[t.priority]}`}>
                    {t.perDay.toFixed(1).replace(".", ",")}<span className="text-base font-semibold">h/dia</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{Math.round(t.hours)}h em {t.pending} de {t.total} tópicos</p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary transition-all duration-500" style={{ width: `${Math.round(t.reachable * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">seu ritmo atual fecha {Math.round(t.reachable * 100)}% do nível</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Níveis 5 + 4 + 3 juntos: <strong className="text-foreground">{tierPerDayTxt}h/dia</strong> ({Math.round(tierHours)}h) · {tierWeight}% do peso da prova
            </p>
          </div>

          <div className="mt-10">
            <div className="mb-3 flex items-center justify-between gap-3">
              <button onClick={() => setSubjectsOpen((v) => !v)} aria-expanded={subjectsOpen}
                className="inline-flex flex-1 items-center gap-2 text-left font-semibold hover:text-primary">
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ${subjectsOpen ? "" : "-rotate-90"}`} />
                Matérias já estudadas
                <span className="text-xs font-normal text-muted-foreground">
                  {subjectsOpen ? "clique para recolher" : `${plan.studied.length} tópicos · clique para abrir`}
                </span>
              </button>
              <button onClick={reset} className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-primary"><RotateCcw className="h-3 w-3" /> Limpar ajustes</button>
            </div>
            {subjectsOpen && <div className="space-y-2 animate-fade-in">
              {subjects.map(([name, list]) => {
                const n = list.filter((t) => done.has(t.id)).length;
                const all = n === list.length;
                const w = list.reduce((a, t) => a + t.priority, 0);
                const wd = list.filter((t) => done.has(t.id)).reduce((a, t) => a + t.priority, 0);
                const pct = w ? wd / w : 0;
                const hue = Math.round(pct * 142);
                return (
                  <div key={name} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
                    <button onClick={() => list.forEach((t) => markDone(t.id, !all))} title={all ? "Desmarcar matéria" : "Marcar matéria inteira"}
                      className={`rounded-md border p-1 ${all ? "border-success bg-success text-success-foreground" : "border-border hover:border-primary"}`}>
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-64 truncate text-sm font-medium">{name}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(pct * 100, 3)}%`, background: `linear-gradient(90deg, hsl(0 78% 55%), hsl(${hue} 70% 48%))` }} />
                    </div>
                    <span className="w-28 text-right text-xs text-muted-foreground">{n}/{list.length} tópicos · {Math.round(pct * 100)}%</span>
                  </div>
                );
              })}
            </div>}
          </div>

          <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-2">
            <div>
              <h3 className="mb-3 font-semibold text-primary">Entra no cronograma</h3>
              <ul className="max-h-[480px] space-y-2 overflow-y-auto pr-2">
                {plan.included.map((t, i) => (
                  <li key={t.id} className={`flex items-center gap-3 rounded-lg border p-3 animate-fade-in ${done.has(t.id) ? "border-success/60 bg-success/10" : "border-border bg-background"}`}>
                    <span className="w-6 text-xs text-muted-foreground">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.title}</p>
                      <p className="text-xs text-muted-foreground">{t.subject} · {done.has(t.id) ? <span className="text-success">estudado · 0h</span> : `${t.hours}h`}</p>
                    </div>
                    <Dots n={t.priority} />
                    <button title={done.has(t.id) ? "Desmarcar" : "Marcar como estudado"} onClick={() => markDone(t.id)} className={`rounded-md border p-1.5 ${done.has(t.id) ? "border-success bg-success text-success-foreground" : "border-border hover:border-primary hover:text-primary"}`}><Check className="h-3.5 w-3.5" /></button>
                    <button title="Mover para o corte" onClick={() => moveOut(t.id)} className="rounded-md border border-border p-1.5 hover:border-primary hover:text-primary"><ArrowRight className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
                {plan.included.length === 0 && <li className="text-sm text-muted-foreground">Sem tempo útil até a prova.</li>}
              </ul>
            </div>
            <div>
              <h3 className="mb-3 font-semibold text-muted-foreground">Corte estratégico</h3>
              <ul className="max-h-[480px] space-y-2 overflow-y-auto pr-2">
                {plan.cut.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 rounded-lg border border-dashed border-border p-3">
                    <button title="Incluir no cronograma" onClick={() => moveIn(t.id)} className="rounded-md border border-border p-1.5 hover:border-primary hover:text-primary"><ArrowLeft className="h-3.5 w-3.5" /></button>
                    <div className="min-w-0 flex-1 opacity-60">
                      <p className="truncate text-sm line-through">{t.title}</p>
                      <p className="text-xs text-muted-foreground">{t.subject} · {done.has(t.id) ? <span className="text-success">estudado · 0h</span> : `${t.hours}h`}</p>
                    </div>
                    <Dots n={t.priority} />
                    <button title={done.has(t.id) ? "Desmarcar" : "Marcar como estudado"} onClick={() => markDone(t.id)} className={`rounded-md border p-1.5 ${done.has(t.id) ? "border-success bg-success text-success-foreground" : "border-border hover:border-primary hover:text-primary"}`}><Check className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
                {plan.cut.length === 0 && <li className="text-sm text-muted-foreground">Tempo suficiente para o edital inteiro.</li>}
              </ul>
            </div>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            Tópicos reais do edital TRT4 Técnico 2026. Pesos da banca e horas por tópico são ilustrativos nesta demonstração; 20% do tempo fica reservado para revisões.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-3xl font-bold">Roteiro do aluno</h2>
        <p className="mt-2 text-muted-foreground">
          O passo a passo até a prova. Marque o que já estudou: as horas restantes e as datas se recalculam na hora.
        </p>
        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <p className="text-sm">
            Faltam <strong className="text-primary">{Math.round(remaining)}h</strong> de estudo em {plan.included.length - plan.studied.length} tópicos ({plan.studied.length} já estudados)
            {studyDays > 0 && <> · o edital inteiro exige <strong className="text-primary">{neededPerDayTxt}h/dia</strong> nos {studyDays} dias até a prova {neededPerDay > hours ? <span className="text-destructive">· acima das {hours}h que você tem</span> : <span className="text-muted-foreground">· cabe nas {hours}h que você tem</span>}</>}
          </p>
        </div>
        <div className="mt-6 space-y-6">
          {weeksGroups.map(([wk, items], wi) => (
            <div key={wk}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Semana {wi + 1} · a partir de {wk}</h3>
              <ul className="space-y-2">
                {items.map(({ topic: t, start, end }) => (
                  <li key={t.id} className={`flex items-center gap-3 rounded-lg border p-3 ${done.has(t.id) ? "border-success/60 bg-success/10" : "border-border bg-background"}`}>
                    <input type="checkbox" checked={done.has(t.id)} onChange={() => markDone(t.id)} className="h-4 w-4 accent-primary" aria-label={`Marcar ${t.title} como estudado`} />
                    <span className="w-24 text-xs text-muted-foreground">{done.has(t.id) ? <span className="text-success">✓ concluído</span> : <>{fmt(start)}{+start !== +end && ` – ${fmt(end)}`}</>}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.title}</p>
                      <p className="text-xs text-muted-foreground">{t.subject} · {done.has(t.id) ? <span className="text-success">estudado · 0h</span> : `${t.hours}h`}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h2 className="text-3xl font-bold">Cada aluno, um plano. Cada hora, mais pontos.</h2>
        <p className="mt-4 text-muted-foreground">Próximo passo: alimentar os pesos reais da FCC e conectar ao simulado de nivelamento da plataforma.</p>
      </section>
    </main>
  );
}
