// node --test tools/pack-builder/test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { parseProva, mergeGabarito } from "../lib/parse-prova.js";
import { parseGabarito } from "../lib/parse-gabarito.js";
import { parseEdital, proposeAssuntos, sliceSection } from "../lib/parse-edital.js";
import { assemblePack, renderReview } from "../lib/assemble.js";
import { parseJsonArray } from "../lib/classify.js";
import { validatePack } from "../../../app/src/engine/schema.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = (name) => path.join(here, "..", "fixtures", name);
const read = (name) => readFileSync(fx(name), "utf8");
const config = JSON.parse(read("config.json"));
const materias = config.estrutura_prova.materias;

test("caderno: 7 questões, seções, contexto compartilhado, número solto", () => {
  const r = parseProva(read("caderno.txt"), { materias });
  assert.equal(r.total, 7);
  assert.deepEqual(r.questoes.map((q) => q.numero), [1, 2, 3, 4, 5, 6, 7]);
  assert.ok(r.questoes.every((q) => q.alternativas.length === 5), JSON.stringify(r.anomalias));
  assert.deepEqual(r.questoes.map((q) => q.materia_id), ["port", "port", "port", "dadm", "dadm", "dadm", "dadm"]);
  assert.match(r.questoes[0].contexto, /vida nas cidades/);
  assert.equal(r.questoes[3].contexto, null);
  assert.match(r.questoes[1].enunciado, /sem prejuízo do sentido, por$/);
  assert.match(r.questoes[3].enunciado, /^Nos termos da Lei nº 14\.133\/2021.*por 5 anos consecutivos, é$/);
  assert.match(r.questoes[6].enunciado, /^A respeito dos poderes/);
  assert.equal(r.questoes[4].alternativas[2], "de competência, em regra sanável.");
  assert.equal(r.anomalias.length, 0, JSON.stringify(r.anomalias));
  assert.equal(r.secoes.length, 2);
});

test("gabarito: pares NNN - X, anulada com asterisco e fallback sequencial", () => {
  const g = parseGabarito(read("gabarito.txt"));
  assert.equal(g.total, 7);
  assert.equal(g.respostas[1], "B");
  assert.equal(g.respostas[5], null);
  assert.deepEqual(g.anuladas, [5]);
  const g2 = parseGabarito("Questão Resposta\n1 C 2 D 3 A 4 E");
  assert.deepEqual(g2.respostas, { 1: "C", 2: "D", 3: "A", 4: "E" });
  const g3 = parseGabarito("12: D 13) E 14 - ANULADA");
  assert.equal(g3.respostas[13], "E");
  assert.deepEqual(g3.anuladas, [14]);
});

test("merge: gabarito anexado e anulada marcada", () => {
  const r = parseProva(read("caderno.txt"), { materias });
  const { questoes, semGabarito } = mergeGabarito(r.questoes, parseGabarito(read("gabarito.txt")));
  assert.deepEqual(semGabarito, []);
  assert.equal(questoes[4].anulada, true);
  assert.equal(questoes[0].gabarito, "B");
});

test("edital: recorte da seção do cargo, modo frases e modo numerado, profundidade", () => {
  const slice = sliceSection(read("edital.txt"), { inicio: config.edital.secao_inicio, fim: config.edital.secao_fim });
  assert.ok(slice && !/Outro programa/.test(slice));
  const ed = parseEdital(slice, { materias });
  const port = ed.materias.find((m) => m.id === "port");
  const dadm = ed.materias.find((m) => m.id === "dadm");
  assert.equal(port.modo, "frases");
  assert.equal(port.itens.length, 5);
  assert.equal(dadm.modo, "numerado");
  assert.deepEqual(dadm.itens.map((i) => i.codigo), ["1", "1.1", "1.2", "1.3", "1.4", "2", "2.1", "2.2", "2.2.1", "3", "4"]);
  const assuntos = proposeAssuntos(ed);
  assert.equal(assuntos.length, 9);
  const ato = assuntos.find((a) => a.id.startsWith("dadm.ato_administrativo"));
  assert.equal(ato.edital_profundidade, 2);
  assert.equal(ato.subitens, 4);
  const lic = assuntos.find((a) => a.id.startsWith("dadm.licitacoes"));
  assert.equal(lic.edital_profundidade, 3);
  assert.equal(assuntos.find((a) => a.id.startsWith("dadm.poderes")).edital_profundidade, 1);
  assert.equal(new Set(assuntos.map((a) => a.id)).size, assuntos.length);
});

