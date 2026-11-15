import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { zipSync } from 'fflate';
import { loadPdf, sanitizeFileName, type PdfInput } from './pdf';

export type Angle = 90 | 180 | 270;

export interface OutputFile {
  name: string;
  bytes: Uint8Array;
}

export class RangeError_ extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RangeError';
  }
}

/**
 * Parse "1,3-5, 8-" style page ranges (1-based) for a document with `count` pages.
 * Returns one group per comma-separated part, each a list of 0-based page indices.
 * Open ranges ("8-") run to the last page. Throws a readable error for anything invalid.
 */
export function parsePageRanges(text: string, count: number): number[][] {
  const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) throw new RangeError_('Enter at least one page or range, for example 1,3-5.');
  return parts.map((part) => {
    const m = /^(\d+)\s*(?:-\s*(\d*))?$/.exec(part);
    if (!m) throw new RangeError_(`"${part}" is not a page or range. Use numbers like 2 or 3-5.`);
    const start = Number(m[1]);
    const end = m[2] === undefined ? start : m[2] === '' ? count : Number(m[2]);
    if (start < 1 || end < 1) throw new RangeError_(`Pages start at 1 ("${part}").`);
    if (start > count || end > count) throw new RangeError_(`"${part}" is outside this document, which has ${count} page${count === 1 ? '' : 's'}.`);
    if (end < start) throw new RangeError_(`"${part}" goes backwards. Write it as ${end}-${start}.`);
    return Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i);
  });
}

function baseName(name: string) {
  return sanitizeFileName(name.replace(/\.pdf$/i, ''), 'document');
}

async function copyToNew(src: PDFDocument, indices: number[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  for (const p of pages) out.addPage(p);
  out.setProducer('PageDock Free');
  out.setCreator('PageDock Free');
  return out.save();
}

/**
 * Split: either one PDF containing all chosen pages (in the order given), or one PDF per range.
 */
export async function splitPdf(input: PdfInput, rangeText: string, mode: 'single' | 'perRange'): Promise<OutputFile[]> {
  const src = await loadPdf(input);
  const groups = parsePageRanges(rangeText, src.getPageCount());
  const base = baseName(input.name);
  if (mode === 'single') {
    return [{ name: `${base}-pages.pdf`, bytes: await copyToNew(src, groups.flat()) }];
  }
  const outs: OutputFile[] = [];
  for (const g of groups) {
    const label = g.length === 1 ? `${g[0] + 1}` : `${g[0] + 1}-${g[g.length - 1] + 1}`;
    outs.push({ name: `${base}-p${label}.pdf`, bytes: await copyToNew(src, g) });
  }
  return outs;
}

/** Bundle several outputs into a .zip archive. Duplicate names get a counter. */
export function zipFiles(files: OutputFile[]): Uint8Array {
  const used = new Map<string, number>();
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) {
    let name = f.name;
    const n = used.get(name) ?? 0;
    used.set(name, n + 1);
    if (n > 0) name = name.replace(/(\.[^.]+)?$/, `-${n + 1}$1`);
    entries[name] = f.bytes;
  }
  return zipSync(entries, { level: 0 }); // PDFs are already compressed
}

/** Add `angle` to the existing rotation of the chosen pages (0-based). Other pages are untouched. */
export async function rotatePdf(input: PdfInput, pageIndices: number[], angle: Angle): Promise<Uint8Array> {
  const doc = await loadPdf(input);
  const count = doc.getPageCount();
  if (pageIndices.length === 0) throw new RangeError_('Choose at least one page to rotate.');
  for (const i of pageIndices) {
    if (i < 0 || i >= count) throw new RangeError_(`Page ${i + 1} does not exist.`);
    const page = doc.getPage(i);
    page.setRotation(degrees((page.getRotation().angle + angle) % 360));
  }
  doc.setProducer('PageDock Free');
  return doc.save();
}

export interface PagePlan {
  /** 0-based index of the page in the original document. */
  source: number;
  /** Extra rotation to apply, added to the page's existing rotation. */
  rotate: 0 | Angle;
}

/** Organize: build a new PDF with pages in the planned order, with extra rotation. Pages not listed are removed. */
export async function organizePdf(input: PdfInput, plan: PagePlan[]): Promise<Uint8Array> {
  const src = await loadPdf(input);
  const count = src.getPageCount();
  if (plan.length === 0) throw new RangeError_('The result would have no pages. Keep at least one page.');
  for (const p of plan) if (p.source < 0 || p.source >= count) throw new RangeError_(`Page ${p.source + 1} does not exist.`);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, plan.map((p) => p.source));
  pages.forEach((page, i) => {
    const extra = plan[i].rotate;
    if (extra) page.setRotation(degrees((page.getRotation().angle + extra) % 360));
    out.addPage(page);
  });
  out.setProducer('PageDock Free');
  out.setCreator('PageDock Free');
  return out.save();
}
