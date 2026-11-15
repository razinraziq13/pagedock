import type { Annotation, Color, FontFamily } from '../core/edit';
import { h, safeCapture } from './dom';
import { MAX_CANVAS_PIXELS, type PageTextItem, type Previewer } from './thumbs';

export type Tool = 'select' | 'text' | 'rect' | 'ellipse' | 'arrow' | 'highlight' | 'pen' | 'signature' | 'image' | 'cover' | 'edittext';
export type Item = Annotation & { id: number; url?: string };
export interface PlacedImage { png: Uint8Array; url: string; aspect: number }

const SVGNS = 'http://www.w3.org/2000/svg';
const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};
export const css = (c: Color) => `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;
export const FONT_CSS: Record<FontFamily, string> = {
  sans: 'Helvetica, Arial, sans-serif',
  serif: '"Times New Roman", Times, serif',
  mono: '"Courier New", Courier, monospace',
};

let measureCtx: CanvasRenderingContext2D | null = null;
/** Width of a line of text in points, measured with the same font the PDF will use (or its closest system match). */
function textWidth(line: string, size: number, font: FontFamily = 'sans', bold = false, italic = false) {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return line.length * size * 0.55;
  measureCtx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px ${FONT_CSS[font]}`;
  return measureCtx.measureText(line).width;
}

export interface EditorSettings {
  tool: Tool; color: Color; width: number; textSize: number; text: string;
  font?: FontFamily; bold?: boolean; italic?: boolean;
  signature?: PlacedImage;
  image?: PlacedImage;
}

export interface EditorOptions {
  preview: Previewer;
  pageCount: number;
  /** Current tool settings, read when a mark is created. */
  settings: () => EditorSettings;
  onChange: () => void;
  onToolDone?: () => void;
  /** Show the editor's own previous/next page buttons (default true). */
  nav?: boolean;
  /** Extra rotation shown for a page (the workspace rotates pages before saving). Marks stay attached to the page. */
  rotation?: (page: number) => number;
  /** Double-tap on a text mark, or a new "Edit existing text" box: lets the host focus its text field. */
  onEditText?: () => void;
}

/**
 * Page editor: the page is drawn by pdf.js on a canvas, and marks live in an SVG on top whose viewBox is the
 * page size in points. Coordinates are therefore page points (top-left origin), exactly what the PDF writer uses.
 */
