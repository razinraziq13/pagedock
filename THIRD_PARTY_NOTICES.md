# Third-party notices

This list was last checked against `package-lock.json` and the files in `node_modules/` on 15 November 2026.

## Shipped to users (bundled into the website)

| Package / files | Version | License |
|---|---|---|
| @cantoo/pdf-lib | 2.11.1 | MIT |
| culori (dependency of pdf-lib) | 4.0.2 | MIT |
| html-entities (dependency of pdf-lib) | 2.6.0 | MIT |
| node-html-better-parser (dependency of pdf-lib) | 1.5.9 | MIT |
| tslib | 2.9.1 | 0BSD |
| fflate | 0.8.3 | MIT |
| pdfjs-dist (pdf.js, plus its worker) | 6.5.438 | Apache-2.0 |
| pdf.js `standard_fonts/` (Foxit fonts) | bundled with pdfjs-dist | BSD-style (PDFium license, `LICENSE_FOXIT`) |
| pdf.js `standard_fonts/` (Liberation fonts) | bundled with pdfjs-dist | Liberation font license (`LICENSE_LIBERATION`) |
| pdf.js `cmaps/` (Adobe character maps) | bundled with pdfjs-dist | BSD-3-Clause, Adobe (per pdf.js); **not yet re-read file by file** |
| pdf.js `iccs/` (colour profiles) | bundled with pdfjs-dist | per pdf.js; **not yet re-read file by file** |
| pdf.js `wasm/` jbig2 decoder | bundled with pdfjs-dist | BSD-style (PDFium, `LICENSE_JBIG2`) and Apache-2.0 (`LICENSE_PDFJS_JBIG2`) |
| pdf.js `wasm/` openjpeg decoder | bundled with pdfjs-dist | BSD-2-Clause (`LICENSE_OPENJPEG`) and Apache-2.0 (`LICENSE_PDFJS_OPENJPEG`) |
| pdf.js `wasm/` qcms colour management | bundled with pdfjs-dist | MIT (`LICENSE_QCMS`) and Apache-2.0 (`LICENSE_PDFJS_QCMS`) |

**How the pdf.js files get into the site:**
- `scripts/copy-pdfjs-assets.mjs` copies them into `public/pdfjs/`, together with their LICENSE files, so the license texts are published alongside them.
- The pdf.js scripting engine (QuickJS) is **deliberately not copied**, because PageDock never runs PDF JavaScript.

**What these licenses require:**
- MIT, BSD and Apache-2.0 require the copyright and license notices to be kept with the code. Apache-2.0 also requires its NOTICE text to be kept, if a package has one.
- An "Open-source licenses" page inside the app is planned before the R1.0 release. **It does not exist yet.**

**Not shipped:** `@napi-rs/canvas` is an optional Node-only dependency of pdfjs-dist (MIT). It is installed for local development on some systems, but it is never bundled into the website.

## Build and test only (not shipped)

These packages are used only to build or test the site:
- vite (MIT)
- vite-plugin-pwa (MIT), which uses Workbox (MIT)
- typescript (Apache-2.0)
- vitest (MIT)

`npm audit` reports 6 low/moderate advisories in glob/minimatch. These are pulled in by vite-plugin-pwa's build tooling. They run only on the developer's machine and are not included in the website.
