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

/** Write page numbers (0-based indices) as a short 1-based list, e.g. [0,1,2,4] → "1-3, 5". */
export function formatPageList(indices: number[]): string {
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(i === j ? `${sorted[i] + 1}` : `${sorted[i] + 1}-${sorted[j] + 1}`);
    i = j;
  }
  return parts.join(', ');
}

/**
 * Pages of a `count`-page document grouped by split boundaries. A boundary `b` means "cut after page b"
 * (0-based), so cuts [2] on 5 pages gives [[0,1,2],[3,4]].
 */
export function groupsFromCuts(count: number, cuts: number[]): number[][] {
  const valid = [...new Set(cuts)].filter((c) => Number.isInteger(c) && c >= 0 && c < count - 1).sort((a, b) => a - b);
  const groups: number[][] = [];
  let start = 0;
  for (const c of [...valid, count - 1]) {
    groups.push(Array.from({ length: c - start + 1 }, (_, i) => start + i));
    start = c + 1;
  }
  return groups;
}

/** Extract: one new PDF with the chosen pages, in document order. */
export async function extractPages(input: PdfInput, indices: number[]): Promise<OutputFile> {
  const src = await loadPdf(input);
  const n = src.getPageCount();
  const pages = [...new Set(indices)].sort((a, b) => a - b);
  if (pages.length === 0) throw new RangeError_('Select at least one page to extract.');
  for (const i of pages) if (!Number.isInteger(i) || i < 0 || i >= n) throw new RangeError_(`Page ${i + 1} does not exist.`);
  return { name: `${baseName(input.name)}-pages-${formatPageList(pages).replace(/, /g, '_')}.pdf`, bytes: await copyToNew(src, pages) };
}

/** Split by boundaries: one PDF per part. Every page ends up in exactly one file. */
export async function splitAtCuts(input: PdfInput, cuts: number[]): Promise<OutputFile[]> {
  const src = await loadPdf(input);
  const groups = groupsFromCuts(src.getPageCount(), cuts);
  if (groups.length < 2) throw new RangeError_('Choose at least one place to split.');
  const base = baseName(input.name);
  const outs: OutputFile[] = [];
  for (const [i, g] of groups.entries()) {
    const label = g.length === 1 ? `${g[0] + 1}` : `${g[0] + 1}-${g[g.length - 1] + 1}`;
    outs.push({ name: `${base}-part${i + 1}-p${label}.pdf`, bytes: await copyToNew(src, g) });
  }
  return outs;
}
