import { extractPages, formatPageList, groupsFromCuts, splitAtCuts, zipFiles } from '../core/pages';
import { announce, h } from './dom';
import { errorPanel, pdfResultPanel, resultPanel, singlePdfPicker, toolHeader, withBusy, type LoadedPdf } from './common';
import { openPreview, outputPreview, type Previewer } from './thumbs';
import { pageManager, type PageManager } from './pagemanager';

type Mode = 'extract' | 'cuts';

/**
 * Split PDF with two visual modes:
 *  - Extract pages: select pages on their thumbnails (or type 1-3, 5) and get one new PDF.
 *  - Split by boundaries: tap between pages to cut, and get one PDF per part (as a .zip).
 * The planned result is shown before anything is processed.
 */
export function renderSplit(root: HTMLElement) {
  let pdf: LoadedPdf | null = null;
  let preview: Previewer | null = null;
  let pm: PageManager | null = null;
  let mode: Mode = 'extract';

  const modeBtns = (['extract', 'cuts'] as Mode[]).map((m) =>
    h('button', { type: 'button', class: 'chip', 'aria-pressed': String(m === mode), onClick: () => setMode(m) },
      m === 'extract' ? 'Extract pages' : 'Split by boundaries'),
  );
  const modeHelp = h('p', { class: 'hint' });
  const slot = h('div', { class: 'pm-slot' });
  const plan = h('div', { class: 'split-plan', 'aria-live': 'polite' });
  const runBtn = h('button', { type: 'button', class: 'btn primary big' }, 'Split PDF');
  const result = h('div', { class: 'result' });
  const settings = h('div', { class: 'settings', hidden: true },
    h('div', { class: 'chips left', role: 'group', 'aria-label': 'Split mode' }, ...modeBtns),
    modeHelp, slot, plan, runBtn,
  );

  function setMode(m: Mode) {
    mode = m;
    modeBtns.forEach((b, i) => b.setAttribute('aria-pressed', String((['extract', 'cuts'] as Mode[])[i] === m)));
    modeHelp.textContent = m === 'extract'
      ? 'Tap the tick on each page you want, or type pages such as 1-3, 5, 8 and press Select. The chosen pages go into one new PDF.'
      : 'Tap + between two pages to split there (tap ✂ again to remove it), or use a quick option. Each part becomes its own PDF.';
    build();
  }

  function build() {
    if (!pdf || !preview) return;
    pm = pageManager({ preview, pageCount: pdf.pages, mode: mode === 'extract' ? 'select' : 'cuts', onChange: describe });
    slot.replaceChildren(pm.el);
    describe();
  }

  /** Show the resulting document structure before processing. */
  function describe() {
    result.replaceChildren();
    if (!pm || !pdf) return;
    if (mode === 'extract') {
      const pages = pm.selectedPositions();
      runBtn.textContent = 'Extract pages';
      runBtn.disabled = pages.length === 0;
      plan.replaceChildren(pages.length
        ? h('p', {}, h('strong', {}, '1 new PDF'), ` with ${pages.length} page${pages.length === 1 ? '' : 's'}: ${formatPageList(pages)}`)
        : h('p', { class: 'muted' }, 'No pages selected yet.'));
    } else {
      const groups = groupsFromCuts(pdf.pages, pm.cuts());
      runBtn.textContent = groups.length > 1 ? `Split into ${groups.length} PDFs` : 'Split PDF';
      runBtn.disabled = groups.length < 2;
      plan.replaceChildren(groups.length < 2
        ? h('p', { class: 'muted' }, 'No split points yet. Tap + between pages.')
        : h('ol', { class: 'split-files' }, ...groups.map((g, i) => h('li', { class: `part-${i % 6}` }, h('strong', {}, `File ${i + 1}`), ` · pages ${formatPageList(g)} (${g.length})`))));
    }
  }

  runBtn.addEventListener('click', () =>
    withBusy(runBtn, mode === 'extract' ? 'Extracting…' : 'Splitting…', async () => {
      if (!pdf || !pm) return;
      result.replaceChildren();
      try {
        if (mode === 'extract') {
          const out = await extractPages(pdf, pm.selectedPositions());
          result.append(pdfResultPanel('Your PDF is ready', `${pm.selectedPositions().length} pages`, out.bytes, out.name));
        } else {
          const outs = await splitAtCuts(pdf, pm.cuts());
          const zip = zipFiles(outs);
          const panel = resultPanel('Your files are ready', `${outs.length} PDFs in a .zip`, zip, `${pdf.name.replace(/\.pdf$/i, '')}-split.zip`, 'application/zip');
          panel.querySelector('.save-row')?.before(h('div', { class: 'split-previews' }, ...outs.map((o, i) => h('div', { class: 'split-preview' }, h('p', { class: 'field-label' }, `File ${i + 1}: ${o.name}`), outputPreview(o.bytes, 8, i > 0)))));
          result.append(panel);
        }
        announce('Split result is ready to download.');
      } catch (e) {
        result.append(errorPanel(e, 'Splitting failed.'));
      }
    }),
  );

  root.append(
    h('section', { class: 'tool wide' },
      ...toolHeader('Split PDF', 'Pick pages on their thumbnails, or choose where to cut. Your original file is not changed.'),
      singlePdfPicker('split-file', async (p) => {
        pdf = p;
        preview?.destroy();
        preview = await openPreview(p.bytes);
        settings.hidden = false;
        setMode(mode);
      }, () => { pdf = null; pm = null; preview?.destroy(); preview = null; settings.hidden = true; slot.replaceChildren(); result.replaceChildren(); }),
      settings,
      result,
    ),
  );
}
