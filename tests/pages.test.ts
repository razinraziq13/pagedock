import { describe, it, expect } from 'vitest';
import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { unzipSync } from 'fflate';
import { parsePageRanges, splitPdf, zipFiles, rotatePdf, organizePdf } from '../src/core/pages';
import { makePdf, readPageTexts } from './helpers';

const rotations = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => p.getRotation().angle);

describe('parsePageRanges', () => {
  it('parses singles, ranges and open ranges', () => {
    expect(parsePageRanges('1,3-5', 5)).toEqual([[0], [2, 3, 4]]);
    expect(parsePageRanges(' 4- ', 5)).toEqual([[3, 4]]);
    expect(parsePageRanges('2 - 3', 5)).toEqual([[1, 2]]);
  });
  it('rejects invalid input with helpful messages', () => {
    expect(() => parsePageRanges('', 5)).toThrow(/at least one/);
    expect(() => parsePageRanges('0', 5)).toThrow(/start at 1/);
    expect(() => parsePageRanges('6', 5)).toThrow(/outside this document, which has 5 pages/);
    expect(() => parsePageRanges('4-2', 5)).toThrow(/backwards/);
    expect(() => parsePageRanges('a-b', 5)).toThrow(/not a page or range/);
    expect(() => parsePageRanges('1-3-5', 5)).toThrow(/not a page or range/);
  });
});

describe('splitPdf', () => {
  it('extracts "1,3-5" from a 5-page file into one 4-page PDF (spec test)', async () => {
    const src = { name: 'report.pdf', bytes: await makePdf('P', 5) };
    const [out] = await splitPdf(src, '1,3-5', 'single');
    expect(out.name).toBe('report-pages.pdf');
    expect(await readPageTexts(out.bytes)).toEqual(['P-1', 'P-3', 'P-4', 'P-5']);
  });

  it('makes one file per range, and a valid zip of them', async () => {
    const src = { name: 'report.pdf', bytes: await makePdf('P', 5) };
    const outs = await splitPdf(src, '1,3-5', 'perRange');
    expect(outs.map((o) => o.name)).toEqual(['report-p1.pdf', 'report-p3-5.pdf']);
    expect(await readPageTexts(outs[0].bytes)).toEqual(['P-1']);
    expect(await readPageTexts(outs[1].bytes)).toEqual(['P-3', 'P-4', 'P-5']);
    const unzipped = unzipSync(zipFiles(outs));
    expect(Object.keys(unzipped)).toEqual(['report-p1.pdf', 'report-p3-5.pdf']);
    expect(await readPageTexts(unzipped['report-p3-5.pdf'])).toEqual(['P-3', 'P-4', 'P-5']);
  });

  it('rejects out-of-range requests without producing output', async () => {
    const src = { name: 'r.pdf', bytes: await makePdf('P', 5) };
    await expect(splitPdf(src, '2,9', 'single')).rejects.toThrow(/"9" is outside/);
  });

  it('gives duplicate zip names a counter', () => {
    const z = unzipSync(zipFiles([{ name: 'a.pdf', bytes: new Uint8Array([1]) }, { name: 'a.pdf', bytes: new Uint8Array([2]) }]));
    expect(Object.keys(z)).toEqual(['a.pdf', 'a-2.pdf']);
  });
});

describe('rotatePdf', () => {
  it.each([90, 180, 270] as const)('rotates selected pages by %i and leaves others alone', async (angle) => {
    const bytes = await makePdf('R', 3);
    const out = await rotatePdf({ name: 'r.pdf', bytes }, [0, 2], angle);
    expect(await rotations(out)).toEqual([angle, 0, angle]);
    expect(await readPageTexts(out)).toEqual(['R-1', 'R-2', 'R-3']); // content kept
  });

  it('adds to an existing rotation', async () => {
    const doc = await PDFDocument.create();
    doc.addPage().setRotation(degrees(270));
    const out = await rotatePdf({ name: 'x.pdf', bytes: await doc.save() }, [0], 180);
    expect(await rotations(out)).toEqual([90]);
  });

  it('refuses an empty selection or a missing page', async () => {
    const input = { name: 'r.pdf', bytes: await makePdf('R', 2) };
    await expect(rotatePdf(input, [], 90)).rejects.toThrow(/at least one page/);
    await expect(rotatePdf(input, [5], 90)).rejects.toThrow(/Page 6 does not exist/);
  });
});

describe('organizePdf', () => {
  it('reorders, removes and rotates (spec test: [1,2,3] -> [3,1], rotate one)', async () => {
    const input = { name: 'o.pdf', bytes: await makePdf('O', 3) };
    const out = await organizePdf(input, [{ source: 2, rotate: 90 }, { source: 0, rotate: 0 }]);
    expect(await readPageTexts(out)).toEqual(['O-3', 'O-1']);
    expect(await rotations(out)).toEqual([90, 0]);
  });

  it('can duplicate nothing and refuses an empty result', async () => {
    const input = { name: 'o.pdf', bytes: await makePdf('O', 2) };
    await expect(organizePdf(input, [])).rejects.toThrow(/no pages/);
  });

  it('does not change the original bytes', async () => {
    const bytes = await makePdf('O', 2);
    const copy = bytes.slice();
    await organizePdf({ name: 'o.pdf', bytes }, [{ source: 1, rotate: 180 }]);
    await rotatePdf({ name: 'o.pdf', bytes }, [0], 90);
    expect(bytes).toEqual(copy);
  });
});