export function pageEditor(o: EditorOptions) {
  let items: Item[] = [];
  const history: Item[][] = [];
  const future: Item[][] = [];
  let nextId = 1;
  let selected: number | null = null;
  let page = 0;
  let size = { width: 595, height: 842 };
  let zoom = 1;
  let renderedScale = 0;
  let renderToken = 0;
  const textCache = new Map<number, Promise<PageTextItem[]>>();

  const canvasBox = h('div', { class: 'edit-canvas' });
  const layer = svg('svg', { class: 'edit-layer', preserveAspectRatio: 'none' });
  const stage = h('div', { class: 'edit-stage', tabindex: '0', 'aria-label': 'Page editor. Select a mark, then use arrow keys to move it or Delete to remove it.' }, canvasBox);
  stage.append(layer);
  const rot = h('div', { class: `edit-rot${o.nav === false ? ' zoomable' : ''}` }, stage);
  const scroller = h('div', { class: 'edit-scroll' }, rot);
  const pageLabel = h('span', { class: 'hint' });
  const prevBtn = h('button', { type: 'button', class: 'btn', onClick: () => go(page - 1) }, '← Page');
  const nextBtn = h('button', { type: 'button', class: 'btn', onClick: () => go(page + 1) }, 'Page →');
  const nav = h('div', { class: 'row center', hidden: o.nav === false }, prevBtn, pageLabel, nextBtn);

  const snapshot = () => { history.push(structuredClone(items)); if (history.length > 200) history.shift(); future.length = 0; };
  const changed = () => { draw(); o.onChange(); };
  const turn = () => (((o.rotation?.(page) ?? 0) % 360) + 360) % 360;

  /** Lay out the (possibly rotated) page box: the outer box takes the displayed shape, the stage keeps the page's own. */
  function layout() {
    const r = turn();
    const sideways = r === 90 || r === 270;
    const { width: w, height: hh } = size;
    rot.style.aspectRatio = sideways ? `${hh} / ${w}` : `${w} / ${hh}`;
    if (o.nav === false) rot.style.width = `${zoom * 100}%`;
    stage.style.width = sideways ? `${(w / hh) * 100}%` : '100%';
    stage.style.height = sideways ? `${(hh / w) * 100}%` : '100%';
    stage.style.transform = `translate(-50%, -50%) rotate(${r}deg)`;
  }

  async function paint() {
    const token = ++renderToken;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const cssWidth = Math.max(300, Math.min(scroller.clientWidth || 760, 1400)) * (o.nav === false ? zoom : 1);
    let scale = (cssWidth / size.width) * ratio;
    scale = Math.min(scale, Math.sqrt(MAX_CANVAS_PIXELS / (size.width * size.height)));
    if (Math.abs(scale - renderedScale) < 0.01 && canvasBox.firstChild) return;
    const canvas = await o.preview.render(page, scale);
    if (token !== renderToken) return; // a newer page or zoom won
    renderedScale = scale;
    canvas.className = 'edit-page';
    canvasBox.replaceChildren(canvas);
  }

  async function go(p: number) {
    if (p < 0 || p >= o.pageCount) return;
    page = p;
    selected = null;
    renderedScale = 0;
    size = await o.preview.pageSize(p);
    layer.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`);
    layout();
    pageLabel.textContent = `Page ${p + 1} of ${o.pageCount}`;
    prevBtn.disabled = p === 0;
    nextBtn.disabled = p === o.pageCount - 1;
    draw();
    await paint();
    if (o.settings().tool === 'edittext') draw();
  }

  function bbox(a: Item) {
    switch (a.type) {
      case 'text': {
        const lines = a.text.split('\n');
        const w = Math.max(4, ...lines.map((l) => textWidth(l, a.size, a.font, a.bold, a.italic)));
        return { x: a.x, y: a.y, w, h: lines.length * a.size * 1.2 };
      }
      case 'line': case 'arrow': return { x: Math.min(a.x1, a.x2), y: Math.min(a.y1, a.y2), w: Math.abs(a.x2 - a.x1), h: Math.abs(a.y2 - a.y1) };
      case 'ink': {
        const xs = a.points.map((p) => p[0]), ys = a.points.map((p) => p[1]);
        return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      }
      default: return { x: a.x, y: a.y, w: a.w, h: a.h };
    }
  }

  function shape(a: Item): SVGElement {
    const g = svg('g', { 'data-id': a.id, class: 'mark' });
    switch (a.type) {
      case 'text': {
        if (a.cover) g.append(svg('rect', { x: a.cover.x, y: a.cover.y, width: a.cover.w, height: a.cover.h, fill: css(a.coverColor ?? { r: 1, g: 1, b: 1 }) }));
        const t = svg('text', {
          x: a.x, y: a.y + a.size * 0.8, 'font-size': a.size, 'font-family': FONT_CSS[a.font ?? 'sans'],
          'font-weight': a.bold ? 'bold' : 'normal', 'font-style': a.italic ? 'italic' : 'normal', fill: css(a.color),
        });
        a.text.split('\n').forEach((line, i) => { const s = svg('tspan', { x: a.x, dy: i === 0 ? 0 : a.size * 1.2 }); s.textContent = line; t.append(s); });
        g.append(t);
        break;
      }
      case 'rect': g.append(svg('rect', { x: a.x, y: a.y, width: a.w, height: a.h, fill: 'none', stroke: css(a.color), 'stroke-width': a.width ?? 2 })); break;
      case 'cover': g.append(svg('rect', { x: a.x, y: a.y, width: a.w, height: a.h, fill: css(a.color) })); break;
      case 'highlight': g.append(svg('rect', { x: a.x, y: a.y, width: a.w, height: a.h, fill: css(a.color), opacity: 0.35, style: 'mix-blend-mode:multiply' })); break;
      case 'ellipse': g.append(svg('ellipse', { cx: a.x + a.w / 2, cy: a.y + a.h / 2, rx: a.w / 2, ry: a.h / 2, fill: 'none', stroke: css(a.color), 'stroke-width': a.width ?? 2 })); break;
      case 'line': case 'arrow': {
        g.append(svg('line', { x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2, stroke: css(a.color), 'stroke-width': a.width, 'stroke-linecap': 'round' }));
        if (a.type === 'arrow') {
          const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1), len = Math.max(8, a.width * 4);
          const pts = [-1, 1].map((s) => `${a.x2 - len * Math.cos(ang + s * 0.5)},${a.y2 - len * Math.sin(ang + s * 0.5)}`);
          g.append(svg('polyline', { points: `${pts[0]} ${a.x2},${a.y2} ${pts[1]}`, fill: 'none', stroke: css(a.color), 'stroke-width': a.width, 'stroke-linecap': 'round' }));
        }
        break;
      }
      case 'ink': g.append(svg('polyline', { points: a.points.map((p) => p.join(',')).join(' '), fill: 'none', stroke: css(a.color), 'stroke-width': a.width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })); break;
      case 'image': g.append(svg('image', { href: a.url ?? '', x: a.x, y: a.y, width: a.w, height: a.h, preserveAspectRatio: 'none' })); break;
    }
    // A generous invisible hit area so thin lines are easy to grab, especially on touch screens.
    const b = bbox(a);
    g.append(svg('rect', { x: b.x - 6, y: b.y - 6, width: b.w + 12, height: b.h + 12, fill: 'transparent', class: 'hit' }));
    if (a.id === selected) {
      g.append(svg('rect', { x: b.x - 4, y: b.y - 4, width: b.w + 8, height: b.h + 8, class: 'sel-outline' }));
      // Corner handle to resize pictures, signatures and white-out boxes.
      if (a.type === 'image' || a.type === 'cover') g.append(svg('circle', { cx: a.x + a.w, cy: a.y + a.h, r: Math.max(8, size.width / 60), class: 'resize-handle', 'data-resize': '1' }));
    }
    return g;
  }

  let textBoxes: SVGElement[] = [];
  function draw() {
    layer.replaceChildren(...textBoxes, ...items.filter((a) => a.page === page).map(shape));
    if (o.settings().tool === 'edittext') showTextBoxes();
    else if (textBoxes.length) { textBoxes = []; layer.querySelectorAll('.text-target').forEach((n) => n.remove()); }
  }

  const pageText = (p: number) => { if (!textCache.has(p)) textCache.set(p, o.preview.textItems(p).catch(() => [])); return textCache.get(p)!; };

  /** In "Edit existing text" mode, outline the lines PageDock can replace. */
  async function showTextBoxes() {
    const p = page;
    const list = await pageText(p);
    if (p !== page || o.settings().tool !== 'edittext') return;
    textBoxes = list.map((t, i) => svg('rect', { x: t.x - 1, y: t.y - 1, width: t.w + 2, height: t.h + 2, class: 'text-target', 'data-text': i }));
    layer.querySelectorAll('.text-target').forEach((n) => n.remove());
    layer.prepend(...textBoxes);
  }

  /** Pointer position in page points, undoing the page's on-screen rotation. */
  function pt(e: PointerEvent): [number, number] {
    const r = stage.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const a = (-turn() * Math.PI) / 180;
    const ux = dx * Math.cos(a) - dy * Math.sin(a), uy = dx * Math.sin(a) + dy * Math.cos(a);
    const W = stage.offsetWidth || 1, H = stage.offsetHeight || 1;
    const x = ((ux + W / 2) / W) * size.width, y = ((uy + H / 2) / H) * size.height;
    return [Math.min(Math.max(x, 0), size.width), Math.min(Math.max(y, 0), size.height)];
  }

  function moveBy(a: Item, dx: number, dy: number) {
    if ('x1' in a) { a.x1 += dx; a.y1 += dy; a.x2 += dx; a.y2 += dy; }
    else if ('points' in a) a.points = a.points.map(([x, y]) => [x + dx, y + dy]);
    else { a.x += dx; a.y += dy; } // a replaced line's white cover stays over the original words
  }

  let drag: { kind: 'move' | 'draw' | 'resize'; start: [number, number]; item: Item; orig?: Item } | null = null;

  function place(img: PlacedImage, p: [number, number], base: { id: number; page: number }, blend: 'multiply' | 'normal'): Item {
    const w = Math.min(blend === 'normal' ? 220 : 160, size.width * 0.5), hh = w / img.aspect;
    const it: Item = { ...base, type: 'image', x: Math.min(p[0] - w / 2, size.width - w), y: Math.min(p[1] - hh / 2, size.height - hh), w, h: hh, png: img.png, url: img.url, blend };
    it.x = Math.max(0, it.x); it.y = Math.max(0, it.y);
    return it;
  }

  async function editExisting(p: [number, number]) {
    const list = await pageText(page);
    const hit = list.find((t) => p[0] >= t.x - 2 && p[0] <= t.x + t.w + 2 && p[1] >= t.y - 2 && p[1] <= t.y + t.h + 2);
    if (!hit) return;
    // Clicking a line that was already replaced selects that replacement instead of making another.
    const existing = items.find((a) => a.type === 'text' && a.page === page && a.cover && Math.abs(a.cover.x - (hit.x - 1)) < 0.5 && Math.abs(a.cover.y - (hit.y - 1)) < 0.5);
    if (existing) { selected = existing.id; changed(); o.onEditText?.(); return; }
    snapshot();
    const it: Item = {
      id: nextId++, page, type: 'text', x: hit.x, y: hit.baseline - hit.size * 0.8, size: Math.round(hit.size * 10) / 10, // same baseline as the original line
      color: { r: 0, g: 0, b: 0 }, text: hit.str, font: hit.family, bold: hit.bold, italic: hit.italic,
      cover: { x: hit.x - 1, y: hit.y - 1, w: hit.w + 2, h: hit.h + 2 },
    };
    items.push(it);
    selected = it.id;
    changed();
    o.onEditText?.();
  }

  layer.addEventListener('pointerdown', (e) => {
    const s = o.settings();
    const p = pt(e);
    const hitId = Number((e.target as Element).closest('[data-id]')?.getAttribute('data-id') ?? NaN);
    const hitItem = items.find((a) => a.id === hitId);
    if (hitItem && (e.target as Element).closest('[data-resize]')) {
      e.preventDefault();
      snapshot();
      drag = { kind: 'resize', start: p, item: hitItem, orig: structuredClone(hitItem) };
      safeCapture(layer, e.pointerId);
      return;
    }
    if (s.tool === 'edittext' && !hitItem) { e.preventDefault(); editExisting(p); return; }
    // With the signature or picture tool, touching an existing picture moves it instead of stamping another one.
    if (s.tool === 'select' || s.tool === 'edittext' || ((s.tool === 'signature' || s.tool === 'image') && hitItem?.type === 'image')) {
      selected = Number.isNaN(hitId) ? null : hitId;
      const it = items.find((a) => a.id === selected);
      if (it) { snapshot(); drag = { kind: 'move', start: p, item: it, orig: structuredClone(it) }; safeCapture(layer, e.pointerId); }
      draw();
      o.onChange();
      return;
    }
    e.preventDefault();
    const base = { id: nextId++, page };
    let it: Item | null = null;
    if (s.tool === 'text') {
      if (!s.text.trim()) { o.onChange(); return; }
      it = { ...base, type: 'text', x: p[0], y: p[1] - s.textSize * 0.6, size: s.textSize, color: s.color, text: s.text, font: s.font, bold: s.bold, italic: s.italic };
    } else if (s.tool === 'signature') {
      if (!s.signature) return;
      it = place(s.signature, p, base, 'multiply');
    } else if (s.tool === 'image') {
      if (!s.image) return;
      it = place(s.image, p, base, 'normal');
    } else if (s.tool === 'arrow') it = { ...base, type: 'arrow', x1: p[0], y1: p[1], x2: p[0], y2: p[1], color: s.color, width: s.width };
    else if (s.tool === 'pen') it = { ...base, type: 'ink', points: [p], color: s.color, width: s.width };
    else if (s.tool === 'cover') it = { ...base, type: 'cover', x: p[0], y: p[1], w: 0, h: 0, color: { r: 1, g: 1, b: 1 } };
    else it = { ...base, type: s.tool, x: p[0], y: p[1], w: 0, h: 0, color: s.tool === 'highlight' ? { r: 1, g: 0.9, b: 0 } : s.color, width: s.width } as Item;
    snapshot();
    items.push(it);
    if (it.type === 'text' || it.type === 'image') { selected = it.id; changed(); o.onToolDone?.(); return; }
    drag = { kind: 'draw', start: p, item: it };
    safeCapture(layer, e.pointerId);
    draw();
  });

  layer.addEventListener('dblclick', (e) => {
    const id = Number((e.target as Element).closest('[data-id]')?.getAttribute('data-id') ?? NaN);
    const it = items.find((a) => a.id === id);
    if (it?.type === 'text') { selected = id; changed(); o.onEditText?.(); }
  });

  layer.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = pt(e);
    const a = drag.item;
    if (drag.kind === 'resize' && drag.orig && (drag.orig.type === 'image' || drag.orig.type === 'cover') && (a.type === 'image' || a.type === 'cover')) {
      if (a.type === 'cover') {
        a.w = Math.max(4, Math.min(size.width - a.x, (drag.orig as typeof a).w + (p[0] - drag.start[0])));
        a.h = Math.max(4, Math.min(size.height - a.y, (drag.orig as typeof a).h + (p[1] - drag.start[1])));
      } else {
        const aspect = drag.orig.w / drag.orig.h;
        const maxW = Math.min(size.width - a.x, (size.height - a.y) * aspect);
        a.w = Math.min(Math.max(20, drag.orig.w + (p[0] - drag.start[0])), maxW);
        a.h = a.w / aspect;
      }
    } else if (drag.kind === 'move' && drag.orig) {
      const fresh = structuredClone(drag.orig);
      moveBy(fresh, p[0] - drag.start[0], p[1] - drag.start[1]);
      Object.assign(a, fresh);
    } else if (a.type === 'arrow' || a.type === 'line') { a.x2 = p[0]; a.y2 = p[1]; }
    else if (a.type === 'ink') a.points.push(p);
    else if ('w' in a) {
      a.x = Math.min(drag.start[0], p[0]); a.y = Math.min(drag.start[1], p[1]);
      a.w = Math.abs(p[0] - drag.start[0]); a.h = Math.abs(p[1] - drag.start[1]);
    }
    draw();
  });

  const finish = () => {
    if (!drag) return;
    const a = drag.item;
    if (drag.kind === 'draw') {
      const b = bbox(a);
      const tiny = a.type === 'ink' ? a.points.length < 2 : b.w < 3 && b.h < 3;
      if (tiny) { items = items.filter((x) => x !== a); history.pop(); }
    } else if (drag.kind === 'move' && drag.orig && JSON.stringify(bbox(drag.orig)) === JSON.stringify(bbox(a))) {
      history.pop(); // a tap that did not move anything is not an undo step
    }
    drag = null;
    changed();
  };
  layer.addEventListener('pointerup', finish);
  layer.addEventListener('pointercancel', finish);

  stage.addEventListener('keydown', (e) => {
    const a = items.find((x) => x.id === selected);
    if (!a) return;
    const step = e.shiftKey ? 10 : 2;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (d[e.key]) { e.preventDefault(); snapshot(); moveBy(a, ...d[e.key]); changed(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); api.removeSelected(); }
  });

  let resizeTimer = 0;
  new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = window.setTimeout(() => { if (canvasBox.firstChild) paint(); }, 200); }).observe(scroller);

  const api = {
    el: h('div', { class: 'editor' }, nav, scroller),
    scroller,
    go,
    page: () => page,
    count: () => items.length,
    selected: () => items.find((x) => x.id === selected) ?? null,
    select(id: number | null) { selected = id; changed(); },
    canUndo: () => history.length > 0,
    canRedo: () => future.length > 0,
    undoDepth: () => history.length,
    undo() { if (!history.length) return; future.push(structuredClone(items)); items = history.pop()!; selected = null; changed(); },
    redo() { if (!future.length) return; history.push(structuredClone(items)); items = future.pop()!; selected = null; changed(); },
    removeSelected() { if (selected === null) return; snapshot(); items = items.filter((x) => x.id !== selected); selected = null; changed(); },
    /** Update the selected mark (e.g. text size or signature width) as one undo step. */
    updateSelected(fn: (a: Item) => void) { const a = items.find((x) => x.id === selected); if (!a) return; snapshot(); fn(a); changed(); },
    /** Start an undo step that several live edits (typing) will share. */
    checkpoint: snapshot,
    /** Change the selected mark without a new undo step (call checkpoint() first). */
    patchSelected(fn: (a: Item) => void) { const a = items.find((x) => x.id === selected); if (!a) return; fn(a); draw(); o.onChange(); },
    /** Marks on pages, e.g. to drop marks of a deleted page. */
    marksOn: (p: number) => items.filter((a) => a.page === p).length,
    setZoom(z: number) { zoom = Math.max(0.25, Math.min(4, z)); layout(); paint(); },
    zoom: () => zoom,
    /** Re-apply the page's on-screen rotation after the page manager rotated it. */
    relayout() { layout(); draw(); },
    /** Redraw (e.g. after switching to or from "Edit existing text"). */
    redraw: draw,
    annotations: (): Annotation[] => items.map(({ id, url, ...rest }) => { void id; void url; return rest as Annotation; }),
  };
  return api;
}

export type PageEditor = ReturnType<typeof pageEditor>;
