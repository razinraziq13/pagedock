import { imagesToPdf, sniffImage, type ImagesToPdfOptions } from '../core/images';
import { announce, formatBytes, h } from './dom';
import { errorPanel, resultPanel, toolHeader, withBusy } from './common';

interface Item {
  id: number;
  name: string;
  size: number;
  bytes: Uint8Array;
  url: string;
  error: string | null;
}

const LARGE_TOTAL = 150 * 1024 * 1024;

export function renderImagesToPdf(root: HTMLElement) {
  let items: Item[] = [];
  let nextId = 1;

  const input = h('input', { type: 'file', accept: 'image/jpeg,image/png,.jpg,.jpeg,.png', multiple: true, class: 'sr-only', id: 'i2p-files' });
  const drop = h('label', { class: 'drop', for: 'i2p-files' }, h('span', { class: 'drop-title' }, 'Choose images'), h('span', { class: 'drop-sub' }, 'JPG or PNG · or drag and drop them here'));
  const list = h('ol', { class: 'file-list', 'aria-label': 'Images, in page order' });
  const status = h('p', { class: 'hint', role: 'status' });
  const pageSize = h('select', { id: 'i2p-size', class: 'text-input' }, h('option', { value: 'a4' }, 'A4'), h('option', { value: 'letter' }, 'US Letter'), h('option', { value: 'fit' }, 'Same size as each image'));
  const orientation = h('select', { id: 'i2p-orient', class: 'text-input' }, h('option', { value: 'auto' }, 'Automatic (match each image)'), h('option', { value: 'portrait' }, 'Portrait'), h('option', { value: 'landscape' }, 'Landscape'));
  const margin = h('select', { id: 'i2p-margin', class: 'text-input' }, h('option', { value: '0' }, 'None'), h('option', { value: '18' }, 'Small'), h('option', { value: '36', selected: true }, 'Normal'));
  const pageOpts = h('div', { class: 'field-row' },
    h('div', { class: 'field' }, h('label', { for: 'i2p-orient', class: 'field-label' }, 'Orientation'), orientation),
    h('div', { class: 'field' }, h('label', { for: 'i2p-margin', class: 'field-label' }, 'Margin'), margin),
  );
  const runBtn = h('button', { type: 'button', class: 'btn primary big' }, 'Convert to PDF');
  const result = h('div', { class: 'result' });

  async function add(files: FileList | File[]) {
    result.replaceChildren();
    for (const f of Array.from(files)) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const kind = sniffImage(bytes);
      items.push({
        id: nextId++, name: f.name, size: f.size, bytes,
        url: kind ? URL.createObjectURL(new Blob([bytes as BlobPart], { type: kind === 'png' ? 'image/png' : 'image/jpeg' })) : '',
        error: kind ? null : /\.(heic|heif)$/i.test(f.name) ? 'HEIC photos are not supported. On iPhone, choose "Most Compatible" in Settings → Camera → Formats, or share the photo as JPG.' : 'not a JPG or PNG image.',
      });
    }
    draw();
    announce(`${items.length} image${items.length === 1 ? '' : 's'} selected.`);
  }

  function move(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    draw();
    (list.children[j]?.querySelector(d < 0 ? '[data-up]' : '[data-down]') as HTMLElement | null)?.focus();
  }

  function draw() {
    result.replaceChildren();
    list.replaceChildren(...items.map((it, i) =>
      h('li', { class: `file ${it.error ? 'bad' : ''}` },
        it.url ? h('img', { class: 'file-thumb', src: it.url, alt: '' }) : h('span', { class: 'file-pos' }, String(i + 1)),
        h('span', { class: 'file-main' },
          h('span', { class: 'file-name' }, `${i + 1}. ${it.name}`),
          h('span', { class: 'file-meta' }, it.error ? `Can't use: ${it.error}` : formatBytes(it.size)),
        ),
        h('span', { class: 'file-actions' },
          h('button', { type: 'button', class: 'icon-btn', 'data-up': '', 'aria-label': `Move ${it.name} up`, disabled: i === 0, onClick: () => move(i, -1) }, '↑'),
          h('button', { type: 'button', class: 'icon-btn', 'data-down': '', 'aria-label': `Move ${it.name} down`, disabled: i === items.length - 1, onClick: () => move(i, 1) }, '↓'),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Remove ${it.name}`, onClick: () => { URL.revokeObjectURL(it.url); items = items.filter((x) => x.id !== it.id); draw(); } }, '✕'),
        ),
      )));
    const bad = items.filter((it) => it.error).length;
    const total = items.reduce((s, it) => s + it.size, 0);
    const msgs = [items.length ? `${items.length - bad} image${items.length - bad === 1 ? '' : 's'}, one per page.` : 'Add at least one image.'];
    if (bad) msgs.push(`Remove the ${bad} file${bad === 1 ? '' : 's'} that can't be used.`);
    if (total > LARGE_TOTAL) msgs.push('These images are large. Converting may be slow or fail on phones.');
    status.textContent = msgs.join(' ');
    runBtn.disabled = items.length === 0 || bad > 0;
    pageOpts.hidden = pageSize.value === 'fit';
  }
  pageSize.addEventListener('change', draw);
  [orientation, margin].forEach((el) => el.addEventListener('change', () => result.replaceChildren()));

  runBtn.addEventListener('click', () =>
    withBusy(runBtn, 'Converting…', async () => {
      try {
        const opts: ImagesToPdfOptions = { pageSize: pageSize.value as ImagesToPdfOptions['pageSize'], orientation: orientation.value as ImagesToPdfOptions['orientation'], margin: Number(margin.value) };
        const out = await imagesToPdf(items, opts);
        result.replaceChildren(resultPanel('Your PDF is ready', `${items.length} page${items.length === 1 ? '' : 's'}`, out, 'images.pdf', 'application/pdf'));
        announce('PDF is ready to download.');
      } catch (e) {
        result.replaceChildren(errorPanel(e, 'Converting failed.'));
      }
    }),
  );

  input.addEventListener('change', () => { if (input.files?.length) add(input.files); input.value = ''; });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer?.files.length) add(e.dataTransfer.files); });

  root.append(
    h('section', { class: 'tool' },
      ...toolHeader('Images to PDF', 'Turn photos and pictures into one PDF, one image per page. Phone photos are turned upright automatically.'),
      input, drop, list, status,
      h('div', { class: 'settings' },
        h('div', { class: 'field' }, h('label', { for: 'i2p-size', class: 'field-label' }, 'Page size'), pageSize),
        pageOpts,
        runBtn,
      ),
      result,
    ),
  );
  draw();
}
