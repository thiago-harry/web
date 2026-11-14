// Question -> assunto classification with Claude (offline curation step, never in the app).
// Output contract (classification.json): { "<prova>#<numero>": { assunto_id, confianca, desatualizada, motivo } }
// The same file can be produced or edited by hand; assemble.js only reads it.
import Anthropic from "@anthropic-ai/sdk";

export const CLASSIFY_DEFAULTS = Object.freeze({ model: "claude-opus-5-5", batchSize: 10, effort: "medium", maxTokens: 16000 });

const SYSTEM = `Você classifica questões de concurso público brasileiro nos assuntos do edital.
Responda APENAS com JSON válido (um array), sem comentários nem texto fora do JSON.
Regras:
- Escolha o assunto_id que melhor cobre o conhecimento exigido pela questão. Use null se nenhum couber.
- confianca entre 0 e 1: 0,9+ quando o enunciado cita o tema diretamente; 0,5–0,7 quando a questão mistura temas; abaixo de 0,5 quando é palpite.
- desatualizada = true somente se a questão depende de norma revogada ou alterada (ex.: Lei 8.666 após a Lei 14.133; CLT antes da reforma de 2017 em ponto alterado). Caso contrário, false.
- motivo: uma frase curta.`;

function buildPrompt({ assuntos, questoes }) {
  const lista = assuntos.map((a) => `- ${a.id} — ${a.nome}${a.edital_literal ? ` — edital: ${a.edital_literal}` : ""}`).join("\n");
  const qs = questoes
    .map((q) => {
      const alts = (q.alternativas ?? []).map((t, i) => `  (${"ABCDE"[i]}) ${t}`).join("\n");
      return `### Questão ${q.numero}${q.gabarito ? ` (gabarito ${q.gabarito})` : ""}\n${q.contexto ? `Contexto: ${q.contexto}\n` : ""}${q.enunciado}\n${alts}`;
    })
    .join("\n\n");
  return `ASSUNTOS DISPONÍVEIS:\n${lista}\n\nQUESTÕES:\n${qs}\n\nResponda com um array JSON com um objeto por questão: {"numero": <int>, "assunto_id": <string|null>, "confianca": <0..1>, "desatualizada": <bool>, "motivo": <string>}.`;
}

export function parseJsonArray(text) {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("resposta sem array JSON");
  const arr = JSON.parse(cleaned.slice(start, end + 1));
  if (!Array.isArray(arr)) throw new Error("JSON não é array");
  return arr;
}

/** Calls the model once for a batch; returns the parsed array. */
export async function classifyBatch({ client, assuntos, questoes, model, effort, maxTokens }) {
  const content = buildPrompt({ assuntos, questoes });
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.beta.messages.create({
      model,
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort },
      system: SYSTEM,
      messages: [{ role: "user", content: attempt === 0 ? content : `${content}\n\nA resposta anterior não era JSON válido. Responda só o array JSON.` }],
    });
    if (response.stop_reason === "refusal") throw new Error(`recusa do modelo: ${response.stop_details?.category ?? "sem categoria"}`);
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    try {
      return { items: parseJsonArray(text), usage: response.usage, model: response.model };
    } catch (err) {
      if (attempt === 1) throw err;
    }
  }
  throw new Error("unreachable");
}

/**
 * classifyQuestions({ provas, assuntos, existing, onBatch, options }) -> classification map.
 * provas: [{ key, questoes: [...] }]. Questions already in `existing` are skipped (resume).
 * Candidates are the assuntos of the question's matéria when known, else all.
 */
export async function classifyQuestions({ provas, assuntos, existing = {}, onBatch, options = {}, client = new Anthropic() }) {
  const cfg = { ...CLASSIFY_DEFAULTS, ...options };
  const out = { ...existing };
  const validIds = new Set(assuntos.map((a) => a.id));
  const byMateria = new Map();
  for (const a of assuntos) {
    if (!byMateria.has(a.materia_id)) byMateria.set(a.materia_id, []);
    byMateria.get(a.materia_id).push(a);
  }
  const usage = { input_tokens: 0, output_tokens: 0, batches: 0, erros: [] };

  for (const prova of provas) {
    const pending = prova.questoes.filter((q) => !q.anulada && q.materia_id !== "_fora" && !(`${prova.key}#${q.numero}` in out));
    // group by matéria hint to keep candidate lists short
    const groups = new Map();
    for (const q of pending) {
      const k = q.materia_id ?? "*";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(q);
    }
    for (const [mid, qs] of groups) {
      const candidates = mid !== "*" && byMateria.has(mid) ? byMateria.get(mid) : assuntos;
      for (let i = 0; i < qs.length; i += cfg.batchSize) {
        const batch = qs.slice(i, i + cfg.batchSize);
        try {
          const { items, usage: u } = await classifyBatch({ client, assuntos: candidates, questoes: batch, model: cfg.model, effort: cfg.effort, maxTokens: cfg.maxTokens });
          usage.input_tokens += u?.input_tokens ?? 0;
          usage.output_tokens += u?.output_tokens ?? 0;
          usage.batches += 1;
          const byNum = new Map(items.map((it) => [Number(it.numero), it]));
          for (const q of batch) {
            const it = byNum.get(q.numero);
            const key = `${prova.key}#${q.numero}`;
            if (!it) {
              out[key] = { assunto_id: null, confianca: 0, desatualizada: false, motivo: "sem resposta do modelo" };
              continue;
            }
            const id = it.assunto_id && validIds.has(it.assunto_id) ? it.assunto_id : null;
            out[key] = {
              assunto_id: id,
              confianca: id ? Math.max(0, Math.min(1, Number(it.confianca) || 0)) : 0,
              desatualizada: Boolean(it.desatualizada),
              motivo: id ? String(it.motivo ?? "") : `id inválido: ${it.assunto_id ?? "null"}`,
            };
          }
        } catch (err) {
          usage.erros.push({ prova: prova.key, materia: mid, de: batch[0].numero, ate: batch[batch.length - 1].numero, erro: String(err.message ?? err) });
        }
        if (onBatch) await onBatch({ out, usage, prova: prova.key, materia: mid, feitas: Math.min(i + cfg.batchSize, qs.length), total: qs.length });
      }
    }
  }
  return { classification: out, usage };
}
