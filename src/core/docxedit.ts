/**
 * Edit the text of a Word (.docx) file in place. Only word/document.xml is changed, and only the characters the
 * user changed: every other part of the file (styles, pictures, tables, headers, numbering) is kept byte-for-byte.
 * Runs that were not touched keep their own formatting.
 */
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML = 'http://www.w3.org/XML/1998/namespace';

export class WordError extends Error {}

export type Align = 'left' | 'center' | 'right' | 'both';
export interface ParaFormat { bold: boolean; italic: boolean; underline: boolean; align: Align; size: number | null }
export interface WordPara { index: number; text: string; format: ParaFormat; inTable: boolean; heading: boolean }

// Word is strict about the order of formatting elements, so new ones are inserted in schema order.
const RPR_ORDER = ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline', 'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath'];
const PPR_ORDER = ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl', 'numPr', 'suppressLineNumbers', 'pBdr', 'shd', 'tabs', 'suppressAutoHyphens', 'kinsoku', 'wordWrap', 'overflowPunct', 'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi', 'adjustRightInd', 'snapToGrid', 'spacing', 'ind', 'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection', 'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr', 'pPrChange'];

const kids = (el: Element, name?: string): Element[] => {
  const out: Element[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && (n as Element).namespaceURI === W && (!name || (n as Element).localName === name)) out.push(n as Element);
  return out;
};
const child = (el: Element, name: string) => kids(el, name)[0] ?? null;

interface Seg { node: Element; kind: 't' | 'tab' | 'br'; text: string; start: number; end: number }

function closestPara(n: Node | null): Element | null {
  for (let p = n?.parentNode ?? null; p; p = p.parentNode) if (p.nodeType === 1 && (p as Element).namespaceURI === W && (p as Element).localName === 'p') return p as Element;
  return null;
}

export class WordDoc {
  private files: Record<string, Uint8Array>;
  private doc!: Document;
  private paras: Element[] = [];

  private constructor(files: Record<string, Uint8Array>) {
    this.files = files;
    this.load(strFromU8(files['word/document.xml']));
  }

  static open(bytes: Uint8Array): WordDoc {
    if (bytes[0] === 0xd0 && bytes[1] === 0xcf) throw new WordError('This is an old Word file (.doc). Save it as .docx in Word or LibreOffice first.');
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new WordError('This is not a Word .docx file.');
    let files: Record<string, Uint8Array>;
    try { files = unzipSync(bytes); } catch { throw new WordError('This .docx file is damaged and cannot be opened.'); }
    if (!files['word/document.xml']) throw new WordError('This file has no Word document inside. Choose a .docx file.');
    return new WordDoc(files);
  }

