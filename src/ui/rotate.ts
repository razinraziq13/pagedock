import { rotatePdf, type Angle } from '../core/pages';
import { announce, h } from './dom';
import { errorPanel, resultPanel, singlePdfPicker, toolHeader, withBusy, type LoadedPdf } from './common';
import { openPreview, type Previewer } from './thumbs';

export function renderRotate(root: HTMLElement) {
  let pdf: LoadedPdf | null = null;
  let preview: Previewer | null = null;
  let selected = new Set<number>();
  let angle: Angle = 90;

  const grid = h('div', { class: 'page-grid', role: 'group', 'aria-label': 'Pages. Tick the pages to rotate.' });
  const count = h('p', { class: 'hint', role: 'status' });
  const runBtn = h('button', { type: 'button', class: 'btn primary big' }, 'Rotate PDF');
  const result = h('div', { class: 'result' });
  const angleBtns = ([[90, '↻ 90° right'], [180, '180°'], [270, '↺ 90° left']] as const).map(([a, label]) =>
    h('button', { type: 'button', class: 'chip', 'aria-pressed': String(a === angle), onClick: () => { angle = a; refresh(); } }, label),
  );
  const settings = h('div', { class: 'settings', hidden: true },
    h('div', { class: 'field-label' }, 'Rotation'),
    h('div', { class: 'chips left', role: 'group', 'aria-label': 'Rotation angle' }, ...angleBtns),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn', onClick: () => { selected = new Set(Array.from({ length: pdf!.pages }, (_, i) => i)); refresh(); } }, 'Select all'),
      h('button', { type: 'button', class: 'btn', onClick: () => { selected.clear(); refresh(); } }, 'Select none'),
    ),
    count,
    grid,
    runBtn,
  );

  function refresh() {
    result.replaceChildren();
    angleBtns.forEach((b, i) => b.setAttribute('aria-pressed', String([90, 180, 270][i] === angle)));
    grid.querySelectorAll<HTMLElement>('.page-card').forEach((card) => {
      const i = Number(card.dataset.index);
      const on = selected.has(i);
      card.classList.toggle('selected', on);
      (card.querySelector('input') as HTMLInputElement).checked = on;
      (card.querySelector('.thumb-box') as HTMLElement).style.setProperty('--rot', `${on ? angle : 0}deg`);
    });
    count.textContent = selected.size ? `${selected.size} of ${pdf?.pages} pages will be rotated.` : 'Tick at least one page.';
    runBtn.disabled = selected.size === 0;
  }

  function build() {
    grid.replaceChildren(
      ...Array.from({ length: pdf!.pages }, (_, i) => {
        const box = h('label', { class: 'page-card', 'data-index': String(i) },
          h('span', { class: 'thumb-box' }, preview!.thumb(i)),
          h('span', { class: 'page-label' },
            h('input', { type: 'checkbox', onChange: (e: Event) => { (e.target as HTMLInputElement).checked ? selected.add(i) : selected.delete(i); refresh(); } }),
            ` Page ${i + 1}`,
          ),
        );
        return box;
      }),
    );
    refresh();
  }

  runBtn.addEventListener('click', () =>
    withBusy(runBtn, 'Rotating…', async () => {
      if (!pdf) return;
      try {
        const out = await rotatePdf(pdf, [...selected].sort((a, b) => a - b), angle);
        result.replaceChildren(resultPanel('Your rotated PDF is ready', `${selected.size} page${selected.size === 1 ? '' : 's'} rotated`, out, `${pdf.name.replace(/\.pdf$/i, '')}-rotated.pdf`, 'application/pdf'));
        announce('Rotated PDF is ready to download.');
      } catch (e) {
        result.replaceChildren(errorPanel(e, 'Rotating failed.'));
      }
    }),
  );

  root.append(
    h('section', { class: 'tool wide' },
      ...toolHeader('Rotate PDF', 'Turn some or all pages. The preview shows the result.'),
      singlePdfPicker('rotate-file', async (p) => {
        pdf = p;
        preview?.destroy();
        preview = await openPreview(p.bytes);
        selected = new Set(Array.from({ length: p.pages }, (_, i) => i));
        settings.hidden = false;
        build();
      }, () => { pdf = null; preview?.destroy(); preview = null; settings.hidden = true; result.replaceChildren(); }),
      settings,
      result,
    ),
  );
}
