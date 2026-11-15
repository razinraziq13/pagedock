# CLAUDE MASTER BUILD PROMPT — PAGEDOCK FREE V5
## Technology-neutral: research, decide, implement, verify

You are my **lead software architect, PDF-engine researcher, UI/UX designer, cross-platform application developer, licensing reviewer and QA lead**.

I want you to **build the actual PageDock Free application**, not merely describe it or design mockups.

## Start here

Read the attached **`PageDock_Technology_Neutral_Product_Spec_V5.md`** in full. It is the authoritative specification and **replaces all previous PageDock V1–V4 plans**. Keep the complete functional, design, privacy, cost, platform, test and delivery requirements.

**CRITICAL: YOU ARE RESPONSIBLE FOR CHOOSING THE TECHNOLOGY.** The planning document intentionally does not specify a language, framework, desktop wrapper, PDF engine, OCR implementation, DOCX generator, installer builder, test framework, or hosting service. **Research the available free technologies and choose independently.** Do not automatically inherit technology choices from earlier conversations or drafts.

## Product deliverables

1. An installable **Windows setup `.exe`** supporting Windows 10 22H2 x64 and Windows 11 x64, subject to documented testing.
2. An **installable iOS and Android PWA**, responsive and usable offline after the necessary files are cached.
3. **Free, private, local document processing**: no document upload, paid APIs, accounts, subscription, metered cloud services, or feature paywalls.
4. A distinctive, accessible PageDock design inspired by the convenience of all-in-one PDF utilities but **not copied** from another app's branding or interface.
5. **17 planned tools** built in tested stages, with genuinely editable PDF-to-Word output included at the final stage.

### Scope and order

**R1.0 — eight tools, first:** Merge PDF; Split PDF; Organize PDF; Rotate PDF; Images to PDF; PDF to Images; Watermark PDF; Page Numbers.

**R1.1 — six more:** Crop PDF; Annotate PDF; Visual Sign PDF; Fill PDF Forms; Scan to PDF; PDF to Text.

**R1.2 — two more:** Compare PDFs; OCR PDF to Text.

**R1.3 — one more:** PDF to Word (`.docx`) producing **real editable text** on Windows and mobile. An enhanced Windows-only layout mode is optional and may be included only if its implementation and redistribution are legally compliant, genuinely free, reliable and tested.

Do **not** implement excluded features or advertise them as working. Do not create pretend controls, dummy files, decorative conversion buttons or untested downloads.

## Phase 0 — choose the engineering approach yourself

Before coding, **investigate and compare workable technologies** against the actual requirements. Seek trustworthy up-to-date documentation and licensing information when available. Produce **`TECHNOLOGY_DECISIONS.md`** containing:

- At least two plausible Windows desktop app + `.exe` installer architectures, with a reasoned recommendation.
- A concrete strategy for a home-screen-installable iOS/Android PWA, offline operation, local files and downloading outputs.
- A tool-by-tool processing approach for all 17 features, including how to produce valid PDF files, images, TXT, and truly editable DOCX files.
- A plan for handling OCR, thumbnails, memory management, PDF input validation and difficult document types.
- Which parts will be shared across Windows and mobile, which might require platform-specific engines, and why.
- An assessment of actual costs and **each important dependency's license, distribution obligations, maintenance and browser/OS compatibility**. Do not assume a package is free to redistribute because it can be downloaded for free.
- An explanation of risks, limitations, tradeoffs, fallback plans and the estimated complexity of the stages.
- Links and verification dates for important technical claims. **If you cannot browse or verify, be transparent rather than inventing sources or package capabilities.**

**Make and document the technical decision yourself.** Do not ask me to pick a framework or library unless an unavoidable product/business decision requires my input. Don't let an old tech stack override the requirements.

## Must-have product behavior

Every published tool should follow this usable workflow:

1. Select local file(s).
2. Show relevant file information and preview where appropriate.
3. Configure and validate settings.
4. Perform actual local processing with useful progress/errors.
5. Save/download a real result; reopen and independently verify it.

