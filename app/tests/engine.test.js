// Engine tests. Run with: node --test app/tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { generate, validatePack, PACK_SCHEMA, score, DEFAULT_WEIGHTS, ALLOCATION_DEFAULTS } from "../src/engine/index.js";
import { computeGap, SCORE_DEFAULTS } from "../src/engine/score.js";
import { planRevisions } from "../src/engine/revision.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(here, "..", "packs", "_fixture.json");
const schemaPath = path.join(here, "..", "packs", "_schema.json");
const loadFixture = () => JSON.parse(readFileSync(fixturePath, "utf8"));

const SPEC_AVAILABILITY = {
  horas_por_dia_semana: { seg: 2, ter: 2, qua: 0, qui: 2, sex: 2, sab: 4, dom: 0 },
  data_inicio: "2026-11-16",
};

const blocksOf = (result) => result.cronograma.flatMap((w) => w.dias.flatMap((d) => d.blocos.map((b) => ({ ...b, data: d.data, semana: w.numero }))));

function assertScheduleInvariants(result, { blocoMin = 30, blocoMax = 90 } = {}) {
  assert.equal(result.ok, true);
  assert.ok(Array.isArray(result.cronograma) && result.cronograma.length > 0);
  for (const week of result.cronograma) {
    assert.ok(week.alocado_min <= week.capacidade_util_min + 1e-9, `semana ${week.numero} acima da capacidade útil`);
    for (const day of week.dias) {
      assert.ok(day.alocado_min <= day.capacidade_min, `dia ${day.data} acima da capacidade`);
      let lastMat = null;
      for (const b of day.blocos) {
        assert.ok(b.minutos % blocoMin === 0, `bloco fora da grade de ${blocoMin} min em ${day.data}`);
        if (b.atividade !== "simulado") {
          assert.ok(b.minutos >= blocoMin && b.minutos <= blocoMax, `bloco de ${b.minutos} min em ${day.data}`);
        }
        assert.equal(typeof b.motivo, "string");
        assert.ok(b.motivo.length > 10, "motivo vazio");
        if (b.materia_id !== null && lastMat !== null && b.materia_id === lastMat) {
          const warned = result.avisos.some((a) => a.codigo === "materia_consecutiva" && a.data === day.data);
          assert.ok(warned, `matéria repetida sem aviso em ${day.data}`);
        }
        lastMat = b.materia_id;
      }
      if (day.reta_final) {
        assert.ok(day.blocos.every((b) => b.atividade !== "teoria"), `teoria na reta final em ${day.data}`);
      }
    }
    const relaxed = result.avisos.some((a) => a.codigo === "cap_novos_relaxado" && a.semana === week.numero);
    assert.ok(week.teto_novos >= ALLOCATION_DEFAULTS.max_new_per_week);
    if (!relaxed) assert.ok(week.novos_assuntos.length <= week.teto_novos, `semana ${week.numero}: ${week.novos_assuntos.length} assuntos novos (teto ${week.teto_novos})`);
    if (week.reta_final && week.dias.every((d) => d.reta_final)) assert.equal(week.novos_assuntos.length, 0, `assunto novo na reta final (semana ${week.numero})`);
    const revMin = week.dias.reduce((s, d) => s + d.blocos.filter((b) => b.atividade === "revisao").reduce((t, b) => t + b.minutos, 0), 0);
    const revOwn = week.capacidade_util_min * ALLOCATION_DEFAULTS.revision_week_cap;
    const revLimit = revOwn >= ALLOCATION_DEFAULTS.revision_minutes ? revOwn : ALLOCATION_DEFAULTS.revision_minutes; // tiny weeks accumulate up to one block
    assert.ok(revMin <= revLimit + 1e-9, `revisões acima de 15% na semana ${week.numero}`);
  }
}

/* ---------- validation ---------- */

test("_schema.json está sincronizado com PACK_SCHEMA", () => {
  const onDisk = JSON.parse(readFileSync(schemaPath, "utf8"));
  assert.deepEqual(onDisk, JSON.parse(JSON.stringify(PACK_SCHEMA)));
});

