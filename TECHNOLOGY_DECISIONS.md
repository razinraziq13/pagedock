# PageDock Free — Technology Decisions

**Date:** 15 November 2026
**Status:** Website/PWA only (no Windows `.exe`). Decided for Stage A/B (foundation + Merge PDF). Later stages are marked as planned or uncertain.

## How these choices were verified

- **What was checked:** each package's version, license and last-publish date, read from the public npm registry with `npm view` on 2026-11-15. The build machine has Node v26.13.0 and npm 11.20.0.
- **What was not checked:** no project websites or documentation pages were read during this pass. Capability claims below come from long-standing, widely known behaviour of these libraries. Each one is confirmed by running the code and tests in this repo, not taken on trust. Anything not yet exercised by a test is marked **unverified**.

## Scope change (15 November 2026)

The project owner decided to **drop the Windows `.exe`**. PageDock is delivered only as a **website / installable PWA**.

- On Windows it runs in a modern browser (Edge or Chrome), where it can also be installed as an app from the address bar.
- On iPhone and Android it runs in Safari or Chrome and can be added to the home screen.
- This overrides the spec's Windows-installer requirements: sections 1, 5.1, 6 (Windows setup gate) and 7 (Windows).
- Electron, Tauri and installer tooling are no longer needed.

## 1. Architecture: one web app

All PDF processing is written once in TypeScript and runs in the browser on the user's device. No server is involved, so documents never leave the device. The same build serves desktop browsers and phones.

## 2. Supported browsers (target)

- **Windows 10 22H2 / 11:** current Microsoft Edge and Google Chrome. Firefox should work but cannot be installed as an app.
- **iOS:** current Safari. Install with Share → Add to Home Screen.
- **Android:** current Chrome.
- All of these are **unverified** until tested.

## 3. PWA delivery

- **Build:** Vite 8.3.8 (MIT) builds static files. vite-plugin-pwa 2.0.0 (MIT) generates the web manifest and a service worker that **precaches every asset**, including the PDF engine and the pdf.js worker. After the first visit, all tools run offline.
- **Hosting:** GitHub Pages serves the PWA over HTTPS. It is free for public repos.
- **Desktop install:** Edge and Chrome on Windows can install the PWA as a desktop app, which gives an "app-like" experience without an `.exe`.
- **Opening files:** a standard `<input type="file">`, which works on iOS Safari and Android Chrome.
- **Saving files:** a Blob download link. Where the browser supports it, the Web Share API with files is offered as an alternative, which is the more reliable route on iOS.
- Real iPhone and Android behaviour is **unverified** until tested on devices.

## 4. Libraries

| Purpose | Package | License | Latest / last publish | Notes |
|---|---|---|---|---|
| Create/modify PDFs | **@cantoo/pdf-lib** 2.11.1 | MIT | 2026-09-15 | Maintained fork of pdf-lib, which hasn't published since 2022-05 (1.17.1). Same API. |
| Render, thumbnails, text extraction | **pdfjs-dist** 6.5.438 | Apache-2.0 | 2026-11-01 | Mozilla pdf.js. Also used in tests as an **independent reader** to check outputs. |
| ZIP archives (Split, PDF to Images) | **fflate** 0.8.3 | MIT | 2026-07-20 | Chosen over jszip, whose dual MIT/GPL license is fine but adds questions; fflate is smaller. |
| OCR (R1.2) | **tesseract.js** 7.0.0 | Apache-2.0 | 2025-12-15 | WASM core plus the `eng.traineddata` language file, both precached for offline use. Memory use on phones is **uncertain**. |
| DOCX output (R1.3) | **docx** 9.15.4 | MIT | 2026-11-14 | Writes real editable paragraphs. Text and layout come from pdf.js text extraction. |
| Tests | **vitest** 5.1.0 | MIT | 2026-11-02 | Unit and integration tests run in Node. |
| Language | **typescript** 7.0.2 | Apache-2.0 | 2026-11-14 | |

No UI framework is used. The interface is plain TypeScript and the DOM, which keeps the offline bundle small and leaves fewer dependencies to audit.

## 5. How each of the 17 tools will work

