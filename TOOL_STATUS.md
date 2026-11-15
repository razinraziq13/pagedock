# Tool status

**Last updated:** 15 November 2026
**Delivery:** website / installable PWA only. The Windows `.exe` was dropped by the project owner.

**Released:** 17 of 17 (R1.0, R1.1, R1.2 and R1.3).

A tool appears on the dashboard only once it has passed end-to-end testing (`released: true` in `src/tools.ts`).

**About the phone column:**
- After R1.0 was published, the project owner tested the live site on their own phone and reported "all good". That covered Merge, saving the result, Images to PDF with camera photos, and offline Rotate from the home-screen app.
- The phone model, operating system and browser were **not recorded**. So this counts as one owner-reported phone pass, not a verified iOS **and** Android result.
- Tools 9–17 have **not** been tried on a phone yet.

| # | Tool | Stage | Status | Desktop browser (Chromium) | Owner's phone | Offline |
|---:|---|---|---|---|---|---|
| 1 | Merge PDF | R1.0 | **Released** | Passed | Passed (owner report) | Passed (desktop and owner report) |
| 2 | Split PDF | R1.0 | **Released** | Passed | Unverified | Precached |
| 3 | Organize PDF | R1.0 | **Released** | Passed | Unverified | Precached |
| 4 | Rotate PDF | R1.0 | **Released** | Passed | Passed (owner report) | Passed (owner report) |
| 5 | Images to PDF | R1.0 | **Released** | Passed | Passed (owner report) | Precached |
| 6 | PDF to Images | R1.0 | **Released** | Passed | Unverified | Precached |
| 7 | Watermark PDF | R1.0 | **Released** | Passed | Unverified | Precached |
| 8 | Page Numbers | R1.0 | **Released** | Passed | Unverified | Precached |
| 9 | Crop PDF | R1.1 | **Released** | Passed | Unverified | Precached |
| 10 | Annotate PDF | R1.1 | **Released** | Passed | Unverified | Precached |
| 11 | Visual Sign PDF | R1.1 | **Released** | Passed | Unverified | Precached |
| 12 | Fill PDF Forms | R1.1 | **Released** | Passed | Unverified | Precached |
| 13 | Scan to PDF | R1.1 | **Released** | Passed (file picker; camera not testable here) | Unverified | Precached |
| 14 | PDF to Text | R1.1 | **Released** | Passed | Unverified | Precached |
| 15 | Compare PDFs | R1.2 | **Released** | Passed | Unverified | Precached |
| 16 | OCR PDF to Text | R1.2 | **Released** | Passed | Unverified | **Passed** after first use (server stopped, page reloaded, OCR ran) |
| 17 | PDF to Word | R1.3 | **Released** | Passed; .docx opened and edited in Microsoft Word | Unverified | Precached |

"Precached" means the tool's code is stored by the offline worker on the first visit. Merge and OCR were run with the server switched off; the other tools use the same cached code but were not each run offline.

## R1.1–R1.3 — evidence

**Automated tests** (`tests/text.test.ts`, `tests/edit.test.ts`, `tests/ocr.test.ts`, 28 tests; **77 of 77 passing** across the project on 2026-11-15):
- **PDF to Text / layout** (actual fidelity, as the spec asks):
  - A heading becomes a level-1 heading, and a smaller bold heading becomes level 2.
  - Two wrapped lines are joined into one paragraph. Malay text is kept exactly.
  - **Two columns are read row by row across both columns** (a known limitation).
  - **Tables become plain lines** ("Apples 3 4.50").
  - Rotated pages work. Pages with no text are flagged for OCR.
  - Damaged files are refused with a clear message.
- **PDF to Word (spec test):**
  - The output is a valid .docx (zip with `[Content_Types].xml`, `word/document.xml`, `word/styles.xml`) containing the real text, Heading1/Heading2 styles and page breaks.
  - It contains **no page images**.
  - Control characters that would break the file are removed.
- **Compare:** a deliberate change ("Price: 10" → "Price: 12") is shown as one removed and one added line. Insertions, empty sides, and very different long files (fallback) are covered.
- **Crop:**
  - Trimming 50/100/20/30 pt gives a 465×772 pt page, and other pages are unchanged.
  - Rotated pages (90°, 180°, 270°) are trimmed on the edges the user sees.
  - The text is still in the file (this is not redaction).
  - Crops that leave less than half an inch, and negative values, are refused.
