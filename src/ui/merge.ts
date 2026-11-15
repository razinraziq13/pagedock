import { getPageCount, mergePdfs, PdfInputError, type PdfInput } from '../core/pdf';
import { announce, formatBytes, h } from './dom';
import { makeSaveControls } from './save';

interface Item extends PdfInput {
  id: number;
  size: number;
  pages: number | null;
  error: string | null;
}

const LARGE_TOTAL = 150 * 1024 * 1024;

export function renderMerge(root: HTMLElement) {
  let items: Item[] = [];
  let nextId = 1;
  let busy = false;

  const fileInput = h('input', { type: 'file', accept: 'application/pdf,.pdf', multiple: true, class: 'sr-only', id: 'merge-files' });
  const list = h('ol', { class: 'file-list', 'aria-label': 'Files to merge, in order' });
  const status = h('div', { class: 'status', role: 'status' });
  const result = h('div', { class: 'result' });
  const mergeBtn = h('button', { type: 'button', class: 'btn primary big' }, 'Merge PDF');

  const drop = h(
    'label',
    { class: 'drop', for: 'merge-files' },
    h('span', { class: 'drop-title' }, 'Choose PDF files'),
    h('span', { class: 'drop-sub' }, 'or drag and drop them here'),
  );

  async function addFiles(files: FileList | File[]) {
    result.replaceChildren();
    for (const f of Array.from(files)) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const item: Item = { id: nextId++, name: f.name, size: f.size, bytes, pages: null, error: null };
      try {
        item.pages = await getPageCount(item);
      } catch (e) {
        item.error = e instanceof PdfInputError ? e.message.replace(`${f.name}: `, '') : 'Could not read this file.';
      }
      items.push(item);
    }
    draw();
    announce(`${items.length} file${items.length === 1 ? '' : 's'} selected.`);
  }

  function move(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    result.replaceChildren();
    draw();
    (list.children[j]?.querySelector(d < 0 ? '[data-up]' : '[data-down]') as HTMLElement | null)?.focus();
  }

  function draw() {
    list.replaceChildren(
      ...items.map((it, i) =>
        h('li', { class: `file ${it.error ? 'bad' : ''}` },
          h('span', { class: 'file-pos', 'aria-hidden': 'true' }, String(i + 1)),
          h('span', { class: 'file-main' },
            h('span', { class: 'file-name' }, it.name),
            h('span', { class: 'file-meta' }, it.error ? `Can't use: ${it.error}` : `${it.pages} page${it.pages === 1 ? '' : 's'} · ${formatBytes(it.size)}`),
          ),
          h('span', { class: 'file-actions' },
            h('button', { type: 'button', class: 'icon-btn', 'data-up': '', 'aria-label': `Move ${it.name} up`, disabled: i === 0, onClick: () => move(i, -1) }, '↑'),
            h('button', { type: 'button', class: 'icon-btn', 'data-down': '', 'aria-label': `Move ${it.name} down`, disabled: i === items.length - 1, onClick: () => move(i, 1) }, '↓'),
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Remove ${it.name}`, onClick: () => { items = items.filter((x) => x.id !== it.id); result.replaceChildren(); draw(); } }, '✕'),
          ),
        ),
      ),
    );
    const good = items.filter((it) => !it.error);
    const bad = items.length - good.length;
    const total = good.reduce((s, it) => s + it.size, 0);
    const pages = good.reduce((s, it) => s + (it.pages ?? 0), 0);
    const msgs: string[] = [];
    if (items.length === 0) msgs.push('Add at least two PDFs.');
    else if (good.length < 2) msgs.push('Add at least two readable PDFs.');
    else msgs.push(`${good.length} files, ${pages} pages in total.`);
    if (bad) msgs.push(`Remove the ${bad} file${bad === 1 ? '' : 's'} that can't be used.`);
    if (total > LARGE_TOTAL) msgs.push('These files are large. Merging may be slow or fail on phones.');
    status.textContent = msgs.join(' ');
    mergeBtn.disabled = busy || good.length < 2 || bad > 0;
  }

  mergeBtn.addEventListener('click', async () => {
    busy = true;
    draw();
    mergeBtn.textContent = 'Merging…';
    result.replaceChildren();
    try {
      const out = await mergePdfs(items);
      const base = items[0].name.replace(/\.pdf$/i, '');
      result.append(
        h('div', { class: 'done' },
          h('h2', {}, 'Your merged PDF is ready'),
          h('p', {}, `${items.reduce((s, it) => s + (it.pages ?? 0), 0)} pages · ${formatBytes(out.length)}`),
          makeSaveControls(out, `${base}-merged.pdf`, 'application/pdf'),
          h('p', { class: 'note' }, 'If any input had a digital signature, that signature is not valid in the merged file.'),
        ),
      );
      announce('Merged PDF is ready to download.');
    } catch (e) {
      result.append(h('p', { class: 'error', role: 'alert' }, e instanceof Error ? e.message : 'Merging failed.'));
    } finally {
      busy = false;
      mergeBtn.textContent = 'Merge PDF';
      draw();
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files?.length) addFiles(fileInput.files);
    fileInput.value = '';
  });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files);
  });

  root.append(
    h('a', { class: 'back', href: '#/' }, '← All tools'),
    h('section', { class: 'tool' },
      h('h1', {}, 'Merge PDF'),
      h('p', { class: 'lead' }, 'Combine PDFs into one file. Use the arrows to set the order.'),
      fileInput,
      drop,
      list,
      status,
      mergeBtn,
      result,
    ),
  );
  draw();
}
