import { describe, it, expect } from 'vitest';
import { PDFDocument, degrees, PDFName, PDFDict, PDFNumber } from '@cantoo/pdf-lib';
import { addPageNumbers, watermarkPdf, formatNumber, type PageNumberOptions, type WatermarkOptions } from '../src/core/stamp';
import { makePdf, makePng, readPlacedText } from './helpers';

const base: PageNumberOptions = { position: 'bottom-center', start: 1, pages: 'all', format: 'n', fontSize: 12, margin: 28 };

async function rotatedDoc(angle: number) {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]).setRotation(degrees(angle));
  return doc.save();
}

/** Fill opacities (/ca) used on a page, read from its graphics states. */
async function opacitiesOf(bytes: Uint8Array, pageIndex: number): Promise<number[]> {
  const doc = await PDFDocument.load(bytes);
  const gs = doc.getPage(pageIndex).node.Resources()?.lookupMaybe(PDFName.of('ExtGState'), PDFDict);
  if (!gs) return [];
  return gs.keys().map((k) => (gs.lookup(k, PDFDict).lookupMaybe(PDFName.of('ca'), PDFNumber)?.asNumber() ?? 1));
}

describe('addPageNumbers', () => {
  it('numbers every page with the chosen start number (spec test)', async () => {
    const out = await addPageNumbers({ name: 'a.pdf', bytes: await makePdf('P', 3) }, { ...base, start: 7 });
    const pages = await readPlacedText(out);
    expect(pages.map((p) => p.items.filter((i) => /^\d+$/.test(i.str)).map((i) => i.str))).toEqual([['7'], ['8'], ['9']]);
  });

  it.each([0, 90, 180, 270])('puts the number upright at the bottom centre of a page rotated %i°', async (angle) => {
    const out = await addPageNumbers({ name: 'r.pdf', bytes: await rotatedDoc(angle) }, base);
    const [page] = await readPlacedText(out);
    const n = page.items.find((i) => i.str === '1')!;
    expect(n).toBeDefined();
    expect(n.upright).toBe(true);
    expect(Math.abs(n.x - page.width / 2)).toBeLessThan(10);
    expect(page.height - n.y).toBeGreaterThan(20); // not clipped off the bottom
    expect(page.height - n.y).toBeLessThan(45); // but near the bottom edge
  });

  it('places numbers in corners and at the top, inside the margins', async () => {
    for (const position of ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'top-center'] as const) {
      const out = await addPageNumbers({ name: 'a.pdf', bytes: await makePdf('P', 1) }, { ...base, position, format: 'page-n-of-total' });
      const [page] = await readPlacedText(out);
      const n = page.items.find((i) => i.str.startsWith('Page 1 of 1'))!;
      expect(n, position).toBeDefined();
      expect(n.x, position).toBeGreaterThanOrEqual(27);
      expect(n.x, position).toBeLessThan(page.width - 27 - 50);
      if (position.startsWith('top')) expect(n.y, position).toBeLessThan(60);
      else expect(n.y, position).toBeGreaterThan(page.height - 60);
      expect(n.y, position).toBeGreaterThan(27);
      expect(n.y, position).toBeLessThan(page.height - 20);
    }
  });

  it('respects a crop box that is offset from the media box', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([600, 800]).setCropBox(100, 200, 300, 400);
    const out = await addPageNumbers({ name: 'c.pdf', bytes: await doc.save() }, base);
    const [page] = await readPlacedText(out);
    expect(page.width).toBe(300);
    const n = page.items.find((i) => i.str === '1')!;
    expect(Math.abs(n.x - 150)).toBeLessThan(10);
    expect(page.height - n.y).toBeGreaterThan(20);
    expect(page.height - n.y).toBeLessThan(45);
  });

  it('skips pages outside the chosen range, e.g. a cover page', async () => {
    const out = await addPageNumbers({ name: 'a.pdf', bytes: await makePdf('P', 3) }, { ...base, pages: '2-', format: 'n-of-total' });
    const pages = await readPlacedText(out);
    expect(pages[0].items.map((i) => i.str)).toEqual(['P-1']);
    expect(pages[1].items.map((i) => i.str)).toContain('1 / 2');
    expect(pages[2].items.map((i) => i.str)).toContain('2 / 2');
  });

  it('shrinks text on a tiny page instead of clipping it', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([60, 60]);
    const out = await addPageNumbers({ name: 't.pdf', bytes: await doc.save() }, { ...base, format: 'page-n-of-total', fontSize: 24, margin: 10 });
    const [page] = await readPlacedText(out);
    const n = page.items.find((i) => i.str.includes('Page'))!;
    expect(n.x).toBeGreaterThanOrEqual(9);
    expect(n.y).toBeLessThanOrEqual(60);
  });

  it('validates options', async () => {
    const input = { name: 'a.pdf', bytes: await makePdf('P', 1) };
    await expect(addPageNumbers(input, { ...base, start: -1 })).rejects.toThrow(/starting number/);
    await expect(addPageNumbers(input, { ...base, fontSize: 200 })).rejects.toThrow(/Font size/);
    await expect(addPageNumbers(input, { ...base, pages: '5' })).rejects.toThrow(/outside/);
  });

  it('formats numbers', () => {
    expect(formatNumber('page-n-of-total', 3, 9)).toBe('Page 3 of 9');
    expect(formatNumber('n-of-total', 3, 9)).toBe('3 / 9');
    expect(formatNumber('page-n', 3, 9)).toBe('Page 3');
  });
});

