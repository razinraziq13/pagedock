/**
 * PDF workspace: toolbar on top, page thumbnails on the left, the page in the middle, properties on the right.
 * Page changes (order, rotation, deletion) and marks (text, pictures, highlights, drawings, white-out and
 * "Edit existing text" replacements) are all kept as plans until Save, so the original file is never changed.
 */
import { applyAnnotations, type Color, type FontFamily } from '../core/edit';
import { extractPages, organizePdf } from '../core/pages';
import { sanitizeFileName } from '../core/pdf';
import { announce, h } from './dom';
import { errorPanel, pdfResultPanel, resultPanel, singlePdfPicker, toolHeader, withBusy, type LoadedPdf } from './common';
import { openPreview, type Previewer } from './thumbs';
import { pageManager, type PageManager } from './pagemanager';
import { readLayout } from './text-tools';
import { pageEditor, type Item, type PageEditor, type PlacedImage, type Tool } from './editor';

const COLORS: Record<string, Color> = {
  Black: { r: 0.09, g: 0.09, b: 0.11 },
  Red: { r: 0.79, g: 0.13, b: 0.2 },
  Blue: { r: 0.2, g: 0.4, b: 0.91 },
  Green: { r: 0.05, g: 0.55, b: 0.35 },
  Violet: { r: 0.49, g: 0.23, b: 0.93 },
};
const colorName = (c: Color) => Object.entries(COLORS).find(([, v]) => Math.abs(v.r - c.r) + Math.abs(v.g - c.g) + Math.abs(v.b - c.b) < 0.05)?.[0];

const TOOLS: [Tool, string, string][] = [
  ['select', 'Select', 'Tap a mark to select it. Drag to move it; the Properties panel changes it.'],
  ['edittext', 'Edit text', 'Tap a line of the PDF\'s own text (outlined) to replace it. The old words are covered with white and your text is written on top.'],
  ['text', 'Add text', 'Type the text in the panel, then tap where it should go.'],
  ['highlight', 'Highlight', 'Drag over the words to highlight.'],
  ['rect', 'Box', 'Drag to draw a box.'],
  ['ellipse', 'Circle', 'Drag to draw a circle or oval.'],
  ['arrow', 'Arrow', 'Drag from the start to the point of the arrow.'],
  ['pen', 'Draw', 'Draw freehand with your finger, pen or mouse.'],
  ['image', 'Picture', 'Choose a picture, then tap the page where it should go. Drag the round handle to resize.'],
  ['cover', 'White-out', 'Drag over anything you want to cover with a white box. It hides it on the page, but the words under it are not deleted from the file.'],
];
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

/** Turn any picture the browser can open into a PNG (at most 1600 px on the long side) for the PDF. */
async function pictureToPng(file: File): Promise<PlacedImage> {
  const bmp = await createImageBitmap(file).catch(() => { throw new Error(`${file.name}: this picture could not be opened. Use JPG or PNG.`); });
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('The picture could not be converted.'))), 'image/png'));
  return { png: new Uint8Array(await blob.arrayBuffer()), url: URL.createObjectURL(blob), aspect: c.width / c.height };
}

