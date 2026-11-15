import { PDFDocument } from '@cantoo/pdf-lib';

export class PdfInputError extends Error {
  constructor(public fileName: string, message: string) {
    super(`${fileName}: ${message}`);
    this.name = 'PdfInputError';
  }
}

export interface PdfInput {
  name: string;
  bytes: Uint8Array;
}

/** True when the bytes start with the %PDF- signature (allowing leading junk within 1 KB, as readers do). */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length - 5, 1024);
  for (let i = 0; i <= limit; i++) {
    if (bytes[i] === 0x25 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x44 && bytes[i + 3] === 0x46 && bytes[i + 4] === 0x2d) return true;
  }
  return false;
}

/** Load a PDF for reading/copying. Encrypted files are refused, never bypassed. */
export async function loadPdf(input: PdfInput): Promise<PDFDocument> {
  if (input.bytes.length === 0) throw new PdfInputError(input.name, 'the file is empty.');
  if (!looksLikePdf(input.bytes)) throw new PdfInputError(input.name, 'this is not a PDF file.');
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(input.bytes, { ignoreEncryption: true, updateMetadata: false });
  } catch {
    throw new PdfInputError(input.name, 'the PDF is damaged or could not be read.');
  }
  if (doc.isEncrypted) throw new PdfInputError(input.name, 'the PDF is password-protected or encrypted. PageDock does not remove protection.');
  let count = 0;
  try {
    count = doc.getPageCount();
  } catch {
    throw new PdfInputError(input.name, 'the PDF is damaged or could not be read.');
  }
  if (count === 0) throw new PdfInputError(input.name, 'the PDF has no pages, or its page list is damaged.');
  return doc;
}

export async function getPageCount(input: PdfInput): Promise<number> {
  return (await loadPdf(input)).getPageCount();
}

/** Merge PDFs in the given order, keeping every page. Inputs are never modified. */
export async function mergePdfs(inputs: PdfInput[]): Promise<Uint8Array> {
  if (inputs.length < 2) throw new Error('Choose at least two PDF files to merge.');
  const out = await PDFDocument.create();
  for (const input of inputs) {
    const src = await loadPdf(input);
    let pages;
    try {
      pages = await out.copyPages(src, src.getPageIndices());
    } catch {
      throw new PdfInputError(input.name, 'some pages are damaged and could not be copied.');
    }
    for (const p of pages) out.addPage(p);
  }
  out.setProducer('PageDock Free');
  out.setCreator('PageDock Free');
  return out.save();
}

/** Strip characters that are unsafe in filenames and keep a sensible length. */
export function sanitizeFileName(name: string, fallback = 'document'): string {
  const cleaned = name
    .replace(/\.{2,}/g, '_')
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 120);
  return cleaned || fallback;
}