  private load(xml: string) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new WordError('The text of this .docx file could not be read.');
    this.doc = doc;
    const body = doc.getElementsByTagNameNS(W, 'body')[0];
    if (!body) throw new WordError('This .docx file has no document body.');
    this.paras = Array.from(body.getElementsByTagNameNS(W, 'p'));
  }

  /** Current document.xml, used for undo snapshots. */
  snapshot(): string { return new XMLSerializer().serializeToString(this.doc); }
  restore(xml: string) { this.load(xml); }

  get count() { return this.paras.length; }

  /** Runs that belong to this paragraph (not to a text box nested inside it). */
  private runs(p: Element): Element[] {
    return Array.from(p.getElementsByTagNameNS(W, 'r')).filter((r) => closestPara(r) === p);
  }

  private segments(p: Element): Seg[] {
    const segs: Seg[] = [];
    let pos = 0;
    for (const r of this.runs(p)) {
      for (const c of kids(r)) {
        const kind = c.localName === 't' ? 't' : c.localName === 'tab' ? 'tab' : c.localName === 'br' || c.localName === 'cr' ? 'br' : null;
        if (!kind) continue;
        const text = kind === 't' ? c.textContent ?? '' : kind === 'tab' ? '\t' : '\n';
        segs.push({ node: c, kind, text, start: pos, end: pos + text.length });
        pos += text.length;
      }
    }
    return segs;
  }

  paragraphs(): WordPara[] {
    return this.paras.map((p, index) => {
      const style = child(child(p, 'pPr') ?? p, 'pStyle')?.getAttributeNS(W, 'val') ?? '';
      let inTable = false;
      for (let n: Node | null = p.parentNode; n; n = n.parentNode) if ((n as Element).localName === 'tc') { inTable = true; break; }
      return { index, text: this.segments(p).map((s) => s.text).join(''), format: this.format(index), inTable, heading: /^(heading|title)/i.test(style) };
    });
  }

  text(i: number): string { return this.segments(this.para(i)).map((s) => s.text).join(''); }

  private para(i: number): Element {
    const p = this.paras[i];
    if (!p) throw new WordError(`Paragraph ${i + 1} does not exist.`);
    return p;
  }

  private el(name: string) { return this.doc.createElementNS(W, `w:${name}`); }
  private textEl(s: string) {
    const t = this.el('t');
    t.setAttributeNS(XML, 'xml:space', 'preserve');
    t.textContent = s;
    return t;
  }

  /** Nodes for inserted text: newlines become line breaks and tabs become tabs, as Word stores them. */
  private textNodes(s: string): Element[] {
    const out: Element[] = [];
    for (const part of s.split(/(\t|\n)/)) {
      if (part === '\t') out.push(this.el('tab'));
      else if (part === '\n') out.push(this.el('br'));
      else if (part) out.push(this.textEl(part));
    }
    return out;
  }

  /** Replace paragraph `i`'s text. Only the changed characters are touched, so untouched words keep their formatting. */
  setText(i: number, next: string) {
    const p = this.para(i);
    next = next.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '');
    const segs = this.segments(p);
    const old = segs.map((s) => s.text).join('');
    if (old === next) return;
    let a = 0;
    while (a < old.length && a < next.length && old[a] === next[a]) a++;
    let b = 0;
    while (b < old.length - a && b < next.length - a && old[old.length - 1 - b] === next[next.length - 1 - b]) b++;
    const from = a, to = old.length - b; // replaced range in the old text
    const insert = next.slice(a, next.length - b);

    // Where the new characters go: the text piece holding the change, else one ending right at it, else any.
    const target = segs.find((s) => s.kind === 't' && s.start <= from && from < s.end)
      ?? [...segs].reverse().find((s) => s.kind === 't' && s.end === from)
      ?? segs.find((s) => s.kind === 't' && s.start >= from)
      ?? null;

    for (const s of segs) {
      if (s === target || s.end <= from || s.start >= to) continue;
      if (s.kind !== 't') { s.node.parentNode?.removeChild(s.node); continue; }
      const keep = s.text.slice(0, Math.max(0, from - s.start)) + s.text.slice(Math.max(0, to - s.start));
      if (keep) { s.node.textContent = keep; s.node.setAttributeNS(XML, 'xml:space', 'preserve'); }
      else s.node.parentNode?.removeChild(s.node);
    }

    if (target) {
      const before = target.text.slice(0, Math.max(0, from - target.start));
      const after = to < target.end ? target.text.slice(Math.max(0, to - target.start)) : '';
      const nodes = this.textNodes(before + insert + after);
      const parent = target.node.parentNode!;
      for (const n of nodes) parent.insertBefore(n, target.node);
      parent.removeChild(target.node);
    } else if (insert) {
      // No text in this paragraph yet: add a run, using the paragraph mark's formatting if it has one.
      const r = this.el('r');
      const markRpr = child(child(p, 'pPr') ?? p, 'rPr');
      if (markRpr) r.appendChild(markRpr.cloneNode(true));
      for (const n of this.textNodes(insert)) r.appendChild(n);
      // Keep the run next to the other content at the position of the change.
      const after = segs.find((s) => s.start >= to);
      const anchorRun = after ? (after.node.parentNode as Element) : null;
      if (anchorRun && anchorRun.parentNode) anchorRun.parentNode.insertBefore(r, anchorRun);
      else p.appendChild(r);
    }
  }

  format(i: number): ParaFormat {
    const p = this.para(i);
    const runs = this.runs(p).filter((r) => kids(r).some((c) => c.localName === 't'));
    const on = (name: string) => runs.length > 0 && runs.every((r) => {
      const e = child(child(r, 'rPr') ?? r, name);
      if (!e) return false;
      const v = e.getAttributeNS(W, 'val');
      return name === 'u' ? !!v && v !== 'none' : v !== '0' && v !== 'false';
    });
    const sizes = new Set(runs.map((r) => child(child(r, 'rPr') ?? r, 'sz')?.getAttributeNS(W, 'val') ?? ''));
    const sz = sizes.size === 1 ? Number([...sizes][0]) / 2 : NaN;
    const jc = child(child(p, 'pPr') ?? p, 'jc')?.getAttributeNS(W, 'val');
    const align: Align = jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : jc === 'both' || jc === 'distribute' ? 'both' : 'left';
    return { bold: on('b'), italic: on('i'), underline: on('u'), align, size: Number.isFinite(sz) && sz > 0 ? sz : null };
  }

  private ensure(parent: Element, name: string, order: string[], first = false): Element {
    let e = child(parent, name);
    if (e) return e;
    e = this.el(name);
    const rank = order.indexOf(name);
    const later = kids(parent).find((c) => order.indexOf(c.localName) > rank);
    if (later) parent.insertBefore(e, later);
    else if (first && parent.firstChild) parent.insertBefore(e, parent.firstChild);
    else parent.appendChild(e);
    return e;
  }

  /** Apply character formatting to the whole paragraph, and its alignment. */
  setFormat(i: number, f: Partial<ParaFormat>) {
    const p = this.para(i);
    for (const r of this.runs(p)) {
      if (!kids(r).some((c) => c.localName === 't' || c.localName === 'tab')) continue;
      const rpr = this.ensure(r, 'rPr', ['rPr'], true);
      const set = (name: string, val: string | null) => { const e = this.ensure(rpr, name, RPR_ORDER); if (val === null) e.removeAttributeNS(W, 'val'); else e.setAttributeNS(W, 'w:val', val); };
      if (f.bold !== undefined) { set('b', f.bold ? null : '0'); set('bCs', f.bold ? null : '0'); }
      if (f.italic !== undefined) { set('i', f.italic ? null : '0'); set('iCs', f.italic ? null : '0'); }
      if (f.underline !== undefined) set('u', f.underline ? 'single' : 'none');
      if (f.size) { const v = String(Math.round(Math.max(1, Math.min(1638, f.size)) * 2)); set('sz', v); set('szCs', v); }
    }
    if (f.align) {
      const ppr = this.ensure(p, 'pPr', ['pPr'], true);
      this.ensure(ppr, 'jc', PPR_ORDER).setAttributeNS(W, 'w:val', f.align);
    }
  }

  /** Add an empty paragraph after `i` with the same paragraph style. Returns its index. */
  insertAfter(i: number): number {
    const p = this.para(i);
    const np = this.el('p');
    const ppr = child(p, 'pPr');
    if (ppr) {
      const copy = ppr.cloneNode(true) as Element;
      const sect = child(copy, 'sectPr'); // section breaks belong to the original paragraph only
      if (sect) copy.removeChild(sect);
      np.appendChild(copy);
    }
    p.parentNode!.insertBefore(np, p.nextSibling);
    this.paras.splice(i + 1, 0, np);
    return i + 1;
  }

  /** Whether paragraph `i` can be removed without breaking the document (tables and sections need theirs). */
  canRemove(i: number): boolean {
    const p = this.paras[i];
    if (!p || this.paras.length <= 1) return false;
    if (child(child(p, 'pPr') ?? p, 'sectPr')) return false;
    const parent = p.parentNode as Element;
    if (parent.localName === 'tc' && kids(parent, 'p').length <= 1) return false;
    return true;
  }

  remove(i: number) {
    if (!this.canRemove(i)) throw new WordError('This paragraph holds a table cell or section layout and cannot be removed. Clear its text instead.');
    const p = this.paras[i];
    p.parentNode!.removeChild(p);
    this.paras.splice(i, 1);
  }

  /** The edited .docx. Every other file inside the package is kept as it was. */
  save(): Uint8Array {
    return zipSync({ ...this.files, 'word/document.xml': strToU8(this.snapshot()) }, { level: 6 });
  }

  /**
   * A copy for on-screen preview only: each paragraph gets an invisible bookmark "pdk_<n>", which the preview
   * shows as an element id, so a tap on the page can find the paragraph. The saved file never has these.
   */
  previewBytes(): Uint8Array {
    const copy = new DOMParser().parseFromString(this.snapshot(), 'application/xml');
    const body = copy.getElementsByTagNameNS(W, 'body')[0];
    Array.from(body.getElementsByTagNameNS(W, 'p')).forEach((p, n) => {
      const start = copy.createElementNS(W, 'w:bookmarkStart');
      start.setAttributeNS(W, 'w:id', String(900000 + n));
      start.setAttributeNS(W, 'w:name', `pdk_${n}`);
      const end = copy.createElementNS(W, 'w:bookmarkEnd');
      end.setAttributeNS(W, 'w:id', String(900000 + n));
      const ppr = child(p, 'pPr');
      const at = ppr ? ppr.nextSibling : p.firstChild;
      p.insertBefore(start, at);
      p.insertBefore(end, start.nextSibling);
    });
    return zipSync({ ...this.files, 'word/document.xml': strToU8(new XMLSerializer().serializeToString(copy)) }, { level: 0 });
  }
}
