import { extractPageText } from '../core/pdftext';
import { buildLayout, layoutToText, type Layout } from '../core/textlayout';
import { sanitizeFileName } from '../core/pdf';
import { announce, h } from './dom';
import { errorPanel, resultPanel, singlePdfPicker, toolHeader, type LoadedPdf } from './common';
import { pdfjs, pdfjsAssets } from './thumbs';

export async function readLayout(pdf: LoadedPdf, onPage: (d: number, t: number) => void, alive: () => boolean): Promise<Layout> {
  const lib = await pdfjs();
  const pages = await extractPageText(lib as any, pdf.bytes, pdfjsAssets(), onPage, alive);
  return buildLayout(pages);
}

const baseName = (n: string) => sanitizeFileName(n.replace(/\.pdf$/i, ''), 'document');

function scannedNote(layout: Layout, total: number): HTMLElement | null {
  if (!layout.emptyPages.length) return null;
  const all = layout.emptyPages.length === total;
  return h('p', { class: all ? 'error' : 'hint warn', role: all ? 'alert' : undefined },
    all
      ? 'No selectable text was found. This looks like a scanned PDF (pictures of pages). '
      : `Pages ${layout.emptyPages.map((i) => i + 1).join(', ')} have no selectable text (probably scanned). `,
    'Use ', h('a', { href: '#/ocr' }, 'OCR PDF to Text'), ' to read text from scanned pages.');
}

// ------------------------------------------------------------------ PDF to Text

export function renderPdfToText(root: HTMLElement) {
  let pdf: LoadedPdf | null = null;
  let alive = true;
  const status = h('p', { class: 'hint', role: 'status' });
  const out = h('div', {});

  async function run(p: LoadedPdf) {
    out.replaceChildren();
    alive = true;
    const cancel = h('button', { type: 'button', class: 'btn', onClick: () => { alive = false; } }, 'Cancel');
    out.append(cancel);
    try {
      const layout = await readLayout(p, (d, t) => { status.textContent = `Reading page ${d} of ${t}…`; }, () => alive);
      status.textContent = '';
      const text = layoutToText(layout);
      const area = h('textarea', { class: 'text-out', rows: '16', 'aria-label': 'Extracted text (you can edit it before saving)' });
      area.value = layout.emptyPages.length === p.pages ? '' : text;
      const copyBtn = h('button', { type: 'button', class: 'btn', onClick: async () => {
        try { await navigator.clipboard.writeText(area.value); copyBtn.textContent = 'Copied'; } catch { area.select(); copyBtn.textContent = 'Press Ctrl+C / ⌘C to copy'; }
      } }, 'Copy text');
      const saveRow = h('div', {});
      const save = () => saveRow.replaceChildren(resultPanel('Text file ready', `${area.value.length.toLocaleString()} characters`, new TextEncoder().encode(area.value), `${baseName(p.name)}.txt`, 'text/plain;charset=utf-8',
        'Reading order can differ from the original on multi-column pages and tables.'));
      area.addEventListener('input', () => saveRow.replaceChildren(h('button', { type: 'button', class: 'btn primary', onClick: save }, 'Update text file')));
      out.replaceChildren(...[scannedNote(layout, p.pages), area, h('div', { class: 'row' }, copyBtn), saveRow].filter(Boolean) as HTMLElement[]);
      if (area.value) save();
      announce('Text extracted.');
    } catch (e) {
      status.textContent = '';
      out.replaceChildren(errorPanel(e, 'Reading the text failed.'));
    }
  }

  root.append(h('section', { class: 'tool' },
    ...toolHeader('PDF to Text', 'Copy out the text of a PDF, or save it as a .txt file.'),
    singlePdfPicker('p2t-file', (p) => { pdf = p; run(p); }, () => { pdf = null; alive = false; out.replaceChildren(); status.textContent = ''; }),
    status, out,
  ));
  void pdf;
}

// ------------------------------------------------------------------ PDF to Word

export function renderPdfToWord(root: HTMLElement) {
  let alive = true;
  const status = h('p', { class: 'hint', role: 'status' });
  const out = h('div', {});

  async function analyse(p: LoadedPdf) {
    out.replaceChildren();
    alive = true;
    try {
      const layout = await readLayout(p, (d, t) => { status.textContent = `Checking page ${d} of ${t}…`; }, () => alive);
      status.textContent = '';
      const textPages = p.pages - layout.emptyPages.length;
      const words = layout.pages.flatMap((pg) => pg.paragraphs).reduce((n, para) => n + para.text.split(/\s+/).filter(Boolean).length, 0);
      const info = h('p', { class: 'hint' }, `Selectable text found on ${textPages} of ${p.pages} page${p.pages === 1 ? '' : 's'} (about ${words.toLocaleString()} words).`);
      if (textPages === 0) {
        out.replaceChildren(info, scannedNote(layout, p.pages)!);
        return;
      }
      const btn = h('button', { type: 'button', class: 'btn primary big' }, 'Convert to Word');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Converting…';
        try {
          const { layoutToDocx } = await import('../core/docx');
          const docx = await layoutToDocx(layout, p.name.replace(/\.pdf$/i, ''));
          out.querySelector('.result')?.replaceChildren(resultPanel('Your Word file is ready', 'Editable text — formatting may change', docx, `${baseName(p.name)}.docx`,
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Text, paragraphs, larger headings and page breaks are kept. Tables, columns, fonts, colours and images are not.'));
          announce('Word file is ready to download.');
        } catch (e) {
          out.querySelector('.result')?.replaceChildren(errorPanel(e, 'Converting failed.'));
        } finally {
          btn.disabled = false;
          btn.textContent = 'Convert to Word';
        }
      });
      out.replaceChildren(...[info, scannedNote(layout, p.pages), h('p', { class: 'badge-note' }, 'Editable text — formatting may change.'), btn, h('div', { class: 'result' })].filter(Boolean) as HTMLElement[]);
    } catch (e) {
      status.textContent = '';
      out.replaceChildren(errorPanel(e, 'Reading the PDF failed.'));
    }
  }

  root.append(h('section', { class: 'tool' },
    ...toolHeader('PDF to Word', 'Turn a text-based PDF into a Word (.docx) file you can edit.'),
    singlePdfPicker('p2w-file', (p) => analyse(p), () => { alive = false; out.replaceChildren(); status.textContent = ''; }),
    status, out,
  ));
}
