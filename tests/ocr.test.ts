import { describe, it, expect } from 'vitest';
import { createWorker } from 'tesseract.js';
import { createCanvas } from '@napi-rs/canvas';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Uses only local files: the language data from node_modules, never the internet.
const langPath = join(dirname(createRequire(import.meta.url).resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int');

/** A "scanned page": text drawn into a picture, so there is no PDF text layer to read. */
function scannedImage(lines: string[]): Buffer {
  const c = createCanvas(1200, 120 + lines.length * 70);
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#111';
  x.font = '44px sans-serif';
  lines.forEach((l, i) => x.fillText(l, 60, 100 + i * 70));
  return c.toBuffer('image/png');
}

describe('OCR (tesseract.js, offline language data)', () => {
  it('recognises English text from a scanned image (spec test)', async () => {
    const worker = await createWorker('eng', 1, { langPath, cacheMethod: 'none', gzip: true });
    try {
      const { data } = await worker.recognize(scannedImage(['Invoice number 2026-118', 'Total due: RM 450.00', 'Thank you for your business']));
      const text = data.text.replace(/\s+/g, ' ');
      expect(text).toContain('Invoice number 2026-118');
      expect(text).toContain('Total due');
      expect(text).toContain('450.00');
      expect(text).toContain('Thank you for your business');
      expect(data.confidence).toBeGreaterThan(70);
    } finally {
      await worker.terminate();
    }
  }, 120_000);
});
