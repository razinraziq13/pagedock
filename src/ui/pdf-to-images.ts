import { parsePageRanges, zipFiles, type OutputFile } from '../core/pages';
import { sanitizeFileName } from '../core/pdf';
import { announce, h } from './dom';
import { errorPanel, resultPanel, singlePdfPicker, toolHeader, type LoadedPdf } from './common';
import { MAX_CANVAS_PIXELS, openPreview } from './thumbs';

function canvasToBytes(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(async (blob) => {
      if (!blob) return reject(new Error('The browser could not create the image. Try a lower resolution.'));
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, type, quality),
  );
}

export function renderPdfToImages(root: HTMLElement) {
  let pdf: LoadedPdf | null = null;
  let cancelled = false;

  const pagesInput = h('input', { type: 'text', id: 'p2i-pages', class: 'text-input', inputmode: 'numeric', autocomplete: 'off' });
  const pagesHint = h('p', { class: 'hint', id: 'p2i-hint' });
  const format = h('select', { id: 'p2i-format', class: 'text-input' }, h('option', { value: 'jpg' }, 'JPG (smaller files)'), h('option', { value: 'png' }, 'PNG (sharper, larger files)'));
  const dpi = h('select', { id: 'p2i-dpi', class: 'text-input' },
    h('option', { value: '72' }, 'Low — 72 dpi (screen)'),
    h('option', { value: '150', selected: true }, 'Medium — 150 dpi'),
    h('option', { value: '300' }, 'High — 300 dpi (print)'),
  );
  const quality = h('input', { type: 'range', id: 'p2i-quality', min: '50', max: '100', value: '90' });
  const qualityOut = h('output', { for: 'p2i-quality' }, '90%');
  const qualityRow = h('div', { class: 'field' }, h('label', { for: 'p2i-quality', class: 'field-label' }, 'JPG quality ', qualityOut), quality);
  const warn = h('p', { class: 'hint' });
  const runBtn = h('button', { type: 'button', class: 'btn primary big' }, 'Convert to images');
  const cancelBtn = h('button', { type: 'button', class: 'btn', hidden: true, onClick: () => { cancelled = true; } }, 'Cancel');
  const progress = h('p', { class: 'hint', role: 'status' });
  const result = h('div', { class: 'result' });

  const settings = h('div', { class: 'settings', hidden: true },
    h('div', { class: 'field' }, h('label', { for: 'p2i-pages', class: 'field-label' }, 'Pages'), pagesInput, pagesHint),
    h('div', { class: 'field-row' },
      h('div', { class: 'field' }, h('label', { for: 'p2i-format', class: 'field-label' }, 'Image type'), format),
      h('div', { class: 'field' }, h('label', { for: 'p2i-dpi', class: 'field-label' }, 'Resolution'), dpi),
    ),
    qualityRow,
    warn,
    h('div', { class: 'row' }, runBtn, cancelBtn),
    progress,
  );
  pagesInput.setAttribute('aria-describedby', 'p2i-hint');

  function selection(): number[] | null {
    if (!pdf) return null;
    try {
      const idx = [...new Set(parsePageRanges(pagesInput.value, pdf.pages).flat())];
      pagesHint.textContent = `${idx.length} page${idx.length === 1 ? '' : 's'} will be converted.`;
      pagesHint.classList.remove('bad');
      return idx;
    } catch (e) {
      pagesHint.textContent = (e as Error).message;
      pagesHint.classList.add('bad');
      return null;
    }
  }

  function update() {
    result.replaceChildren();
    qualityRow.hidden = format.value !== 'jpg';
    qualityOut.textContent = `${quality.value}%`;
    const sel = selection();
    runBtn.disabled = !sel;
    warn.textContent = sel && Number(dpi.value) >= 300 && sel.length > 20
      ? `Converting ${sel.length} pages at high resolution needs a lot of memory and may fail on phones. Consider medium resolution or fewer pages.`
      : '';
  }
  [pagesInput, quality].forEach((el) => el.addEventListener('input', update));
  [format, dpi].forEach((el) => el.addEventListener('change', update));

  runBtn.addEventListener('click', async () => {
    const sel = selection();
    if (!pdf || !sel) return;
    cancelled = false;
    runBtn.disabled = true;
    cancelBtn.hidden = false;
    result.replaceChildren();
    const ext = format.value === 'png' ? 'png' : 'jpg';
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    const base = sanitizeFileName(pdf.name.replace(/\.pdf$/i, ''), 'document');
    const outs: OutputFile[] = [];
    let reduced = false;
    const preview = await openPreview(pdf.bytes);
    try {
      for (let k = 0; k < sel.length; k++) {
        if (cancelled) throw new Error('Cancelled. No images were saved.');
        progress.textContent = `Converting page ${sel[k] + 1} (${k + 1} of ${sel.length})…`;
        const size = await preview.pageSize(sel[k]);
        let scale = Number(dpi.value) / 72;
        const px = size.width * size.height * scale * scale;
        if (px > MAX_CANVAS_PIXELS) { scale *= Math.sqrt(MAX_CANVAS_PIXELS / px); reduced = true; }
        const canvas = await preview.render(sel[k], scale);
        outs.push({ name: `${base}-page-${sel[k] + 1}.${ext}`, bytes: await canvasToBytes(canvas, mime, Number(quality.value) / 100) });
        canvas.width = canvas.height = 0; // free memory straight away
      }
      progress.textContent = '';
      const note = reduced ? 'Some pages were very large, so their resolution was reduced to fit in browser memory.' : undefined;
      if (outs.length === 1) {
        result.append(resultPanel('Your image is ready', `1 ${ext.toUpperCase()} image`, outs[0].bytes, outs[0].name, mime, note));
      } else {
        result.append(resultPanel('Your images are ready', `${outs.length} ${ext.toUpperCase()} images in a .zip`, zipFiles(outs), `${base}-images.zip`, 'application/zip', note));
      }
      announce('Images are ready to download.');
    } catch (e) {
      progress.textContent = '';
      result.append(errorPanel(e, 'Converting failed.'));
    } finally {
      preview.destroy();
      runBtn.disabled = false;
      cancelBtn.hidden = true;
    }
  });

  root.append(
    h('section', { class: 'tool' },
      ...toolHeader('PDF to Images', 'Save PDF pages as JPG or PNG pictures.'),
      singlePdfPicker('p2i-file', (p) => {
        pdf = p;
        pagesInput.value = p.pages > 1 ? `1-${p.pages}` : '1';
        settings.hidden = false;
        update();
      }, () => { pdf = null; settings.hidden = true; result.replaceChildren(); }),
      settings,
      result,
    ),
  );
}
