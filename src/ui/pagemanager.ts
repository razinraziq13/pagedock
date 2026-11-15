/**
 * Visual page manager: real thumbnails of every page, single and multiple selection, page-range selection,
 * and (when allowed) reorder by drag-and-drop or buttons, rotate, delete, undo/redo, and split boundaries.
 * It only edits a plan; tools turn the plan into a PDF with the core functions.
 */
import { formatPageList, parsePageRanges, type PagePlan } from '../core/pages';
import { announce, h } from './dom';
import type { Previewer } from './thumbs';

export type ManagerMode = 'organize' | 'select' | 'cuts';

export interface ManagerOptions {
  preview: Previewer;
  pageCount: number;
  mode: ManagerMode;
  /** 'grid' for the full page view, 'rail' for the slim sidebar of the workspace. */
  layout?: 'grid' | 'rail';
  /** Called when a page is opened (rail layout: tapping the page). Gets the position in the current order. */
  onOpen?: (position: number) => void;
  onChange?: () => void;
}

type Rot = PagePlan['rotate'];
interface Item extends PagePlan { key: number }
interface State { items: Item[]; selected: Set<number>; cuts: Set<number> }

export function pageManager(o: ManagerOptions) {
  const layout = o.layout ?? 'grid';
  let nextKey = 0;
  const fresh = (): State => ({ items: Array.from({ length: o.pageCount }, (_, i) => ({ source: i, rotate: 0 as Rot, key: nextKey++ })), selected: new Set(), cuts: new Set() });
  let state = fresh();
  const undoStack: State[] = [];
  const redoStack: State[] = [];
  // The page open in the workspace, followed by identity so it stays open when pages move.
  let currentKey = state.items[0]?.key ?? 0;
  let lastPos = 0;
  const currentPos = () => {
    const i = state.items.findIndex((it) => it.key === currentKey);
    if (i >= 0) return (lastPos = i);
    lastPos = Math.max(0, Math.min(lastPos, state.items.length - 1)); // the open page was deleted: open its neighbour
    currentKey = state.items[lastPos]?.key ?? 0;
    return lastPos;
  };
  let anchor: number | null = null; // for shift-click range selection
  let dragKey: number | null = null;
  const thumbs = new Map<number, HTMLElement>(); // one canvas per source page, reused while reordering

  const clone = (s: State): State => ({ items: s.items.map((i) => ({ ...i })), selected: new Set(s.selected), cuts: new Set(s.cuts) });
  function change(fn: () => void, msg: string) {
    undoStack.push(clone(state));
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
    fn();
    draw();
    announce(msg);
  }

  // ---------------------------------------------------------------- toolbar
  const count = h('span', { class: 'pm-count', role: 'status' });
  const rangeInput = h('input', { type: 'text', class: 'text-input pm-range', inputmode: 'numeric', autocomplete: 'off', placeholder: 'e.g. 1-3, 5, 8', 'aria-label': 'Pages to select, for example 1-3, 5, 8' });
  const rangeMsg = h('span', { class: 'hint pm-range-msg' });
  const btn = (label: string, aria: string, fn: () => void, cls = 'btn small') => h('button', { type: 'button', class: cls, 'aria-label': aria, title: aria, onClick: fn }, label);

  const selectAllBtn = btn('Select all', 'Select all pages', () => { state.selected = new Set(state.items.map((i) => i.key)); draw(); announce('All pages selected.'); });
  const clearBtn = btn('Clear', 'Clear selection', () => { state.selected.clear(); draw(); announce('Selection cleared.'); });
  const rangeBtn = btn('Select', 'Select the typed pages', () => selectRange());
  rangeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); selectRange(); } });

  function selectRange() {
    try {
      const pos = [...new Set(parsePageRanges(rangeInput.value, state.items.length).flat())];
      state.selected = new Set(pos.map((p) => state.items[p].key));
      rangeMsg.textContent = '';
      rangeInput.removeAttribute('aria-invalid');
      draw();
      announce(`${pos.length} page${pos.length === 1 ? '' : 's'} selected.`);
    } catch (e) {
      rangeMsg.textContent = (e as Error).message;
      rangeInput.setAttribute('aria-invalid', 'true');
    }
  }

  const sel = () => state.items.map((it, i) => (state.selected.has(it.key) ? i : -1)).filter((i) => i >= 0);
  const rotateSel = (by: 90 | 270) => {
    const s = sel();
    if (!s.length) return;
    change(() => s.forEach((i) => { const it = state.items[i]; it.rotate = ((it.rotate + by) % 360) as Rot; }), `${s.length} page${s.length === 1 ? '' : 's'} rotated.`);
  };
  const deleteSel = () => {
    const s = sel();
    if (!s.length) return;
    if (s.length >= state.items.length) { announce('Keep at least one page.'); count.textContent = 'You cannot delete every page. Keep at least one.'; return; }
    change(() => { state.items = state.items.filter((it) => !state.selected.has(it.key)); state.selected.clear(); }, `${s.length} page${s.length === 1 ? '' : 's'} deleted.`);
  };
  /** Move the selected pages as a block one step earlier/later, or to the start/end. */
  const moveSel = (dir: -1 | 1 | 'start' | 'end') => {
    const s = sel();
    if (!s.length) return;
    change(() => {
      const picked = state.items.filter((it) => state.selected.has(it.key));
      const rest = state.items.filter((it) => !state.selected.has(it.key));
      let at: number;
      if (dir === 'start') at = 0;
      else if (dir === 'end') at = rest.length;
      else at = Math.max(0, Math.min(rest.length, s[0] + dir));
      rest.splice(at, 0, ...picked);
      state.items = rest;
    }, 'Selected pages moved.');
  };
  const undoBtn = btn('↶ Undo', 'Undo', () => { if (!undoStack.length) return; redoStack.push(clone(state)); state = undoStack.pop()!; draw(); announce('Undone.'); });
  const redoBtn = btn('↷ Redo', 'Redo', () => { if (!redoStack.length) return; undoStack.push(clone(state)); state = redoStack.pop()!; draw(); announce('Redone.'); });
  const resetBtn = btn('Reset', 'Reset to the original pages', () => change(() => { state = fresh(); currentKey = state.items[0].key; }, 'Reset to the original pages.'));
  const opRow = h('div', { class: 'pm-ops', role: 'group', 'aria-label': 'Selected pages' },
    btn('⟲', 'Rotate selected pages left', () => rotateSel(270), 'icon-btn'),
    btn('⟳', 'Rotate selected pages right', () => rotateSel(90), 'icon-btn'),
    btn('⇤', 'Move selected pages to the start', () => moveSel('start'), 'icon-btn'),
    btn('←', 'Move selected pages earlier', () => moveSel(-1), 'icon-btn'),
    btn('→', 'Move selected pages later', () => moveSel(1), 'icon-btn'),
    btn('⇥', 'Move selected pages to the end', () => moveSel('end'), 'icon-btn'),
    btn('🗑', 'Delete selected pages', deleteSel, 'icon-btn danger'),
  );
  const cutRow = h('div', { class: 'pm-ops', role: 'group', 'aria-label': 'Split points' },
    btn('Every page', 'Split after every page', () => change(() => { state.cuts = new Set(state.items.slice(0, -1).map((it) => it.key)); }, 'Split after every page.')),
    btn('Every 2', 'Split every 2 pages', () => everyN(2)),
    btn('Every 5', 'Split every 5 pages', () => everyN(5)),
    btn('No splits', 'Remove all split points', () => change(() => state.cuts.clear(), 'All split points removed.')),
  );
  function everyN(n: number) {
    change(() => { state.cuts = new Set(state.items.filter((_, i) => (i + 1) % n === 0 && i < state.items.length - 1).map((it) => it.key)); }, `Split every ${n} pages.`);
  }

  const toolbar = h('div', { class: 'pm-toolbar' },
    o.mode === 'cuts' ? null : h('div', { class: 'pm-select' }, selectAllBtn, clearBtn, h('span', { class: 'pm-range-wrap' }, rangeInput, rangeBtn)),
    o.mode === 'organize' ? opRow : o.mode === 'cuts' ? cutRow : null,
    o.mode === 'select' ? null : h('div', { class: 'pm-history' }, undoBtn, redoBtn, resetBtn),
    count, rangeMsg,
  );

  // ---------------------------------------------------------------- cards
  const grid = h('ol', { class: `page-grid pm-grid pm-${layout} pm-mode-${o.mode}`, 'aria-label': o.mode === 'cuts' ? 'Pages; choose where to split' : 'Pages' });

  function toggle(i: number, e?: MouseEvent | KeyboardEvent) {
    const it = state.items[i];
    if (e?.shiftKey && anchor !== null) {
      const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)];
      for (let k = a; k <= b; k++) state.selected.add(state.items[k].key);
    } else if (layout === 'rail' && !(e && (e.ctrlKey || e.metaKey))) {
      state.selected = new Set([it.key]); // rail: a plain tap picks just this page
    } else if (state.selected.has(it.key)) state.selected.delete(it.key);
    else state.selected.add(it.key);
    anchor = i;
    draw();
  }

  function card(it: Item, i: number): HTMLElement {
    if (!thumbs.has(it.source)) thumbs.set(it.source, o.preview.thumb(it.source, layout === 'rail' ? 110 : 140));
    const selected = state.selected.has(it.key);
    const moved = it.source !== i;
    const check = h('button', {
      type: 'button', class: 'pm-check', 'aria-pressed': String(selected),
      'aria-label': `${selected ? 'Deselect' : 'Select'} page ${i + 1}`,
      onClick: (e: MouseEvent) => {
        e.stopPropagation(); // the tick box always adds or removes one page, so touch users can pick several
        if (e.shiftKey) return toggle(i, e);
        if (state.selected.has(it.key)) state.selected.delete(it.key); else state.selected.add(it.key);
        anchor = i;
        draw();
      },
    }, selected ? '✓' : '');
    const li = h('li', {
      class: `page-card pm-card${selected ? ' selected' : ''}${layout === 'rail' && it.key === currentKey ? ' current' : ''}`,
      draggable: o.mode === 'organize' ? 'true' : null,
      tabindex: '0',
      'aria-label': `Page ${i + 1}${moved ? `, was page ${it.source + 1}` : ''}${it.rotate ? `, rotated ${it.rotate} degrees` : ''}${selected ? ', selected' : ''}`,
    },
      check,
      h('span', { class: 'thumb-box', style: `--rot:${it.rotate}deg` }, thumbs.get(it.source)!),
      h('span', { class: 'page-label' }, `${i + 1}`, moved && layout === 'grid' ? h('span', { class: 'muted' }, ` (was ${it.source + 1})`) : null),
    );
    li.addEventListener('click', (e) => {
      if (layout === 'rail') { currentKey = it.key; lastPos = i; o.onOpen?.(i); toggle(i, e); }
      else toggle(i, e);
    });
    li.addEventListener('keydown', (e) => {
      if (e.target !== li) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); li.click(); }
      if (o.mode === 'organize' && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) { e.preventDefault(); moveOne(i, i - 1); }
      if (o.mode === 'organize' && e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) { e.preventDefault(); moveOne(i, i + 1); }
      if (o.mode === 'organize' && e.key === 'Delete') { e.preventDefault(); if (!state.selected.size) state.selected.add(it.key); deleteSel(); }
    });
    if (o.mode === 'organize') {
      li.addEventListener('dragstart', (e) => { dragKey = it.key; e.dataTransfer?.setData('text/plain', String(i)); li.classList.add('dragging'); });
      li.addEventListener('dragend', () => { li.classList.remove('dragging'); dragKey = null; });
      li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('over'); });
      li.addEventListener('dragleave', () => li.classList.remove('over'));
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        li.classList.remove('over');
        if (dragKey === null) return;
        const from = state.items.findIndex((x) => x.key === dragKey);
        // Dragging a selected page moves the whole selection.
        if (state.selected.has(dragKey) && state.selected.size > 1) {
          change(() => {
            const target = state.items[i];
            const picked = state.items.filter((x) => state.selected.has(x.key));
            const rest = state.items.filter((x) => !state.selected.has(x.key));
            let at = rest.indexOf(target);
            if (at < 0) at = rest.length; else if (from < i) at += 1;
            rest.splice(at, 0, ...picked);
            state.items = rest;
          }, 'Selected pages moved.');
        } else moveOne(from, i);
      });
    }
    return li;
  }

  function moveOne(from: number, to: number) {
    if (to < 0 || to >= state.items.length || to === from) return;
    change(() => { const [x] = state.items.splice(from, 1); state.items.splice(to, 0, x); }, `Page moved to position ${to + 1}.`);
    (grid.children[to * (o.mode === 'cuts' ? 2 : 1)] as HTMLElement | undefined)?.focus();
  }

  function cutToggle(it: Item, i: number): HTMLElement {
    const on = state.cuts.has(it.key);
    return h('li', { class: `pm-cut${on ? ' on' : ''}` },
      h('button', {
        type: 'button', class: 'pm-cut-btn', 'aria-pressed': String(on),
        'aria-label': `${on ? 'Remove the split' : 'Split'} between page ${i + 1} and page ${i + 2}`,
        title: on ? 'Remove this split' : 'Split here',
        onClick: () => change(() => { on ? state.cuts.delete(it.key) : state.cuts.add(it.key); }, on ? 'Split removed.' : `Split after page ${i + 1}.`),
      }, on ? '✂' : '+'),
    );
  }

  function draw() {
    currentPos(); // re-home the open page first if it was deleted
    const kids: HTMLElement[] = [];
    state.items.forEach((it, i) => {
      const c = card(it, i);
      if (o.mode === 'cuts') {
        const part = partIndex(i);
        c.classList.add(`part-${part % 6}`);
        c.querySelector('.page-label')?.append(h('span', { class: 'part-tag' }, `File ${part + 1}`));
      }
      kids.push(c);
      if (o.mode === 'cuts' && i < state.items.length - 1) kids.push(cutToggle(it, i));
    });
    grid.replaceChildren(...kids);
    const n = state.selected.size;
    const total = state.items.length;
    if (o.mode === 'cuts') count.textContent = `${total} pages → ${cutPositions().length + 1} file${cutPositions().length ? 's' : ''}`;
    else count.textContent = `${n} of ${total} page${total === 1 ? '' : 's'} selected${n ? ` (${formatPageList(sel())})` : ''}`;
    opRow.querySelectorAll('button').forEach((b) => { (b as HTMLButtonElement).disabled = n === 0; });
    clearBtn.disabled = n === 0;
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
    o.onChange?.();
  }

  const cutPositions = () => state.items.map((it, i) => (state.cuts.has(it.key) && i < state.items.length - 1 ? i : -1)).filter((i) => i >= 0);
  const partIndex = (i: number) => cutPositions().filter((c) => c < i).length;

  draw();

  return {
    el: h('div', { class: `page-manager pm-layout-${layout}` }, toolbar, grid),
    toolbar, grid,
    /** The page plan in the current order (source page + extra rotation). */
    plan: (): PagePlan[] => state.items.map(({ source, rotate }) => ({ source, rotate })),
    /** Selected positions (0-based, in the current order). */
    selectedPositions: sel,
    /** Selected original pages (0-based). */
    selectedSources: () => sel().map((i) => state.items[i].source),
    /** Split after these positions. */
    cuts: cutPositions,
    current: currentPos,
    setCurrent(i: number) { const it = state.items[Math.max(0, Math.min(i, state.items.length - 1))]; if (it) { currentKey = it.key; lastPos = i; } draw(); grid.querySelector('.current')?.scrollIntoView({ block: 'nearest' }); },
    rotation: (position: number) => state.items[position]?.rotate ?? 0,
    sourceAt: (position: number) => state.items[position]?.source ?? 0,
    length: () => state.items.length,
    rotateSelected: rotateSel,
    deleteSelected: deleteSel,
    selectOnly(position: number) { const it = state.items[position]; if (it) { state.selected = new Set([it.key]); draw(); } },
    undoDepth: () => undoStack.length,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    undo: () => undoBtn.click(),
    redo: () => redoBtn.click(),
  };
}

export type PageManager = ReturnType<typeof pageManager>;