describe('watermarkPdf', () => {
  const text: WatermarkOptions = { kind: 'text', text: 'CONFIDENTIAL', fontSize: 40, position: 'center', rotation: 0, opacity: 0.3, pages: 'all' };

  it('stamps text on the chosen pages only, with the chosen opacity (spec test)', async () => {
    const out = await watermarkPdf({ name: 'a.pdf', bytes: await makePdf('P', 3) }, { ...text, pages: '1,3' });
    const pages = await readPlacedText(out);
    expect(pages[0].items.map((i) => i.str)).toContain('CONFIDENTIAL');
    expect(pages[1].items.map((i) => i.str)).not.toContain('CONFIDENTIAL');
    expect(pages[2].items.map((i) => i.str)).toContain('CONFIDENTIAL');
    expect(await opacitiesOf(out, 0)).toContain(0.3);
    expect(await opacitiesOf(out, 1)).toEqual([]);
    const w = pages[0].items.find((i) => i.str === 'CONFIDENTIAL')!;
    expect(w.x).toBeGreaterThan(100);
    expect(w.x).toBeLessThan(595 / 2);
    expect(Math.abs(w.y - 842 / 2)).toBeLessThan(30);
  });

  it('keeps long rotated text inside the page by shrinking it', async () => {
    const out = await watermarkPdf({ name: 'a.pdf', bytes: await makePdf('P', 1) }, { ...text, text: 'THIS IS A VERY LONG WATERMARK LINE', fontSize: 120, rotation: 45 });
    const [page] = await readPlacedText(out);
    const w = page.items.find((i) => i.str.startsWith('THIS IS'))!;
    expect(w.x).toBeGreaterThan(0);
    expect(w.y).toBeLessThan(page.height);
    expect(w.y).toBeGreaterThan(page.height / 2); // a 45° line starts low-left
  });

  it('is upright and centred on a rotated page', async () => {
    const out = await watermarkPdf({ name: 'r.pdf', bytes: await rotatedDoc(90) }, { ...text, text: 'DRAFT' });
    const [page] = await readPlacedText(out);
    const w = page.items.find((i) => i.str === 'DRAFT')!;
    expect(w.upright).toBe(true);
    expect(page.width).toBe(842);
    expect(Math.abs(w.y - page.height / 2)).toBeLessThan(30);
    expect(w.x).toBeLessThan(page.width / 2);
    expect(w.x).toBeGreaterThan(page.width / 2 - 120);
  });

  it('places an image watermark on the chosen pages only', async () => {
    const out = await watermarkPdf(
      { name: 'a.pdf', bytes: await makePdf('P', 2) },
      { kind: 'image', image: { bytes: makePng(4, 2), type: 'png' }, imageScale: 0.5, position: 'bottom-right', rotation: 0, opacity: 0.4, pages: '2' },
    );
    const doc = await PDFDocument.load(out);
    const xobjects = (i: number) => doc.getPage(i).node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict)?.keys().length ?? 0;
    expect(xobjects(0)).toBe(0);
    expect(xobjects(1)).toBe(1);
    expect(await opacitiesOf(out, 1)).toContain(0.4);
  });

  it('rejects text the standard font cannot show, and bad options', async () => {
    const input = { name: 'a.pdf', bytes: await makePdf('P', 1) };
    await expect(watermarkPdf(input, { ...text, text: '机密' })).rejects.toThrow(/cannot show: 机 密/);
    await expect(watermarkPdf(input, { ...text, text: '  ' })).rejects.toThrow(/Type the watermark/);
    await expect(watermarkPdf(input, { ...text, opacity: 0 })).rejects.toThrow(/Opacity/);
    await expect(watermarkPdf(input, { ...text, kind: 'image', image: { bytes: new Uint8Array([1, 2, 3]), type: 'png' } })).rejects.toThrow(/could not be read/);
  });

  it('accepts Malay text with Latin characters', async () => {
    const out = await watermarkPdf({ name: 'a.pdf', bytes: await makePdf('P', 1) }, { ...text, text: 'SULIT — Salinan Terkawal', rotation: 30 });
    const [page] = await readPlacedText(out);
    expect(page.items.map((i) => i.str).join(' ')).toContain('Salinan Terkawal');
  });
});
