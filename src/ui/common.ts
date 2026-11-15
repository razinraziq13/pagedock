import { getPageCount, PdfInputError, type PdfInput } from '../core/pdf';
import { formatBytes, h } from './dom';
import { makeSaveControls } from './save';

export interface LoadedPdf extends PdfInput {
  size: number;
  pages: number;
}

const LARGE_FILE = 100 * 1024 * 1024;

/** Page header used by every tool screen. */
export function toolHeader(title: string, lead: string): HTMLElement[] {
  return [h('a', { class: 'back', href: '#/' }, '← All tools'), h('h1', {}, title), h('p', { class: 'lead' }, lead)];
}

/**
 * A "choose one PDF" area. Calls onLoad with the checked file, or shows why it can't be used.
 * The original file is only read, never changed.
 */
export function singlePdfPicker(id: string, onLoad: (pdf: LoadedPdf) => void, onClear: () => void): HTMLElement {
  const input = h('input', { type: 'file', accept: 'application/pdf,.pdf', class: 'sr-only', id });
  const drop = h('label', { class: 'drop', for: id }, h('span', { class: 'drop-title' }, 'Choose a PDF file'), h('span', { class: 'drop-sub' }, 'or drag and drop it here'));
  const info = h('div', { class: 'picked', hidden: true });
  const wrap = h('div', {}, input, drop, info);

  async function use(file: File) {
    info.hidden = false;
    info.replaceChildren(h('span', { class: 'file-meta' }, `Reading ${file.name}…`));
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      const pages = await getPageCount({ name: file.name, bytes });
      drop.hidden = true;
      info.replaceChildren(
        h('span', { class: 'file-main' },
          h('span', { class: 'file-name' }, file.name),
          h('span', { class: 'file-meta' }, `${pages} page${pages === 1 ? '' : 's'} · ${formatBytes(file.size)}${file.size > LARGE_FILE ? ' · large file, this may be slow' : ''}`),
        ),
        h('button', { type: 'button', class: 'btn', onClick: () => { drop.hidden = false; info.hidden = true; onClear(); } }, 'Choose another'),
      );
      info.className = 'picked file';
      onLoad({ name: file.name, bytes, size: file.size, pages });
    } catch (e) {
      info.className = 'picked file bad';
      info.replaceChildren(h('span', { class: 'file-meta' }, e instanceof PdfInputError ? e.message : `${file.name}: could not read this file.`));
      onClear();
    }
  }

  input.addEventListener('change', () => { if (input.files?.[0]) use(input.files[0]); input.value = ''; });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    const f = e.dataTransfer?.files[0];
    if (f) use(f);
  });
  return wrap;
}

/** The "your file is ready" panel. */
export function resultPanel(title: string, detail: string, bytes: Uint8Array, fileName: string, mime: string, note?: string): HTMLElement {
  return h('div', { class: 'done' },
    h('h2', {}, title),
    h('p', {}, `${detail} · ${formatBytes(bytes.length)}`),
    makeSaveControls(bytes, fileName, mime),
    note ? h('p', { class: 'note' }, note) : null,
  );
}

export function errorPanel(e: unknown, fallback: string): HTMLElement {
  return h('p', { class: 'error', role: 'alert' }, e instanceof Error ? e.message : fallback);
}

/** Run a processing step with the button showing progress and disabled meanwhile. */
export async function withBusy(btn: HTMLButtonElement, label: string, fn: () => Promise<void>) {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  try {
    await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
}
