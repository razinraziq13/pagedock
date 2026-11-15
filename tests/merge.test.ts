import { describe, it, expect } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import { mergePdfs, getPageCount, looksLikePdf, sanitizeFileName, PdfInputError } from '../src/core/pdf';
import { makePdf, readPageTexts } from './helpers';

describe('mergePdfs', () => {
  it('merges 2 + 1 + 3 pages into 6 pages in order (checked with pdf.js)', async () => {
    const a = await makePdf('A', 2);
    const b = await makePdf('B', 1);
    const c = await makePdf('C', 3);
    const out = await mergePdfs([
      { name: 'a.pdf', bytes: a },
      { name: 'b.pdf', bytes: b },
      { name: 'c.pdf', bytes: c },
    ]);
    expect(await readPageTexts(out)).toEqual(['A-1', 'A-2', 'B-1', 'C-1', 'C-2', 'C-3']);
  });

  it('respects a rearranged input order', async () => {
    const a = await makePdf('A', 1);
    const b = await makePdf('B', 2);
    const out = await mergePdfs([{ name: 'b.pdf', bytes: b }, { name: 'a.pdf', bytes: a }]);
    expect(await readPageTexts(out)).toEqual(['B-1', 'B-2', 'A-1']);
  });

  it('keeps existing page rotation and size', async () => {
    const doc = await PDFDocument.create();
    const p = doc.addPage([300, 500]);
    p.setRotation({ type: 'degrees', angle: 90 } as any);
    const rotated = await doc.save();
    const out = await PDFDocument.load(await mergePdfs([
      { name: 'r.pdf', bytes: rotated },
      { name: 'a.pdf', bytes: await makePdf('A', 1) },
    ]));
    expect(out.getPage(0).getRotation().angle).toBe(90);
    expect(out.getPage(0).getSize()).toEqual({ width: 300, height: 500 });
  });

  it('does not modify the input bytes', async () => {
    const a = await makePdf('A', 1);
    const copy = a.slice();
    await mergePdfs([{ name: 'a.pdf', bytes: a }, { name: 'a2.pdf', bytes: a }]);
    expect(a).toEqual(copy);
  });

  it('refuses fewer than two files', async () => {
    await expect(mergePdfs([{ name: 'a.pdf', bytes: await makePdf('A', 1) }])).rejects.toThrow(/at least two/);
  });

  it('rejects non-PDF, empty and damaged input with the filename', async () => {
    const good = { name: 'good.pdf', bytes: await makePdf('A', 1) };
    const notPdf = { name: 'photo.jpg', bytes: new TextEncoder().encode('hello world, not a pdf') };
    const empty = { name: 'empty.pdf', bytes: new Uint8Array() };
    const broken = { name: 'broken.pdf', bytes: new TextEncoder().encode('%PDF-1.7\n garbage garbage') };
    await expect(mergePdfs([good, notPdf])).rejects.toThrow(/photo\.jpg: this is not a PDF/);
    await expect(mergePdfs([good, empty])).rejects.toThrow(/empty\.pdf: the file is empty/);
    await expect(mergePdfs([good, broken])).rejects.toBeInstanceOf(PdfInputError);
  });
});

describe('helpers', () => {
  it('reads page counts', async () => {
    expect(await getPageCount({ name: 'c.pdf', bytes: await makePdf('C', 3) })).toBe(3);
  });
  it('detects the PDF signature', () => {
    expect(looksLikePdf(new TextEncoder().encode('%PDF-1.4 ...'))).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode('PK zip'))).toBe(false);
  });
  it('sanitizes filenames', () => {
    expect(sanitizeFileName('../../evil<name>?.pdf')).toBe('_evil_name_.pdf');
    expect(sanitizeFileName('...')).toBe('_');
    expect(sanitizeFileName('  ')).toBe('document');
    expect(sanitizeFileName('a\\b.pdf')).toBe('a_b.pdf');
  });
});
