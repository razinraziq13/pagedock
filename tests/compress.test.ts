import { PDFDocument } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { compressScannedPages, optimizePdf } from '../src/core/compress';
import { makeJpeg, makePdf, readPageTexts } from './helpers';

describe('PDF compression', () => {
  it('compacts a PDF while preserving selectable text and page order', async () => {
    const original = await PDFDocument.load(await makePdf('Document', 12));
    const uncompressed = await original.save({ useObjectStreams: false });
    const optimized = await optimizePdf({ name: 'original.pdf', bytes: uncompressed });

    expect(optimized.length).toBeLessThan(uncompressed.length);
    expect(await readPageTexts(optimized)).toEqual(await readPageTexts(uncompressed));
  });

  it('keeps scan page sizes and caps the render resolution', async () => {
    const resolutions: number[] = [];
    const bytes = await compressScannedPages({
      pageCount: 2,
      async pageSize(index) {
        return index === 0 ? { width: 612, height: 792 } : { width: 6000, height: 2000 };
      },
      async jpeg(_index, scale) {
        resolutions.push(scale);
        return makeJpeg();
      },
    }, 'balanced', () => {});

    const output = await PDFDocument.load(bytes);
    expect(output.getPages().map((page) => page.getSize())).toEqual([
      { width: 612, height: 792 }, { width: 6000, height: 2000 },
    ]);
    expect(resolutions).toEqual([150 / 72, 4096 / 6000]);
  });
});
