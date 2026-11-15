import { parsePageRanges } from '../core/pages';
import { sanitizeFileName } from '../core/pdf';
import { announce, h } from './dom';
import { errorPanel, resultPanel, singlePdfPicker, toolHeader, type LoadedPdf } from './common';
import { MAX_CANVAS_PIXELS, openPreview } from './thumbs';
import { createOcr } from './ocr-engine';

const OCR_DPI = 200; // a good balance of accuracy, speed and phone memory

export function renderOcr(root: HTMLElement) {
  let pdf: LoadedPdf | null = null;
  let cancelled = false;
  let worker: Awaited<ReturnType<typeof createOcr>> | null = null;

  const pages = h('input', { type: 'text', id: 'ocr-pages', class: 'text-input', inputmode: 'numeric', autocomplete: 'off' });
  const hint = h('p', { class: 'hint', id: 'ocr-hint' });
  const runBtn = h('button', { type: 'button', class: 'btn primary big' }, 'Read text (OCR)');
  const cancelBtn = h('button', { type: 'button', class: 'btn', hidden: true, onClick: () => { cancelled = true; worker?.terminate(); worker = null; } }, 'Cancel');
  const bar = h('progress', { max: '100', value: '0', hidden: true, 'aria-label': 'OCR progress' });
  const status = h('p', { class: 'hint', role: 'status' });
  const result = h('div', {});
  pages.setAttribute('aria-describedby', 'ocr-hint');

  const settings = h('div', { class: 'settings', hidden: true },
    h('div', { class: 'field' }, h('label', { for: 'ocr-pages', class: 'field-label' }, 'Pages'), pages, hint),
    h('p', { class: 'hint' }, 'Language: English. The first run downloads the reading engine (about 7 MB) from this site; after that it works offline. Your pages never leave this device.'),
    h('div', { class: 'row' }, runBtn, cancelBtn),
    bar, status,
  );

  function selection(): number[] | null {
    if (!pdf) return null;
    try {
      const idx = [...new Set(parsePageRanges(pages.value, pdf.pages).flat())];
      hint.textContent = `${idx.length} page${idx.length === 1 ? '' : 's'}. OCR takes a few seconds per page${idx.length > 20 ? '; many pages can take several minutes' : ''}.`;
      hint.classList.remove('bad');
      runBtn.disabled = false;
      return idx;
    } catch (e) {
      hint.textContent = (e as Error).message;
      hint.classList.add('bad');
      runBtn.disabled = true;
      return null;
    }
  }
  pages.addEventListener('input', () => { result.replaceChildren(); selection(); });

  runBtn.addEventListener('click', async () => {
    const sel = selection();
    if (!pdf || !sel) return;
    cancelled = false;
    runBtn.disabled = true;
    cancelBtn.hidden = false;
    bar.hidden = false;
    result.replaceChildren();
    const preview = await openPreview(pdf.bytes);
    const texts: string[] = [];
    const conf: number[] = [];
    try {
      status.textContent = 'Starting the reading engine…';
      worker = await createOcr((s, p) => {
        if (s.startsWith('loading') || s.startsWith('initializing')) { status.textContent = `Preparing: ${s}…`; bar.value = Math.round(p * 100); }
      });
      for (let k = 0; k < sel.length; k++) {
        if (cancelled || !worker) throw new Error('Cancelled.');
        status.textContent = `Reading page ${sel[k] + 1} (${k + 1} of ${sel.length})…`;
        bar.value = Math.round((k / sel.length) * 100);
        const size = await preview.pageSize(sel[k]);
        let scale = OCR_DPI / 72;
        const px = size.width * size.height * scale * scale;
        if (px > MAX_CANVAS_PIXELS) scale *= Math.sqrt(MAX_CANVAS_PIXELS / px);
        const canvas = await preview.render(sel[k], scale);
        const { data } = await worker.recognize(canvas);
        canvas.width = canvas.height = 0;
        texts.push(`--- Page ${sel[k] + 1} ---\n\n${data.text.trim()}`);
        conf.push(data.confidence);
      }
      bar.value = 100;
      status.textContent = '';
      const avg = conf.reduce((a, b) => a + b, 0) / Math.max(conf.length, 1);
      const area = h('textarea', { class: 'text-out', rows: '16', 'aria-label': 'Recognised text (check and correct it before saving)' });
      area.value = texts.join('\n\n') + '\n';
      const saveRow = h('div', {});
      const base = sanitizeFileName(pdf.name.replace(/\.pdf$/i, ''), 'document');
      const save = () => saveRow.replaceChildren(resultPanel('Text file ready', `${sel.length} page${sel.length === 1 ? '' : 's'} read`, new TextEncoder().encode(area.value), `${base}-ocr.txt`, 'text/plain;charset=utf-8',
        'This is a text file, not a searchable PDF. OCR makes mistakes, especially with handwriting, small print and poor scans.'));
      area.addEventListener('input', () => saveRow.replaceChildren(h('button', { type: 'button', class: 'btn primary', onClick: save }, 'Update text file')));
      const copyBtn = h('button', { type: 'button', class: 'btn', onClick: async () => {
        try { await navigator.clipboard.writeText(area.value); copyBtn.textContent = 'Copied'; } catch { area.select(); copyBtn.textContent = 'Press Ctrl+C / ⌘C to copy'; }
      } }, 'Copy text');
      result.replaceChildren(
        h('p', { class: avg < 60 ? 'hint warn' : 'hint' }, `Average confidence ${Math.round(avg)}%.${avg < 60 ? ' Low: please check the text carefully.' : ' Please check the text before using it.'}`),
        area, h('div', { class: 'row' }, copyBtn), saveRow,
      );
      save();
      announce('OCR finished.');
    } catch (e) {
      status.textContent = '';
      result.replaceChildren(errorPanel(e, 'OCR failed. If this is the first run, check your internet connection so the reading engine can download once.'));
    } finally {
      preview.destroy();
      await worker?.terminate();
      worker = null;
      runBtn.disabled = false;
      cancelBtn.hidden = true;
      bar.hidden = true;
    }
  });

  root.append(h('section', { class: 'tool' },
    ...toolHeader('OCR PDF to Text', 'Read text from scanned pages, on your device. You can correct it, copy it or save it as a .txt file.'),
    singlePdfPicker('ocr-file', (p) => { pdf = p; pages.value = p.pages > 1 ? `1-${p.pages}` : '1'; settings.hidden = false; selection(); }, () => { pdf = null; settings.hidden = true; result.replaceChildren(); }),
    settings, result,
  ));
}
