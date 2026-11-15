import type { PageText, TextPiece } from './textlayout';

/** The subset of the pdf.js API we use; works with both the browser build and the Node "legacy" build. */
export interface PdfjsLike {
  getDocument(src: Record<string, unknown>): { promise: Promise<any>; destroy(): Promise<void> | void };
  Util: { transform(a: number[], b: number[]): number[] };
}

export class TextExtractError extends Error {}

/**
 * Read positioned text from every page with pdf.js. Encrypted files are refused (never cracked).
 * `onPage` reports progress; returning false from `shouldContinue` cancels.
 */
export async function extractPageText(
  pdfjs: PdfjsLike,
  bytes: Uint8Array,
  extra: Record<string, unknown> = {},
  onPage?: (done: number, total: number) => void,
  shouldContinue: () => boolean = () => true,
): Promise<PageText[]> {
  const task = pdfjs.getDocument({ data: bytes.slice(), enableXfa: false, ...extra });
  let doc: any;
  try {
    doc = await task.promise;
  } catch (e: any) {
    await task.destroy();
    if (e?.name === 'PasswordException') throw new TextExtractError('This PDF is password-protected. PageDock does not remove protection.');
    throw new TextExtractError('The PDF is damaged or could not be read.');
  }
  try {
    const pages: PageText[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      if (!shouldContinue()) throw new TextExtractError('Cancelled.');
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const pieces: TextPiece[] = [];
      for (const it of content.items as any[]) {
        if (typeof it.str !== 'string' || !it.str) continue;
        const m = pdfjs.Util.transform(vp.transform, it.transform);
        const h = Math.hypot(m[2], m[3]);
        pieces.push({ str: it.str, x: m[4], y: m[5], w: Math.abs(it.width ?? 0), h });
      }
      pages.push({ width: vp.width, height: vp.height, pieces });
      page.cleanup();
      onPage?.(i, doc.numPages);
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
