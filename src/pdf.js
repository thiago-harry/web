// A4 PDF of the full schedule (lazy-loaded jsPDF). Input is already-computed display data.
import { ACTIVITY_LABEL, DAY_LABEL, fmtClock, fmtMin } from "./plan.js";

const C = {
  ink: [15, 23, 41],
  ink2: [70, 80, 104],
  muted: [99, 108, 130],
  line: [214, 220, 229],
  sunken: [242, 244, 248],
  accent: [29, 63, 168],
  accentSoft: [230, 235, 249],
  good: [10, 107, 58],
};
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
// Standard PDF fonts cover Latin-1 only.
const t = (v) =>
  String(v ?? "")
    .replace(/[–—−]/g, "-")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/→/g, "->")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .replace(/[^\x00-\xff]/g, "");
const slugify = (v) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const fmtDMY = (iso) => iso.split("-").reverse().join("/");
const fmtDM = (iso) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
const fmtH = (h) => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(Math.round(h * 10) / 10)}h`;
const fmtPct = (x) => `${Math.round(x * 100)}%`;

/**
 * exportPdf({ appName, pack, weeks, materias: {id: {nome, curto, hex}}, info, top, cmp, aluno })
 *   info: { examISO, simulated, modeLabel, weeklyH, rawH, contentH, scopeLabel, startISO, todayISO }
 *   top:  [{ rank, materia_id, nome, nivel, pts, horas }]
 *   cmp:  { genAt, persAt, gen80, pers80 }
 */
export async function exportPdf({ appName, pack, weeks, materias, info, top, cmp, aluno }) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const nome = (aluno ?? "").trim();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  const margin = { left: M, right: M, top: 16, bottom: 16 };
  doc.setProperties({ title: `${appName}${nome ? ` - ${t(nome)}` : ""}`, author: appName, creator: appName });

  const matCell = (id, content) => ({ content: t(content), mat: id });
  const padMat = { top: 1.8, bottom: 1.8, left: 5.2, right: 1.8 };
  const hooks = {
    didParseCell: (data) => {
      if (data.section === "body" && data.cell.raw?.mat) data.cell.styles.cellPadding = padMat;
    },
    didDrawCell: (data) => {
      if (data.section !== "body") return;
      const raw = data.cell.raw;
      const cy = data.cell.y + data.cell.height / 2;
      if (raw?.mat && materias[raw.mat]) {
        doc.setFillColor(...hexToRgb(materias[raw.mat].hex));
        doc.circle(data.cell.x + 2.6, cy, 1.1, "F");
      }
      if (raw?.check) {
        const cx = data.cell.x + data.cell.width / 2;
        doc.setDrawColor(...C.ink2);
        doc.setLineWidth(0.3);
        doc.rect(cx - 1.75, cy - 1.75, 3.5, 3.5);
      }
      if (raw?.url) doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: raw.url });
    },
  };
  const section = (title, sub, need = 30) => {
    let y = doc.lastAutoTable.finalY + 9;
    if (y + 8 + need > H - margin.bottom) {
      doc.addPage();
      y = 18;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(...C.ink);
    doc.text(t(title), M, y);
    if (!sub) return y + 3;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...C.muted);
    doc.text(doc.splitTextToSize(t(sub), W - 2 * M), M, y + 4.5);
    return y + 7 + (doc.splitTextToSize(t(sub), W - 2 * M).length - 1) * 3.6;
  };

  // Header with a calendar mark
  doc.setFillColor(...C.accent);
  doc.roundedRect(M, 12, 11, 11, 1.5, 1.5, "F");
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.45);
  doc.roundedRect(M + 2.6, 15, 5.8, 5.6, 0.6, 0.6, "S");
  doc.line(M + 2.6, 16.9, M + 8.4, 16.9);
  doc.line(M + 4.2, 14.1, M + 4.2, 15.6);
  doc.line(M + 6.8, 14.1, M + 6.8, 15.6);
  doc.line(M + 4.1, 18.8, M + 5.1, 19.7);
  doc.line(M + 5.1, 19.7, M + 6.9, 17.9);
  doc.setTextColor(...C.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(t(appName), M + 14, 15.6);
  doc.text(`Gerado em ${fmtDMY(info.todayISO)}`, W - M, 15.6, { align: "right" });
  doc.setTextColor(...C.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(t(pack.concurso.nome), M + 14, 21.8);

  let y = 32;
  doc.setFontSize(10.5);
  doc.text("Aluno:", M, y);
  doc.setFont("helvetica", "normal");
  if (nome) doc.text(t(nome), M + 13.5, y);
  else {
    doc.setDrawColor(...C.line);
    doc.setLineWidth(0.3);
    doc.line(M + 13.5, y + 0.8, M + 105, y + 0.8);
  }
  doc.setFontSize(9);
  doc.setTextColor(...C.ink2);
  doc.text(t(`${pack.concurso.cargo} · ${pack.concurso.banca} · ${pack.estrutura_prova.total_questoes} questões`), M, y + 5.5);

  autoTable(doc, {
    startY: y + 9,
    margin,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: { top: 1.7, bottom: 1.7, left: 3, right: 3 }, textColor: C.ink, fillColor: C.sunken },
    columnStyles: { 0: { textColor: C.muted, cellWidth: 36 }, 1: { fontStyle: "bold" }, 2: { textColor: C.muted, cellWidth: 46 }, 3: { fontStyle: "bold" } },
    body: [
      ["Data da prova", t(`${fmtDMY(info.examISO)}${info.simulated ? " (simulada)" : ""}`), "Início", fmtDMY(info.startISO)],
      ["Ritmo", t(info.modeLabel), "Horas por semana", fmtH(info.weeklyH)],
      ["Horas até a prova", fmtH(info.rawH), "Horas para conteúdo novo", fmtH(info.contentH)],
      ["Escopo", t(info.scopeLabel), "Semanas", String(weeks.length)],
      [
        "Top 80% coberto",
        fmtPct(info.coverage ?? 0),
        "Ajustes em dias",
        info.manual && (info.manual.add || info.manual.del) ? t(`+${fmtMin(info.manual.add)} / −${fmtMin(info.manual.del)}`) : "nenhum",
      ],
    ],
  });

  // Priorities
  y = section("Prioridades: top 80% da prova", "Ordem de retorno: pontos esperados (edital + provas anteriores do cargo e da banca) por hora de estudo no seu nível.", 40);
  autoTable(doc, {
    startY: y,
    margin,
    theme: "grid",
    head: [["#", "Matéria", "Assunto", "Nível", "Pts esperados", "Horas"].map(t)],
    body: top.map((x) => [String(x.rank), matCell(x.materia_id, materias[x.materia_id].curto), t(x.nome), `${x.nivel}/5`, x.pts.toFixed(1).replace(".", ","), fmtH(x.horas)]),
    styles: { fontSize: 8.2, cellPadding: 1.6, lineColor: C.line, lineWidth: 0.2, textColor: C.ink, valign: "middle" },
    headStyles: { fillColor: C.sunken, textColor: C.ink2, fontStyle: "bold", fontSize: 8 },
    columnStyles: { 0: { cellWidth: 8, halign: "right" }, 1: { cellWidth: 34 }, 3: { cellWidth: 13, halign: "center" }, 4: { cellWidth: 22, halign: "right" }, 5: { cellWidth: 15, halign: "right" } },
    ...hooks,
  });

  // Generic vs personalized
  y = section("Genérico × personalizado", "Pontos esperados cobertos pelas horas de conteúdo até a prova.", 24);
  autoTable(doc, {
    startY: y,
    margin,
    theme: "grid",
    head: [["", "Cronograma genérico", "Seu cronograma"].map(t)],
    body: [
      [t(`Cobertura com ${fmtH(info.contentH)} de conteúdo`), fmtPct(cmp.genAt), fmtPct(cmp.persAt)],
      ["Horas para chegar a 80%", cmp.gen80 ? fmtH(cmp.gen80) : "-", cmp.pers80 ? fmtH(cmp.pers80) : "-"],
    ],
    styles: { fontSize: 8.8, cellPadding: 1.8, lineColor: C.line, lineWidth: 0.2, textColor: C.ink },
    headStyles: { fillColor: C.sunken, textColor: C.ink2, fontStyle: "bold", fontSize: 8 },
    columnStyles: { 1: { halign: "right", cellWidth: 40 }, 2: { halign: "right", cellWidth: 40, fontStyle: "bold", textColor: C.accent } },
  });

  // Weekly schedule
  const weekBody = (wk) => {
    const body = [];
    for (const d of wk.dias) {
      const label = { content: t(`${DAY_LABEL[d.dia_semana]} ${fmtDM(d.data)}`), styles: { fontStyle: "bold", valign: "top" } };
      if (!d.blocks.length) {
        body.push([label, { content: d.capacidade_min ? "Livre" : "Descanso", colSpan: 6, styles: { textColor: C.muted, fontStyle: "italic" } }]);
        continue;
      }
      d.blocks.forEach((b, j) => {
        const row = j === 0 ? [{ ...label, rowSpan: d.blocks.length }] : [];
        const title = b.assunto ? b.assunto.nome : `Simulado completo (${pack.estrutura_prova.total_questoes} questões)`;
        row.push(
          `${fmtClock(b.start)}-${fmtClock(b.end)}`,
          b.materia_id ? matCell(b.materia_id, materias[b.materia_id].curto) : "Todas",
          b.video ? { content: t(`${title}  [${b.video.tipo === "video" ? "aula" : "buscar aula"}]`), url: b.video.url, styles: { textColor: C.accent } } : t(title),
          t(ACTIVITY_LABEL[b.atividade]),
          fmtMin(b.minutos),
          { content: "", check: true }
        );
        body.push(row);
      });
    }
    return body;
  };
  const bodies = weeks.map(weekBody);
  const usable = H - margin.top - margin.bottom;
  const estHeight = (body) => Math.min(usable, 16 + body.length * 6.8);
  y = section("Roteiro semana a semana", "Marque ao concluir. [aula] abre a videoaula indicada; [buscar aula] abre uma busca pronta no YouTube. Revisões em 1, 7, 21 e 60 dias.", bodies.length ? estHeight(bodies[0]) : 30);
  weeks.forEach((wk, i) => {
    let startY = y;
    if (i > 0) {
      startY = doc.lastAutoTable.finalY + 7;
      if (startY + estHeight(bodies[i]) > H - margin.bottom) {
        doc.addPage();
        startY = margin.top + 2;
      }
    }
    const title = [`Semana ${wk.numero} de ${weeks.length}`, `${fmtDM(wk.inicio)} a ${fmtDM(wk.fim)}`, wk.reta_final ? "Reta final" : "Fase base", fmtMin(wk.alocado_min)].join("  ·  ");
    autoTable(doc, {
      startY,
      margin,
      theme: "grid",
      rowPageBreak: "avoid",
      head: [
        [{ content: t(title), colSpan: 7, styles: { fillColor: C.accent, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9.5, halign: "left" } }],
        ["Dia", "Horário", "Matéria", "Assunto", "Atividade", "Duração", "Feito"].map(t),
      ],
      body: bodies[i],
      styles: { fontSize: 8.2, cellPadding: 1.5, lineColor: C.line, lineWidth: 0.2, textColor: C.ink, valign: "middle" },
      headStyles: { fillColor: C.sunken, textColor: C.ink2, fontStyle: "bold", fontSize: 8 },
      columnStyles: { 0: { cellWidth: 17 }, 1: { cellWidth: 21 }, 2: { cellWidth: 31 }, 4: { cellWidth: 19 }, 5: { cellWidth: 14 }, 6: { cellWidth: 10, halign: "center" } },
      ...hooks,
    });
  });

  // Video list
  const seen = new Set();
  const videos = [];
  for (const wk of weeks)
    for (const d of wk.dias)
      for (const b of d.blocks)
        if (b.video && !seen.has(b.assunto.id)) {
          seen.add(b.assunto.id);
          videos.push(b);
        }
  if (videos.length) {
    y = section("Videoaulas indicadas", "Seleção do YouTube por assunto. Quando não há aula específica, o link abre uma busca pronta.", 30);
    autoTable(doc, {
      startY: y,
      margin,
      theme: "grid",
      head: [["Matéria", "Assunto", "Aula"].map(t)],
      body: videos.map((b) => [
        matCell(b.materia_id, materias[b.materia_id].curto),
        t(b.assunto.nome),
        { content: t(b.video.tipo === "video" ? `${b.video.titulo}${b.video.canal ? ` (${b.video.canal})` : ""}` : "Buscar no YouTube"), url: b.video.url, styles: { textColor: C.accent } },
      ]),
      styles: { fontSize: 8, cellPadding: 1.6, lineColor: C.line, lineWidth: 0.2, textColor: C.ink, valign: "middle" },
      headStyles: { fillColor: C.sunken, textColor: C.ink2, fontStyle: "bold", fontSize: 8 },
      columnStyles: { 0: { cellWidth: 31 }, 1: { cellWidth: 62 } },
      ...hooks,
    });
  }

  const pages = doc.getNumberOfPages();
  const footer = t(`${appName}${nome ? ` · ${nome}` : ""} · ${pack.concurso.nome} · caso de estudo`);
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.muted);
    doc.text(footer, M, H - 8);
    doc.text(`Página ${i} de ${pages}`, W - M, H - 8, { align: "right" });
  }
  doc.save(`cronograma${nome ? `-${slugify(nome)}` : ""}-${info.todayISO}.pdf`);
}
