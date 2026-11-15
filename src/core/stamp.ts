import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from '@cantoo/pdf-lib';
import { loadPdf, type PdfInput } from './pdf';
import { parsePageRanges, RangeError_ } from './pages';

/**
 * "Display space" is the page as a reader shows it: origin at the bottom-left of the visible (crop) box,
 * after the page's /Rotate is applied. Drawing in display space means marks land where the user expects,
 * upright, even on rotated or cropped pages.
 */
export interface DisplayBox {
  width: number;
  height: number;
}

export function displayBox(page: PDFPage): DisplayBox {
  const { width, height } = page.getCropBox();
  const r = normRot(page.getRotation().angle);
  return r % 180 === 0 ? { width, height } : { width: height, height: width };
}

function normRot(a: number) {
  return (((Math.round(a / 90) * 90) % 360) + 360) % 360;
}

/** Map a display-space point to the page's user space, and give the extra rotation needed to look upright. */
export function toUserSpace(page: PDFPage, u: number, v: number): { x: number; y: number; rot: number } {
  const { x: x0, y: y0, width: w, height: h } = page.getCropBox();
  const r = normRot(page.getRotation().angle);
  switch (r) {
    case 90: return { x: x0 + w - v, y: y0 + u, rot: 90 };
    case 180: return { x: x0 + w - u, y: y0 + h - v, rot: 180 };
    case 270: return { x: x0 + v, y: y0 + h - u, rot: 270 };
    default: return { x: x0 + u, y: y0 + v, rot: 0 };
  }
}

/** Rotate vector (dx, dy) by `deg` counter-clockwise. */
function rot(dx: number, dy: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { dx: dx * Math.cos(a) - dy * Math.sin(a), dy: dx * Math.sin(a) + dy * Math.cos(a) };
}

function pageList(doc: PDFDocument, pages: string | 'all'): number[] {
  const n = doc.getPageCount();
  if (pages === 'all' || pages.trim() === '') return Array.from({ length: n }, (_, i) => i);
  return [...new Set(parsePageRanges(pages, n).flat())].sort((a, b) => a - b);
}

/**
 * Standard PDF fonts only cover Latin (WinAnsi) characters, and the PDF library silently turns anything else
 * into "?". Check every character first and fail clearly instead of producing broken output.
 */
export function unsupportedChars(font: PDFFont, text: string): string[] {
  const set = new Set(font.getCharacterSet());
  const bad = new Set<string>();
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x20 && !set.has(cp)) bad.add(ch);
  }
  return [...bad];
}

function checkEncodable(font: PDFFont, text: string) {
  const bad = unsupportedChars(font, text);
  if (bad.length) {
    throw new RangeError_(`The built-in PDF font cannot show: ${bad.slice(0, 8).join(' ')}. Use Latin letters, numbers and common symbols.`);
  }
}

// ------------------------------------------------------------------ page numbers

export type NumberPosition = 'bottom-center' | 'bottom-left' | 'bottom-right' | 'top-center' | 'top-left' | 'top-right';
export type NumberFormat = 'n' | 'page-n' | 'page-n-of-total' | 'n-of-total';

export interface PageNumberOptions {
  position: NumberPosition;
  /** Number shown on the first numbered page. */
  start: number;
  /** Which pages get a number, e.g. "2-" to skip a cover. 'all' for every page. */
  pages: string | 'all';
  format: NumberFormat;
  fontSize: number;
  /** Distance from the page edge, in points. */
  margin: number;
}

export function formatNumber(format: NumberFormat, n: number, total: number): string {
  switch (format) {
    case 'page-n': return `Page ${n}`;
    case 'page-n-of-total': return `Page ${n} of ${total}`;
    case 'n-of-total': return `${n} / ${total}`;
    default: return String(n);
  }
}

export async function addPageNumbers(input: PdfInput, opts: PageNumberOptions): Promise<Uint8Array> {
  if (!Number.isInteger(opts.start) || opts.start < 0 || opts.start > 99999) throw new RangeError_('The starting number must be a whole number from 0 to 99999.');
  if (!(opts.fontSize >= 6 && opts.fontSize <= 72)) throw new RangeError_('Font size must be between 6 and 72.');
  if (!(opts.margin >= 0 && opts.margin <= 144)) throw new RangeError_('Margin must be between 0 and 144 points.');
  const doc = await loadPdf(input);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const targets = pageList(doc, opts.pages);
  const total = opts.start + targets.length - 1;
  targets.forEach((idx, k) => {
    const page = doc.getPage(idx);
    const text = formatNumber(opts.format, opts.start + k, total);
    const box = displayBox(page);
    // Shrink the text if a very small page cannot fit it, so it is never clipped.
    let size = opts.fontSize;
    const maxW = Math.max(box.width - 2 * opts.margin, 10);
    while (size > 4 && font.widthOfTextAtSize(text, size) > maxW) size -= 0.5;
    const margin = Math.min(opts.margin, Math.max((box.height - size) / 2, 0));
    const tw = font.widthOfTextAtSize(text, size);
    const [vert, horiz] = opts.position.split('-') as ['top' | 'bottom', 'left' | 'center' | 'right'];
    const u = horiz === 'left' ? margin : horiz === 'right' ? box.width - margin - tw : (box.width - tw) / 2;
    const descent = Math.abs(font.heightAtSize(size, { descender: true }) - font.heightAtSize(size, { descender: false }));
    const v = vert === 'bottom' ? margin + descent : box.height - margin - font.heightAtSize(size, { descender: false });
    const p = toUserSpace(page, u, v);
    page.drawText(text, { x: p.x, y: p.y, size, font, color: rgb(0.1, 0.1, 0.1), rotate: degrees(p.rot) });
  });
  doc.setProducer('PageDock Free');
  return doc.save();
}

