import './styles.css';
import './theme.css';
import { TOOLS } from './tools';
import { renderDashboard } from './ui/dashboard';
import { renderMerge } from './ui/merge';
import { renderSplit } from './ui/split';
import { renderRotate } from './ui/rotate';
import { renderOrganize } from './ui/organize';
import { renderImagesToPdf } from './ui/images-to-pdf';
import { renderPdfToImages } from './ui/pdf-to-images';
import { renderWatermark } from './ui/watermark';
import { renderPageNumbers } from './ui/page-numbers';
import { renderPdfToText, renderPdfToWord } from './ui/text-tools';
import { renderOcr } from './ui/ocr';
import { renderCompare } from './ui/compare';
import { renderCrop } from './ui/crop';
import { renderScan } from './ui/scan';
import { renderAnnotate } from './ui/annotate';
import { renderSign } from './ui/sign';
import { renderForms } from './ui/forms';
import { renderAbout } from './ui/about';
import { decorateTool } from './ui/chrome';

let undecorate: (() => void) | null = null;

const views: Record<string, (root: HTMLElement) => void> = {
  merge: renderMerge,
  split: renderSplit,
  rotate: renderRotate,
  organize: renderOrganize,
  'images-to-pdf': renderImagesToPdf,
  'pdf-to-images': renderPdfToImages,
  watermark: renderWatermark,
  'page-numbers': renderPageNumbers,
  crop: renderCrop,
  annotate: renderAnnotate,
  sign: renderSign,
  forms: renderForms,
  scan: renderScan,
  'pdf-to-text': renderPdfToText,
  compare: renderCompare,
  ocr: renderOcr,
  'pdf-to-word': renderPdfToWord,
};

function route() {
  const main = document.getElementById('main')!;
  undecorate?.();
  undecorate = null;
  main.replaceChildren();
  const id = location.hash.replace(/^#\/?/, '');
  const tool = TOOLS.find((t) => t.id === id && t.released);
  if (id === 'about') {
    document.title = 'About · PageDock Free';
    renderAbout(main);
    main.focus();
  } else if (tool && views[tool.id]) {
    document.title = `${tool.name} · PageDock Free`;
    views[tool.id](main);
    undecorate = decorateTool(main, tool);
    main.focus();
  } else {
    document.title = 'PageDock Free';
    renderDashboard(main);
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
route();