- **Annotate:**
  - Text lands exactly where it was placed (top-left origin) and stays upright on pages rotated 90°, 180° and 270°.
  - Box, ellipse, highlight (multiply blend), arrow, freehand and signature image are all written.
  - The original text is untouched.
  - Empty input, missing pages and unsupported characters are refused.
- **Forms:**
  - Text, checkbox, dropdown and radio fields are listed, along with max length and read-only status.
  - Filled values read back correctly after reopening.
  - Flattening makes the values part of the page.
  - Clear errors cover: over the maximum length, an option that isn't in a non-editable list, unsupported characters, and an unknown field.
  - XFA forms are detected: "hybrid" ones are allowed with a warning, and "XFA-only" ones are refused.
- **OCR (spec test, offline language data):** a scanned image with 4 lines was read exactly, with confidence above 70%.

**Manual browser test** (built-in Chromium browser, production build, 2026-11-15, sample files from `tests/fixtures/generate.mjs`):
- **PDF to Text:** `report.pdf` gave `report.txt` with page markers, headings and paragraphs. `scanned.pdf` showed "No selectable text… use OCR" and offered no empty download.
- **PDF to Word:** reported "Selectable text found on 2 of 2 pages (about 43 words)" and the label "Editable text — formatting may change". `report.docx` was 9,853 bytes. The scanned file was refused, with a pointer to OCR and no convert button.
- **Microsoft Word check:** the same generator's output for `report.pdf` was opened in Microsoft Word on this PC through its automation interface.
  - It showed 7 paragraphs with styles Heading 1 / Normal / Normal / Heading 2 / Normal / Heading 2 / Normal, across 2 pages.
  - A paragraph was edited and the file saved and reopened.
  - **Observed fidelity:** "Total revenue…" and "Prepared by…" are two separate lines in the PDF, but they became one paragraph.
- **Compare:** `report.pdf` against `report-changed.pdf` gave "1 line only in A, 2 lines only in B" ("RM 120,000" → "RM 128,500", plus "Hire two more staff."). Both pages showed side by side, and Next moved both views together.
- **Fill Forms:** 5 fields were found. After filling name, tick box, State = Johor, Size = L and Postcode = 81300, saving and reopening in the tool, every value was intact. A PDF without fields pointed to Annotate.
- **OCR:** `scanned.pdf` took about 2.2 s and read "Delivery Note / Order number: 2026-4471 / Customer: Kedai Buku llmu / Items delivered: 12 boxes / Received in good condition." That is one error: **"Ilmu" was read as "llmu"**.
  - **Offline:** after one online run, the server was stopped. The page reloaded from the offline copy (offline worker in control) and OCR ran successfully.
  - **Bug found and fixed:** on the very first visit the offline worker wasn't yet in control, so OCR files weren't cached. It now takes control immediately (`clientsClaim`, `skipWaiting`), and this was confirmed on a fresh load.
- **Crop:** dragging the corner of the crop box updated the mm fields, and typing values moved the box. Trimming 15/30/15/20 mm (left/bottom/right/top) gave `/CropBox [42.52 85.04 552.48 785.31]` on both pages, which is exact. The "not redaction" warning is shown.
- **Annotate:** drew a box, highlight, arrow and freehand line, and placed text. The text was selected automatically after placing. Shift+→ moved it 10 pt, and Undo restored it. Clicking a mark selected it, and Delete removed it. A circle was added on page 2. The saved file had 6 marks and a multiply blend for the highlight.
- **Visual Sign:**
  - Save was disabled until a signature was placed, and an empty pad was refused.
  - A drawn signature was trimmed to 649×139 px and placed with a tap (160 pt wide), then resized to 240 pt.
  - The saved file has the signature image with transparency (SMask) and the "not a certificate-based digital signature" note.
- **Scan to PDF:** two photos were added (portrait and landscape). The landscape one was rotated and moved first, and the other was cropped by dragging two corners. The result had 2 A4 pages with images of 1200×1600 px and 840×1280 px (exactly 70% × 80%). The camera input asks for the rear camera; a real camera could not be tested here.
- **Phone width (375 px):** all nine new screens, with files loaded, showed no sideways scrolling. The home page shows all 17 tools and every category chip.

**Not yet tested:**
- R1.1–R1.3 on a real phone, including the camera in Scan to PDF, touch drawing in Annotate and Sign, and saving .docx and .txt files on iPhone.
- OCR speed and memory on low-end phones.
- Large or complex real-world PDFs: multi-column articles, forms made by other software, very long documents.
- Drag-and-drop page reordering in Organize.

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