test("fixture é válida", () => {
  const v = validatePack(loadFixture());
  assert.equal(v.ok, true, JSON.stringify(v.errors));
});

test("pack inválido falha apontando o campo", () => {
  const pack = loadFixture();
  delete pack.assuntos[2].carga_horaria_base;
  pack.estrutura_prova.materias[0].questoes = -1;
  pack.assuntos[5].tipo = "resumo";
  const v = validatePack(pack);
  assert.equal(v.ok, false);
  const paths = v.errors.map((e) => e.path);
  assert.ok(paths.includes("/assuntos/2/carga_horaria_base"), paths.join(","));
  assert.ok(paths.includes("/estrutura_prova/materias/0/questoes"), paths.join(","));
  assert.ok(paths.includes("/assuntos/5/tipo"), paths.join(","));
  const r = generate({ pack, disponibilidade: SPEC_AVAILABILITY });
  assert.equal(r.ok, false);
  assert.equal(r.etapa, "validacao");
});

test("referências quebradas falham: matéria, ano de prova, concurso da banca", () => {
  const pack = loadFixture();
  pack.assuntos[0].materia_id = "mat_x";
  pack.assuntos[1].incidencia_cargo[0].ano = 2019;
  pack.assuntos[2].incidencia_banca[0].concurso = "inexistente";
  const v = validatePack(pack);
  assert.equal(v.ok, false);
  const msgs = v.errors.map((e) => `${e.path}: ${e.message}`).join("\n");
  assert.match(msgs, /\/assuntos\/0\/materia_id: matéria desconhecida/);
  assert.match(msgs, /\/assuntos\/1\/incidencia_cargo\/0\/ano/);
  assert.match(msgs, /\/assuntos\/2\/incidencia_banca\/0\/concurso/);
});

test("prereq circular falha explicitamente", () => {
  const pack = loadFixture();
  // a1 -> a2 -> a4 -> a1
  pack.assuntos.find((a) => a.id === "mat_a.a1").prereq = ["mat_a.a4"];
  const v = validatePack(pack);
  assert.equal(v.ok, false);
  const err = v.errors.find((e) => /ciclo em prereq/.test(e.message));
  assert.ok(err, JSON.stringify(v.errors));
  assert.match(err.message, /mat_a\.a1/);
  assert.match(err.message, /mat_a\.a4/);
});

/* ---------- scoring ---------- */

test("assunto sem histórico (F=0, B=0) recebe prioridade via E", () => {
  const pack = loadFixture();
  const s = score({ pack });
  const b4 = s.byId["mat_b.b4"];
  assert.equal(b4.F, 0);
  assert.equal(b4.B, 0);
  assert.ok(b4.E > 0);
  assert.ok(b4.P > 0);
  assert.ok(Math.abs(b4.P - DEFAULT_WEIGHTS.wE * b4.E * b4.M) < 1e-12);
});

test("nivelamento vazio: G=0 em todos, P = (wF·F + wB·B + wE·E)·M", () => {
  const pack = loadFixture();
  const s = score({ pack, nivelamento: {} });
  for (const id of s.ranking) {
    const x = s.byId[id];
    assert.equal(x.G, 0);
    assert.equal(x.gap_source, "nenhum");
    const expected = (DEFAULT_WEIGHTS.wF * x.F + DEFAULT_WEIGHTS.wB * x.B + DEFAULT_WEIGHTS.wE * x.E) * x.M;
    assert.ok(Math.abs(x.P - expected) < 1e-12, id);
    assert.ok(Math.abs(x.contrib.F + x.contrib.B + x.contrib.E - x.P) < 1e-12, "contribuições somam P");
  }
  assert.equal(s.byId["mat_b.b2"].M, SCORE_DEFAULTS.volatileMultiplier, "volátil ×1.15");
  assert.equal(s.byId["mat_a.a2"].M, 1, "eliminatória sem lacuna não multiplica");
  const r = generate({ pack, disponibilidade: SPEC_AVAILABILITY });
  assert.equal(r.ok, true);
  assert.equal(r.cobertura_parcial, false);
});

