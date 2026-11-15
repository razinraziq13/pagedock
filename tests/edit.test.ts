import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName, PDFDict, PDFString, StandardFonts, degrees } from '@cantoo/pdf-lib';
import { applyAnnotations, cropPdf, fillForm, readForm, type Annotation } from '../src/core/edit';
import { makePdf, makePng, readPageTexts, readPlacedText } from './helpers';

const black = { r: 0, g: 0, b: 0 };

async function rotated(angle: number) {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]).setRotation(degrees(angle));
  return doc.save();
}

describe('cropPdf', () => {
  it('crops the visible area and keeps content (spec test)', async () => {
    const out = await cropPdf({ name: 'a.pdf', bytes: await makePdf('P', 2) }, { top: 50, right: 100, bottom: 20, left: 30 }, '1');
    const pages = await readPlacedText(out);
    expect([pages[0].width, pages[0].height]).toEqual([465, 772]);
    expect([pages[1].width, pages[1].height]).toEqual([595, 842]); // not selected
    expect(pages[0].items.map((i) => i.str)).toEqual(['P-1']); // text kept (and still present: crop is not redaction)
  });

  it.each([90, 180, 270])('trims the edges the user sees on a page rotated %i°', async (angle) => {
    const out = await cropPdf({ name: 'r.pdf', bytes: await rotated(angle) }, { top: 10, right: 20, bottom: 30, left: 40 }, 'all');
    const [page] = await readPlacedText(out);
    const w = angle % 180 ? 842 : 595, h = angle % 180 ? 595 : 842;
    expect([page.width, page.height]).toEqual([w - 60, h - 40]);
  });

  it('refuses crops that leave almost nothing', async () => {
    await expect(cropPdf({ name: 'a.pdf', bytes: await makePdf('P', 1) }, { top: 400, right: 0, bottom: 420, left: 0 }, 'all')).rejects.toThrow(/half an inch/);
    await expect(cropPdf({ name: 'a.pdf', bytes: await makePdf('P', 1) }, { top: -1, right: 0, bottom: 0, left: 0 }, 'all')).rejects.toThrow(/zero or more/);
  });
});

describe('applyAnnotations', () => {
  it('places text where the user put it, top-left origin (spec test)', async () => {
    const out = await applyAnnotations({ name: 'a.pdf', bytes: await makePdf('P', 1) }, [{ type: 'text', page: 0, x: 100, y: 200, size: 20, color: black, text: 'Approved' }]);
    const [page] = await readPlacedText(out);
    const t = page.items.find((i) => i.str === 'Approved')!;
    expect(t.x).toBeCloseTo(100, 0);
    expect(t.y).toBeCloseTo(216, 0); // baseline = top + 0.8 * size
  });

  it.each([90, 180, 270])('keeps text upright at the same on-screen place on a page rotated %i°', async (angle) => {
    const out = await applyAnnotations({ name: 'r.pdf', bytes: await rotated(angle) }, [{ type: 'text', page: 0, x: 50, y: 60, size: 10, color: black, text: 'Note' }]);
    const [page] = await readPlacedText(out);
    const t = page.items.find((i) => i.str === 'Note')!;
    expect(t.upright).toBe(true);
    expect(t.x).toBeCloseTo(50, 0);
    expect(t.y).toBeCloseTo(68, 0);
  });

  it('draws every kind of mark and a signature image', async () => {
    const annots: Annotation[] = [
      { type: 'rect', page: 0, x: 10, y: 10, w: 100, h: 50, color: black, width: 2 },
      { type: 'ellipse', page: 0, x: 10, y: 100, w: 80, h: 40, color: black },
      { type: 'highlight', page: 0, x: 72, y: 70, w: 60, h: 20, color: { r: 1, g: 1, b: 0 } },
      { type: 'arrow', page: 0, x1: 200, y1: 200, x2: 300, y2: 250, color: black, width: 2 },
      { type: 'ink', page: 1, points: [[10, 10], [20, 25], [30, 12]], color: black, width: 1.5 },
      { type: 'image', page: 1, x: 300, y: 700, w: 150, h: 50, png: makePng(30, 10, [0, 0, 128]) },
    ];
    const out = await applyAnnotations({ name: 'a.pdf', bytes: await makePdf('P', 2) }, annots);
    const doc = await PDFDocument.load(out);
    const xobj = (i: number) => doc.getPage(i).node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict)?.keys().length ?? 0;
    expect(xobj(0)).toBe(0);
    expect(xobj(1)).toBe(1); // the signature
    const gs = doc.getPage(0).node.Resources()?.lookupMaybe(PDFName.of('ExtGState'), PDFDict);
    const states = gs!.keys().map((k) => gs!.lookup(k, PDFDict));
    expect(states.some((s) => String(s.get(PDFName.of('BM'))) === '/Multiply')).toBe(true); // highlight
    // Original text is untouched (marks are added on top, not edits of the text)
    expect((await readPlacedText(out))[0].items.map((i) => i.str)).toEqual(['P-1']);
  });

  it('rejects empty input, missing pages and unsupported characters', async () => {
    const input = { name: 'a.pdf', bytes: await makePdf('P', 1) };
    await expect(applyAnnotations(input, [])).rejects.toThrow(/at least one mark/);
    await expect(applyAnnotations(input, [{ type: 'text', page: 3, x: 0, y: 0, size: 10, color: black, text: 'x' }])).rejects.toThrow(/Page 4 does not exist/);
    await expect(applyAnnotations(input, [{ type: 'text', page: 0, x: 0, y: 0, size: 10, color: black, text: '签名' }])).rejects.toThrow(/cannot show/);
  });
});

