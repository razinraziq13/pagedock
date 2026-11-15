import { parsePageRanges, splitPdf, zipFiles } from '../core/pages';
import { announce, h } from './dom';
import { errorPanel, resultPanel, singlePdfPicker, toolHeader, withBusy, type LoadedPdf } from './common';

export function renderSplit(root: HTMLElement) {
  let pdf: LoadedPdf | null = null;

  const ranges = h('input', { type: 'text', id: 'split-ranges', class: 'text-input', inputmode: 'numeric', autocomplete: 'off', placeholder: 'e.g. 1,3-5' });
  const hint = h('p', { class: 'hint', id: 'split-hint' });
  const modeSingle = h('input', { type: 'radio', name: 'split-mode', value: 'single', checked: true });
  const modeEach = h('input', { type: 'radio', name: 'split-mode', value: 'perRange' });
  const runBtn = h('button', { type: 'button', class: 'btn primary big' }, 'Split PDF');
  const result = h('div', { class: 'result' });
  const settings = h('div', { class: 'settings', hidden: true },
    h('label', { for: 'split-ranges', class: 'field-label' }, 'Pages to extract'),
    ranges,
    hint,
    h('fieldset', { class: 'radios' },
      h('legend', { class: 'field-label' }, 'Output'),
      h('label', { class: 'radio' }, modeSingle, ' One PDF with all these pages'),
      h('label', { class: 'radio' }, modeEach, ' A separate PDF for each range (downloaded as a .zip)'),
    ),
    runBtn,
  );
  ranges.setAttribute('aria-describedby', 'split-hint');

  function validate() {
    result.replaceChildren();
    if (!pdf) return;
    try {
      const groups = parsePageRanges(ranges.value, pdf.pages);
      const n = groups.flat().length;
      hint.textContent = `${n} page${n === 1 ? '' : 's'} in ${groups.length} range${groups.length === 1 ? '' : 's'}. The document has ${pdf.pages} pages.`;
      hint.classList.remove('bad');
      runBtn.disabled = false;
    } catch (e) {
      hint.textContent = (e as Error).message;
      hint.classList.add('bad');
      runBtn.disabled = true;
    }
  }
  ranges.addEventListener('input', validate);

  runBtn.addEventListener('click', () =>
    withBusy(runBtn, 'Splitting…', async () => {
      if (!pdf) return;
      result.replaceChildren();
      try {
        const mode = modeEach.checked ? 'perRange' : 'single';
        const outs = await splitPdf(pdf, ranges.value, mode);
        if (outs.length === 1) {
          result.append(resultPanel('Your PDF is ready', `${parsePageRanges(ranges.value, pdf.pages).flat().length} pages`, outs[0].bytes, outs[0].name, 'application/pdf'));
        } else {
          const zip = zipFiles(outs);
          result.append(resultPanel('Your files are ready', `${outs.length} PDFs in a .zip`, zip, `${pdf.name.replace(/\.pdf$/i, '')}-split.zip`, 'application/zip'));
        }
        announce('Split result is ready to download.');
      } catch (e) {
        result.append(errorPanel(e, 'Splitting failed.'));
      }
    }),
  );

  root.append(
    h('section', { class: 'tool' },
      ...toolHeader('Split PDF', 'Take out the pages you need. Your original file is not changed.'),
      singlePdfPicker('split-file', (p) => {
        pdf = p;
        ranges.value = p.pages > 1 ? `1-${p.pages}` : '1';
        settings.hidden = false;
        validate();
      }, () => { pdf = null; settings.hidden = true; result.replaceChildren(); }),
      settings,
      result,
    ),
  );
}
