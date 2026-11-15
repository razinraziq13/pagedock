import { applyAnnotations } from '../core/edit';
import { sniffImage } from '../core/images';
import { announce, h, safeCapture } from './dom';
import { errorPanel, resultPanel, singlePdfPicker, toolHeader, withBusy, type LoadedPdf } from './common';
import { openPreview, type Previewer } from './thumbs';
import { pageEditor, type Tool } from './editor';
import { toolButtons } from './annotate';

interface Signature { png: Uint8Array; url: string; aspect: number }

/** Crop away empty (transparent) margins so the signature sits tightly in its box. */
function trimmed(c: HTMLCanvasElement): HTMLCanvasElement | null {
  const x = c.getContext('2d')!;
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
  for (let y = 0; y < c.height; y++) for (let i = 0; i < c.width; i++) {
    if (d[(y * c.width + i) * 4 + 3] > 10) { if (i < minX) minX = i; if (i > maxX) maxX = i; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX < 0) return null;
  const pad = 6;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad); maxX = Math.min(c.width - 1, maxX + pad); maxY = Math.min(c.height - 1, maxY + pad);
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1; out.height = maxY - minY + 1;
  out.getContext('2d')!.drawImage(c, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

async function toSignature(c: HTMLCanvasElement): Promise<Signature> {
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
  if (!blob) throw new Error('Could not create the signature image.');
  return { png: new Uint8Array(await blob.arrayBuffer()), url: URL.createObjectURL(blob), aspect: c.width / c.height };
}

export function renderSign(root: HTMLElement) {
  let pdf: LoadedPdf | null = null;
  let preview: Previewer | null = null;
  let editor: ReturnType<typeof pageEditor> | null = null;
  let signature: Signature | null = null;

  // ---- Draw
  const pad = h('canvas', { class: 'sig-pad', width: '900', height: '300', 'aria-label': 'Signature drawing area' });
  const ink = h('select', { id: 'sig-ink', class: 'text-input' }, h('option', { value: '#1b2a4a' }, 'Dark blue'), h('option', { value: '#111111' }, 'Black'));
  let drawing = false, last: [number, number] | null = null, hasInk = false;
  const pos = (e: PointerEvent): [number, number] => { const r = pad.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * pad.width, ((e.clientY - r.top) / r.height) * pad.height]; };
  pad.addEventListener('pointerdown', (e) => { e.preventDefault(); drawing = true; last = pos(e); safeCapture(pad, e.pointerId); });
  pad.addEventListener('pointermove', (e) => {
    if (!drawing || !last) return;
    const p = pos(e), x = pad.getContext('2d')!;
    x.strokeStyle = ink.value; x.lineWidth = 6; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(...last); x.lineTo(...p); x.stroke();
    last = p; hasInk = true;
  });
  const up = () => { drawing = false; last = null; };
  pad.addEventListener('pointerup', up);
  pad.addEventListener('pointercancel', up);

  // ---- Type
  const typed = h('input', { type: 'text', id: 'sig-name', class: 'text-input', placeholder: 'Your name', autocomplete: 'name' });
  const typedFont = h('select', { id: 'sig-font', class: 'text-input' },
    h('option', { value: 'italic 120px "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive' }, 'Script'),
    h('option', { value: 'italic 110px Georgia, "Times New Roman", serif' }, 'Classic italic'),
  );

  // ---- Upload
  const upload = h('input', { type: 'file', id: 'sig-upload', accept: 'image/png,image/jpeg', class: 'text-input' });

  const sigStatus = h('p', { class: 'hint', role: 'status' });
  const sigPreview = h('div', { class: 'sig-preview' });
  const panes: Record<string, HTMLElement> = {
    draw: h('div', { class: 'field-group' }, pad, h('div', { class: 'row' }, h('div', { class: 'field' }, h('label', { for: 'sig-ink', class: 'field-label' }, 'Ink'), ink), h('button', { type: 'button', class: 'btn', onClick: () => { pad.getContext('2d')!.clearRect(0, 0, pad.width, pad.height); hasInk = false; } }, 'Clear'))),
    type: h('div', { class: 'field-group', hidden: true }, h('div', { class: 'field' }, h('label', { for: 'sig-name', class: 'field-label' }, 'Name'), typed), h('div', { class: 'field' }, h('label', { for: 'sig-font', class: 'field-label' }, 'Style'), typedFont)),
    upload: h('div', { class: 'field-group', hidden: true }, h('div', { class: 'field' }, h('label', { for: 'sig-upload', class: 'field-label' }, 'Signature image (PNG with transparent background works best)'), upload)),
  };
  const mode = toolButtons<'draw' | 'type' | 'upload'>([['draw', 'Draw'], ['type', 'Type'], ['upload', 'Upload']], 'draw', (m) => { for (const [k, el] of Object.entries(panes)) el.hidden = k !== m; });

  async function makeSignature() {
    sigStatus.textContent = '';
    let c: HTMLCanvasElement | null = null;
    const m = mode.get();
    if (m === 'draw') {
      if (!hasInk) { sigStatus.textContent = 'Draw your signature in the box first.'; return; }
      c = trimmed(pad);
    } else if (m === 'type') {
      if (!typed.value.trim()) { sigStatus.textContent = 'Type your name first.'; return; }
      const t = document.createElement('canvas'); t.width = 1600; t.height = 260;
      const x = t.getContext('2d')!; x.font = typedFont.value; x.fillStyle = '#1b2a4a'; x.textBaseline = 'middle'; x.fillText(typed.value.trim(), 20, 130);
      c = trimmed(t);
    } else {
      const f = upload.files?.[0];
      if (!f) { sigStatus.textContent = 'Choose an image first.'; return; }
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (!sniffImage(bytes)) { sigStatus.textContent = 'Use a PNG or JPG image.'; return; }
      const bmp = await createImageBitmap(new Blob([bytes as BlobPart]));
      const k = Math.min(1, 1200 / bmp.width);
      c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    }
    if (!c) { sigStatus.textContent = 'The signature is empty.'; return; }
    if (signature) URL.revokeObjectURL(signature.url);
    signature = await toSignature(c);
    sigPreview.replaceChildren(h('img', { src: signature.url, alt: 'Your signature' }));
    sigStatus.textContent = 'Signature ready. Tap the page where it should go.';
    tools.set('signature');
  }

  const sigWidth = h('input', { type: 'range', id: 'sig-width', min: '40', max: '400', value: '160' });
  const sizeRow = h('div', { class: 'field', hidden: true }, h('label', { for: 'sig-width', class: 'field-label' }, 'Signature size'), sigWidth);
  sigWidth.addEventListener('input', () => editor?.updateSelected((a) => { if (a.type === 'image') { const asp = a.w / a.h; a.w = Number(sigWidth.value); a.h = a.w / asp; } }));

  const help = h('p', { class: 'hint', role: 'status' });
  const dateText = h('input', { type: 'text', id: 'sig-text', class: 'text-input', value: new Date().toLocaleDateString() });
  const tools = toolButtons<Tool>([['select', 'Select / move'], ['signature', 'Place signature'], ['text', 'Add text (e.g. date)']], 'select', (t) => {
    help.textContent = t === 'signature' ? (signature ? 'Tap the page where your signature should go.' : 'Create your signature first.') : t === 'text' ? 'Tap the page to place the text.' : 'Tap your signature to select it, then drag it or change its size.';
  });
  const undoBtn = h('button', { type: 'button', class: 'btn', onClick: () => editor?.undo() }, 'Undo');
  const delBtn = h('button', { type: 'button', class: 'btn', onClick: () => editor?.removeSelected() }, 'Delete selected');
  const runBtn = h('button', { type: 'button', class: 'btn primary big' }, 'Save signed PDF');
  const result = h('div', { class: 'result' });

  function refresh() {
    result.replaceChildren();
    const sel = editor?.selected();
    sizeRow.hidden = sel?.type !== 'image';
    if (sel?.type === 'image') sigWidth.value = String(Math.round(sel.w));
    undoBtn.disabled = !editor?.canUndo();
    delBtn.disabled = !sel;
    runBtn.disabled = !editor || !editor.annotations().some((a) => a.type === 'image');
  }

  runBtn.addEventListener('click', () =>
    withBusy(runBtn, 'Saving…', async () => {
      if (!pdf || !editor) return;
      try {
        const out = await applyAnnotations(pdf, editor.annotations());
        result.replaceChildren(resultPanel('Your signed PDF is ready', 'Visual signature added', out, `${pdf.name.replace(/\.pdf$/i, '')}-signed.pdf`, 'application/pdf',
          'This is a visual signature (a picture of your signature). It is not a certificate-based digital signature and does not prove who signed or that the file was not changed afterwards.'));
        announce('Signed PDF is ready to download.');
      } catch (e) {
        result.replaceChildren(errorPanel(e, 'Saving failed.'));
      }
    }),
  );

  const workspace = h('div', { class: 'settings', hidden: true },
    h('h2', { class: 'field-label' }, '1. Create your signature'),
    mode.el, ...Object.values(panes),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', onClick: makeSignature }, 'Use this signature'), sigPreview),
    sigStatus,
    h('h2', { class: 'field-label' }, '2. Place it on the page'),
    tools.el,
    h('div', { class: 'field' }, h('label', { for: 'sig-text', class: 'field-label' }, 'Text to add'), dateText),
    sizeRow, help,
    h('div', { class: 'row' }, undoBtn, delBtn),
    h('div', { class: 'editor-slot' }),
    h('p', { class: 'hint warn' }, 'Visual signature only, not a certificate-based digital signature.'),
    runBtn,
  );

  root.append(h('section', { class: 'tool wide' },
    ...toolHeader('Visual Sign PDF', 'Draw, type or upload your signature and place it on the page.'),
    singlePdfPicker('sig-file', async (p) => {
      pdf = p;
      preview?.destroy();
      preview = await openPreview(p.bytes);
      editor = pageEditor({
        preview, pageCount: p.pages, onChange: refresh, onToolDone: () => tools.set('select'),
        settings: () => ({ tool: tools.get(), color: { r: 0.1, g: 0.1, b: 0.1 }, width: 2, textSize: 12, text: dateText.value, signature: signature ?? undefined }),
      });
      workspace.querySelector('.editor-slot')!.replaceChildren(editor.el);
      workspace.hidden = false;
      await editor.go(0);
      refresh();
    }, () => { pdf = null; preview?.destroy(); preview = null; editor = null; workspace.hidden = true; result.replaceChildren(); }),
    workspace, result,
  ));
}
