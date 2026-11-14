// PDF -> text. Prefers poppler's pdftotext (reading-order heuristics handle the
// two-column cadernos well); falls back to pdf.js when poppler is not installed.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";

const exec = promisify(execFile);

/** Page sizes in points via pdfinfo. */
async function pageSizes(pdfPath) {
  const { stdout } = await exec("pdfinfo", ["-f", "1", "-l", "9999", pdfPath], { maxBuffer: 8 * 1024 * 1024 });
  const sizes = [];
  for (const m of stdout.matchAll(/^Page\s+(\d+)\s+size:\s+([\d.]+)\s+x\s+([\d.]+)/gm)) sizes.push({ page: Number(m[1]), w: Number(m[2]), h: Number(m[3]) });
  return sizes;
}

/**
 * Two-column cadernos: read each page's left half, then its right half, so the
 * questions of one column never interleave with the other.
 */
async function extractColumns(pdfPath, columns) {
  const sizes = await pageSizes(pdfPath);
  const pages = [];
  for (const { page, w, h } of sizes) {
    const parts = [];
    for (let c = 0; c < columns; c++) {
      const x = Math.floor((w / columns) * c);
      const args = ["-enc", "UTF-8", "-f", String(page), "-l", String(page), "-r", "72", "-x", String(x), "-y", "0", "-W", String(Math.ceil(w / columns)), "-H", String(Math.ceil(h)), pdfPath, "-"];
      const { stdout } = await exec("pdftotext", args, { maxBuffer: 16 * 1024 * 1024 });
      parts.push(stdout);
    }
    pages.push(parts.join("\n"));
  }
  return pages.join("\n\f\n");
}

export async function extractText(pdfPath, { backend = "auto", columns = 1, layout = false } = {}) {
  if (layout) {
    const { stdout } = await exec("pdftotext", ["-enc", "UTF-8", "-layout", pdfPath, "-"], { maxBuffer: 64 * 1024 * 1024 });
    return { text: normalize(stdout), backend: "pdftotext/layout" };
  }
  if (columns > 1) return { text: normalize(await extractColumns(pdfPath, columns)), backend: `pdftotext/${columns}col` };
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