export function renderWorkspace(root: HTMLElement) {
  let pdf: LoadedPdf | null = null;
  let preview: Previewer | null = null;
  let pm: PageManager | null = null;
  let editor: PageEditor | null = null;
  let tool: Tool = 'select';
  let picture: PlacedImage | undefined;
  let zoomIndex = 2;
  // One undo list across page changes and marks, in the order they happened.
  const log: ('page' | 'mark')[] = [];
  const redoLog: ('page' | 'mark')[] = [];
  let pmDepth = 0, edDepth = 0, replaying = false;

  // ---------------------------------------------------------------- toolbar
  const toolBtns = TOOLS.map(([t, label]) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(t === tool), 'data-tool': t, onClick: () => setTool(t) }, label));
  const pictureInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', class: 'sr-only', id: 'ws-picture' });
  const undoBtn = h('button', { type: 'button', class: 'btn small', title: 'Undo (Ctrl+Z)', onClick: () => undo() }, '↶ Undo');
  const redoBtn = h('button', { type: 'button', class: 'btn small', title: 'Redo (Ctrl+Y)', onClick: () => redo() }, '↷ Redo');
  const delBtn = h('button', { type: 'button', class: 'btn small', title: 'Delete the selected mark (Delete key)', onClick: () => editor?.removeSelected() }, 'Delete mark');
  const zoomLabel = h('span', { class: 'ws-zoom-label', 'aria-live': 'polite' }, '100%');
  const zoomOut = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Zoom out', onClick: () => setZoom(zoomIndex - 1) }, '−');
  const zoomIn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Zoom in', onClick: () => setZoom(zoomIndex + 1) }, '+');
  const zoomFit = h('button', { type: 'button', class: 'btn small', title: 'Fit the page to the width', onClick: () => setZoom(2) }, 'Fit width');
  const pageLabel = h('span', { class: 'ws-page-label' });
  const prevBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Previous page', onClick: () => open((pm?.current() ?? 0) - 1) }, '‹');
  const nextBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Next page', onClick: () => open((pm?.current() ?? 0) + 1) }, '›');
  const saveBtn = h('button', { type: 'button', class: 'btn primary' }, 'Preview & save');
  const help = h('p', { class: 'hint ws-help', role: 'status' });

  const toolbar = h('div', { class: 'ws-toolbar', role: 'toolbar', 'aria-label': 'Editing tools' },
    h('div', { class: 'ws-tools chips left', role: 'group', 'aria-label': 'Tool' }, ...toolBtns),
    h('div', { class: 'ws-bar2' },
      h('div', { class: 'ws-group', role: 'group', 'aria-label': 'History' }, undoBtn, redoBtn, delBtn),
      h('div', { class: 'ws-group', role: 'group', 'aria-label': 'Zoom' }, zoomOut, zoomLabel, zoomIn, zoomFit),
      h('div', { class: 'ws-group', role: 'group', 'aria-label': 'Page' }, prevBtn, pageLabel, nextBtn),
      saveBtn,
    ),
    pictureInput,
  );

  // ---------------------------------------------------------------- properties panel
  const color = h('select', { id: 'ws-color', class: 'text-input' }, ...Object.keys(COLORS).map((c) => h('option', { value: c }, c)));
  const width = h('select', { id: 'ws-width', class: 'text-input' }, h('option', { value: '1' }, 'Thin'), h('option', { value: '2', selected: true }, 'Medium'), h('option', { value: '4' }, 'Thick'));
  const text = h('textarea', { id: 'ws-text', class: 'text-input', rows: '3', placeholder: 'Type text here' });
  const textLabel = h('label', { for: 'ws-text', class: 'field-label' }, 'Text to add');
  const size = h('input', { id: 'ws-size', class: 'text-input', type: 'number', min: '4', max: '144', step: '0.5', value: '14' });
  const font = h('select', { id: 'ws-font', class: 'text-input' }, h('option', { value: 'sans' }, 'Sans (Helvetica)'), h('option', { value: 'serif' }, 'Serif (Times)'), h('option', { value: 'mono' }, 'Mono (Courier)'));
  const bold = h('button', { type: 'button', class: 'icon-btn fmt', 'aria-pressed': 'false', 'aria-label': 'Bold', title: 'Bold' }, h('b', {}, 'B'));
  const italic = h('button', { type: 'button', class: 'icon-btn fmt', 'aria-pressed': 'false', 'aria-label': 'Italic', title: 'Italic' }, h('i', {}, 'I'));
  const selInfo = h('p', { class: 'hint ws-sel-info' });
  const textProps = h('div', { class: 'ws-props-group' },
    h('div', { class: 'field' }, textLabel, text),
    h('div', { class: 'field-row' },
      h('div', { class: 'field' }, h('label', { for: 'ws-font', class: 'field-label' }, 'Font'), font),
      h('div', { class: 'field' }, h('label', { for: 'ws-size', class: 'field-label' }, 'Size (pt)'), size),
    ),
    h('div', { class: 'row', role: 'group', 'aria-label': 'Text style' }, bold, italic),
  );
  const lineProps = h('div', { class: 'field' }, h('label', { for: 'ws-width', class: 'field-label' }, 'Line'), width);
  const colorProps = h('div', { class: 'field' }, h('label', { for: 'ws-color', class: 'field-label' }, 'Colour'), color);
  const pageInfo = h('p', { class: 'hint' });
  const rotL = h('button', { type: 'button', class: 'btn small', onClick: () => pageOp('rotL') }, '⟲ Rotate left');
  const rotR = h('button', { type: 'button', class: 'btn small', onClick: () => pageOp('rotR') }, '⟳ Rotate right');
  const delPage = h('button', { type: 'button', class: 'btn small danger', onClick: () => pageOp('delete') }, 'Delete page');
  const extractBtn = h('button', { type: 'button', class: 'btn small' }, 'Extract selected pages');
  const props = h('aside', { class: 'ws-props', 'aria-label': 'Properties' },
    h('h2', { class: 'ws-h' }, 'Properties'),
    selInfo, textProps, h('div', { class: 'field-row' }, colorProps, lineProps),
    h('h2', { class: 'ws-h' }, 'Page'),
    pageInfo,
    h('div', { class: 'row' }, rotL, rotR, delPage),
    h('div', { class: 'row' }, extractBtn),
    h('p', { class: 'note' }, 'PDFs store text as placed letters, not paragraphs. "Edit text" covers a line with white and writes your new text on top, so it works best on plain white pages, and the new line does not reflow the paragraph. Covered words are hidden, not deleted: they can still be found by copying or searching the PDF, so do not use White-out or Edit text to remove private information. Only Latin letters are supported by the built-in PDF fonts.'),
  );

  // ---------------------------------------------------------------- layout
  const railSlot = h('aside', { class: 'ws-rail', 'aria-label': 'Pages' });
  const canvasSlot = h('div', { class: 'ws-canvas' });
  const result = h('div', { class: 'result ws-result' });
  const ws = h('div', { class: 'ws', hidden: true }, toolbar, help, h('div', { class: 'ws-body' }, railSlot, canvasSlot, props));

  const typing = () => { const a = document.activeElement; return a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement; };
  ws.addEventListener('keydown', (e) => {
    if (typing() || !(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
  });

  function setTool(t: Tool) {
    if (t === 'image' && !picture) { pictureInput.click(); return; }
    tool = t;
    toolBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
    help.textContent = TOOLS.find(([x]) => x === t)![2];
    canvasSlot.dataset.tool = t;
    if (t !== 'select' && t !== 'edittext') editor?.select(null);
    editor?.redraw();
    refresh();
  }
  pictureInput.addEventListener('change', async () => {
    const f = pictureInput.files?.[0];
    pictureInput.value = '';
    if (!f) return;
    help.textContent = `Preparing ${f.name}…`;
    try { picture = await pictureToPng(f); setTool('image'); help.textContent = `${f.name}: tap the page where the picture should go.`; }
    catch (e) { help.textContent = (e as Error).message; }
  });

  function setZoom(i: number) {
    zoomIndex = Math.max(0, Math.min(ZOOMS.length - 1, i));
    editor?.setZoom(ZOOMS[zoomIndex]);
    zoomLabel.textContent = `${Math.round(ZOOMS[zoomIndex] * 100)}%`;
    zoomOut.disabled = zoomIndex === 0;
    zoomIn.disabled = zoomIndex === ZOOMS.length - 1;
  }

  function open(pos: number) {
    if (!pm || !editor || pos < 0 || pos >= pm.length()) return;
    pm.setCurrent(pos);
    pm.selectOnly(pos);
    editor.go(pm.sourceAt(pos));
    refresh();
  }

  function pageOp(op: 'rotL' | 'rotR' | 'delete') {
    if (!pm) return;
    if (!pm.selectedPositions().length) pm.selectOnly(pm.current());
    if (op === 'delete') pm.deleteSelected();
    else pm.rotateSelected(op === 'rotL' ? 270 : 90);
  }

  // ---------------------------------------------------------------- undo across pages and marks
  function track() {
    if (!pm || !editor) return;
    const p = pm.undoDepth(), e = editor.undoDepth();
    if (!replaying) {
      if (p > pmDepth) { log.push('page'); redoLog.length = 0; }
      if (e > edDepth) { log.push('mark'); redoLog.length = 0; }
    }
    pmDepth = p; edDepth = e;
  }
  function undo() {
    const k = log.pop();
    if (!k || !pm || !editor) return;
    replaying = true;
    k === 'page' ? pm.undo() : editor.undo();
    replaying = false;
    redoLog.push(k);
    track(); refresh();
  }
  function redo() {
    const k = redoLog.pop();
    if (!k || !pm || !editor) return;
    replaying = true;
    k === 'page' ? pm.redo() : editor.redo();
    replaying = false;
    log.push(k);
    track(); refresh();
  }

  // ---------------------------------------------------------------- keep everything in step
  let syncing = false;
  function onPages() {
    if (!pm || !editor || syncing) return;
    syncing = true;
    track();
    const src = pm.sourceAt(pm.current());
    if (src !== editor.page()) editor.go(src); else editor.relayout();
    syncing = false;
    refresh();
  }

  let lastWasText = false;
  function showSelection(a: Item | null) {
    const isText = a?.type === 'text';
    if (lastWasText && !isText) text.value = ''; // the box goes back to 'text to add'
    lastWasText = isText;
    textLabel.textContent = isText ? (a.cover ? 'Replacement text' : 'Selected text') : 'Text to add';
    if (isText) {
      text.value = a.text;
      size.value = String(a.size);
      font.value = a.font ?? 'sans';
      bold.setAttribute('aria-pressed', String(!!a.bold));
      italic.setAttribute('aria-pressed', String(!!a.italic));
    }
    if (a && 'color' in a && a.type !== 'cover') { const n = colorName(a.color); if (n) color.value = n; }
    if (a && 'width' in a && a.width) width.value = String(a.width);
    selInfo.textContent = !a ? 'Nothing selected. Settings below apply to new marks.'
      : a.type === 'text' ? (a.cover ? 'Replaced text line. The original words are covered with white.' : 'Text box.')
      : a.type === 'image' ? 'Picture. Drag the round handle to resize.'
      : a.type === 'cover' ? 'White-out box. Drag the round handle to resize.'
      : 'Shape. Change its colour or line below.';
    textProps.hidden = !(isText || (!a && (tool === 'text' || tool === 'select')));
    lineProps.hidden = !(a ? ['rect', 'ellipse', 'arrow', 'line', 'ink'].includes(a.type) : ['rect', 'ellipse', 'arrow', 'pen', 'select'].includes(tool));
    colorProps.hidden = a ? !('color' in a) || a.type === 'cover' || a.type === 'highlight' : tool === 'cover' || tool === 'image' || tool === 'highlight';
  }

  let lastSel: number | null = -1;
  function refresh() {
    if (!pm || !editor || !pdf) return;
    result.replaceChildren();
    const sel = editor.selected();
    const selId = sel?.id ?? null;
    if (selId !== lastSel || !sel) { lastSel = selId; showSelection(sel); }
    undoBtn.disabled = log.length === 0;
    redoBtn.disabled = redoLog.length === 0;
    delBtn.disabled = !sel;
    const pos = pm.current(), n = pm.length();
    pageLabel.textContent = `${pos + 1} / ${n}`;
    prevBtn.disabled = pos <= 0;
    nextBtn.disabled = pos >= n - 1;
    const s = pm.selectedPositions().length;
    const src = pm.sourceAt(pos);
    const rot = pm.rotation(pos);
    const marks = editor.marksOn(src);
    pageInfo.textContent = `Page ${pos + 1} of ${n}${src !== pos ? ` (page ${src + 1} in the original)` : ''}${rot ? `, turned ${rot}°` : ''}. ${marks} mark${marks === 1 ? '' : 's'} on this page.`;
    delPage.textContent = s > 1 ? `Delete ${s} pages` : 'Delete page';
    rotL.textContent = s > 1 ? `⟲ Rotate ${s} left` : '⟲ Rotate left';
    rotR.textContent = s > 1 ? `⟳ Rotate ${s} right` : '⟳ Rotate right';
    delPage.disabled = n <= 1 || s >= n;
    extractBtn.disabled = s === 0;
    extractBtn.textContent = s ? `Extract ${s} selected page${s === 1 ? '' : 's'}` : 'Extract selected pages';
  }

  // Live edits from the panel: typing in the box changes the selected text as one undo step per focus.
  text.addEventListener('focus', () => { if (editor?.selected()?.type === 'text') editor.checkpoint(); });
  text.addEventListener('input', () => { const a = editor?.selected(); if (a?.type === 'text') editor!.patchSelected((x) => { if (x.type === 'text') x.text = text.value; }); });
  const styleChange = (fn: (a: Item) => void) => { const a = editor?.selected(); if (a) editor!.updateSelected(fn); };
  size.addEventListener('change', () => { const v = Math.max(4, Math.min(144, Number(size.value) || 14)); size.value = String(v); styleChange((a) => { if (a.type === 'text') a.size = v; }); });
  font.addEventListener('change', () => styleChange((a) => { if (a.type === 'text') a.font = font.value as FontFamily; }));
  color.addEventListener('change', () => styleChange((a) => { if ('color' in a && a.type !== 'cover') a.color = COLORS[color.value]; }));
  width.addEventListener('change', () => styleChange((a) => { if ('width' in a) a.width = Number(width.value); }));
  for (const [b, key] of [[bold, 'bold'], [italic, 'italic']] as const) {
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      styleChange((a) => { if (a.type === 'text') a[key] = on; });
    });
  }

  // ---------------------------------------------------------------- save
  async function build(): Promise<Uint8Array> {
    if (!pdf || !pm || !editor) throw new Error('Open a PDF first.');
    const marks = editor.annotations();
    const kept = new Set(pm.plan().map((p) => p.source));
    const live = marks.filter((a) => kept.has(a.page)); // marks on deleted pages go with them
    const marked = live.length ? await applyAnnotations(pdf, live) : pdf.bytes;
    return organizePdf({ name: pdf.name, bytes: marked }, pm.plan());
  }
  const base = () => sanitizeFileName((pdf?.name ?? 'document').replace(/\.pdf$/i, ''), 'document');

  saveBtn.addEventListener('click', () =>
    withBusy(saveBtn, 'Preparing…', async () => {
      try {
        const out = await build();
        const marks = editor!.annotations().length;
        const word = h('button', { type: 'button', class: 'btn' }, 'Also save as Word (.docx)');
        const wordOut = h('div', {});
        word.addEventListener('click', () => withBusy(word, 'Converting…', async () => {
          try {
            const { layoutToDocx } = await import('../core/docx');
            const layout = await readLayout({ name: pdf!.name, bytes: out, size: out.length, pages: pm!.length() }, () => {}, () => true);
            if (layout.emptyPages.length === pm!.length()) throw new Error('This PDF has no selectable text to put in a Word file. Try OCR first.');
            const docx = await layoutToDocx(layout, base());
            wordOut.replaceChildren(resultPanel('Your Word file is ready', 'Editable text — formatting may change', docx, `${base()}-edited.docx`,
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'The Word file has the text and paragraphs. Pictures, drawings and exact layout stay in the PDF only.'));
          } catch (e) { wordOut.replaceChildren(errorPanel(e, 'Converting failed.')); }
        }));
        const panel = pdfResultPanel('Your edited PDF is ready', `${pm!.length()} pages, ${marks} edit${marks === 1 ? '' : 's'}`, out, `${base()}-edited.pdf`,
          'This is a new file. Your original PDF is not changed. Check the preview, then download.');
        panel.append(h('div', { class: 'row' }, word), wordOut);
        result.replaceChildren(panel);
        result.scrollIntoView({ behavior: 'smooth', block: 'start' });
        announce('Edited PDF is ready. Check the preview, then download.');
      } catch (e) { result.replaceChildren(errorPanel(e, 'Saving failed.')); }
    }),
  );

  extractBtn.addEventListener('click', () =>
    withBusy(extractBtn, 'Extracting…', async () => {
      try {
        const positions = pm!.selectedPositions();
        const out = await extractPages({ name: pdf!.name, bytes: await build() }, positions);
        result.replaceChildren(pdfResultPanel('Your extracted pages are ready', `${positions.length} page${positions.length === 1 ? '' : 's'}, with your edits`, out.bytes, out.name));
        result.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) { result.replaceChildren(errorPanel(e, 'Extracting failed.')); }
    }),
  );

  // ---------------------------------------------------------------- open a file
  root.append(h('section', { class: 'tool wide ws-tool' },
    ...toolHeader('Edit PDF', 'See every page, edit text, add text, pictures, highlights and drawings, and organize pages, all in one place.'),
    singlePdfPicker('ws-file', async (p) => {
      pdf = p;
      preview?.destroy();
      preview = await openPreview(p.bytes);
      log.length = 0; redoLog.length = 0; pmDepth = 0; edDepth = 0; lastSel = -1; picture = undefined;
      pm = pageManager({ preview, pageCount: p.pages, mode: 'organize', layout: 'rail', onOpen: (pos) => { editor?.go(pm!.sourceAt(pos)); }, onChange: () => onPages() });
      editor = pageEditor({
        preview, pageCount: p.pages, nav: false,
        rotation: (src) => { const plan = pm!.plan(); const i = plan.findIndex((x) => x.source === src); return i >= 0 ? plan[i].rotate : 0; },
        onChange: () => { track(); refresh(); },
        onToolDone: () => setTool('select'),
        onEditText: () => { text.focus(); text.select(); },
        settings: () => ({
          tool, color: COLORS[color.value], width: Number(width.value), textSize: Number(size.value) || 14, text: text.value,
          font: font.value as FontFamily, bold: bold.getAttribute('aria-pressed') === 'true', italic: italic.getAttribute('aria-pressed') === 'true',
          image: picture,
        }),
      });
      railSlot.replaceChildren(pm.el);
      canvasSlot.replaceChildren(editor.el);
      ws.hidden = false;
      setTool('select');
      setZoom(2);
      pm.selectOnly(0);
      await editor.go(0);
      refresh();
    }, () => { pdf = null; pm = null; editor = null; preview?.destroy(); preview = null; ws.hidden = true; result.replaceChildren(); }),
    ws, result,
  ));
}