test("G: autoavaliação, simulado com shrinkage, híbrido e eliminatória", () => {
  const cfg = SCORE_DEFAULTS;
  assert.equal(computeGap("x", { autoavaliacao: { x: "nunca" } }, cfg).G, 1);
  assert.equal(computeGap("x", { autoavaliacao: { x: 4 } }, cfg).G, 0);
  assert.equal(computeGap("x", { autoavaliacao: { x: 1 } }, cfg).G, 0.75);
  // 2 answered, 2 wrong -> (2 + 1.5) / (2 + 3) = 0.7, not 1.0
  assert.ok(Math.abs(computeGap("x", { simulado: { x: { respondidas: 2, erros: 2 } } }, cfg).G - 0.7) < 1e-12);
  // hybrid: quiz weight 1 below 5 answers, 2 at 5+
  const h1 = computeGap("x", { autoavaliacao: { x: 4 }, simulado: { x: { respondidas: 2, erros: 2 } } }, cfg);
  assert.ok(Math.abs(h1.G - (0 + 0.7) / 2) < 1e-12);
  const h2 = computeGap("x", { autoavaliacao: { x: 4 }, simulado: { x: { respondidas: 5, erros: 5 } } }, cfg);
  const gq = (5 + 1.5) / (5 + 3);
  assert.ok(Math.abs(h2.G - (0 + 2 * gq) / 3) < 1e-12);

  const pack = loadFixture();
  const s = score({ pack, nivelamento: { autoavaliacao: { "mat_a.a2": "nunca", "mat_b.b2": 0 } } });
  assert.equal(s.byId["mat_a.a2"].M, SCORE_DEFAULTS.eliminatoryMultiplier, "eliminatória com G ≥ 0,6 → ×1,30");
  assert.equal(s.byId["mat_b.b2"].M, SCORE_DEFAULTS.volatileMultiplier, "matéria B não é eliminatória");
  assert.equal(s.byId["mat_a.a2"].gap_factor, 2);
});

/* ---------- allocation ---------- */

test("capacidade insuficiente retorna cobertura_parcial, não cronograma comprimido", () => {
  const pack = loadFixture();
  const r = generate({ pack, disponibilidade: { horas_por_dia_semana: { sab: 1 }, data_inicio: "2026-11-16" } });
  assert.equal(r.ok, true);
  assert.equal(r.cobertura_parcial, true);
  assert.equal(r.mensagem_id, "cobertura_parcial");
  assert.equal(r.cronograma, null);
  assert.ok(r.deficit_horas > 0);
  assert.ok(r.assuntos_cortados.length > 0);
  // cut in ascending P order
  const s = r.scores.byId;
  for (let i = 1; i < r.assuntos_cortados.length; i++) {
    assert.ok(s[r.assuntos_cortados[i - 1]].P <= s[r.assuntos_cortados[i]].P);
  }
  // with accept_cut the remaining topics are scheduled
  const r2 = generate({ pack, disponibilidade: { horas_por_dia_semana: { sab: 1 }, data_inicio: "2026-11-16" }, options: { allocate: { accept_cut: true } } });
  assert.equal(r2.cobertura_parcial, true);
  assertScheduleInvariants(r2);
  const scheduled = new Set(blocksOf(r2).map((b) => b.assunto_id));
  for (const id of r2.assuntos_cortados) assert.ok(!scheduled.has(id), `${id} foi cortado mas aparece no cronograma`);
});

test("cenário mínimo: 1 dia/semana, 1h/dia", () => {
  const pack = loadFixture();
  const r = generate({
    pack,
    disponibilidade: { horas_por_dia_semana: { dom: 1 }, data_inicio: "2026-11-16", data_prova: "2030-11-10" },
  });
  assert.equal(r.cobertura_parcial, false, JSON.stringify({ cap: r.capacidade, deficit: r.deficit_horas }));
  assertScheduleInvariants(r);
  assert.equal(r.resumo.horas_nao_alocadas, 0);
  assert.equal(r.resumo.assuntos_nao_iniciados.length, 0);
  for (const b of blocksOf(r)) assert.ok(b.minutos <= 60);
});