// ------------------------------------------------------------------ watermark

export type WatermarkPosition = 'center' | 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface WatermarkOptions {
  kind: 'text' | 'image';
  text?: string;
  /** For text: font size in points. */
  fontSize?: number;
  color?: { r: number; g: number; b: number };
  image?: { bytes: Uint8Array; type: 'png' | 'jpg' };
  /** For images: width as a fraction of the page width (0.05–1). */
  imageScale?: number;
  position: WatermarkPosition;
  /** Degrees counter-clockwise, as seen on the page. */
  rotation: number;
  /** 0.05–1 */
  opacity: number;
  pages: string | 'all';
}

export async function watermarkPdf(input: PdfInput, opts: WatermarkOptions): Promise<Uint8Array> {
  if (!(opts.opacity >= 0.05 && opts.opacity <= 1)) throw new RangeError_('Opacity must be between 5% and 100%.');
  if (!Number.isFinite(opts.rotation)) throw new RangeError_('Rotation must be a number.');
  const doc = await loadPdf(input);
  const targets = pageList(doc, opts.pages);

  let font: PDFFont | null = null;
  let image: PDFImage | null = null;
  const text = (opts.text ?? '').trim();
  if (opts.kind === 'text') {
    if (!text) throw new RangeError_('Type the watermark text.');
    if (text.length > 200) throw new RangeError_('Keep the watermark text under 200 characters.');
    font = await doc.embedFont(StandardFonts.HelveticaBold);
    checkEncodable(font, text);
  } else {
    if (!opts.image) throw new RangeError_('Choose a PNG or JPG image for the watermark.');
    try {
      image = opts.image.type === 'png' ? await doc.embedPng(opts.image.bytes) : await doc.embedJpg(opts.image.bytes);
    } catch {
      throw new RangeError_('The watermark image could not be read. Use a PNG or JPG file.');
    }
  }

  for (const idx of targets) {
    const page = doc.getPage(idx);
    const box = displayBox(page);
    // Size of the mark before rotation, in display space.
    let w: number, hgt: number, size = 0;
    if (font) {
      size = opts.fontSize ?? 48;
      // Keep long text inside the page: shrink until its rotated bounding box fits.
      const fits = (s: number) => {
        const tw = font!.widthOfTextAtSize(text, s), th = font!.heightAtSize(s, { descender: false });
        const a = (opts.rotation * Math.PI) / 180;
        return Math.abs(tw * Math.cos(a)) + Math.abs(th * Math.sin(a)) <= box.width * 0.95 && Math.abs(tw * Math.sin(a)) + Math.abs(th * Math.cos(a)) <= box.height * 0.95;
      };
      while (size > 6 && !fits(size)) size -= 1;
      w = font.widthOfTextAtSize(text, size);
      hgt = font.heightAtSize(size, { descender: false });
    } else {
      const scale = Math.min(Math.max(opts.imageScale ?? 0.4, 0.05), 1);
      w = box.width * scale;
      hgt = (w * image!.height) / image!.width;
    }
    // Rotated bounding box, used to keep the mark inside the page at edge positions.
    const a = (opts.rotation * Math.PI) / 180;
    const bw = Math.abs(w * Math.cos(a)) + Math.abs(hgt * Math.sin(a));
    const bh = Math.abs(w * Math.sin(a)) + Math.abs(hgt * Math.cos(a));
    const m = Math.min(box.width, box.height) * 0.05;
    const [row, col] = opts.position === 'center' ? ['middle', 'center'] : opts.position.split('-');
    const cx = col === 'left' ? m + bw / 2 : col === 'right' ? box.width - m - bw / 2 : box.width / 2;
    const cy = row === 'bottom' ? m + bh / 2 : row === 'top' ? box.height - m - bh / 2 : box.height / 2;
    // Bottom-left corner of the unrotated mark, rotated about the centre.
    const off = rot(-w / 2, -hgt / 2, opts.rotation);
    const p = toUserSpace(page, cx + off.dx, cy + off.dy);
    const rotate = degrees(p.rot + opts.rotation);
    if (font) {
      const c = opts.color ?? { r: 0.5, g: 0.5, b: 0.5 };
      page.drawText(text, { x: p.x, y: p.y, size, font, color: rgb(c.r, c.g, c.b), opacity: opts.opacity, rotate });
    } else {
      page.drawImage(image!, { x: p.x, y: p.y, width: w, height: hgt, opacity: opts.opacity, rotate });
    }
  }
  doc.setProducer('PageDock Free');
  return doc.save();
}
