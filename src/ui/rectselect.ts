import { h, safeCapture } from './dom';

/** A rectangle as fractions (0–1) of the element it sits on. */
export interface FracRect { x: number; y: number; w: number; h: number }

const MIN = 0.05;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * A draggable, resizable selection box over an image or canvas. Works with mouse, pen and touch
 * (pointer events). The caller also offers number inputs, so it is usable without dragging.
 */
export function rectSelector(stage: HTMLElement, initial: FracRect, onChange: (r: FracRect) => void) {
  let r = { ...initial };
  const box = h('div', { class: 'sel-box', 'aria-hidden': 'true' });
  const handles = (['nw', 'ne', 'sw', 'se'] as const).map((c) => {
    const el = h('span', { class: `sel-handle ${c}`, 'data-corner': c });
    box.append(el);
    return el;
  });
  void handles;
  stage.classList.add('sel-stage');
  stage.append(box);

  function draw() {
    box.style.left = `${r.x * 100}%`;
    box.style.top = `${r.y * 100}%`;
    box.style.width = `${r.w * 100}%`;
    box.style.height = `${r.h * 100}%`;
  }

  let drag: { mode: string; sx: number; sy: number; start: FracRect } | null = null;
  box.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    safeCapture(box, e.pointerId);
    const corner = (e.target as HTMLElement).dataset.corner;
    drag = { mode: corner ?? 'move', sx: e.clientX, sy: e.clientY, start: { ...r } };
  });
  box.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const rect = stage.getBoundingClientRect();
    const dx = (e.clientX - drag.sx) / rect.width, dy = (e.clientY - drag.sy) / rect.height;
    const s = drag.start;
    let { x, y, w, h: hh } = s;
    if (drag.mode === 'move') {
      x = clamp(s.x + dx, 0, 1 - s.w);
      y = clamp(s.y + dy, 0, 1 - s.h);
    } else {
      if (drag.mode.includes('w')) { x = clamp(s.x + dx, 0, s.x + s.w - MIN); w = s.x + s.w - x; }
      if (drag.mode.includes('e')) { w = clamp(s.w + dx, MIN, 1 - s.x); }
      if (drag.mode.includes('n')) { y = clamp(s.y + dy, 0, s.y + s.h - MIN); hh = s.y + s.h - y; }
      if (drag.mode.includes('s')) { hh = clamp(s.h + dy, MIN, 1 - s.y); }
    }
    r = { x, y, w, h: hh };
    draw();
    onChange(r);
  });
  const end = () => { drag = null; };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
  draw();

  return {
    get: () => ({ ...r }),
    set(next: FracRect) {
      r = { x: clamp(next.x, 0, 1 - MIN), y: clamp(next.y, 0, 1 - MIN), w: 0, h: 0 };
      r.w = clamp(next.w, MIN, 1 - r.x);
      r.h = clamp(next.h, MIN, 1 - r.y);
      draw();
    },
  };
}