test("cenário folgado: 7 dias/semana, 6h/dia não infla além do clamp 2×", () => {
  const pack = loadFixture();
  const base = Object.fromEntries(pack.assuntos.map((a) => [a.id, a.carga_horaria_base]));
  const r = generate({
    pack,
    disponibilidade: { horas_por_dia_semana: { seg: 6, ter: 6, qua: 6, qui: 6, sex: 6, sab: 6, dom: 6 }, data_inicio: "2026-11-16" },
  });
  assertScheduleInvariants(r);
  for (const o of r.orcamentos) {
    assert.ok(o.hours <= 2 * base[o.assunto_id] + 1e-9, `${o.assunto_id}: ${o.hours}h > 2× base`);
    assert.equal(o.clamp, "max");
  }
  const firstPass = Object.fromEntries(r.resumo.por_assunto.map((a) => [a.assunto_id, a.teoria_min + a.questoes_min]));
  for (const o of r.orcamentos) assert.ok(firstPass[o.assunto_id] <= o.min, `${o.assunto_id} estudou além do orçamento`);
  assert.ok(r.resumo.horas_livres > 0, "sobra fica livre por padrão");
});

test("orçamentos respeitam o clamp [0,5×, 2×] e somam a capacidade de conteúdo", () => {
  const pack = loadFixture();
  const base = Object.fromEntries(pack.assuntos.map((a) => [a.id, a.carga_horaria_base]));
  const r = generate({ pack, disponibilidade: SPEC_AVAILABILITY });
  let total = 0;
  for (const o of r.orcamentos) {
    assert.ok(o.hours >= 0.5 * base[o.assunto_id] - 1e-9);
    assert.ok(o.hours <= 2 * base[o.assunto_id] + 1e-9);
    total += o.hours;
  }
  assert.ok(Math.abs(total - r.capacidade.horas_para_conteudo) < 0.05, `${total} vs ${r.capacidade.horas_para_conteudo}`);
});

test("cenário da spec: cobre todos os assuntos, revisa, simula e respeita restrições", () => {
  const pack = loadFixture();
  const r = generate({ pack, disponibilidade: SPEC_AVAILABILITY });
  assertScheduleInvariants(r);
  assert.equal(r.resumo.assuntos_concluidos, 12);
  assert.equal(r.resumo.horas_nao_alocadas, 0);
  assert.ok(r.resumo.simulados >= 4);
  const blocks = blocksOf(r);
  assert.ok(blocks.some((b) => b.atividade === "revisao" && b.intervalo_dias === 1));
  assert.ok(blocks.some((b) => b.atividade === "revisao" && b.intervalo_dias === 21));
  // prereq order: a topic opens only after its prerequisites opened
  const openedAt = Object.fromEntries(r.resumo.por_assunto.map((a) => [a.assunto_id, a.aberto_em]));
  for (const a of pack.assuntos) for (const p of a.prereq) assert.ok(openedAt[p] <= openedAt[a.id], `${a.id} abriu antes de ${p}`);
  // mock cadence: every 4 weeks, every 2 inside the last 60 days
  const mockWeeks = r.cronograma.filter((w) => w.simulado).map((w) => w.numero);
  assert.deepEqual(mockWeeks.slice(0, 2), [4, 8]);
  // the final stretch has no new topics
  const finalWeeks = r.cronograma.filter((w) => w.dias.every((d) => d.reta_final));
  assert.ok(finalWeeks.length >= 2);
  for (const w of finalWeeks) assert.equal(w.novos_assuntos.length, 0);
});

test("ratio_teoria_questoes_sugerido da banca sobrescreve 60/40", () => {
  const pack = loadFixture();
  pack.notas_banca.ratio_teoria_questoes_sugerido = [0.4, 0.6];
  const r = generate({ pack, disponibilidade: SPEC_AVAILABILITY });
  for (const o of r.orcamentos) assert.ok(Math.abs(o.t_min / o.min - 0.4) <= 30 / o.min + 1e-9, `${o.assunto_id}: ${o.t_min}/${o.min}`);
});

