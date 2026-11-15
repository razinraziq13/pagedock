import type { Annotation, Color } from '../core/edit';
import { h, safeCapture } from './dom';
import type { Previewer } from './thumbs';

export type Tool = 'select' | 'text' | 'rect' | 'ellipse' | 'arrow' | 'highlight' | 'pen' | 'signature';
type Item = Annotation & { id: number; url?: string };

const SVGNS = 'http://www.w3.org/2000/svg';
const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};
const css = (c: Color) => `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;

export interface EditorOptions {
  preview: Previewer;
  pageCount: number;
  /** Current tool settings, read when a mark is created. */
  settings: () => { tool: Tool; color: Color; width: number; textSize: number; text: string; signature?: { png: Uint8Array; url: string; aspect: number } };
  onChange: () => void;
  onToolDone?: () => void;
}

/**
 * Page editor: the page is drawn by pdf.js on a canvas, and marks live in an SVG on top whose viewBox is the
 * page size in points. Coordinates are therefore page points (top-left origin), exactly what the PDF writer uses.
 */
export function pageEditor(o: EditorOptions) {
  let items: Item[] = [];
  const history: Item[][] = [];
  let nextId = 1;
  let selected: number | null = null;
  let page = 0;
  let size = { width: 595, height: 842 };

  const canvasBox = h('div', { class: 'edit-canvas' });
  const layer = svg('svg', { class: 'edit-layer', preserveAspectRatio: 'none' });
  const stage = h('div', { class: 'edit-stage', tabindex: '0', 'aria-label': 'Page editor. Select a mark, then use arrow keys to move it or Delete to remove it.' }, canvasBox);
  stage.append(layer);
  const pageLabel = h('span', { class: 'hint' });
  const prevBtn = h('button', { type: 'button', class: 'btn', onClick: () => go(page - 1) }, '← Page');
  const nextBtn = h('button', { type: 'button', class: 'btn', onClick: () => go(page + 1) }, 'Page →');
  const nav = h('div', { class: 'row center' }, prevBtn, pageLabel, nextBtn);

  const snapshot = () => { history.push(structuredClone(items)); if (history.length > 100) history.shift(); };
  const changed = () => { draw(); o.onChange(); };

  async function go(p: number) {
    if (p < 0 || p >= o.pageCount) return;
    page = p;
    selected = null;
    size = await o.preview.pageSize(p);
    const canvas = await o.preview.render(p, (700 / size.width) * Math.min(window.devicePixelRatio || 1, 2));
    canvas.className = 'edit-page';
    canvasBox.replaceChildren(canvas);
    layer.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`);
    stage.style.aspectRatio = `${size.width} / ${size.height}`;
    pageLabel.textContent = `Page ${p + 1} of ${o.pageCount}`;
    prevBtn.disabled = p === 0;
    nextBtn.disabled = p === o.pageCount - 1;
    draw();
  }

  function bbox(a: Item) {
    switch (a.type) {
      case 'text': {
        const lines = a.text.split('\n');
        const w = Math.max(...lines.map((l) => l.length)) * a.size * 0.55;
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
        const t = svg('text', { x: a.x, y: a.y + a.size * 0.8, 'font-size': a.size, 'font-family': 'Helvetica, Arial, sans-serif', fill: css(a.color) });
        a.text.split('\n').forEach((line, i) => { const s = svg('tspan', { x: a.x, dy: i === 0 ? 0 : a.size * 1.2 }); s.textContent = line; t.append(s); });
        g.append(t);
        break;
      }
      case 'rect': g.append(svg('rect', { x: a.x, y: a.y, width: a.w, height: a.h, fill: 'none', stroke: css(a.color), 'stroke-width': a.width ?? 2 })); break;
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
    if (a.id === selected) g.append(svg('rect', { x: b.x - 4, y: b.y - 4, width: b.w + 8, height: b.h + 8, class: 'sel-outline' }));
    return g;
  }

  function draw() {
    layer.replaceChildren(...items.filter((a) => a.page === page).map(shape));
  }

  function pt(e: PointerEvent): [number, number] {
    const m = layer.getScreenCTM();
    if (!m) return [0, 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [Math.min(Math.max(p.x, 0), size.width), Math.min(Math.max(p.y, 0), size.height)];
  }

  function moveBy(a: Item, dx: number, dy: number) {
    if ('x1' in a) { a.x1 += dx; a.y1 += dy; a.x2 += dx; a.y2 += dy; }
    else if ('points' in a) a.points = a.points.map(([x, y]) => [x + dx, y + dy]);
    else { a.x += dx; a.y += dy; }
  }

  let drag: { kind: 'move' | 'draw'; start: [number, number]; item: Item; orig?: Item } | null = null;

  layer.addEventListener('pointerdown', (e) => {
    const s = o.settings();
    const p = pt(e);
    const hitId = Number((e.target as Element).closest('[data-id]')?.getAttribute('data-id') ?? NaN);
    if (s.tool === 'select') {
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
      it = { ...base, type: 'text', x: p[0], y: p[1] - s.textSize * 0.6, size: s.textSize, color: s.color, text: s.text };
    } else if (s.tool === 'signature') {
      if (!s.signature) return;
      const w = Math.min(160, size.width * 0.4), hh = w / s.signature.aspect;
      it = { ...base, type: 'image', x: Math.min(p[0] - w / 2, size.width - w), y: Math.min(p[1] - hh / 2, size.height - hh), w, h: hh, png: s.signature.png, url: s.signature.url };
      it.x = Math.max(0, it.x); it.y = Math.max(0, it.y);
    } else if (s.tool === 'arrow') it = { ...base, type: 'arrow', x1: p[0], y1: p[1], x2: p[0], y2: p[1], color: s.color, width: s.width };
    else if (s.tool === 'pen') it = { ...base, type: 'ink', points: [p], color: s.color, width: s.width };
    else it = { ...base, type: s.tool, x: p[0], y: p[1], w: 0, h: 0, color: s.tool === 'highlight' ? { r: 1, g: 0.9, b: 0 } : s.color, width: s.width } as Item;
    snapshot();
    items.push(it);
    if (it.type === 'text' || it.type === 'image') { selected = it.id; changed(); o.onToolDone?.(); return; }
    drag = { kind: 'draw', start: p, item: it };
    safeCapture(layer, e.pointerId);
    draw();
  });

  layer.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = pt(e);
    const a = drag.item;
    if (drag.kind === 'move' && drag.orig) {
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

  const api = {
    el: h('div', { class: 'editor' }, nav, stage),
    go,
    count: () => items.length,
    selected: () => items.find((x) => x.id === selected) ?? null,
    canUndo: () => history.length > 0,
    undo() { if (!history.length) return; items = history.pop()!; selected = null; changed(); },
    removeSelected() { if (selected === null) return; snapshot(); items = items.filter((x) => x.id !== selected); selected = null; changed(); },
    /** Update the selected mark (e.g. text size or signature width). */
    updateSelected(fn: (a: Item) => void) { const a = items.find((x) => x.id === selected); if (!a) return; snapshot(); fn(a); changed(); },
    annotations: (): Annotation[] => items.map(({ id, url, ...rest }) => { void id; void url; return rest as Annotation; }),
  };
  return api;
}
