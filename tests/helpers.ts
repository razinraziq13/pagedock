import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const pdfjsRoot = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
const standardFontDataUrl = join(pdfjsRoot, 'standard_fonts') + '/';

/** Make a PDF whose pages say "<label>-1", "<label>-2", ... */
export async function makePdf(label: string, pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`${label}-${i}`, { x: 72, y: 760, size: 24, font });
  }
  return doc.save();
}

/** Read each page's text with pdf.js — an independent reader from the library that wrote the file. */
export async function readPageTexts(bytes: Uint8Array): Promise<string[]> {
  const task = getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: false, standardFontDataUrl });
  const pdf = await task.promise;
  const texts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    texts.push(content.items.map((it: any) => it.str).join('').trim());
  }
  await task.destroy();
  return texts;
}