test("disponibilidade inválida é rejeitada com caminho do campo", () => {
  const pack = loadFixture();
  const r = generate({ pack, disponibilidade: { horas_por_dia_semana: { seg: 2 }, data_inicio: "2027-06-01" } });
  assert.equal(r.ok, false);
  assert.equal(r.etapa, "disponibilidade");
  assert.ok(r.erros.some((e) => e.path === "/data_inicio"));
});

test("revisão espaçada: 1, 7, 21 e 60 dias, descartando datas após a prova", () => {
  const close = Date.UTC(2027, 0, 10);
  const exam = Date.UTC(2027, 1, 15); // 36 days later
  assert.deepEqual(planRevisions(close, exam).map((r) => r.days), [1, 7, 21]);
});

test("determinismo: mesma entrada produz saída idêntica em 3 execuções", () => {
  const run = () => {
    const pack = loadFixture();
    const nivelamento = { autoavaliacao: { "mat_a.a2": "nunca", "mat_c.c1": 3 }, simulado: { "mat_b.b2": { respondidas: 6, erros: 4 } } };
    return JSON.stringify(generate({ pack, nivelamento, disponibilidade: SPEC_AVAILABILITY }));
  };
  const a = run();
  const b = run();
  const c = run();
  assert.equal(a, b);
  assert.equal(b, c);
});

/* ---------- additions: peso, níveis, simulado ---------- */

import { sampleQuiz, scoreQuiz } from "../src/engine/quiz.js";
import { levelOf } from "../src/engine/score.js";

test("peso por matéria entra em E (questões × peso)", () => {
  const pack = loadFixture();
  const s1 = score({ pack });
  pack.estrutura_prova.materias.forEach((m) => (m.peso = 1));
  const s2 = score({ pack });
  // with pesos 2/2/1 matéria C topics weigh less than with equal pesos
  assert.ok(s1.byId["mat_c.c1"].E < s2.byId["mat_c.c1"].E);
  assert.equal(s1.materias.mat_a.pontos, 30);
  assert.equal(s1.totalPoints, 70);
  assert.ok(Math.abs(s1.materias.mat_a.share_prova - 30 / 70) < 1e-12);
});

test("níveis 1–5 por assunto e por matéria", () => {
  assert.deepEqual([1, 0.8, 0.6, 0.4, 0.2, 0.19, 0].map(levelOf), [5, 5, 4, 3, 2, 1, 1]);
  const s = score({ pack: loadFixture() });
  assert.equal(s.byId[s.ranking[0]].nivel, 5);
  assert.equal(s.byId[s.ranking[s.ranking.length - 1]].nivel, 1);
  for (const id of s.ranking) assert.ok(s.byId[id].nivel >= 1 && s.byId[id].nivel <= 5);
  assert.equal(s.materias[s.materiaRanking[0]].nivel, 5);
  assert.ok(s.byId["mat_b.b4"].rank_hist > s.byId["mat_b.b4"].rank_edital, "sem histórico cai no quadro A e sobe no B");
});

test("simulado: 40 itens determinísticos, estratificados, cobrindo todos os assuntos com itens", () => {
  const pack = loadFixture();
  const a = sampleQuiz(pack);
  const b = sampleQuiz(pack);
  assert.equal(a.itens.length, 40);
  assert.deepEqual(a.itens.map((i) => i.id), b.itens.map((i) => i.id));
  assert.equal(new Set(a.itens.map((i) => i.id)).size, 40);
  assert.equal(a.cobertos.length, pack.assuntos.length);
  assert.deepEqual(a.sem_itens, []);
  // heavier topics (matéria A/B, depth 3) get more questions than light ones
  assert.ok(a.cotas["mat_b.b2"] >= a.cotas["mat_c.c4"]);
  // another pack version -> another sample
  const c = sampleQuiz({ ...pack, pack_version: "1.0.1" });
  assert.notDeepEqual(a.itens.map((i) => i.id), c.itens.map((i) => i.id));
  // fewer items than topics: heaviest first, one each
  const small = sampleQuiz(pack, { n: 5 });
  assert.equal(small.itens.length, 5);
  assert.equal(new Set(small.itens.map((i) => i.assunto_id)).size, 5);
});