Keep source files intact. Handle damaged, protected, unsupported or unusually large PDFs gracefully. On touch devices offer alternatives to drag-and-drop. Test camera/file picker and download/save/share behavior rather than assuming they work everywhere.

User-facing claims must be accurate:
- Crop is **not** redaction.
- Visual signatures are **not** certificate-backed digital signatures.
- Annotations are **not** full editing/reflow of original text.
- OCR-to-Text is **not** automatically searchable PDF creation.
- PDF-to-Word creates **editable text**, not full-page screenshots placed inside a Word document; formatting may differ from the source.

## Design requirements

Create an original premium-quality **free** interface with PageDock branding, a clean blue-and-teal light visual direction, readable mobile typography, responsive tool cards, sensible icons, category filtering and search. Include a clear tool workspace, loading/errors, accessible keyboard and touch controls and effective result download. Preserve the detailed design direction and wireframes from the V5 specification, but you are free to choose how to implement them.

**Only enable features after testing their real input → processing → output workflow.** If 17 functions cannot all be completed in one development pass, ship the functional subset and track the remaining tools internally; never suggest that a tool is complete because its card exists.

## Implementation order

**Stage A — Foundation:** Set up the chosen project and developer workflow. Build reusable navigation, local file handling, rendering/preview where required, output/save behavior, feature availability tracking, error handling and representative test fixtures.

**Stage B — First working tool:** Implement **Merge PDF** end to end. Test with known page counts and page order. Export and reopen the result using a different reader or validator. Report actual commands run and results.

**Stage C — Finish R1.0:** Build the remaining seven tools one at a time. Each must have a functional UI, real processing, input validation, download/save, fixture-based tests and an explicit per-platform status.

**Stage D — Distribution:** Create and verify a real Windows setup `.exe` on a suitable build environment. Create the installable mobile PWA, verify offline use and exported files on target browsers/devices where available. If platform testing is not possible in your environment, explain exactly what is unverified and supply reproducible manual test steps.

**Stage E — R1.1, R1.2, R1.3:** Add the six editing/capture features, then comparison and OCR, and finally PDF-to-Word. For PDF-to-Word, prioritize accurate **editable text conversion on all supported platforms**; only provide an enhanced Windows layout mode if it passes legal review, real output-quality tests and installer verification.

Never skip ahead to implement decorative copies of later features while the core eight tools are unfinished.

## Non-negotiable testing and legal gates

- No paid API, mandatory subscription, hidden server conversion or external document upload.
- Only free/open-source components whose licenses and redistribution conditions have been actually checked and satisfied. An uncertain optional component must **not** be shipped.
- Unit/integration tests for processing correctness; a clear manual cross-platform QA checklist.
- Valid files produced and reopened; expected page count/order, image output, text and DOCX editability verified.
- PWA tested after initial caching with networking disconnected.
- Windows installer really built, installed and tested, or clearly reported **not built / not verified**.
- Clear privacy communication. No claim that user files stay local unless confirmed by architecture and tests.
- No fictional build logs, screenshots, filenames, download paths, test passes, or compatibility claims.

## Required project documents

- `TECHNOLOGY_DECISIONS.md` — independent research, selected technology and tradeoffs.
- `TOOL_STATUS.md` — the 17 planned tools, implemented state, supported platforms, real test evidence and limits.
- `THIRD_PARTY_NOTICES.md` — actual package licenses and notices.
- `README.md` — setup, development, testing, Windows `.exe` building, PWA deployment, install steps and troubleshooting.
- Tests, fixtures, reproducible build configuration and any genuine generated artifacts.

## How to report progress

After each stage, provide a concise factual summary of:
- files created/changed;
- commands actually executed and their outputs;
- features fully implemented and verified;
- tests passed/failed and untested platform behaviors;
- licenses or compatibility risks;
- next development milestone.

**Begin by reviewing the V5 specification, conducting your own technology selection, creating `TECHNOLOGY_DECISIONS.md`, and implementing the project foundation plus a genuinely working Merge PDF tool. Continue toward the eight-tool R1.0 and both delivery formats. Do not stop at a plan or a static mockup.**
