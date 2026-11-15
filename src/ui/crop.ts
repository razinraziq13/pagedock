import { cropPdf } from '../core/edit';
import { parsePageRanges } from '../core/pages';
import { announce, h } from './dom';
import { errorPanel, resultPanel, singlePdfPicker, toolHeader, withBusy, type LoadedPdf } from './common';
import { openPreview, type Previewer } from './thumbs';
import { rectSelector } from './rectselect';

const MM = 72 / 25.4;

export function renderCrop(root: HTMLElement) {
  let pdf: LoadedPdf | null = null;
  let preview: Previewer | null = null;
  let size = { width: 595, height: 842 };
  let sel: ReturnType<typeof rectSelector> | null = null;

  const stage = h('div', { class: 'crop-stage' });
  const inputs = Object.fromEntries((['top', 'right', 'bottom', 'left'] as const).map((k) => [k, h('input', { type: 'number', id: `crop-${k}`, class: 'text-input', min: '0', step: '1', value: '0', inputmode: 'decimal' })])) as Record<'top' | 'right' | 'bottom' | 'left', HTMLInputElement>;
  const pages = h('input', { type: 'text', id: 'crop-pages', class: 'text-input', inputmode: 'numeric', autocomplete: 'off', placeholder: 'All pages' });
  const hint = h('p', { class: 'hint', role: 'status' });
  const runBtn = h('button', { type: 'button', class: 'btn primary big' }, 'Crop PDF');
  const result = h('div', { class: 'result' });

  const margins = () => ({
    top: Number(inputs.top.value) * MM, right: Number(inputs.right.value) * MM,
    bottom: Number(inputs.bottom.value) * MM, left: Number(inputs.left.value) * MM,
  });

  function fromSelection() {
    const r = sel!.get();
    const mm = (pt: number) => String(Math.max(0, Math.round(pt / MM)));
    inputs.left.value = mm(r.x * size.width);
    inputs.top.value = mm(r.y * size.height);
    inputs.right.value = mm((1 - r.x - r.w) * size.width);
    inputs.bottom.value = mm((1 - r.y - r.h) * size.height);
    validate();
  }
  function toSelection() {
    const m = margins();
    sel?.set({ x: m.left / size.width, y: m.top / size.height, w: (size.width - m.left - m.right) / size.width, h: (size.height - m.top - m.bottom) / size.height });
    validate();
  }
  function validate() {
    result.replaceChildren();
    const m = margins();
    let ok = Object.values(m).every((v) => v >= 0 && Number.isFinite(v));
    const w = size.width - m.left - m.right, hh = size.height - m.top - m.bottom;
    if (ok && (w < 36 || hh < 36)) ok = false;
    if (ok && pdf && pages.value.trim()) { try { parsePageRanges(pages.value, pdf.pages); } catch (e) { ok = false; hint.textContent = (e as Error).message; } }
    if (ok) hint.textContent = `Result size: ${Math.round(w / MM)} × ${Math.round(hh / MM)} mm (shown for page 1; other pages are trimmed by the same amounts).`;
    else if (!hint.textContent || !pages.value.trim()) hint.textContent = 'The crop leaves too little of the page, or a value is invalid.';
    runBtn.disabled = !ok;
  }
  Object.values(inputs).forEach((el) => el.addEventListener('input', toSelection));
  pages.addEventListener('input', validate);

  runBtn.addEventListener('click', () =>
    withBusy(runBtn, 'Cropping…', async () => {
      if (!pdf) return;
      try {
        const out = await cropPdf(pdf, margins(), pages.value.trim() || 'all');
        result.replaceChildren(resultPanel('Your cropped PDF is ready', `${pdf.pages} pages`, out, `${pdf.name.replace(/\.pdf$/i, '')}-cropped.pdf`, 'application/pdf',
          'Cropping hides the edges but does not delete them: the hidden content is still in the file and can be recovered. Do not use cropping to remove private information.'));
        announce('Cropped PDF is ready to download.');
      } catch (e) {
        result.replaceChildren(errorPanel(e, 'Cropping failed.'));
      }
    }),
  );

  const settings = h('div', { class: 'settings two-col', hidden: true },
    h('div', { class: 'controls' },
      h('p', { class: 'hint' }, 'Drag the box or its corners on the preview, or type how much to trim from each edge (in millimetres).'),
      h('div', { class: 'field-row' },
        h('div', { class: 'field' }, h('label', { for: 'crop-top', class: 'field-label' }, 'Top (mm)'), inputs.top),
        h('div', { class: 'field' }, h('label', { for: 'crop-bottom', class: 'field-label' }, 'Bottom (mm)'), inputs.bottom),
      ),
      h('div', { class: 'field-row' },
        h('div', { class: 'field' }, h('label', { for: 'crop-left', class: 'field-label' }, 'Left (mm)'), inputs.left),
        h('div', { class: 'field' }, h('label', { for: 'crop-right', class: 'field-label' }, 'Right (mm)'), inputs.right),
      ),
      h('div', { class: 'field' }, h('label', { for: 'crop-pages', class: 'field-label' }, 'Pages'), pages),
      hint,
      h('p', { class: 'hint warn' }, 'Cropping is not redaction: trimmed content stays in the file.'),
      runBtn,
    ),
    h('figure', { class: 'preview' }, stage, h('figcaption', { class: 'hint' }, 'Page 1')),
  );

  root.append(h('section', { class: 'tool wide' },
    ...toolHeader('Crop PDF', 'Trim the edges of pages.'),
    singlePdfPicker('crop-file', async (p) => {
      pdf = p;
      preview?.destroy();
      preview = await openPreview(p.bytes);
      size = await preview.pageSize(0);
      const canvas = await preview.render(0, (320 / size.width) * Math.min(window.devicePixelRatio || 1, 2));
      canvas.className = 'preview-canvas';
      stage.replaceChildren(canvas);
      sel = rectSelector(stage, { x: 0, y: 0, w: 1, h: 1 }, fromSelection);
      Object.values(inputs).forEach((el) => { el.value = '0'; });
      settings.hidden = false;
      validate();
    }, () => { pdf = null; preview?.destroy(); preview = null; settings.hidden = true; result.replaceChildren(); }),
    settings, result,
  ));
}
