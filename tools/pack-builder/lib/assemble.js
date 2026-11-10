// Draft assuntos + parsed provas + classification -> content pack + review report.
import { half } from "./text.js";

export const ASSEMBLE_DEFAULTS = Object.freeze({
  confiancaMinima: 0.6, // items below this stay out of nivelamento.itens and go to the review
  cargaPadrao: (a) => half(Math.min(24, Math.max(2, 2 + 2 * a.edital_profundidade + 0.5 * (a.subitens ?? 0)))),
});

const LETTER_INDEX = { A: 0, B: 1, C: 2, D: 3, E: 4 };

/**
 * assemblePack({ config, assuntos, provas, classification, overrides, options }) -> { pack, review }
 *
 * config.estrutura_prova.materias[]: { id, nome, questoes, peso?, eliminatoria, min_acertos, tipo_default?, aliases? }
 * provas: [{ key, tipo: "cargo"|"banca", ano, concurso?, fonte, total_questoes?, questoes: [{ numero, materia_id, contexto, enunciado, alternativas, gabarito, anulada }] }]
 * classification: { "<key>#<numero>": { assunto_id, confianca, desatualizada } }
 * overrides.assuntos: { [id]: { nome?, carga_horaria_base?, tipo?, prereq?, volatil?, edital_profundidade? } }
 */
export function assemblePack({ config, assuntos, provas, classification = {}, overrides = {}, options = {} }) {
  const cfg = { ...ASSEMBLE_DEFAULTS, ...options };
  const materias = config.estrutura_prova.materias.map((m) => ({
    id: m.id,
    nome: m.nome,
    questoes: m.questoes,
    ...(m.peso !== undefined ? { peso: m.peso } : {}),
    eliminatoria: Boolean(m.eliminatoria),
    min_acertos: m.min_acertos ?? null,
  }));
  const tipoDefault = Object.fromEntries(config.estrutura_prova.materias.map((m) => [m.id, m.tipo_default ?? "lei_seca"]));
  const review = { contagem: [], baixa_confianca: [], sem_assunto: [], sem_gabarito: [], desatualizadas: [], padroes: [], anomalias: [], avisos: [] };

  // incidence per assunto per prova
  const inc = new Map(assuntos.map((a) => [a.id, { cargo: new Map(), banca: new Map() }]));
  const itens = [];
  for (const p of provas) {
    const counts = new Map();
    for (const q of p.questoes) {
      const key = `${p.key}#${q.numero}`;
      if (q.anulada) continue;
      if (q.gabarito === null || q.gabarito === undefined) review.sem_gabarito.push(key);
      const c = classification[key];
      if (!c || !c.assunto_id) {
        review.sem_assunto.push({ questao: key, materia: q.materia_id, motivo: c?.motivo ?? "não classificada" });
        continue;
      }
      if (!inc.has(c.assunto_id)) {
        review.avisos.push(`${key}: assunto ${c.assunto_id} não existe no rascunho`);
        continue;
      }
      const slot = inc.get(c.assunto_id)[p.tipo];
      const k = p.tipo === "cargo" ? String(p.ano) : p.concurso;
      slot.set(k, (slot.get(k) ?? 0) + 1);
      counts.set(q.materia_id ?? "?", (counts.get(q.materia_id ?? "?") ?? 0) + 1);
      if (c.confianca < cfg.confiancaMinima) review.baixa_confianca.push({ questao: key, assunto_id: c.assunto_id, confianca: c.confianca, motivo: c.motivo });
      if (c.desatualizada) review.desatualizadas.push(key);
      const gab = LETTER_INDEX[q.gabarito];
      if (c.confianca >= cfg.confiancaMinima && gab !== undefined && q.alternativas.length >= 2 && gab < q.alternativas.length) {
        itens.push({
          id: `${p.key}-q${q.numero}`,
          assunto_id: c.assunto_id,
          enunciado: q.contexto ? `${q.contexto}\n\n${q.enunciado}` : q.enunciado,
          alternativas: q.alternativas,
          gabarito: gab,
          fonte: p.fonte,
          ano: p.ano,
          desatualizada: Boolean(c.desatualizada),
        });
      }
    }
    review.contagem.push({
      prova: p.key,
      total_parseado: p.questoes.length,
      anuladas: p.questoes.filter((q) => q.anulada).length,
      por_materia: Object.fromEntries([...counts.entries()]),
      esperado: Object.fromEntries(materias.map((m) => [m.id, m.questoes])),
    });
    for (const a of p.anomalias ?? []) review.anomalias.push({ prova: p.key, ...a });
  }

  const assuntosOut = assuntos.map((a) => {
    const o = overrides.assuntos?.[a.id] ?? {};
    const carga = o.carga_horaria_base ?? cfg.cargaPadrao(a);
    const tipo = o.tipo ?? tipoDefault[a.materia_id];
    if (o.carga_horaria_base === undefined) review.padroes.push({ assunto_id: a.id, campo: "carga_horaria_base", valor: carga });
    if (o.tipo === undefined) review.padroes.push({ assunto_id: a.id, campo: "tipo", valor: tipo });
    const i = inc.get(a.id);
    return {
      id: a.id,
      materia_id: a.materia_id,
      nome: o.nome ?? a.nome,
      edital_literal: a.edital_literal,
      edital_profundidade: o.edital_profundidade ?? a.edital_profundidade,
      incidencia_cargo: [...i.cargo.entries()].map(([ano, questoes]) => ({ ano: Number(ano), questoes })).sort((x, y) => x.ano - y.ano),
      incidencia_banca: [...i.banca.entries()].map(([concurso, questoes]) => {
        const p = provas.find((pp) => pp.tipo === "banca" && pp.concurso === concurso);
        return { concurso, ano: p.ano, questoes };
      }),
      carga_horaria_base: carga,
      prereq: o.prereq ?? [],
      tipo,
      volatil: Boolean(o.volatil),
    };
  });

  const pack = {
    pack_version: config.pack_version ?? "0.1.0",
    concurso: config.concurso,
    estrutura_prova: {
      total_questoes: config.estrutura_prova.total_questoes,
      tipo: config.estrutura_prova.tipo,
      penalidade_erro: Boolean(config.estrutura_prova.penalidade_erro),
      nota_corte_estimada: config.estrutura_prova.nota_corte_estimada ?? 0.6,
      materias,
    },
    assuntos: assuntosOut,
    provas_historico: provas.filter((p) => p.tipo === "cargo").map((p) => ({ ano: p.ano, total_questoes: p.total_questoes ?? p.questoes.length, fonte: p.fonte })),
    provas_banca: provas.filter((p) => p.tipo === "banca").map((p) => ({ concurso: p.concurso, ano: p.ano, total_questoes: p.total_questoes ?? p.questoes.length, fonte: p.fonte })),
    nivelamento: { modo: itens.length ? "hibrido" : "autoavaliacao", itens },
    notas_banca: {
      estilo: config.notas_banca?.estilo ?? [],
      formato_questao: config.notas_banca?.formato_questao ?? "",
      ratio_teoria_questoes_sugerido: config.notas_banca?.ratio_teoria_questoes_sugerido ?? null,
      recomendacoes_estudo: config.notas_banca?.recomendacoes_estudo ?? [],
    },
  };
  return { pack, review };
}

