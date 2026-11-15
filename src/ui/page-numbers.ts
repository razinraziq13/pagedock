import { parsePageRanges } from '../core/pages';
import { addPageNumbers, type NumberFormat, type NumberPosition, type PageNumberOptions } from '../core/stamp';
import { announce, h } from './dom';
import { errorPanel, resultPanel, singlePdfPicker, toolHeader, withBusy, type LoadedPdf } from './common';
import { livePreview } from './live-preview';

export function renderPageNumbers(root: HTMLElement) {
  let pdf: LoadedPdf | null = null;

  const position = h('select', { id: 'pn-pos', class: 'text-input' },
    h('option', { value: 'bottom-center' }, 'Bottom centre'), h('option', { value: 'bottom-right' }, 'Bottom right'), h('option', { value: 'bottom-left' }, 'Bottom left'),
    h('option', { value: 'top-center' }, 'Top centre'), h('option', { value: 'top-right' }, 'Top right'), h('option', { value: 'top-left' }, 'Top left'),
  );
  const format = h('select', { id: 'pn-format', class: 'text-input' },
    h('option', { value: 'n' }, '1'), h('option', { value: 'page-n' }, 'Page 1'), h('option', { value: 'n-of-total' }, '1 / 10'), h('option', { value: 'page-n-of-total' }, 'Page 1 of 10'),
  );
  const start = h('input', { type: 'number', id: 'pn-start', class: 'text-input', min: '0', max: '99999', step: '1', value: '1', inputmode: 'numeric' });
  const pages = h('input', { type: 'text', id: 'pn-pages', class: 'text-input', inputmode: 'numeric', autocomplete: 'off', placeholder: 'All pages' });
  const pagesHint = h('p', { class: 'hint', id: 'pn-pages-hint' }, 'Leave empty for all pages. Use "2-" to skip a cover page.');
  const size = h('select', { id: 'pn-size', class: 'text-input' }, h('option', { value: '9' }, 'Small'), h('option', { value: '12', selected: true }, 'Normal'), h('option', { value: '16' }, 'Large'));
  const margin = h('select', { id: 'pn-margin', class: 'text-input' }, h('option', { value: '18' }, 'Close to edge'), h('option', { value: '28', selected: true }, 'Normal'), h('option', { value: '48' }, 'Further in'));
  const runBtn = h('button', { type: 'button', class: 'btn primary big' }, 'Add page numbers');
  const result = h('div', { class: 'result' });
  pages.setAttribute('aria-describedby', 'pn-pages-hint');

  const options = (): PageNumberOptions => ({
    position: position.value as NumberPosition,
    format: format.value as NumberFormat,
    start: Number(start.value),
    pages: pages.value.trim() || 'all',
    fontSize: Number(size.value),
    margin: Number(margin.value),
  });

  const preview = livePreview(async () => {
    if (!pdf) return null;
    const o = options();
    const first = o.pages === 'all' ? 0 : parsePageRanges(o.pages, pdf.pages).flat().sort((a, b) => a - b)[0];
    return { bytes: await addPageNumbers(pdf, o), pageIndex: first };
  });

  function update() {
    result.replaceChildren();
    let ok = true;
    if (pdf && pages.value.trim()) {
      try { parsePageRanges(pages.value, pdf.pages); pagesHint.classList.remove('bad'); pagesHint.textContent = 'Only these pages get a number.'; }
      catch (e) { ok = false; pagesHint.textContent = (e as Error).message; pagesHint.classList.add('bad'); }
    } else {
      pagesHint.classList.remove('bad');
      pagesHint.textContent = 'Leave empty for all pages. Use "2-" to skip a cover page.';
    }
    const s = Number(start.value);
    if (!Number.isInteger(s) || s < 0 || s > 99999) ok = false;
    runBtn.disabled = !ok;
    if (ok) preview.refresh();
  }
  [position, format, size, margin].forEach((el) => el.addEventListener('change', update));
  [start, pages].forEach((el) => el.addEventListener('input', update));

  runBtn.addEventListener('click', () =>
    withBusy(runBtn, 'Adding numbers…', async () => {
      if (!pdf) return;
      try {
        const out = await addPageNumbers(pdf, options());
        result.replaceChildren(resultPanel('Your numbered PDF is ready', `${pdf.pages} pages`, out, `${pdf.name.replace(/\.pdf$/i, '')}-numbered.pdf`, 'application/pdf'));
        announce('Numbered PDF is ready to download.');
      } catch (e) {
        result.replaceChildren(errorPanel(e, 'Adding page numbers failed.'));
      }
    }),
  );

  const settings = h('div', { class: 'settings two-col', hidden: true },
    h('div', { class: 'controls' },
      h('div', { class: 'field-row' },
        h('div', { class: 'field' }, h('label', { for: 'pn-pos', class: 'field-label' }, 'Position'), position),
        h('div', { class: 'field' }, h('label', { for: 'pn-format', class: 'field-label' }, 'Style'), format),
      ),
      h('div', { class: 'field-row' },
        h('div', { class: 'field' }, h('label', { for: 'pn-start', class: 'field-label' }, 'First number'), start),
        h('div', { class: 'field' }, h('label', { for: 'pn-size', class: 'field-label' }, 'Size'), size),
      ),
      h('div', { class: 'field' }, h('label', { for: 'pn-margin', class: 'field-label' }, 'Distance from edge'), margin),
      h('div', { class: 'field' }, h('label', { for: 'pn-pages', class: 'field-label' }, 'Pages to number'), pages, pagesHint),
      runBtn,
    ),
    preview.el,
  );

  root.append(
    h('section', { class: 'tool wide' },
      ...toolHeader('Page Numbers', 'Add page numbers in the position and style you choose.'),
      singlePdfPicker('pn-file', (p) => { pdf = p; settings.hidden = false; update(); }, () => { pdf = null; settings.hidden = true; result.replaceChildren(); }),
      settings,
      result,
    ),
  );
}
