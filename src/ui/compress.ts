import { compressScannedPages, optimizePdf } from '../core/compress';
import { sanitizeFileName } from '../core/pdf';
import { errorPanel, resultPanel, singlePdfPicker, toolHeader, type LoadedPdf } from './common';
import { formatBytes, h } from './dom';
import { openPreview } from './thumbs';

function jpegBytes(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not compress this page as a JPEG.'));
    }, 'image/jpeg', quality);
  }).then(async (blob) => new Uint8Array(await blob.arrayBuffer()));
}

export function renderCompress(root: HTMLElement) {
  let pdf: LoadedPdf | null = null;
  let job: AbortController | null = null;
  const mode = h('select', { id: 'compress-mode', class: 'text-input' },
    h('option', { value: 'optimize' }, 'Preserve text and forms'),
    h('option', { value: 'balanced' }, 'Scans · Balanced quality'),
    h('option', { value: 'small' }, 'Scans · Smallest file'),
  );
  const guidance = h('p', { class: 'hint', id: 'compress-guidance' },
    'Optimizes the PDF structure with modest savings. Resaving can invalidate digital signatures.');
  mode.setAttribute('aria-describedby', guidance.id);
  const status = h('p', { class: 'hint', role: 'status' });
  const result = h('div', { class: 'result' });
  const run = h('button', { type: 'button', class: 'btn primary big' }, 'Compress PDF');
  const cancel = h('button', { type: 'button', class: 'btn', hidden: true }, 'Cancel');
  const settings = h('div', { class: 'settings', hidden: true },
    h('label', { for: mode.id }, 'Compression mode'), mode, guidance,
    h('div', { class: 'row' }, run, cancel), status,
  );

  function reset(next: LoadedPdf | null) {
    job?.abort();
    job = null;
    pdf = next;
    settings.hidden = !next;
    run.disabled = mode.disabled = false;
    cancel.hidden = true;
    status.textContent = '';
    result.replaceChildren();
  }

  cancel.addEventListener('click', () => reset(pdf));
  mode.addEventListener('change', () => {
    result.replaceChildren();
    guidance.textContent = mode.value === 'optimize'
      ? 'Optimizes the PDF structure with modest savings. Resaving can invalidate digital signatures.'
      : 'Turns each page into an image. Text selection, links, fillable forms and digital signatures are lost.';
  });

  run.addEventListener('click', async () => {
    if (!pdf || job) return;
    const input = pdf;
    const selected = mode.value;
    const current = new AbortController();
    job = current;
    run.disabled = mode.disabled = true;
    cancel.hidden = false;
    result.replaceChildren();
    status.textContent = 'Compressing…';
    try {
      let bytes: Uint8Array;
      if (selected === 'balanced' || selected === 'small') {
        const preview = await openPreview(input.bytes);
        try {
          bytes = await compressScannedPages({
            pageCount: preview.pageCount,
            pageSize: preview.pageSize,
            async jpeg(index, scale, quality) {
              const canvas = await preview.render(index, scale);
              try {
                return await jpegBytes(canvas, quality);
              } finally {
                canvas.width = canvas.height = 0;
              }
            },
          }, selected, (page) => {
            status.textContent = 'Compressing page ' + page + ' of ' + preview.pageCount + '…';
          }, current.signal);
        } finally {
          preview.destroy();
        }
      } else {
        bytes = await optimizePdf(input);
      }
      if (job !== current || !root.contains(settings)) return;
      if (bytes.length >= input.bytes.length) {
        result.replaceChildren(h('p', { class: 'hint', role: 'status' },
          'This mode did not produce a smaller file. Keep your original (' + formatBytes(input.size) + ').'));
        return;
      }
      const saved = ((1 - bytes.length / input.size) * 100).toFixed(1);
      const name = sanitizeFileName(input.name.replace(/\.pdf$/i, ''), 'document');
      result.replaceChildren(resultPanel('Compressed PDF ready',
        formatBytes(input.size) + ' original · ' + saved + '% smaller', bytes, name + '-compressed.pdf', 'application/pdf'));
    } catch (error) {
      if (job === current) result.replaceChildren(errorPanel(error, 'Could not compress this PDF.'));
    } finally {
      if (job === current) {
        job = null;
        run.disabled = mode.disabled = false;
        cancel.hidden = true;
        status.textContent = '';
      }
    }
  });

  root.append(h('section', { class: 'tool' },
    ...toolHeader('Compress PDF', 'Reduce the size of a PDF directly on your device.'),
    singlePdfPicker('compress-file', reset, () => reset(null)), settings, result,
  ));
}
