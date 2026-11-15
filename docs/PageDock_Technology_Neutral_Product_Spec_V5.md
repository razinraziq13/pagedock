# PAGEDOCK FREE — PRODUCT SPECIFICATION V5
## Technology-neutral requirements for a Windows EXE + mobile PWA

**Date:** 15 November 2026  
**Status:** Planning document; no software or tool is claimed implemented  
**Audience:** Claude / a solo developer building the real product  
**Replaces:** All earlier PageDock specifications, including V4  
**IMPORTANT:** This document intentionally **does not prescribe any programming language, UI framework, desktop wrapper, PDF library, conversion engine, test framework, packaging system, or hosting provider.** The developer must research and select suitable free technologies, verify licenses and compatibility, and document the choices before implementation.

---

## 1. Product vision and non-negotiable constraints

Build **PageDock Free**, an original, easy-to-use PDF toolbox inspired by the *convenience* of an all-in-one PDF utility site, without cloning another company's interface, visual assets, icons, text, or branding.

**Platform deliverables:**
- **Windows:** a real installable **`.exe` setup** supporting Windows 10 22H2 x64 and Windows 11 x64. Users should not be required to install a developer toolchain or manually configure runtimes. State clearly if a prerequisite is unavoidable.
- **Mobile:** one responsive, home-screen-installable **Progressive Web App (PWA)** supporting current iOS Safari and mainstream Android browsers. It must be served over HTTPS for normal PWA deployment and work offline after the necessary resources have been installed/cached.
- Feature parity is the goal for **core tools**; clearly disclose and test any platform-specific exceptions. Share implementation where practical, but let the developer choose the architecture.

**Business and privacy rules:**
- All included PDF tools are **free to use**, with no paywalls, account, subscription, commercial API key, external conversion service, or usage-based cloud dependency.
- **Document contents stay on the device.** Do not transmit files, extracted text, scans, or signatures to an external server. The app itself may be downloaded/updated from a hosting service; user document processing must be local.
- No third-party telemetry involving documents, user-generated content, filenames, or extracted text. Do not send it to analytics or error trackers.
- Do not include runtime dependencies that defeat a promised offline workflow. Offline behavior must be tested, not merely asserted.
- Free and open-source dependencies are allowed if their licenses, transitive dependencies, maintenance, security, offline capabilities, and redistribution requirements are suitable. **Free of charge does not automatically mean legally redistributable.** If a component has conditions the developer cannot comply with, choose a different one or omit its associated optional feature.
- Do not falsely promise that hosting, code-signing certificates, a custom domain, distribution infrastructure, or every possible operating-system prerequisite is free.
- **Functionality before feature count.** Production dashboards display only tools validated end to end on their supported platform(s). No fake export buttons, pretend converters, dead cards, paid upgrades, or unsupported claims.

**Product promise:** *“Your PDFs. Your device. Your control.”*

---

## 2. Exactly 17 planned tools

Legend: **R1.0** = launch basics (8); **R1.1** = practical editing and capture (+6); **R1.2** = advanced local analysis (+2); **R1.3** = PDF-to-Word (+1). The 17 are a roadmap, **not an assertion that every feature already works**.

