import { PDFDocument, concatTransformationMatrix, drawObject, popGraphicsState, pushGraphicsState, type PDFImage } from '@cantoo/pdf-lib';
import { RangeError_ } from './pages';

export type ImageKind = 'jpg' | 'png';

export interface ImageInput {
  name: string;
  bytes: Uint8Array;
}

export interface ImagesToPdfOptions {
  /** 'a4width': A4-wide page whose height follows the image (no margins), like a scanner app. */
  pageSize: 'fit' | 'a4' | 'letter' | 'a4width';
  orientation: 'auto' | 'portrait' | 'landscape';
  /** Space around the image, in points (72 pt = 1 inch). Ignored for 'fit'. */
  margin: number;
}

const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const;
const PX_TO_PT = 0.75; // 96 px per inch
const MAX_PT = 14400; // largest page most PDF readers accept

/** Identify JPEG / PNG by their file signatures (not by the filename). */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  return null;
}

/** Read the EXIF Orientation (1–8) from a JPEG. Returns 1 when absent or unreadable. */
export function jpegOrientation(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 2;
  while (off + 4 <= bytes.length) {
    if (bytes[off] !== 0xff) return 1;
    const marker = bytes[off + 1];
    if (marker === 0xda || marker === 0xd9) return 1; // image data starts: no EXIF before it
    const len = view.getUint16(off + 2);
    if (marker === 0xe1 && off + 10 <= bytes.length && view.getUint32(off + 4) === 0x45786966 /* "Exif" */) {
      const tiff = off + 10;
      if (tiff + 8 > bytes.length) return 1;
      const le = view.getUint16(tiff) === 0x4949;
      const u16 = (p: number) => view.getUint16(p, le);
      const u32 = (p: number) => view.getUint32(p, le);
      const ifd = tiff + u32(tiff + 4);
      if (ifd + 2 > bytes.length) return 1;
      const entries = u16(ifd);
      for (let i = 0; i < entries; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 12 > bytes.length) return 1;
        if (u16(e) === 0x0112) {
          const v = u16(e + 8);
          return v >= 1 && v <= 8 ? v : 1;
        }
      }
      return 1;
    }
    off += 2 + len;
  }
  return 1;
}

/**
 * Matrix mapping the stored image's unit square to the upright display unit square, for each EXIF orientation.
 * (a, b, c, d, e, f) as in a PDF "cm" operator.
 */
const ORIENT: Record<number, [number, number, number, number, number, number]> = {
  1: [1, 0, 0, 1, 0, 0],
  2: [-1, 0, 0, 1, 1, 0],
  3: [-1, 0, 0, -1, 1, 1],
  4: [1, 0, 0, -1, 0, 1],
  5: [0, -1, -1, 0, 1, 1],
  6: [0, -1, 1, 0, 0, 1],
  7: [0, 1, 1, 0, 0, 0],
  8: [0, 1, -1, 0, 1, 0],
};

function pageFor(displayW: number, displayH: number, opts: ImagesToPdfOptions): [number, number] {
  if (opts.pageSize === 'a4width') {
    const w = PAGE_SIZES.a4[0];
    return [w, Math.min(MAX_PT, (w * displayH) / displayW)];
  }
  if (opts.pageSize === 'fit') {
    let w = displayW * PX_TO_PT, h = displayH * PX_TO_PT;
    const k = Math.min(1, MAX_PT / Math.max(w, h));
    w *= k; h *= k;
    return [Math.max(w, 1), Math.max(h, 1)];
  }
  const [pw, ph] = PAGE_SIZES[opts.pageSize];
  const landscape = opts.orientation === 'landscape' || (opts.orientation === 'auto' && displayW > displayH);
  return landscape ? [ph, pw] : [pw, ph];
}

/**
 * Put each image on its own page, upright (EXIF orientation applied without re-compressing), in the given order.
 */
export async function imagesToPdf(images: ImageInput[], opts: ImagesToPdfOptions): Promise<Uint8Array> {
  if (images.length === 0) throw new RangeError_('Add at least one image.');
  if (!(opts.margin >= 0 && opts.margin <= 144)) throw new RangeError_('Margin must be between 0 and 144 points.');
  const doc = await PDFDocument.create();
  for (const img of images) {
    const kind = sniffImage(img.bytes);
    if (!kind) throw new RangeError_(`${img.name}: this is not a JPG or PNG image.`);
    let embedded: PDFImage;
    try {
      embedded = kind === 'jpg' ? await doc.embedJpg(img.bytes) : await doc.embedPng(img.bytes);
    } catch {
      throw new RangeError_(`${img.name}: the image is damaged or uses an unsupported format.`);
    }
    const o = kind === 'jpg' ? jpegOrientation(img.bytes) : 1;
    const swap = o >= 5;
    const dispW = swap ? embedded.height : embedded.width;
    const dispH = swap ? embedded.width : embedded.height;

    const [pw, ph] = pageFor(dispW, dispH, opts);
    const page = doc.addPage([pw, ph]);
    const margin = opts.pageSize === 'fit' || opts.pageSize === 'a4width' ? 0 : Math.min(opts.margin, pw / 3, ph / 3);
    const boxW = pw - 2 * margin, boxH = ph - 2 * margin;
    const scale = Math.min(boxW / dispW, boxH / dispH);
    const w = dispW * scale, h = dispH * scale;
    const x = (pw - w) / 2, y = (ph - h) / 2;

    const [a, b, c, d, e, f] = ORIENT[o];
    const name = page.node.newXObject('Image', embedded.ref);
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(w * a, h * b, w * c, h * d, x + w * e, y + h * f),
      drawObject(name),
      popGraphicsState(),
    );
  }
  doc.setProducer('PageDock Free');
  doc.setCreator('PageDock Free');
  return doc.save();
}
