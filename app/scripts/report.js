// Gate report for Fase 1: priority table with breakdown + first 4 weeks of the schedule.
// Usage: node app/scripts/report.js [weeks=4]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { generate } from "../src/engine/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const pack = JSON.parse(readFileSync(path.join(here, "..", "packs", "_fixture.json"), "utf8"));
const weeksToShow = Number(process.argv[2] ?? 4);

const disponibilidade = {
  horas_por_dia_semana: { seg: 2, ter: 2, qua: 0, qui: 2, sex: 2, sab: 4, dom: 0 },
  data_inicio: "2026-11-16",
};
// Empty leveling (pure A+B) is what the fixture ships with; pass one here to see G in action.
const nivelamento = {};

const r = generate({ pack, nivelamento, disponibilidade });
if (!r.ok) {
  console.error(JSON.stringify(r, null, 2));
  process.exit(1);
}

const f = (x, d = 3) => x.toFixed(d);
const pad = (s, n, right = false) => (right ? String(s).padStart(n) : String(s).padEnd(n));
const nomes = Object.fromEntries(pack.assuntos.map((a) => [a.id, a.nome]));

console.log(`\n${pack.concurso.nome} · ${pack.concurso.banca} · prova ${pack.concurso.data_prova}`);
console.log(`Pesos: wF=${r.scores.weights.wF} wB=${r.scores.weights.wB} wE=${r.scores.weights.wE} wG=${r.scores.weights.wG} · λ=${r.scores.config.lambda} · ano_ref=${r.scores.refYear}\n`);

console.log("PRIORIDADE POR ASSUNTO (P = (wF·F + wB·B + wE·E) · (1 + wG·G) · M)");
const head = `${pad("#", 3)}${pad("assunto", 12)}${pad("P", 8, true)}${pad("F", 7, true)}${pad("B", 7, true)}${pad("E", 7, true)}${pad("G", 6, true)}${pad("M", 6, true)} │${pad("cF", 7, true)}${pad("cB", 7, true)}${pad("cE", 7, true)} │${pad("share", 7, true)}${pad("orçam.", 8, true)}  nome`;
console.log(head);
console.log("─".repeat(head.length + 10));
const orc = Object.fromEntries((r.orcamentos ?? []).map((o) => [o.assunto_id, o]));
for (const id of r.scores.ranking) {
  const s = r.scores.byId[id];
  const o = orc[id];
  console.log(
    `${pad(s.rank, 3)}${pad(id, 12)}${pad(f(s.P), 8, true)}${pad(f(s.F, 2), 7, true)}${pad(f(s.B, 2), 7, true)}${pad(f(s.E, 2), 7, true)}${pad(f(s.G, 2), 6, true)}${pad(f(s.M, 2), 6, true)} │` +
      `${pad(f(s.contrib.F), 7, true)}${pad(f(s.contrib.B), 7, true)}${pad(f(s.contrib.E), 7, true)} │${pad(`${(s.share * 100).toFixed(1)}%`, 7, true)}${pad(o ? `${o.hours.toFixed(1)}h${o.clamp ? "*" : ""}` : "-", 8, true)}  ${nomes[id]}`
  );
}
console.log("cF/cB/cE = contribuição absoluta de cada termo (somam P) · * = orçamento no limite do clamp\n");

const c = r.capacidade;
console.log("CAPACIDADE");
console.log(`  ${c.dias} dias · ${c.semanas} semanas · ${c.horas_brutas}h brutas − ${c.buffer_horas}h buffer = ${c.horas_uteis}h úteis`);
console.log(`  reservas: reta final ${c.reservas_horas.reta_final}h (desde ${c.reta_final_inicio}) · simulados ${c.reservas_horas.simulados}h · revisões ${c.reservas_horas.revisoes}h → ${c.horas_para_conteudo}h para conteúdo novo`);
console.log(`  cobertura parcial: ${r.cobertura_parcial} · mínimo necessário (0,5× base): ${c.minimo_necessario_horas}h\n`);

const ATIV = { teoria: "T", questoes: "Q", revisao: "R", simulado: "S" };
console.log(`ROTEIRO · primeiras ${weeksToShow} semanas  (T teoria · Q questões · R revisão · S simulado)`);
for (const w of r.cronograma.slice(0, weeksToShow)) {
  console.log(`\nSemana ${w.numero} · ${w.inicio} a ${w.fim} · ${w.alocado_min / 60}h de ${w.capacidade_util_min / 60}h úteis` + (w.novos_assuntos.length ? ` · novos: ${w.novos_assuntos.join(", ")}` : "") + (w.simulado ? " · SIMULADO" : "") + (w.reta_final ? " · RETA FINAL" : ""));
  for (const d of w.dias) {
    if (d.capacidade_min === 0) {
      console.log(`  ${d.data} ${d.dia_semana}  —`);
      continue;
    }
    const line = d.blocos.map((b) => `${ATIV[b.atividade]} ${b.minutos}' ${b.assunto_id ?? "simulado"}${b.intervalo_dias ? `(+${b.intervalo_dias}d)` : ""}`).join(" | ");
    console.log(`  ${d.data} ${d.dia_semana}  ${line}`);
  }
}

console.log("\nMOTIVOS (amostra: primeiros 3 blocos da semana 1)");
for (const b of r.cronograma[0].dias.flatMap((d) => d.blocos).slice(0, 3)) console.log(`  • ${b.motivo}`);

const s = r.resumo;
console.log("\nRESUMO");
console.log(`  ${s.horas_alocadas}h alocadas · ${s.horas_livres}h livres · ${s.horas_nao_alocadas}h não alocadas · ${s.assuntos_concluidos}/${pack.assuntos.length} assuntos concluídos · ${s.simulados} simulados · revisões pendentes: ${s.revisoes_pendentes}`);
console.log(`  avisos: ${r.avisos.length}${r.avisos.length ? " · " + [...new Set(r.avisos.map((a) => a.codigo))].join(", ") : ""}`);
console.log(`  semanas com simulado: ${r.cronograma.filter((w) => w.simulado).map((w) => w.numero).join(", ")}`);
console.log("");
