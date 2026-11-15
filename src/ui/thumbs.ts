import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

/** Load pdf.js only when a tool needs it, so the dashboard stays light. */
export function pdfjs() {
  pdfjsPromise ??= import('pdfjs-dist').then((m) => {
    m.GlobalWorkerOptions.workerSrc = workerUrl;
    return m;
  });
  return pdfjsPromise;
}

/** pdf.js options pointing at our own copies of its fonts and decoders (served locally, cached offline). */
export function pdfjsAssets() {
  const asset = (p: string) => new URL(`pdfjs/${p}/`, document.baseURI).href;
  return {
    standardFontDataUrl: asset('standard_fonts'),
    cMapUrl: asset('cmaps'),
    cMapPacked: true,
    wasmUrl: asset('wasm'),
    iccUrl: asset('iccs'),
  };
}

export interface Previewer {
  pageCount: number;
  /** Returns a <canvas> wrapper that renders its page when it scrolls into view. */
  thumb(index: number, width?: number): HTMLElement;
  /** Displayed page size in points (after page rotation). */
  pageSize(index: number): Promise<{ width: number; height: number }>;
  /** Render a page at `scale` (1 = 72 dpi) onto a new canvas with a white background. */
  render(index: number, scale: number): Promise<HTMLCanvasElement>;
  /** Upright text on a page with its box in displayed points (top-left origin), for 'Edit existing text'. */
  textItems(index: number): Promise<PageTextItem[]>;
  destroy(): void;
}

export interface PageTextItem { str: string; x: number; y: number; baseline: number; w: number; h: number; size: number; family: 'sans' | 'serif' | 'mono'; bold: boolean; italic: boolean }

/** Open a PDF for previews. PDF JavaScript is never run; rendering is capped to small sizes. */
export async function openPreview(bytes: Uint8Array): Promise<Previewer> {
  const lib = await pdfjs();
  const task = lib.getDocument({
    data: bytes.slice(),
    // No scripting: pdf.js 6 has no eval path, and the page's CSP has no 'unsafe-eval' anyway.
    enableXfa: false,
    ...pdfjsAssets(),
  });
  const doc: PDFDocumentProxy = await task.promise;
  const rendered = new WeakSet<HTMLCanvasElement>();

  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        observer.unobserve(e.target);
        const canvas = e.target as HTMLCanvasElement;
        if (!rendered.has(canvas)) {
          rendered.add(canvas);
          draw(canvas, Number(canvas.dataset.page), Number(canvas.dataset.width)).catch(() => canvas.classList.add('thumb-failed'));
        }
      }
    },
    { rootMargin: '300px' },
  );

  async function draw(canvas: HTMLCanvasElement, index: number, width: number) {
    const page = await doc.getPage(index + 1);
    const base = page.getViewport({ scale: 1 });
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: (width / base.width) * ratio });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
    // 'print' intent: no waiting on animation frames, so thumbnails also finish while the app is in the background.
    await page.render({ canvas, viewport, background: 'white', intent: 'print' } as Parameters<typeof page.render>[0]).promise;
    page.cleanup();
  }

  return {
    pageCount: doc.numPages,
    thumb(index, width = 140) {
      const canvas = document.createElement('canvas');
      canvas.className = 'thumb-canvas';
      canvas.dataset.page = String(index);
      canvas.dataset.width = String(width);
      canvas.setAttribute('aria-hidden', 'true');
      observer.observe(canvas);
      return canvas;
    },
    async pageSize(index) {
      const page = await doc.getPage(index + 1);
      const vp = page.getViewport({ scale: 1 });
      return { width: vp.width, height: vp.height };
    },
    async render(index, scale) {
      const page = await doc.getPage(index + 1);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d')!;
      // White background, so transparent PDF pages don't become black in JPG output.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // 'print' intent: renders as the page would print, and does not wait on animation frames,
      // so exports keep going when the tab is in the background.
      await page.render({ canvas, viewport, background: 'white', intent: 'print' } as Parameters<typeof page.render>[0]).promise;
      page.cleanup();
      return canvas;
    },
    async textItems(index) {
      const page = await doc.getPage(index + 1);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const out: PageTextItem[] = [];
      for (const it of content.items as any[]) {
        if (!it.str || !it.str.trim()) continue;
        const m = lib.Util.transform(vp.transform, it.transform);
        const size = Math.hypot(m[2], m[3]);
        if (!(m[0] > 0) || Math.abs(m[1]) > 1e-3 || Math.abs(m[2]) > 1e-3 || size < 2) continue; // upright, left-to-right only
        const style = content.styles[it.fontName] ?? {};
        let name = '';
        try { name = String((page.commonObjs.get(it.fontName) as any)?.name ?? ''); } catch { /* font not loaded yet */ }
        const fam = String(style.fontFamily ?? '') + ' ' + name;
        const family = /mono|courier/i.test(fam) ? 'mono' : /serif|times|roman|georgia|garamond/i.test(fam) && !/sans/i.test(fam) ? 'serif' : 'sans';
        const ascent = typeof style.ascent === 'number' && style.ascent > 0 ? style.ascent : 0.8;
        out.push({ str: it.str, x: m[4], y: m[5] - size * ascent, baseline: m[5], w: it.width * vp.scale, h: size * 1.05, size, family, bold: /bold|black|heavy|semibold/i.test(name), italic: /italic|oblique/i.test(name) });
      }
      page.cleanup();
      return out;
    },
    destroy() {
      observer.disconnect();
      task.destroy();
    },
  };
}

/** Largest canvas most phones allow (iOS Safari limit is about 16.7 million pixels). */
export const MAX_CANVAS_PIXELS = 16_000_000;

/** Render one page of some PDF bytes into a preview canvas that fits `width` CSS pixels. */
export async function renderPreview(bytes: Uint8Array, index: number, width: number): Promise<HTMLCanvasElement> {
  const p = await openPreview(bytes);
  try {
    const size = await p.pageSize(index);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = await p.render(index, (width / size.width) * ratio);
    canvas.className = 'preview-canvas';
    return canvas;
  } finally {
    p.destroy();
  }
}

const outputs: Previewer[] = [];

/**
 * A strip of real thumbnails of a generated PDF, so the result can be checked before downloading.
 * Shows up to `max` pages; the previous result preview is closed to free memory.
 */
export function outputPreview(bytes: Uint8Array, max = 24, keepOthers = false): HTMLElement {
  const strip = document.createElement('ol');
  strip.className = 'out-preview';
  strip.setAttribute('aria-label', 'Preview of the result');
  if (!keepOthers) outputs.splice(0).forEach((p) => p.destroy());
  openPreview(bytes).then((p) => {
    outputs.push(p);
    const n = Math.min(p.pageCount, max);
    for (let i = 0; i < n; i++) {
      const li = document.createElement('li');
      li.append(p.thumb(i, 90));
      const label = document.createElement('span');
      label.textContent = String(i + 1);
      li.append(label);
      strip.append(li);
    }
    if (p.pageCount > max) {
      const li = document.createElement('li');
      li.className = 'more';
      li.textContent = `+${p.pageCount - max} more`;
      strip.append(li);
    }
  }).catch(() => { strip.textContent = 'Preview not available for this file.'; });
  return strip;
}