| # | Tool | Stage | Minimum genuinely working outcome | Limitations / safety notes |
|---:|---|---|---|---|
| 1 | **Merge PDF** | R1.0 | Select 2+ local PDFs, rearrange input order, export one PDF preserving all pages in the chosen order. | Warn if signed documents may lose signature validity. |
| 2 | **Split PDF** | R1.0 | Extract pages and ranges; export one PDF or multiple parts as a downloadable archive. | Validate ranges and prevent empty/corrupt outputs. |
| 3 | **Organize PDF** | R1.0 | Thumbnails; reorder, remove, and rotate individual pages; export revised PDF. | Accessible drag alternative and undo before save. |
| 4 | **Rotate PDF** | R1.0 | Rotate selected or all pages by 90°, 180°, 270°; save. | Preserve content, including existing page rotation. |
| 5 | **Images to PDF** | R1.0 | Import JPG/PNG, reorder, choose page size/fit/margins, export multipage PDF. | Handle phone-photo orientation and memory limits. |
| 6 | **PDF to Images** | R1.0 | Export chosen pages as JPG/PNG with resolution/quality controls; archive multi-page outputs. | Memory/performance warnings for many high-resolution pages. |
| 7 | **Watermark PDF** | R1.0 | Place text/image watermark with position, rotation, opacity, size and page selection. | Preview the actual result where feasible. |
| 8 | **Page Numbers** | R1.0 | Add visible numbering in selected location and range with adjustable starting number. | No clipped numbering; respect common page sizes. |
| 9 | **Crop PDF** | R1.1 | Visually crop page boundaries by selection/measurement, preview, and export. | **Cropping is not permanent content removal or secure redaction.** |
| 10 | **Annotate PDF** | R1.1 | Add/move/delete text overlays, arrows, shapes, highlights and freehand marks, then export. | **Not** guaranteed editing or reflow of the original text. |
| 11 | **Visual Sign PDF** | R1.1 | Draw, type or import a signature appearance and place it on a page. | **Not** certificate-backed electronic/digital signing. |
| 12 | **Fill PDF Forms** | R1.1 | Detect and fill common compatible text/checkbox/dropdown form fields; export. | Unsupported dynamic or special forms must be identified. |
| 13 | **Scan to PDF** | R1.1 | Capture or select photos, crop/rotate/reorder, export one PDF. | Camera support varies; always provide photo/file-picker fallback. |
| 14 | **PDF to Text** | R1.1 | Extract selectable PDF text, preview/copy it, export `.txt`. | Image-only PDFs need OCR; reading order may vary. |
| 15 | **Compare PDFs** | R1.2 | Side-by-side page view and a basic text difference display when readable text exists. | Do not claim complete semantic or pixel-perfect comparison. |
| 16 | **OCR PDF to Text** | R1.2 | Recognize text from scanned PDF pages **locally**, let user review/copy, export editable `.txt`. | Accuracy varies; multilingual recognition and offline assets must be tested. Do **not** advertise a searchable PDF output unless it is actually built and validated. |
| 17 | **PDF to Word (DOCX)** | R1.3 | Convert a text-based PDF into a real `.docx` containing **selectable, editable text**, not just page screenshots, without paid API or server upload. | Simple formatting/layout is the minimum; optional improved layout preservation on Windows only if freely redistributable, reliable, and packaged properly. |

### Release totals
- **R1.0:** 8 working tools.
- **R1.1:** 14 working tools total.
- **R1.2:** 16 working tools total.
- **R1.3:** 17 working tools total, including PDF-to-Word.

The developer may change engineering implementation order when justified, **not** silently omit a listed feature. A feature whose success criteria cannot be achieved with validated free technology remains **unavailable**, and the developer explains the blocker and proposes a feasible alternate implementation. A demo or decorative screen is not an acceptable substitute.

### Intentionally excluded from V5 scope
Do not create cards or promises for: Word to PDF; PDF to/from PowerPoint or Excel; HTML to PDF; PDF to Markdown; unlock/protect PDF; permanent redaction; compression; repair; PDF/A; AI summarization; translation; or workflow automation. Some are feasible using free tools in particular environments; they are excluded from this **specific release scope**, not declared impossible.

---

## 3. PDF-to-Word detailed functional requirements

This is a required planned feature, **not** a paid/cloud service and **not** an image-only DOCX wrapper.

### Basic editable-text conversion — expected on Windows, iOS, Android
1. User chooses a local text-based `.pdf`. Display filename, size, page count and whether useful selectable text appears present.
2. Analyze document content and reconstruct meaningful reading order, paragraphs and page breaks as accurately as a free, offline-capable solution permits.
3. Create a standards-compliant `.docx` with real editable text. Preserve basic headings/line breaks when supported and tested.
4. Save/export to the user's device. Offer platform-appropriate alternatives when downloads or sharing are restricted.
5. Explicitly label the result **“Editable text — formatting may change.”** Do not promise tables, columns, fonts, image placement, or pixel-identical layout until verified.
6. If a PDF consists only of scanned images, explain that OCR is required and do not output an empty document or document made only of page screenshots claiming editable conversion.
7. Process locally, including when offline after the app is fully installed/cached.

### Optional enhanced conversion mode
- Research whether a **free, legally redistributable, locally executable** solution can provide better layout and tables.
- If it passes actual document tests, license review, packaging and clean-install verification, it may be exposed as **“Preserve layout (best effort)”** on Windows.
- The Windows installer must contain all required eligible components or clearly documented unavoidable prerequisites; normal users must not need to install a developer environment.
- Do **not** expose this optional mode in the mobile PWA unless a real device-compatible local implementation is demonstrated.
- Never silently fall back to paid conversion, remote uploading, unlicensed binaries, or a feature that merely embeds page images.

