# PageDock 

Free PDF tools that stay on your device. PageDock is a website you can install as an app (a PWA) on Windows, iPhone and Android. Your files are processed in your browser and are never uploaded.

**Status:** all **19** tools are available, including the Edit PDF workspace and Edit Word. See [TOOL_STATUS.md](TOOL_STATUS.md) for what is tested on which platform.

## Video panduan

▶️ **[Tonton video panduan (Bahasa Melayu, 2:30)](docs/video/PageDock_Panduan.mp4)** — cara install di Windows, iPhone dan Android, serta cara guna (contoh: Merge PDF dan Visual Sign PDF).

## Use it

- **Website:** https://razinraziq13.github.io/pagedock/ (live once GitHub Pages has deployed)
- **Install on Windows:** open the site in Edge or Chrome, then click the install icon in the address bar.
- **Install on iPhone:** open the site in Safari, tap Share, then **Add to Home Screen**.
- **Install on Android:** open the site in Chrome, tap ⋮, then **Install app** (or **Add to Home screen**).
- **Offline:** after the first visit, every tool works with no internet. OCR downloads its reading engine (about 7 MB) the first time you use it; after that it also works offline.

## Develop

You need Node.js 22.13 or newer (24 is used for deployment).

```bash
npm install
npm run dev        # local dev server
npm test           # automated tests
npm run build      # production build into dist/
npm run preview    # serve the production build at http://localhost:4173
```

Sample PDFs for manual testing are in `tests/fixtures/`.

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml`. It tests the code, builds the site and publishes `dist/` to GitHub Pages. Hosting is free for public repositories.

## Project layout

```
src/core/      PDF processing, with no browser UI code (unit tested)
src/ui/        dashboard, tool screens, save/share helpers
src/tools.ts   the 19 tools; only released ones are shown
tests/         vitest tests and fixture PDFs
docs/          V5 product spec and build prompt
```

## Documents

- [TECHNOLOGY_DECISIONS.md](TECHNOLOGY_DECISIONS.md): technology choices and why (website-only scope change included)
- [TOOL_STATUS.md](TOOL_STATUS.md): per-tool, per-platform status and test evidence
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md): licenses of shipped packages
- [docs/](docs/): the original V5 specification and build prompt

## Troubleshooting

- **The site looks out of date after an update:** close every PageDock tab or app window and open it again. The offline copy updates itself on the next visit.
- **iPhone saves open a preview instead of saving:** use **Share / Save to Files** on the result screen.
