# Third-party notices

The list below was taken from `package-lock.json` on 15 November 2026.

## Shipped to users (bundled into the website)

| Package | Version | License |
|---|---|---|
| @cantoo/pdf-lib | 2.11.1 | MIT |
| culori | 4.0.2 | MIT |
| fflate | 0.8.3 | MIT |
| html-entities | 2.6.0 | MIT |
| node-html-better-parser | 1.5.9 | MIT |
| tslib | 2.9.1 | 0BSD |

**What these licenses require:**
- MIT requires the copyright and license notice to be kept with the code. The full license texts are in each package's folder under `node_modules/`.
- An "Open-source licenses" page inside the app is planned before the R1.0 release. **It does not exist yet.**

## Build and test only (not shipped)

These packages are used only to build or test the site:
- vite (MIT)
- vite-plugin-pwa (MIT), which uses Workbox (MIT)
- typescript (Apache-2.0)
- vitest (MIT)
- pdfjs-dist (Apache-2.0): used in tests as an independent PDF reader; it will ship once page previews are built

`npm audit` reports 6 low/moderate advisories in glob/minimatch. These are pulled in by vite-plugin-pwa's build tooling. They run only on the developer's machine and are not included in the website.
