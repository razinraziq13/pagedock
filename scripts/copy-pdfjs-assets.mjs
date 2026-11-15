// Copies the pdf.js helper files (fonts, character maps, image decoders) into public/pdfjs
// so they are served from our own site and cached for offline use. Scripting (quickjs) is left out on purpose.
import { cpSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
const src = 'node_modules/pdfjs-dist';
const dst = 'public/pdfjs';
rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
for (const dir of ['standard_fonts', 'cmaps', 'iccs']) cpSync(`${src}/${dir}`, `${dst}/${dir}`, { recursive: true });
mkdirSync(`${dst}/wasm`);
for (const f of readdirSync(`${src}/wasm`)) if (!f.includes('quickjs') && !f.includes('QUICKJS')) cpSync(`${src}/wasm/${f}`, `${dst}/wasm/${f}`);
console.log('pdf.js assets copied');
