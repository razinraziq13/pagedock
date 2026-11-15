/**
 * Word workspace: shows the pages of a .docx, lets you tap a paragraph and change its text and formatting,
 * and saves a real .docx (only the changed text is rewritten) or prints it to PDF with the browser.
 * The pages are drawn by docx-preview, which runs here in the browser; nothing is uploaded.
 */
import { WordDoc, WordError, type Align } from '../core/docxedit';
import { sanitizeFileName } from '../core/pdf';
import { announce, formatBytes, h } from './dom';
import { errorPanel, resultPanel, toolHeader, withBusy } from './common';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5];

export function renderWordEditor(root: HTMLElement) {
  let word: WordDoc | null = null;
  let name = 'document.docx';
  let current: number | null = null;
  let zoomIndex = 2;
  const undoStack: string[] = [];
  const redoStack: string[] = [];
  let typingCheckpoint = false;

  // ---------------------------------------------------------------- file picker
  const input = h('input', { type: 'file', accept: `.docx,${DOCX_MIME}`, class: 'sr-only', id: 'word-file' });
  const drop = h('label', { class: 'drop', for: 'word-file' }, h('span', { class: 'drop-title' }, 'Choose a Word file (.docx)'), h('span', { class: 'drop-sub' }, 'or drag and drop it here'));
  const info = h('div', { class: 'picked', hidden: true });

  // ---------------------------------------------------------------- toolbar
  const b = (label: string, aria: string, fn: () => void, cls = 'btn small') => h('button', { type: 'button', class: cls, 'aria-label': aria, title: aria, onClick: fn }, label);
  const undoBtn = b('↶ Undo', 'Undo (Ctrl+Z)', () => undo());
  const redoBtn = b('↷ Redo', 'Redo (Ctrl+Y)', () => redo());
  const fmt = (key: 'bold' | 'italic' | 'underline', label: HTMLElement, aria: string) => {
    const btn = h('button', { type: 'button', class: 'icon-btn fmt', 'aria-pressed': 'false', 'aria-label': aria, title: aria }, label);
    btn.addEventListener('click', () => {
      if (!word || current === null) return;
      const on = btn.getAttribute('aria-pressed') !== 'true';
      change(() => word!.setFormat(current!, { [key]: on }), `${aria} ${on ? 'on' : 'off'}.`);
    });
    return btn;
  };
  const boldBtn = fmt('bold', h('b', {}, 'B'), 'Bold');
  const italicBtn = fmt('italic', h('i', {}, 'I'), 'Italic');
  const underBtn = fmt('underline', h('u', {}, 'U'), 'Underline');
  const aligns: [Align, string, string][] = [['left', '⯇', 'Align left'], ['center', '≡', 'Centre'], ['right', '⯈', 'Align right'], ['both', '☰', 'Justify']];
  const alignBtns = aligns.map(([a, label, aria]) => {
    const btn = h('button', { type: 'button', class: 'icon-btn fmt', 'aria-pressed': 'false', 'aria-label': aria, title: aria, 'data-align': a }, label);
    btn.addEventListener('click', () => { if (word && current !== null) change(() => word!.setFormat(current!, { align: a }), `${aria}.`); });
    return btn;
  });
  const sizeSel = h('select', { class: 'text-input ws-size-sel', 'aria-label': 'Text size (pt)' }, h('option', { value: '' }, 'Size'), ...[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48].map((n) => h('option', { value: String(n) }, `${n} pt`)));
  sizeSel.addEventListener('change', () => { if (word && current !== null && sizeSel.value) change(() => word!.setFormat(current!, { size: Number(sizeSel.value) }), `Size ${sizeSel.value} pt.`); });
  const addBtn = b('+ Paragraph', 'Add a paragraph after the selected one', () => {
    if (!word || current === null) return;
    let ni = 0;
    change(() => { ni = word!.insertAfter(current!); }, 'Paragraph added.');
    select(ni);
    text.focus();
  });
  const removeBtn = b('Delete paragraph', 'Delete the selected paragraph', () => {
    if (!word || current === null) return;
    if (!word.canRemove(current)) { status.textContent = 'This paragraph holds a table cell or a section layout, so it cannot be removed. Clear its text instead.'; return; }
    change(() => word!.remove(current!), 'Paragraph deleted.');
    select(null);
  });
  const zoomLabel = h('span', { class: 'ws-zoom-label' }, '100%');
  const zoomOut = b('−', 'Zoom out', () => setZoom(zoomIndex - 1), 'icon-btn');
  const zoomIn = b('+', 'Zoom in', () => setZoom(zoomIndex + 1), 'icon-btn');
  const saveBtn = h('button', { type: 'button', class: 'btn primary' }, 'Save .docx');
  const pdfBtn = h('button', { type: 'button', class: 'btn' }, 'Save as PDF');
  const status = h('p', { class: 'hint ws-help', role: 'status' }, 'Tap a paragraph on the page to edit it.');

  const toolbar = h('div', { class: 'ws-toolbar', role: 'toolbar', 'aria-label': 'Word editing tools' },
    h('div', { class: 'ws-bar2' },
      h('div', { class: 'ws-group', role: 'group', 'aria-label': 'History' }, undoBtn, redoBtn),
      h('div', { class: 'ws-group', role: 'group', 'aria-label': 'Text style' }, boldBtn, italicBtn, underBtn, sizeSel),
      h('div', { class: 'ws-group', role: 'group', 'aria-label': 'Alignment' }, ...alignBtns),
      h('div', { class: 'ws-group', role: 'group', 'aria-label': 'Paragraphs' }, addBtn, removeBtn),
      h('div', { class: 'ws-group', role: 'group', 'aria-label': 'Zoom' }, zoomOut, zoomLabel, zoomIn),
      saveBtn, pdfBtn,
    ),
  );

  // ---------------------------------------------------------------- panels
  const rail = h('ol', { class: 'word-rail', 'aria-label': 'Pages' });
  const styleBox = h('div', { class: 'word-styles' });
  const view = h('div', { class: 'word-view', 'aria-label': 'Document pages. Tap a paragraph to edit it.' });
  const text = h('textarea', { id: 'word-text', class: 'text-input', rows: '6', disabled: true, placeholder: 'Tap a paragraph on the page' });
  const paraInfo = h('p', { class: 'hint' }, 'No paragraph selected.');
  const props = h('aside', { class: 'ws-props', 'aria-label': 'Paragraph' },
    h('h2', { class: 'ws-h' }, 'Paragraph'),
    paraInfo,
    h('label', { for: 'word-text', class: 'field-label' }, 'Text'),
    text,
    h('p', { class: 'note' }, 'You are editing the real text of the Word file. Words you do not change keep their own formatting. Tabs and new lines are kept. B, I, U and size apply to the whole paragraph.'),
    h('p', { class: 'note' }, 'The page view is drawn in your browser and can wrap lines a little differently from Microsoft Word. The saved .docx keeps the original styles, pictures, tables, headers and footers.'),
  );
  const result = h('div', { class: 'result ws-result' });
  const ws = h('div', { class: 'ws word-ws', hidden: true }, toolbar, status,
    h('div', { class: 'ws-body' }, h('aside', { class: 'ws-rail', 'aria-label': 'Pages' }, rail), h('div', { class: 'ws-canvas word-canvas' }, styleBox, view), props));

  // ---------------------------------------------------------------- render
  let renderToken = 0;
  async function render() {
    if (!word) return;
    const token = ++renderToken;
    const { renderAsync } = await import('docx-preview');
    const body = h('div', {});
    const styles = h('div', {});
    try {
      await renderAsync(word.previewBytes(), body, styles, {
        inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: false, renderChanges: false, renderComments: false,
        useBase64URL: false, className: 'docx', experimental: true,
      });
    } catch {
      if (token === renderToken) status.textContent = 'Some parts of this file could not be drawn on screen. Editing and saving still work.';
    }
    if (token !== renderToken) return;
    const top = view.scrollTop;
    styleBox.replaceChildren(...styles.childNodes);
    view.replaceChildren(...body.childNodes);
    view.scrollTop = top;
    view.querySelectorAll('a[href]').forEach((a) => a.removeAttribute('href')); // links in the document do not navigate away
    mark();
    thumbs();
  }

  const pages = () => Array.from(view.querySelectorAll<HTMLElement>('section.docx'));
  function thumbs() {
    const list = pages();
    rail.replaceChildren(...list.slice(0, 60).map((sec, i) => {
      const clone = sec.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
      clone.removeAttribute('id');
      clone.setAttribute('aria-hidden', 'true');
      const mini = h('div', { class: 'word-mini' }, clone);
      const li = h('li', {}, h('button', { type: 'button', class: 'word-thumb', 'aria-label': `Go to page ${i + 1}`, onClick: () => sec.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, mini, h('span', { class: 'page-label' }, String(i + 1))));
      return li;
    }));
    if (list.length > 60) rail.append(h('li', { class: 'muted' }, `+${list.length - 60} more pages`));
    // Scale each copy to the rail width.
    requestAnimationFrame(() => rail.querySelectorAll<HTMLElement>('.word-mini').forEach((m) => {
      const page = m.firstElementChild as HTMLElement;
      const w = page.offsetWidth || 794;
      const k = (m.clientWidth || 96) / w;
      page.style.transform = `scale(${k})`;
      m.style.height = `${(page.offsetHeight || 1123) * k}px`;
    }));
  }

  function paraEl(i: number): HTMLElement | null {
    return (view.querySelector(`#pdk_${i}`)?.closest('p') as HTMLElement | null) ?? null;
  }
  function mark() {
    view.querySelectorAll('.word-sel').forEach((e) => e.classList.remove('word-sel'));
    if (current !== null) paraEl(current)?.classList.add('word-sel');
  }

  view.addEventListener('click', (e) => {
    const p = (e.target as Element).closest('p');
    const id = p?.querySelector('[id^="pdk_"]')?.id;
    if (!id) return;
    select(Number(id.slice(4)));
  });

  function select(i: number | null) {
    current = i;
    typingCheckpoint = false;
    if (!word || i === null || i >= word.count) {
      current = null;
      text.value = '';
      text.disabled = true;
      paraInfo.textContent = 'No paragraph selected.';
    } else {
      const p = word.paragraphs()[i];
      text.disabled = false;
      text.value = p.text;
      paraInfo.textContent = `Paragraph ${i + 1} of ${word.count}${p.heading ? ' · heading' : ''}${p.inTable ? ' · in a table' : ''}.`;
    }
    refresh();
    mark();
  }

  function refresh() {
    const has = !!word && current !== null;
    [boldBtn, italicBtn, underBtn, ...alignBtns, addBtn, removeBtn, sizeSel].forEach((x) => { (x as HTMLButtonElement).disabled = !has; });
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
    zoomOut.disabled = zoomIndex === 0;
    zoomIn.disabled = zoomIndex === ZOOMS.length - 1;
    if (has) {
      const f = word!.format(current!);
      boldBtn.setAttribute('aria-pressed', String(f.bold));
      italicBtn.setAttribute('aria-pressed', String(f.italic));
      underBtn.setAttribute('aria-pressed', String(f.underline));
      alignBtns.forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.align === f.align)));
      sizeSel.value = f.size && [...sizeSel.options].some((o) => o.value === String(f.size)) ? String(f.size) : '';
    }
  }

  function change(fn: () => void, msg: string) {
    if (!word) return;
    undoStack.push(word.snapshot());
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
    try { fn(); } catch (e) { undoStack.pop(); status.textContent = e instanceof Error ? e.message : 'That change could not be made.'; return; }
    result.replaceChildren();
    announce(msg);
    refresh();
    render();
  }
  function undo() {
    if (!word || !undoStack.length) return;
    redoStack.push(word.snapshot());
    word.restore(undoStack.pop()!);
    typingCheckpoint = false;
    select(current !== null && current < word.count ? current : null);
    render();
    announce('Undone.');
  }
  function redo() {
    if (!word || !redoStack.length) return;
    undoStack.push(word.snapshot());
    word.restore(redoStack.pop()!);
    select(current !== null && current < word.count ? current : null);
    render();
    announce('Redone.');
  }

  // Typing: one undo step per editing session, and the page view catches up shortly after you pause.
  let typingTimer = 0;
  text.addEventListener('input', () => {
    if (!word || current === null) return;
    if (!typingCheckpoint) { undoStack.push(word.snapshot()); redoStack.length = 0; typingCheckpoint = true; }
    word.setText(current, text.value);
    result.replaceChildren();
    refresh();
    clearTimeout(typingTimer);
    typingTimer = window.setTimeout(render, 350);
  });
  text.addEventListener('blur', () => { typingCheckpoint = false; });

  ws.addEventListener('keydown', (e) => {
    if (e.target === text || !(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
  });

  function setZoom(i: number) {
    zoomIndex = Math.max(0, Math.min(ZOOMS.length - 1, i));
    view.style.setProperty('--word-zoom', String(ZOOMS[zoomIndex]));
    zoomLabel.textContent = `${Math.round(ZOOMS[zoomIndex] * 100)}%`;
    refresh();
  }

  // ---------------------------------------------------------------- save
  const base = () => sanitizeFileName(name.replace(/\.docx$/i, ''), 'document');
  saveBtn.addEventListener('click', () => withBusy(saveBtn, 'Saving…', async () => {
    if (!word) return;
    try {
      const out = word.save();
      WordDoc.open(out); // check the result opens again before offering it
      result.replaceChildren(resultPanel('Your Word file is ready', 'Edited .docx', out, `${base()}-edited.docx`, DOCX_MIME,
        'The pages shown above are a preview of this file. Your original file is not changed.'));
      announce('Word file is ready to download.');
    } catch (e) { result.replaceChildren(errorPanel(e, 'Saving failed.')); }
  }));

  pdfBtn.addEventListener('click', () => {
    if (!word) return;
    // Print only the document pages; the browser's "Save as PDF" printer makes the file, on this device.
    const holder = h('div', { id: 'print-root' }, styleBox.cloneNode(true), view.cloneNode(true));
    holder.querySelectorAll('.word-sel').forEach((e) => e.classList.remove('word-sel'));
    document.body.append(holder);
    document.documentElement.classList.add('print-word');
    const done = () => { holder.remove(); document.documentElement.classList.remove('print-word'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    result.replaceChildren(h('div', { class: 'note' }, 'In the print window choose "Save as PDF" (or "Microsoft Print to PDF") as the printer, set margins to "None" and turn off headers and footers. The PDF is made by your browser from the pages shown here.'));
    window.print();
    setTimeout(() => { if (!matchMedia('print').matches) done(); }, 1000);
  });

  // ---------------------------------------------------------------- open
  async function use(file: File) {
    info.hidden = false;
    info.className = 'picked';
    info.replaceChildren(h('span', { class: 'file-meta' }, `Reading ${file.name}…`));
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      word = WordDoc.open(bytes);
      name = file.name;
      undoStack.length = 0; redoStack.length = 0; current = null;
      drop.hidden = true;
      info.className = 'picked file';
      info.replaceChildren(
        h('span', { class: 'file-main' }, h('span', { class: 'file-name' }, file.name), h('span', { class: 'file-meta' }, `${word.count} paragraphs · ${formatBytes(file.size)}`)),
        h('button', { type: 'button', class: 'btn', onClick: () => { drop.hidden = false; info.hidden = true; ws.hidden = true; word = null; result.replaceChildren(); } }, 'Choose another'),
      );
      ws.hidden = false;
      setZoom(2);
      select(null);
      await render();
    } catch (e) {
      word = null;
      ws.hidden = true;
      info.className = 'picked file bad';
      info.replaceChildren(h('span', { class: 'file-meta' }, e instanceof WordError ? e.message : `${file.name}: could not read this file.`));
    }
  }
  input.addEventListener('change', () => { if (input.files?.[0]) use(input.files[0]); input.value = ''; });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer?.files[0]; if (f) use(f); });

  root.append(h('section', { class: 'tool wide ws-tool' },
    ...toolHeader('Edit Word', 'See the pages of a Word file, tap a paragraph to change its text or style, then save as .docx or PDF.'),
    h('div', {}, input, drop, info),
    ws, result,
  ));
}
