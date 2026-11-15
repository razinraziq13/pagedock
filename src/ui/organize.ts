import { extractPages, organizePdf } from '../core/pages';
import { announce, h } from './dom';
import { errorPanel, pdfResultPanel, singlePdfPicker, toolHeader, withBusy, type LoadedPdf } from './common';
import { openPreview, type Previewer } from './thumbs';
import { pageManager, type PageManager } from './pagemanager';

export function renderOrganize(root: HTMLElement) {
  let pdf: LoadedPdf | null = null;
  let preview: Previewer | null = null;
  let pm: PageManager | null = null;

  const slot = h('div', { class: 'pm-slot' });
  const runBtn = h('button', { type: 'button', class: 'btn primary big' }, 'Save organized PDF');
  const extractBtn = h('button', { type: 'button', class: 'btn big' }, 'Extract selected pages');
  const result = h('div', { class: 'result' });
  const settings = h('div', { class: 'settings', hidden: true },
    h('p', { class: 'hint' }, 'Tap the tick on a page to select it (Shift-click selects a run of pages), or type pages such as 1-3, 5. Then rotate, move or delete the selection. On a computer you can also drag pages to a new place.'),
    slot,
    h('div', { class: 'row' }, runBtn, extractBtn),
  );

  const refresh = () => {
    result.replaceChildren();
    if (!pm) return;
    const n = pm.selectedPositions().length;
    extractBtn.disabled = n === 0;
    extractBtn.textContent = n ? `Extract ${n} selected page${n === 1 ? '' : 's'}` : 'Extract selected pages';
  };

  runBtn.addEventListener('click', () =>
    withBusy(runBtn, 'Saving…', async () => {
      if (!pdf || !pm) return;
      try {
        const plan = pm.plan();
        const out = await organizePdf(pdf, plan);
        const removed = pdf.pages - new Set(plan.map((p) => p.source)).size;
        result.replaceChildren(pdfResultPanel('Your organized PDF is ready', `${plan.length} pages${removed ? `, ${removed} removed` : ''}`, out, `${pdf.name.replace(/\.pdf$/i, '')}-organized.pdf`));
        announce('Organized PDF is ready to download.');
      } catch (e) {
        result.replaceChildren(errorPanel(e, 'Saving failed.'));
      }
    }),
  );

  extractBtn.addEventListener('click', () =>
    withBusy(extractBtn, 'Extracting…', async () => {
      if (!pdf || !pm) return;
      try {
        // Extract from the organized result, so rotation and order shown on screen are kept.
        const plan = pm.plan();
        const organized = await organizePdf(pdf, plan);
        const out = await extractPages({ name: pdf.name, bytes: organized }, pm.selectedPositions());
        result.replaceChildren(pdfResultPanel('Your extracted pages are ready', `${pm.selectedPositions().length} pages`, out.bytes, out.name));
        announce('Extracted pages are ready to download.');
      } catch (e) {
        result.replaceChildren(errorPanel(e, 'Extracting failed.'));
      }
    }),
  );

  root.append(
    h('section', { class: 'tool wide' },
      ...toolHeader('Organize PDF', 'See every page, then select, reorder, rotate, delete or extract pages and save a new PDF.'),
      singlePdfPicker('organize-file', async (p) => {
        pdf = p;
        preview?.destroy();
        preview = await openPreview(p.bytes);
        pm = pageManager({ preview, pageCount: p.pages, mode: 'organize', onChange: refresh });
        slot.replaceChildren(pm.el);
        settings.hidden = false;
        refresh();
      }, () => { pdf = null; pm = null; preview?.destroy(); preview = null; settings.hidden = true; slot.replaceChildren(); result.replaceChildren(); }),
      settings,
      result,
    ),
  );
}
