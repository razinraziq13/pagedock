# Tool status

**Last updated:** 15 November 2026
**Delivery:** website / installable PWA only. The Windows `.exe` was dropped by the project owner.

**Released:** 8 of 17 — all of R1.0 (Merge, Split, Organize, Rotate, Images to PDF, PDF to Images, Watermark, Page Numbers).

A tool appears on the dashboard only once it has passed end-to-end testing (`released: true` in `src/tools.ts`).

| # | Tool | Stage | Status | Desktop browser | iOS Safari | Android Chrome |
|---:|---|---|---|---|---|---|
| 1 | Merge PDF | R1.0 | **Released** | Passed (see evidence) | Unverified | Unverified |
| 2 | Split PDF | R1.0 | **Released** | Passed (see evidence) | Unverified | Unverified |
| 3 | Organize PDF | R1.0 | **Released** | Passed (see evidence) | Unverified | Unverified |
| 4 | Rotate PDF | R1.0 | **Released** | Passed (see evidence) | Unverified | Unverified |
| 5 | Images to PDF | R1.0 | **Released** | Passed (see evidence) | Unverified | Unverified |
| 6 | PDF to Images | R1.0 | **Released** | Passed (see evidence) | Unverified | Unverified |
| 7 | Watermark PDF | R1.0 | **Released** | Passed (see evidence) | Unverified | Unverified |
| 8 | Page Numbers | R1.0 | **Released** | Passed (see evidence) | Unverified | Unverified |
| 9 | Crop PDF | R1.1 | Not started | — | — | — |
| 10 | Annotate PDF | R1.1 | Not started | — | — | — |
| 11 | Visual Sign PDF | R1.1 | Not started | — | — | — |
| 12 | Fill PDF Forms | R1.1 | Not started | — | — | — |
| 13 | Scan to PDF | R1.1 | Not started | — | — | — |
| 14 | PDF to Text | R1.1 | Not started | — | — | — |
| 15 | Compare PDFs | R1.2 | Not started | — | — | — |
| 16 | OCR PDF to Text | R1.2 | Not started | — | — | — |
| 17 | PDF to Word | R1.3 | Not started | — | — | — |

## Images to PDF, PDF to Images, Watermark, Page Numbers — evidence

**Automated tests** (`tests/stamp.test.ts`, `tests/images.test.ts`, 26 tests; 49 of 49 passing across the project on 2026-11-15). Text positions are read back with pdf.js *as displayed*, so rotation and crop are checked the way a reader shows them.
- **Page Numbers:**
  - Start number 7 on 3 pages gives 7, 8, 9 (spec test).
  - On pages rotated 0°, 90°, 180° and 270°, the number is upright, centred and 20–45 pt from the bottom edge.
  - All six positions land inside the margins.
  - A crop box offset from the media box is respected.
  - "2-" skips a cover page ("1 / 2", "2 / 2").
  - On a 60×60 pt page the text shrinks instead of clipping.
  - Bad start numbers, font sizes and ranges are refused.
- **Watermark:**
  - Text appears only on the chosen pages, at opacity /ca 0.3, centred (spec test).
  - Long text at 45° shrinks to stay on the page.
  - On a 90°-rotated page it is upright and centred.
  - An image watermark appears on the chosen page only, at the chosen opacity.
  - Chinese text is refused with the exact characters named. The PDF library would otherwise silently print "??"; this was found by a test and fixed.
  - Malay text such as "SULIT — Salinan Terkawal" works.
- **Images to PDF:**
  - One page per image, in order (spec test). "Fit" pages match the image at 96 dpi.
  - A4 automatically picks landscape or portrait, centres the image inside the margins and keeps the aspect ratio.
  - Forced portrait and landscape both work.
  - EXIF orientation 3, 6 and 8 produce the correct upright placement. This is done without re-compressing the image.
  - Huge images are capped at 14,400 pt.
  - Non-images and damaged images are refused with the filename.