### PDF-to-Word acceptance tests
- Two-page text PDF yields a `.docx` containing the correct substantive text in roughly the correct order; reopen it in a genuine DOCX editor and edit a paragraph.
- Test an ordinary heading, paragraphs, Malay/Unicode characters, multi-column text and a sample table; document actual fidelity, not expected fidelity.
- Handle image-only, encrypted, malformed, very large, empty-text and canceled input safely.
- Validate output file format and independent-opening behavior; do not equate “download finished” with “valid Word file.”
- Record separately whether the feature passed on Windows, iOS PWA and Android PWA. If one platform fails, do not present it as supported there.

---

## 4. Product design and user experience

**Working brand:** PageDock Free. Check trademark/domain before publishing. No copying of another service's graphics, interface geometry, icon set, wording or code. Keep the interface clean, reassuring and more usable than a dense “32-card” dashboard.

### Visual direction
- Color: light background, white cards, clear blue primary actions, restrained teal accents. Accessible contrast and consistent hover/focus states. Optional dark mode after first release.
- Typography: clear system font or appropriately licensed bundled font, readable on small phones.
- Cards: recognizable category icon, name, one-line benefit, clear input requirements; show only tested available tools.
- Desktop: centered content; responsive grid (typically 3–4 columns when wide) with category filters and search.
- Mobile: usually 1–2 legible columns, comfortable tap targets and stacked processing controls.
- Avoid busy ads, sign-in barriers, “premium” labels, fake progress, intrusive popups and repetitive marketing copy.
- Accessibility: keyboard navigation, screen-reader labels, focus indicators, usable form controls, sufficient contrast, touch alternatives to drag-and-drop.

### Suggested light theme palette (design direction, not framework instructions)
| Role | Color |
|---|---|
| Background | `#F6F8FC` |
| Card | `#FFFFFF` |
| Primary | `#3267E8` |
| Accent | `#14B8A6` |
| Main text | `#17243B` |
| Secondary text | `#62718B` |
| Border | `#DDE5F0` |
| Error | `#C93A52` |

### Home dashboard
- Original logo/wordmark and product identity; small privacy/offline status indicator with truthful wording.
- Intro: **“Free PDF tools that stay on your device.”**
- Search by tool name and use case; category chips: **All, Organize, Convert, Edit & Forms, Scan & Text, Compare**.
- Tools grouped by purpose; optional “recently used” data only if stored locally and with the user's consent.
- Incomplete features remain **out of the released dashboard**, though internally tracked in the project roadmap.
- Settings/help area for privacy, usage guidance, license notices, troubleshooting and version.

### Desktop concept
```text
┌────────────────────────────────────────────────────────────────────────┐
│ PageDock       [ Search PDF tools...                 ]    Local / Help │
├────────────────────────────────────────────────────────────────────────┤
│ Free PDF tools that stay on your device                                │
│ [All] [Organize] [Convert] [Edit & Forms] [Scan & Text] [Compare]        │
│                                                                        │
│ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐               │
│ │ Merge PDF      │ │ Split PDF      │ │ Organize PDF   │               │
│ │ Combine files  │ │ Extract pages  │ │ Arrange pages  │               │
│ └────────────────┘ └────────────────┘ └────────────────┘               │
└────────────────────────────────────────────────────────────────────────┘
```

### Mobile concept
```text
┌─────────────────────────────┐
│ PageDock              Help  │
│ Free. Private. On-device.   │
│ [ Search tools...         ] │
│ [All] [Organize] [Convert]  │
│ ┌─────────────┬───────────┐ │
│ │ Merge PDF   │ Split PDF │ │
│ ├─────────────┼───────────┤ │
│ │ Organize    │ Rotate    │ │
│ └─────────────┴───────────┘ │
│ Home                About   │
└─────────────────────────────┘
```

### Standard workflow for every tool
1. **Choose:** local file(s), with drag/drop where supported and normal file selection on every device.
2. **Review:** selected names, types, sizes, page count (where relevant), reorder/remove controls.
3. **Configure:** only tool-specific settings; default values should make sense. Show preview for visual operations.
4. **Process:** enabled only for valid inputs; honest progress, cancel when practical, and informative errors.
5. **Export:** verified result, download/save, optional share where supported, reset/new task.