/** Markdown review report for the curator. */
export function renderReview(review, pack) {
  const lines = [`# Revisão do pack ${pack.concurso.id}`, ""];
  lines.push(`- Assuntos: ${pack.assuntos.length} · itens de nivelamento: ${pack.nivelamento.itens.length}`);
  lines.push(`- Provas do cargo: ${pack.provas_historico.map((p) => p.ano).join(", ") || "—"} · provas da banca: ${pack.provas_banca.map((p) => p.concurso).join(", ") || "—"}`, "");
  lines.push("## Contagem por prova (parseado × esperado por matéria)");
  for (const c of review.contagem) {
    lines.push(`- **${c.prova}**: ${c.total_parseado} questões parseadas (${c.anuladas} anuladas)`);
    for (const [m, n] of Object.entries(c.por_materia)) lines.push(`  - ${m}: ${n} classificadas (edital prevê ${c.esperado[m] ?? "?"})`);
  }
  const section = (title, arr, fmt) => {
    lines.push("", `## ${title} (${arr.length})`);
    if (!arr.length) lines.push("- nenhum");
    for (const x of arr.slice(0, 200)) lines.push(`- ${fmt(x)}`);
  };
  section("Sem assunto (revisar à mão)", review.sem_assunto, (x) => `${x.questao} [${x.materia ?? "?"}] — ${x.motivo}`);
  section("Baixa confiança (confirmar)", review.baixa_confianca, (x) => `${x.questao} → ${x.assunto_id} (${x.confianca.toFixed(2)}) — ${x.motivo}`);
  section("Sem gabarito", review.sem_gabarito, (x) => x);
  section("Marcadas como desatualizadas", review.desatualizadas, (x) => x);
  section("Anomalias de parsing", review.anomalias, (x) => `${x.prova} q${x.numero ?? "?"}: ${x.tipo} ${x.detalhe ?? ""}`);
  const cargas = review.padroes.filter((p) => p.campo === "carga_horaria_base");
  lines.push("", `## Valores padrão aplicados (ajustar em overrides.json)`);
  lines.push(`- carga_horaria_base padrão em ${cargas.length} assunto(s): 2 + 2×profundidade + 0,5×subitens, entre 2h e 24h`);
  lines.push(`- tipo padrão (tipo_default da matéria) em ${review.padroes.filter((p) => p.campo === "tipo").length} assunto(s)`);
  if (review.avisos.length) section("Avisos", review.avisos, (x) => x);
  return lines.join("\n") + "\n";
}
