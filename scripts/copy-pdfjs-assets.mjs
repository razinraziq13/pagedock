// Copies runtime helper files into public/ so they are served from our own site (never a CDN)
// and can be cached for offline use.
//  - public/pdfjs: pdf.js fonts, character maps and image decoders (scripting/QuickJS left out on purpose)
//  - public/ocr:   tesseract.js worker, LSTM engine builds and English language data
//  - public/vendor/opencv: OpenCV.js for finding document edges
import { cpSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = (name) => dirname(require.resolve(`${name}/package.json`));

// ---- pdf.js
const pdfjs = pkg('pdfjs-dist');
rmSync('public/pdfjs', { recursive: true, force: true });
mkdirSync('public/pdfjs/wasm', { recursive: true });
for (const dir of ['standard_fonts', 'cmaps', 'iccs']) cpSync(join(pdfjs, dir), `public/pdfjs/${dir}`, { recursive: true });
for (const f of readdirSync(join(pdfjs, 'wasm'))) if (!/quickjs/i.test(f)) cpSync(join(pdfjs, 'wasm', f), `public/pdfjs/wasm/${f}`);
cpSync(join(pdfjs, 'LICENSE'), 'public/pdfjs/LICENSE');

// ---- OCR
const tjs = pkg('tesseract.js');
const core = pkg('tesseract.js-core');
const eng = pkg('@tesseract.js-data/eng');
rmSync('public/ocr', { recursive: true, force: true });
mkdirSync('public/ocr/core', { recursive: true });
mkdirSync('public/ocr/lang', { recursive: true });
cpSync(join(tjs, 'dist/worker.min.js'), 'public/ocr/worker.min.js');
cpSync(join(tjs, 'LICENSE.md'), 'public/ocr/LICENSE-tesseract.js.md');
// Only LSTM builds are needed (we always use the LSTM engine). The browser picks one by CPU features.
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) cpSync(join(core, f), `public/ocr/core/${f}`);
cpSync(join(core, 'LICENSE'), 'public/ocr/core/LICENSE');
// "best_int": the accurate English model, integer-quantised (about 3 MB)
cpSync(join(eng, '4.0.0_best_int/eng.traineddata.gz'), 'public/ocr/lang/eng.traineddata.gz');

// ---- OpenCV.js (document edge finding in Scan to PDF; runs in public/scan-edge-worker.js)
const ocv = pkg('@techstark/opencv-js');
rmSync('public/vendor/opencv', { recursive: true, force: true });
mkdirSync('public/vendor/opencv', { recursive: true });
cpSync(join(ocv, 'dist/opencv.js'), 'public/vendor/opencv/opencv.js');
cpSync(join(ocv, 'LICENSE'), 'public/vendor/opencv/LICENSE');

console.log('pdf.js, OCR and OpenCV assets copied');
