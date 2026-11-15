import {
  BlendMode, PDFCheckBox, PDFDropdown, PDFName, PDFOptionList, PDFRadioGroup, PDFTextField, StandardFonts, degrees, rgb,
  type PDFDocument, type PDFFont, type PDFPage,
} from '@cantoo/pdf-lib';
import { loadPdf, type PdfInput } from './pdf';
import { parsePageRanges, RangeError_ } from './pages';
import { displayBox, toUserSpace, unsupportedChars } from './stamp';

// ------------------------------------------------------------------ crop

/** Amounts to trim from each edge, in points, as the page is displayed. */
export interface CropMargins { top: number; right: number; bottom: number; left: number }

export async function cropPdf(input: PdfInput, m: CropMargins, pages: string | 'all'): Promise<Uint8Array> {
  for (const v of Object.values(m)) if (!(v >= 0) || !Number.isFinite(v)) throw new RangeError_('Crop amounts must be zero or more.');
  const doc = await loadPdf(input);
  const n = doc.getPageCount();
  const targets = pages === 'all' || !pages.trim() ? [...Array(n).keys()] : [...new Set(parsePageRanges(pages, n).flat())];
  for (const i of targets) {
    const page = doc.getPage(i);
    const box = displayBox(page);
    const w = box.width - m.left - m.right, h = box.height - m.top - m.bottom;
    if (w < 36 || h < 36) throw new RangeError_(`Page ${i + 1}: that would leave less than half an inch. Use smaller crop amounts.`);
    // Two opposite corners of the kept area, in display space (bottom-left origin), mapped to the page's own space.
    const a = toUserSpace(page, m.left, m.bottom);
    const b = toUserSpace(page, box.width - m.right, box.height - m.top);
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    page.setCropBox(x, y, Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  }
  doc.setProducer('PageDock Free');
  return doc.save();
}

// ------------------------------------------------------------------ annotations (also used for visual signatures)

export interface Color { r: number; g: number; b: number }

/** Coordinates are display-space points with a TOP-LEFT origin, matching what the user sees on screen. */
export type Annotation =
  | { type: 'text'; page: number; x: number; y: number; size: number; color: Color; text: string }
  | { type: 'rect' | 'ellipse' | 'highlight'; page: number; x: number; y: number; w: number; h: number; color: Color; width?: number }
  | { type: 'line' | 'arrow'; page: number; x1: number; y1: number; x2: number; y2: number; color: Color; width: number }
  | { type: 'ink'; page: number; points: [number, number][]; color: Color; width: number }
  | { type: 'image'; page: number; x: number; y: number; w: number; h: number; png: Uint8Array };

function at(page: PDFPage, x: number, yTop: number) {
  return toUserSpace(page, x, displayBox(page).height - yTop);
}

export async function applyAnnotations(input: PdfInput, annots: Annotation[]): Promise<Uint8Array> {
  if (annots.length === 0) throw new RangeError_('Add at least one mark before saving.');
  const doc = await loadPdf(input);
  const n = doc.getPageCount();
  let font: PDFFont | null = null;
  for (const a of annots) {
    if (!Number.isInteger(a.page) || a.page < 0 || a.page >= n) throw new RangeError_(`Page ${a.page + 1} does not exist.`);
    const page = doc.getPage(a.page);
    const color = 'color' in a ? rgb(a.color.r, a.color.g, a.color.b) : rgb(0, 0, 0);
    switch (a.type) {
      case 'text': {
        font ??= await doc.embedFont(StandardFonts.Helvetica);
        const bad = unsupportedChars(font, a.text.replace(/\n/g, ''));
        if (bad.length) throw new RangeError_(`The built-in PDF font cannot show: ${bad.slice(0, 8).join(' ')}.`);
        a.text.split('\n').forEach((line, i) => {
          const p = at(page, a.x, a.y + a.size * 0.8 + i * a.size * 1.2);
          page.drawText(line, { x: p.x, y: p.y, size: a.size, font: font!, color, rotate: degrees(p.rot) });
        });
        break;
      }
      case 'rect':
      case 'highlight': {
        const p = at(page, a.x, a.y + a.h);
        if (a.type === 'highlight') page.drawRectangle({ x: p.x, y: p.y, width: a.w, height: a.h, color, opacity: 0.35, blendMode: BlendMode.Multiply, rotate: degrees(p.rot) });
        else page.drawRectangle({ x: p.x, y: p.y, width: a.w, height: a.h, borderColor: color, borderWidth: a.width ?? 2, rotate: degrees(p.rot) });
        break;
      }
      case 'ellipse': {
        const p = at(page, a.x + a.w / 2, a.y + a.h / 2);
        page.drawEllipse({ x: p.x, y: p.y, xScale: a.w / 2, yScale: a.h / 2, borderColor: color, borderWidth: a.width ?? 2, rotate: degrees(p.rot) });
        break;
      }
      case 'line':
      case 'arrow': {
        const seg = (x1: number, y1: number, x2: number, y2: number) => {
          const s = at(page, x1, y1), e = at(page, x2, y2);
          page.drawLine({ start: { x: s.x, y: s.y }, end: { x: e.x, y: e.y }, thickness: a.width, color, lineCap: 1 as any });
        };
        seg(a.x1, a.y1, a.x2, a.y2);
        if (a.type === 'arrow') {
          const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1), len = Math.max(8, a.width * 4);
          for (const s of [-1, 1]) seg(a.x2, a.y2, a.x2 - len * Math.cos(ang + s * 0.5), a.y2 - len * Math.sin(ang + s * 0.5));
        }
        break;
      }
      case 'ink': {
        for (let i = 1; i < a.points.length; i++) {
          const s = at(page, ...a.points[i - 1]), e = at(page, ...a.points[i]);
          page.drawLine({ start: { x: s.x, y: s.y }, end: { x: e.x, y: e.y }, thickness: a.width, color, lineCap: 1 as any });
        }
        break;
      }
      case 'image': {
        let img;
        try { img = await doc.embedPng(a.png); } catch { throw new RangeError_('The signature image could not be read.'); }
        const p = at(page, a.x, a.y + a.h);
        page.drawImage(img, { x: p.x, y: p.y, width: a.w, height: a.h, rotate: degrees(p.rot) });
        break;
      }
    }
  }
  doc.setProducer('PageDock Free');
  return doc.save();
}