async function sampleForm(xfa = false) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const form = doc.getForm();
  const name = form.createTextField('name');
  name.addToPage(page, { x: 50, y: 700, width: 200, height: 20 });
  const agree = form.createCheckBox('agree');
  agree.addToPage(page, { x: 50, y: 650, width: 15, height: 15 });
  const state = form.createDropdown('state');
  state.addOptions(['Selangor', 'Johor', 'Penang']);
  state.disableEditing();
  state.addToPage(page, { x: 50, y: 600, width: 150, height: 20 });
  const size = form.createRadioGroup('size');
  size.addOptionToPage('S', page, { x: 50, y: 550, width: 15, height: 15 });
  size.addOptionToPage('L', page, { x: 80, y: 550, width: 15, height: 15 });
  const code = form.createTextField('postcode');
  code.setMaxLength(5);
  code.addToPage(page, { x: 50, y: 500, width: 80, height: 20 });
  const ro = form.createTextField('locked');
  ro.setText('fixed');
  ro.enableReadOnly();
  ro.addToPage(page, { x: 50, y: 450, width: 80, height: 20 });
  const bytes = await doc.save();
  if (!xfa) return bytes;
  // Add XFA without touching the form API (the library strips XFA when the form API is used).
  const raw = await PDFDocument.load(bytes, { preserveXFA: true } as any);
  (raw.catalog.lookup(PDFName.of('AcroForm')) as PDFDict).set(PDFName.of('XFA'), PDFString.of('<xdp/>'));
  return raw.save();
}

