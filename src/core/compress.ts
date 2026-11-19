import { PDFDocument } from '@cantoo/pdf-lib';
import { loadPdf, type PdfInput } from './pdf';

export interface ScanSource {
  pageCount: number;
  pageSize(index: number): Promise<{ width: number; height: number }>;
  jpeg(index: number, scale: number, quality: number): Promise<Uint8Array>;
}

export async function optimizePdf(input: PdfInput): Promise<Uint8Array> {
  const document = await loadPdf(input, { preserveXFA: true });
  return document.save({ useObjectStreams: true, updateFieldAppearances: false, addDefaultPage: false });
}

export async function compressScannedPages(
  source: ScanSource,
  mode: 'balanced' | 'small',
  onPage: (index: number) => void,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const dpi = mode === 'balanced' ? 150 : 96;
  const quality = mode === 'balanced' ? 0.76 : 0.58;
  for (let index = 0; index < source.pageCount; index++) {
    signal?.throwIfAborted();
    onPage(index + 1);
    const { width, height } = await source.pageSize(index);
    const scale = Math.min(dpi / 72, 4096 / Math.max(width, height), Math.sqrt(8_000_000 / (width * height)));
    const bytes = await source.jpeg(index, scale, quality);
    signal?.throwIfAborted();
    const image = await document.embedJpg(bytes);
    document.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
  }
  return document.save();
}
