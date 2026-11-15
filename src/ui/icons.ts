/** Original line icons for PageDock (24×24, stroke-based). Drawn for this project; no icon set is copied. */
import type { Category } from '../tools';

const PAGE = 'M6 3h8l4 4v14H6z M14 3v4h4';
const PATHS: Record<string, string> = {
  'edit-pdf': 'M5 3h9l4 4v6 M5 3v18h7 M14 3v4h4 M14 21l1-4 5-5 3 3-5 5z',
  'edit-word': 'M4 4h16v16H4z M7 8l1.5 8 2.5-6 2.5 6L15 8 M17 8h0',
  merge: 'M4 4h7v9H4z M13 11h7v9h-7z M11 8h3a2 2 0 0 1 2 2v1 M14 9l2 2 2-2',
  split: 'M5 3h14v7H5z M5 14h14v7H5z M2 12h3 M8 12h2 M14 12h2 M19 12h3',
  organize: 'M4 4h6v7H4z M14 4h6v7h-6z M4 15h6v5H4z M14 15h6v5h-6z',
  rotate: `${PAGE} M9 15a3 3 0 1 0 3-3h-2 M10 10l-1.5 2 2 1.5`,
  'images-to-pdf': 'M3 5h12v10H3z M3 12l3-3 3 3 2-2 4 4 M12 8.5h.01 M17 9h4v12H9v-3',
  'pdf-to-images': `${PAGE} M8 16l2.5-2.5 2 2 1.5-1.5L16 16 M10 11h.01`,
  watermark: `${PAGE} M8 17l8-8 M9 11.5l1 .5 M13.5 16l.5 1`,
  'page-numbers': `${PAGE} M9 17h6 M11 12h2v5`,
  crop: 'M6 2v16h16 M2 6h16v16',
  annotate: 'M4 20h4L19 9l-4-4L4 16z M13 7l4 4 M15 20h5',
  sign: 'M3 17c3-1 4-8 6-8s0 8 2 8 3-5 5-5 1 4 3 4 M3 21h18',
  forms: 'M5 3h14v18H5z M8 8h1 M11 8h5 M8 12h1 M11 12h5 M8 16h1 M11 16h3',
  scan: 'M4 8V4h4 M16 4h4v4 M20 16v4h-4 M8 20H4v-4 M7 12h10',
  'pdf-to-text': `${PAGE} M9 12h6 M9 15h6 M9 18h4`,
  compare: 'M3 4h7v16H3z M14 4h7v16h-7z M6 9h1 M17 9h1 M6 13h1 M17 13h1 M12 2v20',
  ocr: 'M4 8V4h4 M16 4h4v4 M20 16v4h-4 M8 20H4v-4 M9 16l3-8 3 8 M10 13.5h4',
  'pdf-to-word': `${PAGE} M8 11l1.5 6 2.5-5 2.5 5L16 11`,
  about: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 11v6 M12 7h.01',
};

export function toolIcon(id: string, className = 'tool-icon'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', PATHS[id] ?? PAGE);
  svg.append(path);
  return svg;
}

/** Each category has its own accent colour (CSS class), used on cards, chips and tool headers. */
export const CATEGORY_CLASS: Record<Category, string> = {
  Organize: 'cat-violet',
  Convert: 'cat-turquoise',
  'Edit & Forms': 'cat-coral',
  'Scan & Text': 'cat-gold',
  Compare: 'cat-blue',
};