**Manual browser test** (built-in Chromium browser, production build, 2026-11-15):
- **Images to PDF:** a PNG (300×150, red top / blue bottom), a JPEG of the same picture tagged EXIF orientation 6, and a fake `.HEIC` file were added. The HEIC file was refused with instructions for iPhone. Converting the other two gave a 2-page PDF: landscape A4 for the PNG and portrait A4 for the rotated JPEG.
- **PDF to Images:** converting that PDF back to PNG at 72 dpi gave 841×595 for page 1 (red on top) and 595×841 for page 2, with red on the **right**. That is the correct upright result for EXIF 6 (rotate 90° clockwise). The JPG choice at 150 dpi for both pages gave `images-images.zip` (starts with `PK`) with two JPGs. A range of "7" for a 2-page file was refused.
- **Watermark:** with a 5-page file, pages "2,4", red, 45°: the live preview showed page 2 with the diagonal mark (544 tinted pixels, checked by screenshot). The saved file had 5 pages with two `/ca 0.3` graphics states.
- **Page Numbers:** "Page 1 of 10" style, bottom right, large, pages "2-": the preview of page 2 had the label 19 px from the right and 20 px from the bottom at preview scale. A negative start number disabled the button. The saved file had 5 pages.
- **Phone width (375 px):** all four screens with a file loaded showed no sideways scrolling. The home page shows 8 tools.
- **Bug found and fixed:** PDF to Images stalled when the browser tab was in the background, because pdf.js waits on animation frames. Exports now use pdf.js's print rendering, which doesn't.

**Not yet tested:**
- Real phones, including real iPhone and Android photos, iOS HEIC handling and Share / Save to Files.
- PDF to Images with very large or many pages on a phone.

## Split, Rotate, Organize — evidence

**Automated tests** (`tests/pages.test.ts`, 14 tests; 23 of 23 passing across the project on 2026-11-15). Output text is read back with pdf.js.
- **Page ranges:** `1,3-5`, open ranges (`4-`) and spaces are accepted. `0`, out-of-range pages, backwards ranges, letters and `1-3-5` are rejected with a clear message.
- **Split, one file (spec test):** `1,3-5` from a 5-page file gives 4 pages, `P-1, P-3, P-4, P-5`.
- **Split, one file per range:** gives `report-p1.pdf` and `report-p3-5.pdf`, zipped, and the unzipped files have the right pages. Out-of-range requests produce no output. Duplicate names in the zip get a counter.
- **Rotate:** 90°, 180° and 270° on chosen pages only. The other pages and the text are unchanged. Rotation is added to any existing rotation (270° + 180° = 90°). An empty selection or a missing page is refused.
- **Organize (spec test):** `[1,2,3]` becomes `[3,1]` with the first page rotated 90°. Removing every page is refused.
- Original bytes are unchanged after Rotate and Organize.

**Manual browser test** (built-in Chromium browser, production build, 2026-11-15):
- **Split:** with a 5-page file, the box defaulted to `1-5`; typing `2,9` showed the error and disabled the button. `1,3-5` in one file gave a valid 4-page PDF. "Separate PDF for each range" gave `p-5pages-split.zip` (starts with `PK`) containing `p-5pages-p1.pdf` and `p-5pages-p3-5.pdf`.
- **Rotate:** all 5 page previews were drawn by pdf.js. After choosing "Select none", ticking pages 2 and 4 and choosing 180°, the saved PDF had 5 pages with exactly two `/Rotate 180` entries.
- **Organize:** with the 3-page file: moved page 3 to the front, removed page 2, rotated page 3, then removed a page and pressed Undo, which restored it. The saved PDF had 2 pages with one `/Rotate 90`.
- **Phone width (375 px):** home, Merge, Split, Rotate and Organize, with a 5-page file loaded and a long filename, showed no sideways scrolling. A 7 px overflow in the page grid was found and fixed during this test.

**Not yet tested:**
- Real phones.
- Drag-and-drop reordering in Organize (the buttons are tested; dragging is not).
- Previews of very large PDFs and of PDFs that use JBIG2/JPEG 2000 images.

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