test("simulado: pontuação por assunto alimenta G com shrinkage", () => {
  const pack = loadFixture();
  const { itens } = sampleQuiz(pack);
  const respostas = {};
  itens.forEach((it, i) => (respostas[it.id] = i % 2 === 0 ? it.gabarito : (it.gabarito + 1) % it.alternativas.length));
  const r = scoreQuiz(itens, respostas);
  assert.equal(r.total.respondidas, 40);
  assert.equal(r.total.acertos + r.total.erros, 40);
  const s = score({ pack, nivelamento: { simulado: r.porAssunto } });
  for (const id of Object.keys(r.porAssunto)) {
    assert.equal(s.byId[id].gap_source, "simulado");
    assert.ok(s.byId[id].G > 0 && s.byId[id].G < 1);
  }
});

test("teto de novos sobe com o ritmo necessário (30 assuntos em 21 semanas)", () => {
  const pack = loadFixture();
  const extra = [];
  for (let k = 0; k < 18; k++) {
    const src = pack.assuntos[k % 12];
    extra.push({ ...src, id: `${src.materia_id}.x${k}`, nome: `Extra ${k}`, prereq: [], carga_horaria_base: 4, incidencia_cargo: [], incidencia_banca: [] });
  }
  pack.assuntos.push(...extra);
  pack.nivelamento.itens = [];
  const r = generate({ pack, disponibilidade: SPEC_AVAILABILITY });
  assertScheduleInvariants(r);
  assert.equal(r.resumo.assuntos_nao_iniciados.length, 0);
  assert.ok(r.cronograma.some((w) => w.teto_novos > 2));
});

test("exceções por data substituem as horas do dia da semana", () => {
  const pack = loadFixture();
  const base = { ...SPEC_AVAILABILITY, data_prova: "2027-03-01" };
  const plain = generate({ pack, disponibilidade: base });
  const dia = plain.cronograma[1].dias.find((d) => d.capacidade_min > 0).data;
  const quarta = plain.cronograma[1].dias.find((d) => d.dia_semana === "qua").data; // quarta tem 0h
  const r = generate({ pack, disponibilidade: { ...base, excecoes: { [dia]: 0, [quarta]: 3 } } });
  const find = (res, iso) => res.cronograma.flatMap((w) => w.dias).find((d) => d.data === iso);
  assert.equal(find(r, dia).capacidade_min, 0);
  assert.equal(find(r, dia).blocos.length, 0);
  assert.equal(find(r, quarta).capacidade_min, 180);
  assert.equal(r.capacidade.horas_brutas, plain.capacidade.horas_brutas - find(plain, dia).capacidade_min / 60 + 3);
  assertScheduleInvariants(r);
  const bad = generate({ pack, disponibilidade: { ...base, excecoes: { "2027-02-30": 1, [dia]: 30 } } });
  assert.equal(bad.ok, false);
  assert.equal(bad.erros.length, 2);
});

test("concluídos fora do plano: sem conteúdo novo, mas com revisões a partir do início", () => {
  const pack = loadFixture();
  const [done, ...rest] = pack.assuntos;
  const scoped = { ...pack, assuntos: rest.map((a) => ({ ...a, prereq: a.prereq.filter((p) => p !== done.id) })), nivelamento: { ...pack.nivelamento, itens: pack.nivelamento.itens.filter((i) => i.assunto_id !== done.id) } };
  const disponibilidade = { ...SPEC_AVAILABILITY, data_prova: "2027-03-01" };
  const r = generate({ pack: scoped, disponibilidade, options: { allocate: { concluidos: [{ id: done.id, materia_id: done.materia_id, nome: done.nome, data: "2026-11-10" }] } } });
  assertScheduleInvariants(r);
  const blocks = blocksOf(r).filter((b) => b.assunto_id === done.id);
  assert.ok(blocks.length > 0, "assunto concluído recebe revisões");
  assert.ok(blocks.every((b) => b.atividade === "revisao"));
  assert.ok(blocks.every((b) => b.data >= "2026-11-16"), "revisões vencidas antes do início são descartadas");
  assert.deepEqual([...new Set(blocks.map((b) => b.intervalo_dias))].sort((a, b) => a - b), [7, 21, 60]);
});