test("assemble: pack válido, incidência contada, itens de nivelamento filtrados por confiança", () => {
  const r = parseProva(read("caderno.txt"), { materias });
  const { questoes } = mergeGabarito(r.questoes, parseGabarito(read("gabarito.txt")));
  const ed = parseEdital(sliceSection(read("edital.txt"), { inicio: config.edital.secao_inicio, fim: config.edital.secao_fim }), { materias });
  const assuntos = proposeAssuntos(ed);
  const id = (prefix) => assuntos.find((a) => a.id.startsWith(prefix)).id;
  const classification = {
    "fixture-2025#1": { assunto_id: id("port.compreensao"), confianca: 0.9, desatualizada: false, motivo: "" },
    "fixture-2025#2": { assunto_id: id("port.compreensao"), confianca: 0.8, desatualizada: false, motivo: "" },
    "fixture-2025#3": { assunto_id: id("port.concordancia"), confianca: 0.95, desatualizada: false, motivo: "" },
    "fixture-2025#4": { assunto_id: id("dadm.licitacoes"), confianca: 0.9, desatualizada: false, motivo: "" },
    "fixture-2025#6": { assunto_id: id("dadm.regime"), confianca: 0.4, desatualizada: false, motivo: "palpite" },
    "fixture-2025#7": { assunto_id: id("dadm.poderes"), confianca: 0.9, desatualizada: false, motivo: "" },
  };
  const provas = [{ key: "fixture-2025", tipo: "cargo", ano: 2025, fonte: "fixture://prova-2025", total_questoes: 7, questoes, anomalias: r.anomalias }];
  const { pack, review } = assemblePack({ config, assuntos, provas, classification, overrides: { assuntos: { [id("dadm.licitacoes")]: { carga_horaria_base: 12, volatil: true } } } });
  const v = validatePack(pack);
  assert.equal(v.ok, true, JSON.stringify(v.errors));
  assert.equal(pack.assuntos.find((a) => a.id === id("port.compreensao")).incidencia_cargo[0].questoes, 2);
  assert.equal(pack.assuntos.find((a) => a.id === id("dadm.licitacoes")).carga_horaria_base, 12);
  assert.equal(pack.assuntos.find((a) => a.id === id("dadm.licitacoes")).volatil, true);
  assert.equal(pack.nivelamento.itens.length, 5, "q5 anulada e q6 abaixo da confiança ficam fora");
  assert.equal(pack.nivelamento.itens.find((i) => i.id === "fixture-2025-q1").gabarito, 1);
  assert.match(pack.nivelamento.itens.find((i) => i.id === "fixture-2025-q1").enunciado, /^O texto fictício/);
  assert.equal(review.baixa_confianca.length, 1);
  assert.equal(review.sem_assunto.length, 0, "q5 é anulada, não entra como sem assunto");
  assert.equal(pack.provas_historico[0].total_questoes, 7);
  const md = renderReview(review, pack);
  assert.match(md, /Baixa confiança \(confirmar\) \(1\)/);
});

test("classify: extrai array JSON de respostas com cercas", () => {
  assert.deepEqual(parseJsonArray('```json\n[{"numero":1}]\n```'), [{ numero: 1 }]);
  assert.throws(() => parseJsonArray("sem json"));
});

test("cli: init → extract → parse → assemble num workspace temporário", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pack-builder-"));
  const cli = path.join(here, "..", "cli.js");
  execFileSync("node", [cli, "init", dir]);
  writeFileSync(path.join(dir, "config.json"), read("config.json"));
  for (const f of ["caderno.txt", "gabarito.txt", "edital.txt"]) copyFileSync(fx(f), path.join(dir, "input", f));
  execFileSync("node", [cli, "extract", dir]);
  const parseOut = execFileSync("node", [cli, "parse", dir], { encoding: "utf8" });
  assert.match(parseOut, /fixture-2025: 7 questões \(7 completas\)/);
  const work = path.join(dir, "work");
  assert.ok(existsSync(path.join(work, "provas.json")) && existsSync(path.join(work, "assuntos.json")));
  const dry = execFileSync("node", [cli, "classify", dir, "--dry-run"], { encoding: "utf8" });
  assert.match(dry, /6 questão\(ões\) pendente/);
  const assuntos = JSON.parse(readFileSync(path.join(work, "assuntos.json"), "utf8"));
  const cls = Object.fromEntries([1, 2, 3, 4, 6, 7].map((n) => [`fixture-2025#${n}`, { assunto_id: assuntos[n % assuntos.length].id, confianca: 0.9, desatualizada: false, motivo: "teste" }]));
  writeFileSync(path.join(work, "classification.json"), JSON.stringify(cls));
  const outPack = path.join(dir, "out.json");
  const asm = execFileSync("node", [cli, "assemble", dir, "--no-index", `--out=${outPack}`], { encoding: "utf8" });
  assert.match(asm, /válido: true/);
  const pack = JSON.parse(readFileSync(outPack, "utf8"));
  assert.equal(validatePack(pack).ok, true);
  assert.ok(existsSync(path.join(dir, "review.md")));
});