describe('forms', () => {
  it('lists text, checkbox, dropdown and radio fields', async () => {
    const info = await readForm({ name: 'f.pdf', bytes: await sampleForm() });
    expect(info.xfa).toBe('none');
    expect(info.fields.map((f) => [f.name, f.kind])).toEqual([['name', 'text'], ['agree', 'checkbox'], ['state', 'dropdown'], ['size', 'radio'], ['postcode', 'text'], ['locked', 'text']]);
    expect(info.fields[2].options).toEqual(['Selangor', 'Johor', 'Penang']);
    expect(info.fields[4].maxLength).toBe(5);
    expect(info.fields[5].readOnly).toBe(true);
  });

  it('fills and exports fields, readable after reopening (spec test)', async () => {
    const out = await fillForm({ name: 'f.pdf', bytes: await sampleForm() }, { name: 'Siti Aminah', agree: true, state: 'Johor', size: 'L', postcode: '81300' }, false);
    const info = await readForm({ name: 'out.pdf', bytes: out });
    const v = Object.fromEntries(info.fields.map((f) => [f.name, f.value]));
    expect(v).toMatchObject({ name: 'Siti Aminah', agree: true, state: 'Johor', size: 'L', postcode: '81300', locked: 'fixed' });
  });

  it('can flatten so the values become part of the page', async () => {
    const out = await fillForm({ name: 'f.pdf', bytes: await sampleForm() }, { name: 'Ali bin Abu' }, true);
    expect((await readForm({ name: 'o.pdf', bytes: out })).fields).toEqual([]);
    expect((await readPlacedText(out))[0].items.map((i) => i.str).join(' ')).toContain('Ali bin Abu');
  });

  it('gives actionable errors', async () => {
    const bytes = await sampleForm();
    await expect(fillForm({ name: 'f.pdf', bytes }, { postcode: '123456' }, false)).rejects.toThrow(/at most 5 characters/);
    await expect(fillForm({ name: 'f.pdf', bytes }, { state: 'Mars' }, false)).rejects.toThrow(/"state": choose one of the listed options/);
    await expect(fillForm({ name: 'f.pdf', bytes }, { name: '王小明' }, false)).rejects.toThrow(/cannot show/);
    await expect(fillForm({ name: 'f.pdf', bytes }, { nope: 'x' }, false)).rejects.toThrow(/no field called "nope"/);
  });

  it('detects XFA forms', async () => {
    expect((await readForm({ name: 'x.pdf', bytes: await sampleForm(true) })).xfa).toBe('hybrid');
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.catalog.set(PDFName.of('AcroForm'), doc.context.obj({ Fields: [], XFA: PDFString.of('<xdp/>') }));
    const bytes = await doc.save();
    expect((await readForm({ name: 'x.pdf', bytes })).xfa).toBe('xfa-only');
    await expect(fillForm({ name: 'x.pdf', bytes }, {}, false)).rejects.toThrow(/dynamic XFA/);
  });
});

describe('workspace marks', () => {
  const black = { r: 0, g: 0, b: 0 };
  it('writes text in the chosen standard font and style', async () => {
    const { PDFDocument: D } = await import('@cantoo/pdf-lib');
    const out = await applyAnnotations({ name: 'a.pdf', bytes: await makePdf('P', 1) }, [
      { type: 'text', page: 0, x: 72, y: 300, size: 14, color: black, text: 'Serif bold', font: 'serif', bold: true },
      { type: 'text', page: 0, x: 72, y: 340, size: 14, color: black, text: 'Mono italic', font: 'mono', italic: true },
    ]);
    const raw = new TextDecoder('latin1').decode(out);
    expect(raw).toContain('/Times-Bold');
    expect(raw).toContain('/Courier-Oblique');
    expect((await readPageTexts(out))[0]).toContain('Serif bold');
    expect((await D.load(out)).getPageCount()).toBe(1);
  });

  it('replaces a line: draws a white cover, then the new text', async () => {
    const out = await applyAnnotations({ name: 'a.pdf', bytes: await makePdf('P', 1) }, [
      { type: 'text', page: 0, x: 72, y: 60, size: 24, color: black, text: 'New words', cover: { x: 70, y: 58, w: 80, h: 28 } },
    ]);
    const text = (await readPageTexts(out))[0];
    expect(text).toContain('New words');
    // Honest limitation: the original words are hidden, not deleted.
    expect(text).toContain('P-1');
  });

  it('draws white-out boxes and normal-blend pictures', async () => {
    const out = await applyAnnotations({ name: 'a.pdf', bytes: await makePdf('P', 1) }, [
      { type: 'cover', page: 0, x: 60, y: 60, w: 100, h: 40, color: { r: 1, g: 1, b: 1 } },
      { type: 'image', page: 0, x: 100, y: 200, w: 50, h: 50, png: makePng(4, 4), blend: 'normal' },
    ]);
    const raw = new TextDecoder('latin1').decode(out);
    expect(raw).not.toContain('/Multiply');
    expect(raw).toContain('/Image');
  });
});