// ------------------------------------------------------------------ forms

export type FieldKind = 'text' | 'checkbox' | 'dropdown' | 'radio' | 'list' | 'unsupported';

export interface FormField {
  name: string;
  kind: FieldKind;
  value: string | boolean | string[];
  options: string[];
  multiline: boolean;
  readOnly: boolean;
  maxLength?: number;
  /** For unsupported fields: why. */
  note?: string;
}

export interface FormInfo {
  fields: FormField[];
  /** XFA forms (made by Adobe LiveCycle) are dynamic and cannot be filled reliably outside Adobe software. */
  xfa: 'none' | 'hybrid' | 'xfa-only';
}

/** Must be called BEFORE doc.getForm(): the PDF library deletes XFA data when it opens the form. */
function hasXfa(doc: PDFDocument): boolean {
  const acro = doc.catalog.lookup(PDFName.of('AcroForm')) as any;
  return !!acro?.lookup?.(PDFName.of('XFA'));
}

export async function readForm(input: PdfInput): Promise<FormInfo> {
  const doc = await loadPdf(input);
  const xfa = hasXfa(doc);
  const form = doc.getForm();
  const fields: FormField[] = form.getFields().map((f) => {
    const name = f.getName();
    const readOnly = f.isReadOnly();
    if (f instanceof PDFTextField) return { name, kind: 'text', value: f.getText() ?? '', options: [], multiline: f.isMultiline(), readOnly, maxLength: f.getMaxLength() };
    if (f instanceof PDFCheckBox) return { name, kind: 'checkbox', value: f.isChecked(), options: [], multiline: false, readOnly };
    if (f instanceof PDFDropdown) return { name, kind: 'dropdown', value: f.getSelected()[0] ?? '', options: f.getOptions(), multiline: false, readOnly };
    if (f instanceof PDFRadioGroup) return { name, kind: 'radio', value: f.getSelected() ?? '', options: f.getOptions(), multiline: false, readOnly };
    if (f instanceof PDFOptionList) return { name, kind: 'list', value: f.getSelected(), options: f.getOptions(), multiline: false, readOnly };
    return { name, kind: 'unsupported', value: '', options: [], multiline: false, readOnly: true, note: 'Signature and button fields are not filled by PageDock.' };
  });
  return { fields, xfa: !xfa ? 'none' : fields.length ? 'hybrid' : 'xfa-only' };
}

export async function fillForm(input: PdfInput, values: Record<string, string | boolean | string[]>, flatten: boolean): Promise<Uint8Array> {
  const doc = await loadPdf(input);
  const xfa = hasXfa(doc);
  const form = doc.getForm();
  if (xfa && form.getFields().length === 0) throw new RangeError_('This is a dynamic XFA form. It can only be filled in Adobe software.');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const [name, value] of Object.entries(values)) {
    const f = form.getFieldMaybe(name);
    if (!f) throw new RangeError_(`The form has no field called "${name}".`);
    if (f.isReadOnly()) continue;
    try {
      if (f instanceof PDFTextField) {
        const text = String(value);
        const bad = unsupportedChars(font, text.replace(/\n/g, ''));
        if (bad.length) throw new RangeError_(`Field "${name}": the built-in PDF font cannot show ${bad.slice(0, 8).join(' ')}.`);
        const max = f.getMaxLength();
        if (max !== undefined && text.length > max) throw new RangeError_(`Field "${name}" allows at most ${max} characters.`);
        f.setText(text || undefined);
      } else if (f instanceof PDFCheckBox) {
        value ? f.check() : f.uncheck();
      } else if (f instanceof PDFDropdown) {
        if (value && !f.isEditable() && !f.getOptions().includes(String(value))) throw new RangeError_(`Field "${name}": choose one of the listed options.`);
        if (value) f.select(String(value)); else f.clear();
      } else if (f instanceof PDFRadioGroup) {
        if (value) f.select(String(value)); else f.clear();
      } else if (f instanceof PDFOptionList) {
        const sel = Array.isArray(value) ? value : value ? [String(value)] : [];
        if (sel.length) f.select(sel); else f.clear();
      }
    } catch (e) {
      if (e instanceof RangeError_) throw e;
      throw new RangeError_(`Field "${name}" could not be filled with that value.`);
    }
  }
  form.updateFieldAppearances(font);
  if (flatten) form.flatten();
  doc.setProducer('PageDock Free');
  return doc.save();
}
