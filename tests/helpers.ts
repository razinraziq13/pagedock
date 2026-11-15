import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { getDocument, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';

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
  const task = getDocument({ data: bytes.slice(), useSystemFonts: false, standardFontDataUrl });
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

export interface PlacedText {
  str: string;
  /** Position of the text origin as displayed (top-left origin, after page rotation). */
  x: number;
  y: number;
  /** True when the text reads left-to-right, upright, as displayed. */
  upright: boolean;
}

/** Read text with its displayed position on each page, using pdf.js. */
export async function readPlacedText(bytes: Uint8Array): Promise<{ width: number; height: number; items: PlacedText[] }[]> {
  const task = getDocument({ data: bytes.slice(), useSystemFonts: false, standardFontDataUrl });
  const pdf = await task.promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items
      .filter((it: any) => it.str && it.str.trim())
      .map((it: any) => {
        const m = Util.transform(vp.transform, it.transform);
        return { str: it.str, x: m[4], y: m[5], upright: m[0] > 0 && Math.abs(m[1]) < 1e-6 };
      });
    pages.push({ width: vp.width, height: vp.height, items });
  }
  await task.destroy();
  return pages;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc(buf: Buffer) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}

/** A real solid-colour RGB PNG of the given size, built by hand so tests need no image files. */
export function makePng(width: number, height: number, rgb: [number, number, number] = [255, 0, 0]): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

/**
 * A minimal valid baseline JPEG (8x8 grey) with an optional EXIF Orientation tag.
 * Built from fixed bytes so tests need no image files.
 */
export function makeJpeg(orientation?: number, width = 8, height = 8): Uint8Array {
  const parts: number[] = [0xff, 0xd8];
  if (orientation) {
    // APP1 Exif, big-endian TIFF, IFD0 with one entry: Orientation (0x0112), SHORT, count 1.
    const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    const body = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
    parts.push(0xff, 0xe1, ((body.length + 2) >> 8) & 255, (body.length + 2) & 255, ...body);
  }
  // DQT: one table of all 1s
  parts.push(0xff, 0xdb, 0x00, 0x43, 0x00, ...Array(64).fill(1));
  // SOF0: 8-bit, size, 1 component
  parts.push(0xff, 0xc0, 0x00, 0x0b, 0x08, (height >> 8) & 255, height & 255, (width >> 8) & 255, width & 255, 0x01, 0x01, 0x11, 0x00);
  // DHT DC table 0: one code of length 1 for category 0
  parts.push(0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, ...Array(15).fill(0), 0x00);
  // DHT AC table 0: one code of length 1 for EOB (0x00)
  parts.push(0xff, 0xc4, 0x00, 0x14, 0x10, 0x01, ...Array(15).fill(0), 0x00);
  // SOS, then entropy data: each 8x8 block = DC diff 0 ("0") + EOB ("0") = 2 bits
  parts.push(0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00);
  const blocks = Math.ceil(width / 8) * Math.ceil(height / 8);
  const bytes = Math.ceil((blocks * 2) / 8);
  for (let i = 0; i < bytes; i++) parts.push(i === bytes - 1 && (blocks * 2) % 8 ? (0xff >> ((blocks * 2) % 8)) & 0xff : 0x00);
  parts.push(0xff, 0xd9);
  return new Uint8Array(parts);
}
