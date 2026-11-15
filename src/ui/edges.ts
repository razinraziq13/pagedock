import type { Pt } from '../core/scanimage';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: Pt[] | null) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('scan-edge-worker.js', document.baseURI).href);
  worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; quad?: Pt[] | null; error?: string }>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.ok) p.resolve(e.data.quad ?? null);
    else p.reject(new Error(e.data.error || 'Edge finding failed.'));
  };
  worker.onerror = () => {
    for (const p of pending.values()) p.reject(new Error('The edge finder stopped. Drag the corners instead.'));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

function ask(msg: { type: string; imageData?: ImageData }): Promise<Pt[] | null> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, ...msg });
  });
}

/** Start downloading/initialising the edge finder early, so it is ready when the photo appears. */
export function warmUpEdges(): void {
  ask({ type: 'warmup' }).catch(() => {});
}

/** Find the document's four corners in a (small) image. Returns null when no clear edges are found. */
export function findDocumentCorners(imageData: ImageData): Promise<Pt[] | null> {
  return ask({ type: 'detect', imageData });
}
