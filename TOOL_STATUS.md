# Tool status

**Last updated:** 15 November 2026
**Delivery:** website / installable PWA only. The Windows `.exe` was dropped by the project owner.

A tool appears on the dashboard only once it has passed end-to-end testing (`released: true` in `src/tools.ts`).

| # | Tool | Stage | Status | Desktop browser | iOS Safari | Android Chrome |
|---:|---|---|---|---|---|---|
| 1 | Merge PDF | R1.0 | **Released** | Passed (see evidence) | Unverified | Unverified |
| 2 | Split PDF | R1.0 | Not started | — | — | — |
| 3 | Organize PDF | R1.0 | Not started | — | — | — |
| 4 | Rotate PDF | R1.0 | Not started | — | — | — |
| 5 | Images to PDF | R1.0 | Not started | — | — | — |
| 6 | PDF to Images | R1.0 | Not started | — | — | — |
| 7 | Watermark PDF | R1.0 | Not started | — | — | — |
| 8 | Page Numbers | R1.0 | Not started | — | — | — |
| 9 | Crop PDF | R1.1 | Not started | — | — | — |
| 10 | Annotate PDF | R1.1 | Not started | — | — | — |
| 11 | Visual Sign PDF | R1.1 | Not started | — | — | — |
| 12 | Fill PDF Forms | R1.1 | Not started | — | — | — |
| 13 | Scan to PDF | R1.1 | Not started | — | — | — |
| 14 | PDF to Text | R1.1 | Not started | — | — | — |
| 15 | Compare PDFs | R1.2 | Not started | — | — | — |
| 16 | OCR PDF to Text | R1.2 | Not started | — | — | — |
| 17 | PDF to Word | R1.3 | Not started | — | — | — |

## Merge PDF — evidence

**Automated tests** (`npm test`, vitest 5.1.0, 9 of 9 passing on 2026-11-15):
- 2 + 1 + 3 page inputs give 6 pages in order. Page text was read back with pdf.js, a separate reader from the library that wrote the file: `A-1, A-2, B-1, C-1, C-2, C-3`.
- Reordered inputs give the matching output order.
- Existing page rotation (90°) and page size are kept.
- Input bytes are unchanged after merging.
- Fewer than two files is refused.
- Non-PDF, empty and damaged files are rejected with the filename in the error.
- Filename sanitising and page counting are covered.

**Manual browser test** (Claude desktop app's built-in Chromium browser, `vite preview` production build, 2026-11-15):
- The dashboard shows only Merge, with "1 of 17 planned tools are available".
- Adding `c-3pages`, `a-2pages`, `b-1pages` and `not-a-pdf`: the bad file was flagged ("this is not a PDF file") and Merge stayed disabled until it was removed.
- After reordering to A, B, C and merging: the download `a-2pages-merged.pdf` was 2,836 bytes, with a `%PDF-1.7` header, 6 page objects and a final `%%EOF`.
- At 375 px phone width the layout has no sideways scrolling.
- **Offline:** after the first visit, the preview server was stopped (a fetch to it failed). The page then reloaded and merged the three files into a valid 6-page PDF. However, the browser reported `navigator.serviceWorker.controller = false` at that moment, so it is not proven that the offline worker served the page. **Offline status: needs re-checking on the deployed site and on real phones.**

**Not yet tested:**
- iPhone and Android: file picking, download, Share / Save to Files, Add to Home Screen.
- Very large files.
- Encrypted PDFs. The code refuses them, but there is no encrypted sample file yet.
- Opening the merged file in a separate desktop PDF viewer by hand.