| # | Tool | Method (runs in the browser) | Notes |
|---|---|---|---|
| 1 | Merge | pdf-lib `copyPages` into a new document | — |
| 2 | Split | pdf-lib copy of page ranges; fflate ZIP for multiple parts | — |
| 3 | Organize | pdf.js thumbnails; pdf-lib reorder/remove/`setRotation` | — |
| 4 | Rotate | pdf-lib `setRotation`, added to the page's existing rotation | — |
| 5 | Images to PDF | pdf-lib `embedJpg`/`embedPng`. Phone photos are normalised by drawing them to a canvas, which applies their EXIF orientation | — |
| 6 | PDF to Images | pdf.js render to canvas, then `toBlob` JPG/PNG; fflate ZIP | — |
| 7 | Watermark | pdf-lib `drawText`/`drawImage` with opacity and rotation | — |
| 8 | Page Numbers | pdf-lib `drawText`, positioned inside the page's crop box | — |
| 9 | Crop | pdf-lib `setCropBox`. The UI labels it "not redaction" | — |
| 10 | Annotate | Canvas overlay editor, then drawn into the page content with pdf-lib | — |
| 11 | Visual Sign | Canvas signature, embedded as a PNG image. Labelled "not a digital signature" | — |
| 12 | Fill Forms | pdf-lib `getForm()` for text, checkbox and dropdown fields. XFA forms are detected and refused | — |
| 13 | Scan to PDF | `<input capture>` or the file picker, a canvas crop, then the Images to PDF pipeline | — |
| 14 | PDF to Text | pdf.js `getTextContent`, saved as a .txt Blob | — |
| 15 | Compare | pdf.js side-by-side render and a line diff of the extracted text | — |
| 16 | OCR to Text | tesseract.js (WASM) on pdf.js-rendered pages, English only at first | — |
| 17 | PDF to Word | pdf.js text items grouped into lines and paragraphs, written as real paragraphs with docx. Image-only PDFs are detected and refused | The optional "Preserve layout" mode (Windows-only in the spec) is **dropped** along with the `.exe`. |

## 6. Memory, validation and difficult documents

- **Memory:**
  - Thumbnails are rendered small and only when needed, never at full resolution.
  - Large files (over 100 MB or 300 pages) get a warning before processing.
  - Rendering canvases are released after use.
- **Input validation:**
  - Every input is checked for the `%PDF-` file header.
  - Files are loaded with `ignoreEncryption: false`, so encrypted PDFs are reported as protected, never bypassed.
  - Parse errors are caught and shown with the filename.
  - Output filenames are sanitised.
- **Safety:**
  - PDF JavaScript is never executed: pdf.js scripting is not loaded, and the CSP blocks `eval`.
  - The original file is never written to. Outputs are always new Blobs.
  - The site is served with a strict Content Security Policy and loads no third-party scripts.

## 6b. Decisions made while building R1.0

- **Positions on rotated and cropped pages:** watermarks and page numbers are placed in "display space" (the page as a reader shows it) and then mapped into the page's own coordinates. This keeps them upright and inside the visible crop box on rotated pages.
- **Built-in font:** the standard Helvetica font only covers Latin characters. The PDF library silently replaces anything else with "?", so PageDock checks the text first and names any character it can't show. Embedding a Unicode font is possible later, but it adds file size.
- **Phone photos:** EXIF orientation is applied by the PDF's image placement matrix. Nothing is re-compressed, so there is no quality loss. HEIC files are refused with instructions, because browsers can't reliably decode them.
- **PDF to Images:** pages are rendered with pdf.js's print rendering, so exports don't stall in background tabs. Each page is capped at 16 million pixels (the iOS Safari canvas limit); larger pages are scaled down and the user is told.

## 7. Risks and open questions

- **pdf-lib fork:** @cantoo/pdf-lib is maintained by a smaller team than the original. If it stalls, the original pdf-lib 1.17.1 is still a working fallback.
- **iOS saving:** downloads on iOS Safari open a preview rather than saving straight to Files, so Share is the primary save path there. This needs device testing.
- **OCR on phones:** speed and memory on low-end phones are uncertain, and pages may need to be processed one at a time.
- **PDF to Word quality:** expected to be good for single-column text. Multi-column layouts and tables will lose structure, and this will be documented with test results.
- **Rough effort:**
  - Stage A/B (foundation and Merge): small.
  - R1.0 total: medium.
  - Annotate, Forms and OCR: the largest pieces.
