import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName, PDFDict, PDFRawStream, decodePDFRawStream } from '@cantoo/pdf-lib';
import { imagesToPdf, jpegOrientation, sniffImage } from '../src/core/images';
import { makeJpeg, makePng } from './helpers';

/** The "cm" matrix that places the image on each page, read from the page content. */
async function placements(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFRawStream ? [contents] : (contents as any).asArray().map((r: any) => doc.context.lookup(r));
    const text = streams.map((s: PDFRawStream) => new TextDecoder().decode(decodePDFRawStream(s).decode())).join('\n');
    const m = /([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) cm\s*\/\S+ Do/.exec(text);
    const xobjects = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict)?.keys().length ?? 0;
    return { size: page.getSize(), cm: m ? m.slice(1).map(Number) : null, xobjects };
  });
}

describe('image helpers', () => {
  it('detects JPEG and PNG by content, not filename', () => {
    expect(sniffImage(makeJpeg())).toBe('jpg');
    expect(sniffImage(makePng(2, 2))).toBe('png');
    expect(sniffImage(new TextEncoder().encode('GIF89a'))).toBeNull();
  });
  it('reads EXIF orientation, defaulting to 1', () => {
    expect(jpegOrientation(makeJpeg())).toBe(1);
    for (const o of [1, 3, 6, 8]) expect(jpegOrientation(makeJpeg(o))).toBe(o);
    expect(jpegOrientation(new Uint8Array([0xff, 0xd8, 0xff]))).toBe(1);
  });
});

describe('imagesToPdf', () => {
  it('makes one page per image in the chosen order (spec test)', async () => {
    const out = await imagesToPdf(
      [
        { name: 'wide.png', bytes: makePng(40, 20) },
        { name: 'tall.jpg', bytes: makeJpeg(undefined, 16, 32) },
        { name: 'square.png', bytes: makePng(10, 10) },
      ],
      { pageSize: 'fit', orientation: 'auto', margin: 0 },
    );
    const p = await placements(out);
    expect(p.map((x) => x.xobjects)).toEqual([1, 1, 1]);
    // 'fit' pages match the image at 96 dpi (0.75 pt per pixel)
    expect(p.map((x) => [x.size.width, x.size.height])).toEqual([[30, 15], [12, 24], [7.5, 7.5]]);
  });

  it('uses A4 with automatic orientation and keeps the aspect ratio inside the margins', async () => {
    const out = await imagesToPdf(
      [{ name: 'wide.png', bytes: makePng(400, 200) }, { name: 'tall.png', bytes: makePng(200, 400) }],
      { pageSize: 'a4', orientation: 'auto', margin: 36 },
    );
    const [wide, tall] = await placements(out);
    expect(wide.size.width).toBeCloseTo(841.89);
    expect(tall.size.width).toBeCloseTo(595.28);
    // Wide image fills the width between margins, and is centred vertically
    const [w, , , h, x, y] = wide.cm!;
    expect(w).toBeCloseTo(841.89 - 72, 1);
    expect(h).toBeCloseTo(w / 2, 1);
    expect(x).toBeCloseTo(36, 1);
    expect(y).toBeCloseTo((595.28 - h) / 2, 1);
  });

  it('forces portrait or landscape when asked', async () => {
    const wide = [{ name: 'w.png', bytes: makePng(400, 200) }];
    const [p] = await placements(await imagesToPdf(wide, { pageSize: 'letter', orientation: 'portrait', margin: 0 }));
    expect([p.size.width, p.size.height]).toEqual([612, 792]);
    const [l] = await placements(await imagesToPdf(wide, { pageSize: 'letter', orientation: 'landscape', margin: 0 }));
    expect([l.size.width, l.size.height]).toEqual([792, 612]);
  });

  it('turns phone photos upright using EXIF orientation 6 (rotate 90° clockwise)', async () => {
    // Stored 32 wide x 16 tall, but the camera says "rotate 90° clockwise": shown 16 wide x 32 tall.
    const out = await imagesToPdf([{ name: 'phone.jpg', bytes: makeJpeg(6, 32, 16) }], { pageSize: 'fit', orientation: 'auto', margin: 0 });
    const [p] = await placements(out);
    expect([p.size.width, p.size.height]).toEqual([12, 24]); // portrait page
    // Unit square (s,t) -> page: x = 12*t, y = 24*(1-s): the stored left edge becomes the top edge.
    expect(p.cm).toEqual([0, -24, 12, 0, 0, 24]);
  });

  it('handles orientation 3 (upside down) and 8 (rotate 90° anticlockwise)', async () => {
    const [o3] = await placements(await imagesToPdf([{ name: 'a.jpg', bytes: makeJpeg(3, 16, 8) }], { pageSize: 'fit', orientation: 'auto', margin: 0 }));
    expect([o3.size.width, o3.size.height]).toEqual([12, 6]);
    expect(o3.cm).toEqual([-12, 0, 0, -6, 12, 6]);
    const [o8] = await placements(await imagesToPdf([{ name: 'b.jpg', bytes: makeJpeg(8, 16, 8) }], { pageSize: 'fit', orientation: 'auto', margin: 0 }));
    expect([o8.size.width, o8.size.height]).toEqual([6, 12]);
    expect(o8.cm).toEqual([0, 12, -6, 0, 6, 0]);
  });

  it('caps huge images to a page size readers accept', async () => {
    const out = await imagesToPdf([{ name: 'huge.jpg', bytes: makeJpeg(undefined, 30000, 15000) }], { pageSize: 'fit', orientation: 'auto', margin: 0 });
    const [p] = await placements(out);
    expect(p.size.width).toBeLessThanOrEqual(14400);
    expect(p.size.height).toBeCloseTo(7200);
  });

  it('rejects empty input, non-images and damaged images with the filename', async () => {
    const opts = { pageSize: 'fit' as const, orientation: 'auto' as const, margin: 0 };
    await expect(imagesToPdf([], opts)).rejects.toThrow(/at least one image/);
    await expect(imagesToPdf([{ name: 'notes.txt', bytes: new TextEncoder().encode('hello') }], opts)).rejects.toThrow(/notes\.txt: this is not a JPG or PNG/);
    const broken = makePng(4, 4).slice(0, 20);
    await expect(imagesToPdf([{ name: 'broken.png', bytes: broken }], opts)).rejects.toThrow(/broken\.png: the image is damaged/);
  });
});
