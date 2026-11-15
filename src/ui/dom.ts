/** Tiny element helper. Text is always added as text nodes, never innerHTML, so filenames cannot inject markup. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: (Node | string | null | false | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function announce(msg: string) {
  const live = document.getElementById('live');
  if (live) live.textContent = msg;
}

/** Pointer capture keeps drags working outside the element; some input devices refuse it, which is harmless. */
export function safeCapture(el: Element, pointerId: number) {
  try { el.setPointerCapture(pointerId); } catch { /* not capturable: dragging still works inside the element */ }
}
