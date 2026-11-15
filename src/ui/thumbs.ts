import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

/** Load pdf.js only when a tool needs page previews, so the dashboard stays light. */
function pdfjs() {
  pdfjsPromise ??= import('pdfjs-dist').then((m) => {
    m.GlobalWorkerOptions.workerSrc = workerUrl;
    return m;
  });
  return pdfjsPromise;
}

export interface Previewer {
  pageCount: number;
  /** Returns a <canvas> wrapper that renders its page when it scrolls into view. */
  thumb(index: number, width?: number): HTMLElement;
  /** Displayed page size in points (after page rotation). */
  pageSize(index: number): Promise<{ width: number; height: number }>;
  /** Render a page at `scale` (1 = 72 dpi) onto a new canvas with a white background. */
  render(index: number, scale: number): Promise<HTMLCanvasElement>;
  destroy(): void;
}

/** Open a PDF for previews. PDF JavaScript is never run; rendering is capped to small sizes. */
export async function openPreview(bytes: Uint8Array): Promise<Previewer> {
  const lib = await pdfjs();
  const asset = (p: string) => new URL(`pdfjs/${p}/`, document.baseURI).href;
  const task = lib.getDocument({
    data: bytes.slice(),
    // No scripting: pdf.js 6 has no eval path, and the page's CSP has no 'unsafe-eval' anyway.
    enableXfa: false,
    standardFontDataUrl: asset('standard_fonts'),
    cMapUrl: asset('cmaps'),
    cMapPacked: true,
    wasmUrl: asset('wasm'),
    iccUrl: asset('iccs'),
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
    await page.render({ canvas, viewport }).promise;
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
