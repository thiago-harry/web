// Client-side exports: CSV, ICS and block start/end times for a day.
import { parseClock, fmtClock, pad2 } from "./dom.js";
import { t } from "./strings.pt-BR.js";

const WEEKEND = new Set(["sab", "dom"]);

/** Start time for a day: weekdays use `inicio_hora`, Saturday/Sunday use `inicio_hora_fds`. */
export function dayStart(dia, disp) {
  if (typeof disp === "string") return disp;
  return WEEKEND.has(dia.dia_semana) ? disp.inicio_hora_fds ?? disp.inicio_hora : disp.inicio_hora;
}

/** Sequential times for a day's blocks. `inicio` is "HH:MM" or the disponibilidade object. */
export function blockTimes(dia, inicio) {
  let cursor = parseClock(dayStart(dia, inicio));
  return dia.blocos.map((b) => {
    const start = cursor;
    cursor += b.minutos;
    return { start, end: cursor, startLabel: fmtClock(start), endLabel: fmtClock(cursor) };
  });
}

function csvCell(v) {
  const s = String(v ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV({ result, pack, inicioHora }) {
  const nomes = Object.fromEntries(pack.assuntos.map((a) => [a.id, a.nome]));
  const materias = Object.fromEntries(pack.estrutura_prova.materias.map((m) => [m.id, m.nome]));
  const rows = [["semana", "data", "dia", "inicio", "fim", "materia", "assunto", "atividade", "minutos", "motivo"]];
  for (const w of result.cronograma) {
    for (const d of w.dias) {
      const times = blockTimes(d, inicioHora);
      d.blocos.forEach((b, i) => {
        rows.push([
          w.numero,
          d.data,
          t.disponibilidade.dias[d.dia_semana],
          times[i].startLabel,
          times[i].endLabel,
          b.materia_id ? materias[b.materia_id] : "",
          b.assunto_id ? nomes[b.assunto_id] : t.cronograma.atividade.simulado,
          t.cronograma.atividade[b.atividade],
          b.minutos,
          b.motivo,
        ]);
      });
    }
  }
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
}

const icsEscape = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsLocal = (iso, minOfDay) => {
  // floating local time: the student's own timezone
  const dayShift = Math.floor(minOfDay / 1440);
  const m = ((minOfDay % 1440) + 1440) % 1440;
  const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + dayShift));
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(Math.floor(m / 60))}${pad2(m % 60)}00`;
};

export function toICS({ result, pack, inicioHora, stamp }) {
  const nomes = Object.fromEntries(pack.assuntos.map((a) => [a.id, a.nome]));
  const materias = Object.fromEntries(pack.estrutura_prova.materias.map((m) => [m.id, m.nome]));
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mentoria 2G//Cronograma Direcionado//PT", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${icsEscape(`${t.app.nome} · ${pack.concurso.nome}`)}`];
  const dtstamp = stamp ?? "20260101T000000Z";
  for (const w of result.cronograma) {
    for (const d of w.dias) {
      const times = blockTimes(d, inicioHora);
      d.blocos.forEach((b, i) => {
        const subject = b.assunto_id ? nomes[b.assunto_id] : t.cronograma.atividade.simulado;
        const summary = `[${t.cronograma.atividade[b.atividade]}] ${subject}`;
        lines.push(
          "BEGIN:VEVENT",
          `UID:${pack.concurso.id}-${d.data}-${i}@cronograma-2g`,
          `DTSTAMP:${dtstamp}`,
          `DTSTART:${icsLocal(d.data, times[i].start)}`,
          `DTEND:${icsLocal(d.data, times[i].end)}`,
          `SUMMARY:${icsEscape(summary)}`,
          `DESCRIPTION:${icsEscape(`${b.materia_id ? materias[b.materia_id] + " · " : ""}${b.motivo}`)}`,
          `CATEGORIES:${icsEscape(t.cronograma.atividade[b.atividade])}`,
          "END:VEVENT"
        );
      });
    }
  }
  lines.push("END:VCALENDAR");
  // RFC 5545: CRLF line endings, fold lines longer than 75 octets
  return lines
    .map((l) => {
      const parts = [];
      let s = l;
      while (s.length > 60) {
        parts.push(s.slice(0, 60));
        s = " " + s.slice(60);
      }
      parts.push(s);
      return parts.join("\r\n");
    })
    .join("\r\n");
}

export function download(filename, text, mime) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const slug = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