An error must never corrupt or overwrite an original. Handle unsupported input, encrypted PDFs, malformed pages, large files, out-of-range page requests, low memory, failed downloads and user cancellation. Do not attempt to bypass encryption. On mobile, document and test actual Files/save/share behavior instead of assuming desktop-style filesystem access.

---

## 5. Architecture selection — Claude decides

**Do not prescribe implementation technology at planning time.** Claude must research and propose the actual languages, UI approach, PDF processors, image/text conversion methods, document-generation method, offline delivery, Windows packaging, testing strategy and deployment method.

The resulting architecture must satisfy the following *outcomes*, regardless of chosen tools:

1. **Windows deliverable:** installable `.exe` setup, launchable PDF UI, local processing and tested save/open workflow on the supported Windows versions.
2. **Mobile deliverable:** HTTPS-installable iOS/Android PWA, responsive UI, required offline files cached, meaningful offline behavior, reliable mobile export workflow.
3. **Maintainability:** share UI/business logic where sensible; avoid multiple diverging copies of the same algorithms unless platform constraints require them. Explain tradeoffs.
4. **No paid processing:** there is no per-document service charge or cloud API. Offline document processing is mandatory.
5. **Performance:** do not load all pages at full resolution by default; prevent avoidable memory leaks and frozen screens; show warnings for very large inputs and handle failure gracefully.
6. **Privacy/security:** no content uploads, analytics collection of documents, unsafe execution of PDF-embedded content, untrusted filename injection or unnecessary filesystem privileges. Sanitize filenames and treat PDF contents as untrusted.
7. **Legal compatibility:** dependencies must permit the intended redistribution under an explicit license compliance plan, including transitive components and notices.
8. **Honest capability claims:** an engine that only extracts text is not a high-fidelity layout converter; a visual overlay is not redaction; a scan-to-text tool is not automatically searchable-PDF generation.

### Required technology-selection research deliverable
Before starting implementation, Claude must provide a short **TECHNOLOGY_DECISIONS.md** containing:
- At least **two viable architectural candidates** for Windows desktop packaging and a reasoned comparison.
- One proposed way to support the installable mobile PWA with offline processing and exporting.
- A feature-to-processing-method matrix for all 17 tools, distinguishing browser-compatible processing from optional Windows-only approaches.
- For any candidate package/engine: available license, whether use and redistribution are free, project maintenance status, operating-system/browser support, offline feasibility, likely memory/quality limitations and relevant official documentation.
- A recommended design with tradeoffs and any feature whose implementation is uncertain.
- Source links and verification dates for important claims. **If web research is unavailable, explicitly say so, rely only on verified local package information and flag open questions rather than fabricating verification.**

Claude should then choose the best fitting technologies independently and implement them. The chosen technology **must not weaken product requirements without a documented reason**, and a paid API is never an acceptable substitute.

---

## 6. Milestones and objective QA

### Foundation — before calling any feature complete
- Set up the selected project architecture, responsive UI, accessible navigation, tool availability tracking, input/output handling and test fixtures.
- Prepare known PDFs: 1/2/3-page documents, mixed page dimensions, varied rotations, text, images, compatible form fields, scanned pages and deliberately broken samples.
- Implement merge completely before opening additional tool cards to ordinary users.

### Release 1.0 tests — eight essential tools
| Tool | Minimum verification |
|---|---|
| Merge | Input PDFs with known 2+1+3 pages produce six correctly ordered pages and retain recognizable page labels. |
| Split | Extract `1,3-5` from a five-page fixture; verify four pages and reject invalid ranges. |
| Organize | Reorder `[1,2,3]` to `[3,1]`, remove one page and rotate another; reopen and verify order/content. |
| Rotate | 90°, 180°, 270° across selected pages without losing content. |
| Images to PDF | Multipage PDF opens, contains correct image count/order, respects selected page size/orientation. |
| PDF to Images | Exported JPG/PNG images open, dimensions match requested settings and multi-page archive opens. |
| Watermark | Marks appear on selected pages with expected placement/opacity; unselected pages unaffected. |
| Page Numbers | Numbered pages have correct starting number, placement and no clipping. |

