import { diffLines, diffSummary } from '../core/diff';
import { extractPageText } from '../core/pdftext';
import { pageLines } from '../core/textlayout';
import { h } from './dom';
import { errorPanel, singlePdfPicker, type LoadedPdf } from './common';
import { openPreview, pdfjs, pdfjsAssets, type Previewer } from './thumbs';

export function renderCompare(root: HTMLElement) {
  const docs: (LoadedPdf | null)[] = [null, null];
  const previews: (Previewer | null)[] = [null, null];
  let page = 0;

  const view = h('div', { class: 'compare', hidden: true });
  const pagesBox = h('div', { class: 'compare-pages' });
  const nav = h('div', { class: 'row center' });
  const diffBox = h('div', { class: 'diff' });
  const status = h('p', { class: 'hint', role: 'status' });

  const maxPages = () => Math.max(docs[0]?.pages ?? 0, docs[1]?.pages ?? 0);

  async function showPage() {
    const label = h('span', { class: 'hint' }, `Page ${page + 1} of ${maxPages()}`);
    nav.replaceChildren(
      h('button', { type: 'button', class: 'btn', disabled: page === 0, onClick: () => { page--; showPage(); } }, '← Previous'),
      label,
      h('button', { type: 'button', class: 'btn', disabled: page >= maxPages() - 1, onClick: () => { page++; showPage(); } }, 'Next →'),
    );
    const cols = await Promise.all([0, 1].map(async (i) => {
      const d = docs[i]!, p = previews[i]!;
      const title = h('div', { class: 'compare-title' }, `${i === 0 ? 'A' : 'B'}: ${d.name}`);
      if (page >= d.pages) return h('div', { class: 'compare-col' }, title, h('p', { class: 'hint' }, `This file has only ${d.pages} page${d.pages === 1 ? '' : 's'}.`));
      const size = await p.pageSize(page);
      const canvas = await p.render(page, (440 / size.width) * Math.min(window.devicePixelRatio || 1, 2));
      canvas.className = 'preview-canvas';
      return h('div', { class: 'compare-col' }, title, canvas);
    }));
    pagesBox.replaceChildren(...cols);
  }

  async function compare() {
    if (!docs[0] || !docs[1]) return;
    view.hidden = false;
    status.textContent = 'Reading both files…';
    diffBox.replaceChildren();
    try {
      previews.forEach((p) => p?.destroy());
      previews[0] = await openPreview(docs[0].bytes);
      previews[1] = await openPreview(docs[1].bytes);
      page = 0;
      await showPage();
      const lib = await pdfjs();
      const [ta, tb] = await Promise.all(docs.map((d) => extractPageText(lib as any, d!.bytes, pdfjsAssets())));
      const linesA = ta.flatMap((p, i) => [`— Page ${i + 1} —`, ...pageLines(p)]);
      const linesB = tb.flatMap((p, i) => [`— Page ${i + 1} —`, ...pageLines(p)]);
      status.textContent = '';
      const textless = [ta, tb].map((pages) => pages.every((p) => p.pieces.length === 0));
      if (textless[0] || textless[1]) {
        diffBox.replaceChildren(h('p', { class: 'hint warn' }, `File ${textless[0] ? 'A' : 'B'} has no selectable text (it may be scanned), so only the side-by-side view is available.`));
        return;
      }
      const ops = diffLines(linesA, linesB);
      const s = diffSummary(ops);
      const changed = s.added + s.removed;
      diffBox.replaceChildren(
        h('h2', {}, 'Text differences'),
        h('p', { class: changed ? 'hint' : 'hint ok' }, changed ? `${s.removed} line${s.removed === 1 ? '' : 's'} only in A, ${s.added} line${s.added === 1 ? '' : 's'} only in B.` : 'The text of both files is the same.'),
        h('p', { class: 'hint' }, 'This compares readable text line by line. It does not compare images, formatting or exact layout, and moved text shows as removed and added.'),
        h('ol', { class: 'diff-list' }, ...ops.map((o) => h('li', { class: `diff-${o.type}` },
          h('span', { class: 'diff-mark', 'aria-hidden': 'true' }, o.type === 'add' ? '+' : o.type === 'del' ? '−' : ' '),
          h('span', { class: 'sr-only' }, o.type === 'add' ? 'Only in B: ' : o.type === 'del' ? 'Only in A: ' : ''),
          o.text,
        ))),
      );
    } catch (e) {
      status.textContent = '';
      diffBox.replaceChildren(errorPanel(e, 'Comparing failed.'));
    }
  }

  const pick = (i: number) => singlePdfPicker(`cmp-file-${i}`, (p) => { docs[i] = p; compare(); }, () => { docs[i] = null; view.hidden = true; });

  root.append(h('section', { class: 'tool wide' },
    h('a', { class: 'back', href: '#/' }, '← All tools'),
    h('h1', {}, 'Compare PDFs'),
    h('p', { class: 'lead' }, 'See two versions side by side and find text that changed.'),
    h('div', { class: 'compare-pickers' }, h('div', {}, h('h2', { class: 'field-label' }, 'File A (original)'), pick(0)), h('div', {}, h('h2', { class: 'field-label' }, 'File B (changed)'), pick(1))),
    status,
    h('div', {}, view),
  ));
  view.append(nav, pagesBox, diffBox);
}
