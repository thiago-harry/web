#!/usr/bin/env node
// Pack builder CLI. Workspace layout:
//   <dir>/config.json            concurso, estrutura_prova (com aliases), provas, edital, notas_banca
//   <dir>/input/*.pdf            edital, cadernos e gabaritos
//   <dir>/work/*.txt             texto extraído
//   <dir>/work/provas.json       questões parseadas + gabarito
//   <dir>/work/edital.json       matérias/itens do edital
//   <dir>/work/assuntos.json     rascunho de assuntos (edite à vontade)
//   <dir>/work/classification.json  questão -> assunto (LLM ou manual)
//   <dir>/overrides.json         ajustes por assunto (carga, tipo, prereq, volatil)
//   -> app/packs/<id>.json + <dir>/review.md
//
// Commands: init | extract | parse | classify | assemble | all
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractText } from "./lib/pdf.js";
import { parseProva, mergeGabarito } from "./lib/parse-prova.js";
import { parseGabarito } from "./lib/parse-gabarito.js";
import { parseEdital, proposeAssuntos, sliceSection } from "./lib/parse-edital.js";
import { assemblePack, renderReview } from "./lib/assemble.js";
import { validatePack, formatIssues } from "../../app/src/engine/schema.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const [, , cmd, dirArg, ...rest] = process.argv;
const flags = Object.fromEntries(rest.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")).map(([k, v]) => [k, v ?? true]));

const exists = (p) => access(p).then(() => true, () => false);
const readJSON = async (p, fallback) => ((await exists(p)) ? JSON.parse(await readFile(p, "utf8")) : fallback);
const writeJSON = (p, data) => writeFile(p, JSON.stringify(data, null, 2) + "\n");
const log = (...a) => console.log(...a);

const CONFIG_TEMPLATE = {
  pack_version: "0.1.0",
  concurso: { id: "orgao-ano", nome: "Nome do concurso", orgao: "Órgão", banca: "BANCA", cargo: "Cargo", data_prova: "2027-01-31", fonte_edital: "https://…", curado_em: "2026-11-10" },
  estrutura_prova: {
    total_questoes: 60,
    tipo: "multipla_escolha_5",
    penalidade_erro: false,
    nota_corte_estimada: 0.6,
    materias: [
      { id: "port", nome: "Língua Portuguesa", aliases: ["LÍNGUA PORTUGUESA", "PORTUGUÊS"], questoes: 10, peso: 1, eliminatoria: false, min_acertos: null, tipo_default: "pratica" },
      { id: "dadm", nome: "Direito Administrativo", aliases: ["NOÇÕES DE DIREITO ADMINISTRATIVO"], questoes: 10, peso: 2, eliminatoria: false, min_acertos: null, tipo_default: "lei_seca" },
    ],
  },
  edital: { pdf: "input/edital.pdf", secao_inicio: "TÉCNICO JUDICIÁRIO – ÁREA ADMINISTRATIVA", secao_fim: null },
  provas: [
    { key: "cargo-2022", tipo: "cargo", ano: 2022, caderno: "input/prova-2022.pdf", gabarito: "input/gabarito-2022.pdf", fonte: "https://…", total_questoes: 60 },
    { key: "banca-outro-2025", tipo: "banca", concurso: "outro-2025", ano: 2025, caderno: "input/prova-outro-2025.pdf", gabarito: "input/gabarito-outro-2025.pdf", fonte: "https://…", total_questoes: 60 },
  ],
  notas_banca: { estilo: [], formato_questao: "assertiva única, 5 alternativas", ratio_teoria_questoes_sugerido: null, recomendacoes_estudo: [] },
  classificacao: { modelo: "claude-opus-5-5", lote: 10, effort: "medium", confianca_minima: 0.6 },
};

async function loadWorkspace(dir) {
  const root = path.resolve(dir);
  const config = await readJSON(path.join(root, "config.json"), null);
  if (!config) throw new Error(`config.json não encontrado em ${root} (rode: init)`);
  const work = path.join(root, "work");
  await mkdir(work, { recursive: true });
  return { root, work, config };
}

async function cmdInit(dir) {
  const root = path.resolve(dir);
  await mkdir(path.join(root, "input"), { recursive: true });
  await mkdir(path.join(root, "work"), { recursive: true });
  const cfgPath = path.join(root, "config.json");
  if (await exists(cfgPath)) throw new Error(`${cfgPath} já existe`);
  await writeJSON(cfgPath, CONFIG_TEMPLATE);
  await writeJSON(path.join(root, "overrides.json"), { assuntos: {} });
  log(`Workspace criado em ${root}. Edite config.json e coloque os PDFs em input/.`);
}

const txtOf = (work, rel) => path.join(work, path.basename(rel).replace(/\.(pdf|txt)$/i, "") + ".txt");

async function cmdExtract(dir) {
  const { root, work, config } = await loadWorkspace(dir);
  const files = [config.edital?.pdf, ...config.provas.flatMap((p) => [p.caderno, p.gabarito])].filter(Boolean);
  for (const rel of files) {
    const src = path.join(root, rel);
    if (!(await exists(src))) {
      log(`- ${rel}: ausente (pulado)`);
      continue;
    }
    const out = txtOf(work, rel);
    if (/\.txt$/i.test(rel)) {
      await writeFile(out, await readFile(src, "utf8"));
      log(`- ${rel}: copiado (texto)`);
      continue;
    }
    const { text, backend } = await extractText(src, { backend: flags.backend ?? "auto" });
    await writeFile(out, text);
    log(`- ${rel}: ${text.length} caracteres via ${backend} -> ${path.relative(root, out)}`);
  }
}

async function cmdParse(dir) {
  const { root, work, config } = await loadWorkspace(dir);
  const materias = config.estrutura_prova.materias;
  const provas = [];
  for (const p of config.provas) {
    const cadPath = txtOf(work, p.caderno);
    if (!(await exists(cadPath))) {
      log(`- ${p.key}: texto do caderno ausente (rode extract)`);
      continue;
    }
    const parsed = parseProva(await readFile(cadPath, "utf8"), { materias });
    let merged = { questoes: parsed.questoes.map((q) => ({ ...q, gabarito: null, anulada: false })), semGabarito: [] };
    let gab = null;
    if (p.gabarito && (await exists(txtOf(work, p.gabarito)))) {
      gab = parseGabarito(await readFile(txtOf(work, p.gabarito), "utf8"));
      merged = mergeGabarito(parsed.questoes, gab);
    }
    provas.push({ key: p.key, tipo: p.tipo, ano: p.ano, concurso: p.concurso, fonte: p.fonte, total_questoes: p.total_questoes, questoes: merged.questoes, anomalias: parsed.anomalias, secoes: parsed.secoes, sem_gabarito: merged.semGabarito });
    log(`- ${p.key}: ${parsed.questoes.length} questões (${parsed.questoes.filter((q) => q.completa).length} completas), ${parsed.secoes.length} seções, gabarito ${gab ? gab.total : 0}, anomalias ${parsed.anomalias.length}`);
  }
  await writeJSON(path.join(work, "provas.json"), provas);

  if (config.edital?.pdf && (await exists(txtOf(work, config.edital.pdf)))) {
    const full = await readFile(txtOf(work, config.edital.pdf), "utf8");
    const slice = sliceSection(full, { inicio: config.edital.secao_inicio, fim: config.edital.secao_fim });
    if (slice === null) log(`- edital: seção "${config.edital.secao_inicio}" não encontrada; usando o texto inteiro`);
    const edital = parseEdital(slice ?? full, { materias });
    await writeJSON(path.join(work, "edital.json"), edital);
    const assuntosPath = path.join(work, "assuntos.json");
    if ((await exists(assuntosPath)) && !flags.force) log(`- edital: assuntos.json já existe, mantido (use --force para regenerar)`);
    else await writeJSON(assuntosPath, proposeAssuntos(edital));
    for (const m of edital.materias) log(`- edital/${m.id}: ${m.itens.length} itens (${m.modo})`);
    if (edital.semMateria.length) log(`- edital: ${edital.semMateria.length} linha(s) fora de qualquer matéria`);
  } else log("- edital: texto ausente (pulado)");
  log(`Saída em ${path.relative(process.cwd(), work)}/`);
}

async function cmdClassify(dir) {
  const { work, config } = await loadWorkspace(dir);
  const provas = await readJSON(path.join(work, "provas.json"), null);
  const assuntos = await readJSON(path.join(work, "assuntos.json"), null);
  if (!provas || !assuntos) throw new Error("rode parse antes de classify");
  const outPath = path.join(work, "classification.json");
  const existing = await readJSON(outPath, {});
  const pendentes = provas.reduce((s, p) => s + p.questoes.filter((q) => !q.anulada && !(`${p.key}#${q.numero}` in existing)).length, 0);
  log(`${pendentes} questão(ões) pendente(s) de classificação em ${assuntos.length} assuntos.`);
  if (flags["dry-run"] || pendentes === 0) return;
  const { classifyQuestions } = await import("./lib/classify.js");
  const c = config.classificacao ?? {};
  const { usage } = await classifyQuestions({
    provas,
    assuntos,
    existing,
    options: { model: flags.model ?? c.modelo, batchSize: Number(flags.lote ?? c.lote ?? 10), effort: flags.effort ?? c.effort ?? "medium" },
    onBatch: async ({ out, prova, materia, feitas, total }) => {
      await writeJSON(outPath, out);
      log(`  ${prova}/${materia}: ${feitas}/${total}`);
    },
  });
  log(`Lotes: ${usage.batches} · tokens entrada ${usage.input_tokens} · saída ${usage.output_tokens} · erros ${usage.erros.length}`);
  for (const e of usage.erros) log(`  erro ${e.prova} q${e.de}-${e.ate}: ${e.erro}`);
}

async function cmdAssemble(dir) {
  const { root, work, config } = await loadWorkspace(dir);
  const provas = await readJSON(path.join(work, "provas.json"), []);
  const assuntos = await readJSON(path.join(work, "assuntos.json"), null);
  if (!assuntos) throw new Error("work/assuntos.json ausente (rode parse)");
  const classification = await readJSON(path.join(work, "classification.json"), {});
  const overrides = await readJSON(path.join(root, "overrides.json"), { assuntos: {} });
  const { pack, review } = assemblePack({ config, assuntos, provas, classification, overrides, options: { confiancaMinima: config.classificacao?.confianca_minima ?? 0.6 } });
  const v = validatePack(pack);
  const outPath = flags.out ? path.resolve(String(flags.out)) : path.join(repoRoot, "app", "packs", `${pack.concurso.id}.json`);
  await writeJSON(outPath, pack);
  await writeFile(path.join(root, "review.md"), renderReview(review, pack) + (v.ok ? "" : `\n## Erros de validação\n\n\`\`\`\n${formatIssues(v.errors)}\n\`\`\`\n`));
  log(`Pack: ${path.relative(process.cwd(), outPath)} · válido: ${v.ok} (${v.errors.length} erro(s), ${v.warnings.length} aviso(s))`);
  if (!v.ok) log(formatIssues(v.errors));
  log(`Revisão: ${path.relative(process.cwd(), path.join(root, "review.md"))}`);
  if (v.ok && !flags["no-index"]) {
    const idxPath = path.join(repoRoot, "app", "packs", "index.json");
    const idx = await readJSON(idxPath, { packs: [] });
    const entry = { id: pack.concurso.id, arquivo: `${pack.concurso.id}.json`, nome: pack.concurso.nome, orgao: pack.concurso.orgao, banca: pack.concurso.banca, cargo: pack.concurso.cargo, data_prova: pack.concurso.data_prova, status: config.status ?? "rascunho", descricao: config.descricao ?? "" };
    const i = idx.packs.findIndex((p) => p.id === entry.id);
    if (i >= 0) idx.packs[i] = entry;
    else idx.packs.push(entry);
    await writeJSON(idxPath, idx);
    log(`index.json atualizado (${entry.status}).`);
  }
}

const COMMANDS = { init: cmdInit, extract: cmdExtract, parse: cmdParse, classify: cmdClassify, assemble: cmdAssemble };
COMMANDS.all = async (dir) => {
  await cmdExtract(dir);
  await cmdParse(dir);
  await cmdClassify(dir);
  await cmdAssemble(dir);
};

if (!cmd || !COMMANDS[cmd] || !dirArg) {
  console.log("uso: node tools/pack-builder/cli.js <init|extract|parse|classify|assemble|all> <workspace-dir> [--backend=pdftotext|pdfjs] [--force] [--dry-run] [--model=…] [--lote=10] [--effort=low|medium|high] [--no-index]");
  process.exit(cmd ? 1 : 0);
}
COMMANDS[cmd](dirArg).catch((err) => {
  console.error(`erro: ${err.message ?? err}`);
  process.exit(1);
});
