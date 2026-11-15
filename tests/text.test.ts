import { describe, it, expect } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument, StandardFonts, degrees } from '@cantoo/pdf-lib';
import { unzipSync, strFromU8 } from 'fflate';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { extractPageText, TextExtractError } from '../src/core/pdftext';
import { buildLayout, layoutToText, pageLines } from '../src/core/textlayout';
import { layoutToDocx } from '../src/core/docx';
import { diffLines, diffSummary } from '../src/core/diff';
import { makePdf } from './helpers';

const standardFontDataUrl = join(dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')), 'standard_fonts') + '/';
const extract = (bytes: Uint8Array) => extractPageText(pdfjs as any, bytes, { standardFontDataUrl, useSystemFonts: false });

/** A realistic 2-page document: heading, wrapped paragraphs, Malay text, a 2-column block and a small table. */
async function sampleDoc(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const p1 = doc.addPage([595, 842]);
  p1.drawText('Annual Report 2026', { x: 72, y: 760, size: 24, font: bold });
  const para = [
    'PageDock turns PDF files into editable documents on your own',
    'device. This paragraph wraps over two lines on purpose.',
  ];
  para.forEach((t, i) => p1.drawText(t, { x: 72, y: 720 - i * 14, size: 11, font: reg }));
  p1.drawText('Ringkasan dalam Bahasa Melayu: dokumen ini sulit.', { x: 72, y: 680, size: 11, font: reg });
  p1.drawText('Results', { x: 72, y: 640, size: 16, font: bold });
  p1.drawText('Second paragraph after the heading.', { x: 72, y: 620, size: 11, font: reg });
  const p2 = doc.addPage([595, 842]);
  p2.drawText('Left column first line', { x: 72, y: 760, size: 11, font: reg });
  p2.drawText('Right column first line', { x: 320, y: 760, size: 11, font: reg });
  p2.drawText('Left column second line', { x: 72, y: 746, size: 11, font: reg });
  p2.drawText('Right column second line', { x: 320, y: 746, size: 11, font: reg });
  [['Item', 'Qty', 'Price'], ['Apples', '3', '4.50'], ['Pears', '10', '12.00']].forEach((row, r) =>
    row.forEach((cell, c) => p2.drawText(cell, { x: 72 + c * 120, y: 680 - r * 16, size: 11, font: reg })),
  );
  return doc.save();
}

describe('text extraction and layout', () => {
  it('rebuilds headings, paragraphs and reading order (documents real fidelity)', async () => {
    const layout = buildLayout(await extract(await sampleDoc()));
    const p1 = layout.pages[0].paragraphs;
    expect(p1[0]).toMatchObject({ text: 'Annual Report 2026', heading: 1 });
    expect(p1[1].text).toBe('PageDock turns PDF files into editable documents on your own device. This paragraph wraps over two lines on purpose.');
    expect(p1[1].heading).toBeUndefined();
    expect(p1[2].text).toBe('Ringkasan dalam Bahasa Melayu: dokumen ini sulit.');
    expect(p1[3]).toMatchObject({ text: 'Results', heading: 2 });
    expect(p1[4].text).toBe('Second paragraph after the heading.');
    expect(layout.emptyPages).toEqual([]);
  });

  it('reads two columns row by row (known limitation) and tables as plain lines', async () => {
    const lines = pageLines((await extract(await sampleDoc()))[1]);
    expect(lines[0]).toBe('Left column first line Right column first line');
    expect(lines).toContain('Item Qty Price');
    expect(lines).toContain('Apples 3 4.50');
  });

  it('works on rotated pages', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const p = doc.addPage([595, 842]);
    p.drawText('Rotated page text', { x: 72, y: 760, size: 12, font });
    p.setRotation(degrees(90));
    const layout = buildLayout(await extract(await doc.save()));
    expect(layoutToText(layout, false).trim()).toBe('Rotated page text');
  });

  it('flags pages with no text as needing OCR', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage().drawText('Only page two has text', { x: 50, y: 700, size: 12, font });
    const layout = buildLayout(await extract(await doc.save()));
    expect(layout.emptyPages).toEqual([0]);
  });

  it('produces plain text with page markers', async () => {
    const text = layoutToText(buildLayout(await extract(await makePdf('P', 2))));
    expect(text).toBe('--- Page 1 ---\n\nP-1\n\n--- Page 2 ---\n\nP-2\n');
  });

  it('refuses encrypted PDFs and damaged files clearly', async () => {
    await expect(extract(new TextEncoder().encode('%PDF-1.7 junk'))).rejects.toBeInstanceOf(TextExtractError);
  });
});

describe('PDF to Word (.docx)', () => {
  it('writes a valid .docx with real editable text, headings and page breaks (spec test)', async () => {
    const layout = buildLayout(await extract(await sampleDoc()));
    const bytes = await layoutToDocx(layout, 'Annual Report');
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK');
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['[Content_Types].xml', 'word/document.xml', 'word/styles.xml']));
    const xml = strFromU8(files['word/document.xml']);
    expect(xml).toContain('<w:t xml:space="preserve">Annual Report 2026</w:t>');
    expect(xml).toContain('Ringkasan dalam Bahasa Melayu: dokumen ini sulit.');
    expect(xml).toMatch(/<w:pStyle w:val="Heading1"\/>/);
    expect(xml).toMatch(/<w:pStyle w:val="Heading2"\/>/);
    expect(xml).toContain('<w:pageBreakBefore/>');
    expect(xml).not.toMatch(/<w:drawing>|<pic:pic/); // text, not page pictures
  });

  it('removes characters that would make the XML invalid', async () => {
    const bytes = await layoutToDocx({ pages: [{ paragraphs: [{ text: 'A\u0001B\u000bC', size: 11 }] }], emptyPages: [] }, 't');
    expect(strFromU8(unzipSync(bytes)['word/document.xml'])).toContain('ABC');
  });
});

describe('diffLines', () => {
  it('finds a changed line (spec test: deliberate text change)', () => {
    const ops = diffLines(['Title', 'Price: 10', 'Footer'], ['Title', 'Price: 12', 'Footer']);
    expect(ops).toEqual([
      { type: 'same', text: 'Title' },
      { type: 'del', text: 'Price: 10' },
      { type: 'add', text: 'Price: 12' },
      { type: 'same', text: 'Footer' },
    ]);
  });
  it('handles insertions, deletions and empty sides', () => {
    expect(diffSummary(diffLines(['a', 'b', 'c'], ['a', 'x', 'b', 'c', 'd']))).toEqual({ same: 3, removed: 0, added: 2 });
    expect(diffSummary(diffLines(['a', 'b'], []))).toEqual({ same: 0, removed: 2, added: 0 });
    expect(diffLines([], [])).toEqual([]);
  });
  it('falls back gracefully on very different long inputs', () => {
    const a = Array.from({ length: 300 }, (_, i) => `a${i}`);
    const b = Array.from({ length: 300 }, (_, i) => `b${i}`);
    expect(diffSummary(diffLines(a, b, 50))).toEqual({ same: 0, removed: 300, added: 300 });
  });
});
