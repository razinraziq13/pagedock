import { h } from './dom';
import { renderPreview } from './thumbs';

/**
 * Shows page `pageIndex` of the real output file, regenerated (debounced) whenever settings change.
 * Because it renders the actual result, what you see is what you download.
 */
export function livePreview(make: () => Promise<{ bytes: Uint8Array; pageIndex: number } | null>) {
  const frame = h('div', { class: 'preview-frame' });
  const caption = h('p', { class: 'hint', role: 'status' });
  const el = h('figure', { class: 'preview' }, frame, h('figcaption', {}, caption));
  let timer = 0;
  let seq = 0;

  async function run() {
    const mine = ++seq;
    caption.textContent = 'Updating preview…';
    try {
      const r = await make();
      if (mine !== seq) return;
      if (!r) { frame.replaceChildren(); caption.textContent = ''; return; }
      const canvas = await renderPreview(r.bytes, r.pageIndex, 320);
      if (mine !== seq) return;
      frame.replaceChildren(canvas);
      caption.textContent = `Preview of page ${r.pageIndex + 1}, exactly as it will be saved.`;
    } catch (e) {
      if (mine !== seq) return;
      frame.replaceChildren();
      caption.textContent = e instanceof Error ? e.message : 'Preview unavailable.';
    }
  }

  return {
    el,
    refresh(delay = 350) {
      window.clearTimeout(timer);
      timer = window.setTimeout(run, delay);
    },
  };
}
