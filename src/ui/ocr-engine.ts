import type { Worker } from 'tesseract.js';

const OEM_LSTM_ONLY = 1;

/**
 * Start a local OCR worker. Every file comes from this site (never a CDN); after first use the service worker
 * and tesseract's own browser cache keep them for offline use. Nothing is uploaded.
 */
export async function createOcr(onProgress: (status: string, p: number) => void): Promise<Worker> {
  const { createWorker } = await import('tesseract.js');
  const url = (p: string) => new URL(`ocr/${p}`, document.baseURI).href;
  return createWorker('eng', OEM_LSTM_ONLY, {
    workerPath: url('worker.min.js'),
    corePath: url('core/'),
    langPath: url('lang'),
    gzip: true,
    logger: (m: { status: string; progress: number }) => onProgress(m.status, m.progress),
    errorHandler: () => {},
  });
}
