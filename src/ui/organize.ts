import { organizePdf, type PagePlan } from '../core/pages';
import { announce, h } from './dom';
import { errorPanel, resultPanel, singlePdfPicker, toolHeader, withBusy, type LoadedPdf } from './common';
import { openPreview, type Previewer } from './thumbs';

export function renderOrganize(root: HTMLElement) {
  let pdf: LoadedPdf | null = null;
  let preview: Previewer | null = null;
  let plan: PagePlan[] = [];
  let history: PagePlan[][] = [];
  const thumbs = new Map<number, HTMLElement>(); // one canvas per source page, reused while reordering
  let dragFrom = -1;

  const grid = h('ol', { class: 'page-grid', 'aria-label': 'Pages in their new order' });
  const status = h('p', { class: 'hint', role: 'status' });
  const undoBtn = h('button', { type: 'button', class: 'btn', onClick: () => { if (history.length) { plan = history.pop()!; draw(); announce('Undone.'); } } }, 'Undo');
  const resetBtn = h('button', { type: 'button', class: 'btn', onClick: () => change(() => { plan = initial(); }, 'Reset to the original order.') }, 'Reset');
  const runBtn = h('button', { type: 'button', class: 'btn primary big' }, 'Save organized PDF');
  const result = h('div', { class: 'result' });
  const settings = h('div', { class: 'settings', hidden: true },
    h('p', { class: 'hint' }, 'Use the buttons under each page to move, rotate or remove it. On a computer you can also drag pages.'),
    h('div', { class: 'row' }, undoBtn, resetBtn),
    status,
    grid,
    runBtn,
  );

  const initial = () => Array.from({ length: pdf!.pages }, (_, i): PagePlan => ({ source: i, rotate: 0 }));

  function change(fn: () => void, msg: string) {
    history.push(plan.map((p) => ({ ...p })));
    if (history.length > 100) history.shift();
    fn();
    draw();
    announce(msg);
  }

  function move(i: number, to: number) {
    if (to < 0 || to >= plan.length || to === i) return;
    change(() => { const [p] = plan.splice(i, 1); plan.splice(to, 0, p); }, `Page moved to position ${to + 1}.`);
  }

  function draw() {
    result.replaceChildren();
    grid.replaceChildren(
      ...plan.map((p, i) => {
        if (!thumbs.has(p.source)) thumbs.set(p.source, preview!.thumb(p.source));
        const li = h('li', { class: 'page-card', draggable: 'true' },
          h('span', { class: 'thumb-box', style: `--rot:${p.rotate}deg` }, thumbs.get(p.source)!),
          h('span', { class: 'page-label' }, `${i + 1}`, h('span', { class: 'muted' }, ` (was page ${p.source + 1})`)),
          h('span', { class: 'page-actions' },
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Move page ${p.source + 1} earlier`, disabled: i === 0, onClick: () => move(i, i - 1) }, '←'),
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Rotate page ${p.source + 1} right`, onClick: () => change(() => { p.rotate = ((p.rotate + 90) % 360) as PagePlan['rotate']; }, 'Page rotated.') }, '↻'),
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Remove page ${p.source + 1}`, onClick: () => change(() => { plan.splice(i, 1); }, 'Page removed.') }, '✕'),
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Move page ${p.source + 1} later`, disabled: i === plan.length - 1, onClick: () => move(i, i + 1) }, '→'),
          ),
        );
        li.addEventListener('dragstart', (e) => { dragFrom = i; e.dataTransfer?.setData('text/plain', String(i)); li.classList.add('dragging'); });
        li.addEventListener('dragend', () => li.classList.remove('dragging'));
        li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('over'); });
        li.addEventListener('dragleave', () => li.classList.remove('over'));
        li.addEventListener('drop', (e) => { e.preventDefault(); li.classList.remove('over'); if (dragFrom >= 0) move(dragFrom, i); dragFrom = -1; });
        return li;
      }),
    );
    const removed = pdf!.pages - new Set(plan.map((p) => p.source)).size;
    status.textContent = plan.length
      ? `${plan.length} page${plan.length === 1 ? '' : 's'} in the result${removed ? `, ${removed} removed` : ''}.`
      : 'All pages are removed. Undo or Reset to keep at least one page.';
    undoBtn.disabled = history.length === 0;
    runBtn.disabled = plan.length === 0;
  }

  runBtn.addEventListener('click', () =>
    withBusy(runBtn, 'Saving…', async () => {
      if (!pdf) return;
      try {
        const out = await organizePdf(pdf, plan);
        result.replaceChildren(resultPanel('Your organized PDF is ready', `${plan.length} pages`, out, `${pdf.name.replace(/\.pdf$/i, '')}-organized.pdf`, 'application/pdf'));
        announce('Organized PDF is ready to download.');
      } catch (e) {
        result.replaceChildren(errorPanel(e, 'Saving failed.'));
      }
    }),
  );

  root.append(
    h('section', { class: 'tool wide' },
      ...toolHeader('Organize PDF', 'Reorder, rotate and remove pages, then save a new PDF.'),
      singlePdfPicker('organize-file', async (p) => {
        pdf = p;
        preview?.destroy();
        thumbs.clear();
        preview = await openPreview(p.bytes);
        plan = initial();
        history = [];
        settings.hidden = false;
        draw();
      }, () => { pdf = null; preview?.destroy(); preview = null; settings.hidden = true; result.replaceChildren(); }),
      settings,
      result,
    ),
  );
}