### Release 1.1 tests — six practical tools
- **Crop:** re-opened PDF reflects crop selection and warns it does not remove hidden content.
- **Annotate:** added elements remain correctly placed after export; no claim of editing original text.
- **Visual Sign:** drawn/typed/image signature persists as a visible mark; clearly described as non-certified.
- **Fill Forms:** fill and export standard text/checkbox/dropdown fields; unsupported form errors are actionable.
- **Scan to PDF:** import/capture multiple photos, reorder/rotate/crop, export valid PDF; test camera fallback.
- **PDF to Text:** selectable text extracted into readable TXT; scanned input clearly flagged.

### Release 1.2 tests — two advanced tools
- **Compare:** synchronize two documents' pages; identify a deliberate text change and explain comparison limits.
- **OCR PDF to Text:** use actual scanned samples, test progress, result editing and TXT export. Test offline language assets and low-memory device behavior. Start with English; add other languages only after verified.

### Release 1.3 tests — one conversion tool
- **PDF to Word:** valid `.docx` opens in an independent editor and contains editable PDF text; handle scanned PDFs honestly. Any optional Windows enhanced mode needs separate quality, licensing and install tests.

### Release gates (every applicable platform)
- Each exposed tool is fully executable: select file → configure → process → export → independently open/check result.
- Automated tests prove key operations; real-device/manual tests record browser and OS version, and known limitations.
- Original inputs are unchanged; errors and cancellation do not silently create bogus output.
- Cached PWA opens and performs the relevant offline operations after disconnecting internet. Initial download may require connectivity.
- Windows setup `.exe` actually builds, installs, launches, completes processing and uninstalls on a supported Windows system. If the environment cannot build it, state that and provide reproducible project/build instructions; never pretend the executable exists.
- iPhone and Android tests cover file picking, image/photo capture where supported, generated downloads, share/save fallback and reopened outputs. Mark any untested behavior **unverified**.
- Supply license notices, privacy statement, setup documentation, test evidence and a per-tool, per-platform status report.

---

## 7. Platform details and deployment expectations

### Windows
- Support Windows 10 22H2 x64 and Windows 11 x64 (within practical compatibility constraints confirmed by testing).
- Provide a standard setup `.exe`, not only source code or an unpackaged web app. An installer is acceptable; a portable executable is not required.
- Choose installer/packaging tools during research. End-users should not need to install a development environment.
- Explain any system prerequisite, unsigned executable warnings, and code-signing limitations accurately. Windows 10 has passed normal support; do not imply it receives standard security updates indefinitely.

### iOS/Android
- PWA install from HTTPS with appropriate metadata/icons and stand-alone home-screen experience where supported.
- Offline app availability after initial install/visit and caching, using only appropriate locally available processing assets.
- Document platform-specific install instructions, particularly Add to Home Screen on iOS. Handle browser-dependent camera and file save/share behavior.
- Respect phone memory constraints; do not promise unlimited page counts or file sizes.

### Costs
- Features are free at point of use. Optional hosting tiers, domains, distribution, signing and unusual operating-system prerequisites can incur costs; tell the user about them rather than misrepresenting them.
- Do not use a free trial of a paid processing API, even temporarily, as core functionality.

---

## 8. Project outputs and handoff

Claude should deliver:
1. A real source-code project with a clear folder structure.
2. **TECHNOLOGY_DECISIONS.md** — independently researched choices, evidence, tradeoffs and licensing assessment.
3. **TOOL_STATUS.md** — all 17 features with status and per-platform test evidence; no unsupported claims.
4. **THIRD_PARTY_NOTICES.md** — actual dependencies/license obligations after inspection.
5. **README.md** — installation, development, testing, packaging Windows `.exe`, deploying PWA, offline behavior and troubleshooting.
6. Feature tests and test fixtures, plus a reproducible verification checklist for Windows, iOS and Android.
7. Working installers / deployed PWA only **where successfully built and verified**. Otherwise provide buildable sources and clear, truthful blockers.

**Handoff sequence:** research and choose technologies → set up project → implement/test Merge → implement/test eight R1.0 tools → validate Windows + mobile distribution → expand to R1.1 → R1.2 → R1.3 PDF-to-Word. Report actual results after each stage. Do not stop at static mockups.

**Status reminder:** This is a build plan, not a claim that PageDock or its 17 tools already exist.
