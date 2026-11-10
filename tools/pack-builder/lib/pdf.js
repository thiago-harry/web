// PDF -> text. Prefers poppler's pdftotext (reading-order heuristics handle the
// two-column cadernos well); falls back to pdf.js when poppler is not installed.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";

const exec = promisify(execFile);

export async function extractText(pdfPath, { backend = "auto" } = {}) {
  if (backend === "auto" || backend === "pdftotext") {
    try {
      const { stdout } = await exec("pdftotext", ["-enc", "UTF-8", pdfPath, "-"], { maxBuffer: 64 * 1024 * 1024 });
      return { text: normalize(stdout), backend: "pdftotext" };
    } catch (err) {
      if (backend === "pdftotext") throw err;
    }
  }
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await readFile(pdfPath));
  const doc = await getDocument({ data, useSystemFonts: true, verbosity: 0 }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    pages.push(itemsToText(tc.items));
  }
  return { text: normalize(pages.join("\n\f\n")), backend: "pdfjs", pages: doc.numPages };
}

function itemsToText(items) {
  let out = "";
  let lastY = null;
  for (const it of items) {
    if (!it.str && !it.hasEOL) continue;
    const y = Math.round(it.transform?.[5] ?? 0);
    if (lastY !== null && Math.abs(y - lastY) > 2 && !out.endsWith("\n")) out += "\n";
    else if (out && !/[\s\n]$/.test(out) && it.str && !/^\s/.test(it.str)) out += " ";
    out += it.str;
    if (it.hasEOL) out += "\n";
    lastY = y;
  }
  return out;
}

export function normalize(t) {
  return String(t)
    .replace(/\r\n?/g, "\n")
    .replace(/­/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/-\n(?=[a-záéíóúâêôãõç])/g, "") // hy-\nphenation across lines
    .replace(/\n{3,}/g, "\n\n");
}
