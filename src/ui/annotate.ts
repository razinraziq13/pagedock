import { applyAnnotations, type Color } from '../core/edit';
import { announce, h } from './dom';
import { errorPanel, resultPanel, singlePdfPicker, toolHeader, withBusy, type LoadedPdf } from './common';
import { openPreview, type Previewer } from './thumbs';
import { pageEditor, type Tool } from './editor';

const COLORS: Record<string, Color> = {
  Red: { r: 0.79, g: 0.13, b: 0.2 },
  Blue: { r: 0.2, g: 0.4, b: 0.91 },
  Black: { r: 0.09, g: 0.14, b: 0.23 },
  Green: { r: 0.05, g: 0.55, b: 0.35 },
};

export function toolButtons<T extends string>(tools: [T, string][], initial: T, onPick: (t: T) => void) {
  let current = initial;
  const btns = tools.map(([t, label]) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(t === initial), onClick: () => set(t) }, label));
  function set(t: T) {
    current = t;
    btns.forEach((b, i) => b.setAttribute('aria-pressed', String(tools[i][0] === t)));
    onPick(t);
  }
  return { el: h('div', { class: 'chips left', role: 'group', 'aria-label': 'Tool' }, ...btns), set, get: () => current };
}

export function renderAnnotate(root: HTMLElement) {
  let pdf: LoadedPdf | null = null;
  let preview: Previewer | null = null;
  let editor: ReturnType<typeof pageEditor> | null = null;

  const color = h('select', { id: 'an-color', class: 'text-input' }, ...Object.keys(COLORS).map((c) => h('option', { value: c }, c)));
  const width = h('select', { id: 'an-width', class: 'text-input' }, h('option', { value: '1' }, 'Thin'), h('option', { value: '2', selected: true }, 'Medium'), h('option', { value: '4' }, 'Thick'));
  const text = h('textarea', { id: 'an-text', class: 'text-input', rows: '2', placeholder: 'Type your note, then tap the page' });
  const textSize = h('select', { id: 'an-size', class: 'text-input' }, h('option', { value: '10' }, 'Small'), h('option', { value: '14', selected: true }, 'Medium'), h('option', { value: '20' }, 'Large'));
  const textFields = h('div', { class: 'field-group', hidden: true },
    h('div', { class: 'field' }, h('label', { for: 'an-text', class: 'field-label' }, 'Text'), text),
    h('div', { class: 'field' }, h('label', { for: 'an-size', class: 'field-label' }, 'Text size'), textSize),
  );
  const help = h('p', { class: 'hint', role: 'status' });
  const undoBtn = h('button', { type: 'button', class: 'btn', onClick: () => editor?.undo() }, 'Undo');
  const delBtn = h('button', { type: 'button', class: 'btn', onClick: () => editor?.removeSelected() }, 'Delete selected');
  const runBtn = h('button', { type: 'button', class: 'btn primary big' }, 'Save annotated PDF');
  const result = h('div', { class: 'result' });

  const HELP: Record<Tool, string> = {
    select: 'Tap a mark to select it, then drag it, or use arrow keys. Delete removes it.',
    text: 'Type your text above, then tap where it should go.',
    rect: 'Drag on the page to draw a box.', ellipse: 'Drag on the page to draw a circle or oval.',
    arrow: 'Drag from the start to the point of the arrow.', highlight: 'Drag over the area to highlight.',
    pen: 'Draw freehand with your finger, pen or mouse.', signature: '',
  };
  const tools = toolButtons<Tool>([['select', 'Select'], ['text', 'Text'], ['highlight', 'Highlight'], ['rect', 'Box'], ['ellipse', 'Circle'], ['arrow', 'Arrow'], ['pen', 'Pen']], 'select', (t) => {
    textFields.hidden = t !== 'text';
    help.textContent = HELP[t];
    if (t === 'text') text.focus();
  });

  function refresh() {
    result.replaceChildren();
    const n = editor?.count() ?? 0;
    undoBtn.disabled = !editor?.canUndo();
    delBtn.disabled = !editor?.selected();
    runBtn.disabled = n === 0;
    if (tools.get() === 'text' && !text.value.trim()) help.textContent = 'Type your text first.';
  }
  textSize.addEventListener('change', () => { const s = editor?.selected(); if (s?.type === 'text') editor!.updateSelected((a) => { if (a.type === 'text') a.size = Number(textSize.value); }); });
  color.addEventListener('change', () => { const s = editor?.selected(); if (s && 'color' in s) editor!.updateSelected((a) => { if ('color' in a) a.color = COLORS[color.value]; }); });

  runBtn.addEventListener('click', () =>
    withBusy(runBtn, 'Saving…', async () => {
      if (!pdf || !editor) return;
      try {
        const out = await applyAnnotations(pdf, editor.annotations());
        result.replaceChildren(resultPanel('Your annotated PDF is ready', `${editor.count()} mark${editor.count() === 1 ? '' : 's'} added`, out, `${pdf.name.replace(/\.pdf$/i, '')}-annotated.pdf`, 'application/pdf',
          'Marks are drawn on top of the page. The original text is not edited or reflowed.'));
        announce('Annotated PDF is ready to download.');
      } catch (e) {
        result.replaceChildren(errorPanel(e, 'Saving failed.'));
      }
    }),
  );

  const workspace = h('div', { class: 'settings', hidden: true },
    tools.el,
    h('div', { class: 'field-row three' },
      h('div', { class: 'field' }, h('label', { for: 'an-color', class: 'field-label' }, 'Colour'), color),
      h('div', { class: 'field' }, h('label', { for: 'an-width', class: 'field-label' }, 'Line'), width),
    ),
    textFields, help,
    h('div', { class: 'row' }, undoBtn, delBtn),
    h('div', { class: 'editor-slot' }),
    runBtn,
  );

  root.append(h('section', { class: 'tool wide' },
    ...toolHeader('Annotate PDF', 'Add notes, highlights, boxes, arrows and drawings on top of your pages.'),
    singlePdfPicker('an-file', async (p) => {
      pdf = p;
      preview?.destroy();
      preview = await openPreview(p.bytes);
      editor = pageEditor({
        preview, pageCount: p.pages, onChange: refresh,
        onToolDone: () => tools.set('select'),
        settings: () => ({ tool: tools.get(), color: COLORS[color.value], width: Number(width.value), textSize: Number(textSize.value), text: text.value }),
      });
      workspace.querySelector('.editor-slot')!.replaceChildren(editor.el);
      workspace.hidden = false;
      await editor.go(0);
      tools.set('select');
      refresh();
    }, () => { pdf = null; preview?.destroy(); preview = null; editor = null; workspace.hidden = true; result.replaceChildren(); }),
    workspace, result,
  ));
}
