/* Visual Sign — signature pad, ink colours and saved signatures ported from the owner's Prism Scan app. */
import { applyAnnotations } from '../core/edit';
import { sniffImage } from '../core/images';
import { announce, h, safeCapture } from './dom';
import { errorPanel, resultPanel, singlePdfPicker, toolHeader, withBusy, type LoadedPdf } from './common';
import { openPreview, type Previewer } from './thumbs';
import { pageEditor, type Tool } from './editor';
import { toolButtons } from './annotate';
import { deleteSig, listSigs, saveSig, type SavedSig } from './sigstore';

const INKS: [string, string][] = [['#111827', 'Black'], ['#1d4ed8', 'Blue'], ['#7c3aed', 'Purple'], ['#dc2626', 'Red']];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Crop away empty (transparent) margins so the signature sits tightly in its box. */
function trimmed(c: HTMLCanvasElement, margin = 6): HTMLCanvasElement | null {
  const x = c.getContext('2d', { willReadFrequently: true })!;
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
  for (let y = 0; y < c.height; y++) for (let i = 0; i < c.width; i++) {
    if (d[(y * c.width + i) * 4 + 3] > 10) { if (i < minX) minX = i; if (i > maxX) maxX = i; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX < 0) return null;
  minX = Math.max(0, minX - margin); minY = Math.max(0, minY - margin); maxX = Math.min(c.width - 1, maxX + margin); maxY = Math.min(c.height - 1, maxY + margin);
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1; out.height = maxY - minY + 1;
  out.getContext('2d')!.drawImage(c, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}
const pngOf = (c: HTMLCanvasElement) => new Promise<Uint8Array>((res, rej) => c.toBlob(async (b) => (b ? res(new Uint8Array(await b.arrayBuffer())) : rej(new Error('Could not create the signature image.'))), 'image/png'));

/** Prism Scan's pad: smooth curves, faster strokes draw thinner lines, colour can change after drawing. */
function signaturePad() {
  const canvas = h('canvas', { class: 'sig-pad', 'aria-label': 'Signature drawing area. Sign with your finger, pen or mouse.' });
  const placeholder = h('span', { class: 'pad-ph' }, 'Sign here');
  const wrap = h('div', { class: 'pad-wrap' }, canvas, h('div', { class: 'pad-line', 'aria-hidden': 'true' }), placeholder);
  let ink = (() => { try { return localStorage.getItem('pagedock:ink') || INKS[0][0]; } catch { return INKS[0][0]; } })();
  let ctx: CanvasRenderingContext2D | null = null, dpr = 1, drawing = false, dirty = false, w = 0;
  let pts: { x: number; y: number; t: number }[] = [];

  function size() {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    clear();
  }
  function clear() { ctx?.clearRect(0, 0, canvas.width, canvas.height); dirty = false; placeholder.hidden = false; }
  const pt = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr, t: e.timeStamp }; };
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  function stroke(from: { x: number; y: number }, ctrl: { x: number; y: number } | null, to: { x: number; y: number }, width: number) {
    if (!ctx) return;
    ctx.strokeStyle = ink; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(from.x, from.y);
    if (ctrl) ctx.quadraticCurveTo(ctrl.x, ctrl.y, to.x, to.y); else ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  function addPoint(p: { x: number; y: number; t: number }) {
    const prev = pts[pts.length - 1];
    const d = Math.hypot(p.x - prev.x, p.y - prev.y);
    if (d < 1.2 * dpr) return;
    const v = d / dpr / Math.max(1, p.t - prev.t);
    const target = clamp(4.2 - v * 1.3, 1.5, 4.2) * dpr;
    w = w * 0.65 + target * 0.35;
    pts.push(p);
    if (pts.length === 2) stroke(prev, null, mid(prev, p), w);
    else stroke(mid(pts[pts.length - 3], prev), prev, mid(prev, p), w);
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (!ctx) size();
    if (!ctx) return;
    safeCapture(canvas, e.pointerId);
    const p = pt(e);
    drawing = true; pts = [p]; w = 3.2 * dpr; dirty = true;
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(p.x, p.y, w / 2, 0, Math.PI * 2); ctx.fill();
    placeholder.hidden = true;
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    (evs.length ? evs : [e]).forEach((ev) => addPoint(pt(ev)));
    e.preventDefault();
  });
  const end = () => {
    if (!drawing) return;
    drawing = false;
    if (pts.length > 1) { const a = pts[pts.length - 2], b = pts[pts.length - 1]; stroke(mid(a, b), null, b, w); }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  const inkBtns = INKS.map(([c, name]) => h('button', { type: 'button', class: `ink ${c === ink ? 'on' : ''}`, style: `--ink:${c}`, 'aria-label': `${name} ink`, 'aria-pressed': String(c === ink), onClick: () => {
    ink = c;
    try { localStorage.setItem('pagedock:ink', c); } catch { /* private mode */ }
    inkBtns.forEach((b, i) => { b.classList.toggle('on', INKS[i][0] === c); b.setAttribute('aria-pressed', String(INKS[i][0] === c)); });
    if (dirty && ctx) { ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = ink; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.globalCompositeOperation = 'source-over'; }
  } }));

  return {
    el: h('div', { class: 'field-group' }, wrap, h('div', { class: 'row' }, h('div', { class: 'inks', role: 'group', 'aria-label': 'Ink colour' }, ...inkBtns), h('button', { type: 'button', class: 'btn', onClick: clear }, 'Clear'))),
    size,
    isEmpty: () => !dirty,
    result: () => trimmed(canvas, Math.round(6 * dpr)),
    ink: () => ink,
  };
}

export function renderSign(root: HTMLElement) {
  let pdf: LoadedPdf | null = null;
  let preview: Previewer | null = null;
  let editor: ReturnType<typeof pageEditor> | null = null;
  let current: { png: Uint8Array; url: string; aspect: number; id?: string } | null = null;
  const urls: string[] = [];

  // ---- saved signatures
  const tiles = h('div', { class: 'sig-list', role: 'list', 'aria-label': 'Your signatures' });
  async function renderTiles(selectId?: string) {
    urls.forEach((u) => URL.revokeObjectURL(u)); urls.length = 0;
    const sigs = await listSigs();
    const tile = (s: SavedSig) => {
      const url = URL.createObjectURL(new Blob([s.png as BlobPart], { type: 'image/png' })); urls.push(url);
      const pick = () => { use({ png: s.png, url, aspect: s.w / s.h, id: s.id }); };
      const t = h('div', { class: `sig-tile ${current?.id === s.id || selectId === s.id ? 'on' : ''}`, role: 'listitem' },
        h('button', { type: 'button', class: 'sig-pick', 'aria-label': 'Use this saved signature', onClick: pick }, h('img', { src: url, alt: 'Saved signature' })),
        h('button', { type: 'button', class: 'sig-del', 'aria-label': 'Delete this saved signature', onClick: async () => {
          if (!confirm('Delete this saved signature from this device?')) return;
          await deleteSig(s.id);
          if (current?.id === s.id) current = null;
          renderTiles();
          refresh();
        } }, '✕'),
      );
      if (selectId === s.id) pick();
      return t;
    };
    tiles.replaceChildren(
      h('button', { type: 'button', class: 'sig-tile add', onClick: () => { creator.hidden = false; pad.size(); creator.scrollIntoView({ block: 'nearest' }); } }, '＋ New'),
      ...sigs.map(tile),
    );
    if (!sigs.length && !current) { creator.hidden = false; requestAnimationFrame(() => pad.size()); }
  }
  function use(sig: { png: Uint8Array; url: string; aspect: number; id?: string }) {
    current = sig;
    tiles.querySelectorAll('.sig-tile').forEach((t) => t.classList.toggle('on', !!sig.id && t.querySelector('img')?.getAttribute('src') === sig.url));
    sigStatus.textContent = 'Signature ready. Tap the page where it should go, then drag it into place.';
    tools.set('signature');
  }

  // ---- create a new signature (draw like Prism Scan, or type / upload)
  const pad = signaturePad();
  const typed = h('input', { type: 'text', id: 'sig-name', class: 'text-input', placeholder: 'Your name', autocomplete: 'name' });
  const typedFont = h('select', { id: 'sig-font', class: 'text-input' },
    h('option', { value: 'italic 120px "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive' }, 'Script'),
    h('option', { value: 'italic 110px Georgia, "Times New Roman", serif' }, 'Classic italic'),
  );
  const upload = h('input', { type: 'file', id: 'sig-upload', accept: 'image/png,image/jpeg', class: 'text-input' });
  const panes: Record<string, HTMLElement> = {
    draw: pad.el,
    type: h('div', { class: 'field-group', hidden: true }, h('div', { class: 'field' }, h('label', { for: 'sig-name', class: 'field-label' }, 'Name'), typed), h('div', { class: 'field' }, h('label', { for: 'sig-font', class: 'field-label' }, 'Style'), typedFont)),
    upload: h('div', { class: 'field-group', hidden: true }, h('div', { class: 'field' }, h('label', { for: 'sig-upload', class: 'field-label' }, 'Signature image (PNG with a transparent or white background)'), upload)),
  };
  const mode = toolButtons<'draw' | 'type' | 'upload'>([['draw', '✍️ Draw'], ['type', 'Type'], ['upload', 'Upload']], 'draw', (m) => {
    for (const [k, el] of Object.entries(panes)) el.hidden = k !== m;
    if (m === 'draw') requestAnimationFrame(() => pad.size());
  });
  const sigStatus = h('p', { class: 'hint', role: 'status' });
  const remember = h('input', { type: 'checkbox', id: 'sig-remember', checked: true });

  async function saveNew() {
    sigStatus.textContent = '';
    let c: HTMLCanvasElement | null = null;
    const m = mode.get();
    if (m === 'draw') {
      if (pad.isEmpty()) { sigStatus.textContent = '✍️ Draw your signature first.'; return; }
      c = pad.result();
    } else if (m === 'type') {
      if (!typed.value.trim()) { sigStatus.textContent = 'Type your name first.'; return; }
      const t = document.createElement('canvas'); t.width = 1600; t.height = 260;
      const x = t.getContext('2d')!; x.font = typedFont.value; x.fillStyle = pad.ink(); x.textBaseline = 'middle'; x.fillText(typed.value.trim(), 20, 130);
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
    const png = await pngOf(c);
    creator.hidden = true;
    if (remember.checked) {
      const rec = await saveSig({ png, w: c.width, h: c.height });
      await renderTiles(rec.id);
    } else {
      const url = URL.createObjectURL(new Blob([png as BlobPart], { type: 'image/png' })); urls.push(url);
      use({ png, url, aspect: c.width / c.height });
    }
  }

  const creator = h('div', { class: 'sig-creator', hidden: true },
    mode.el, ...Object.values(panes),
    h('div', { class: 'field check' }, remember, h('label', { for: 'sig-remember' }, 'Save on this device for next time')),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', onClick: saveNew }, 'Use this signature'), h('button', { type: 'button', class: 'btn', onClick: () => { creator.hidden = true; } }, 'Cancel')),
  );

  // ---- placing
  const help = h('p', { class: 'hint', role: 'status' });
  const dateText = h('input', { type: 'text', id: 'sig-text', class: 'text-input', value: new Date().toLocaleDateString() });
  const tools = toolButtons<Tool>([['select', 'Select / move'], ['signature', 'Place signature'], ['text', 'Add text (e.g. date)']], 'select', (t) => {
    help.textContent = t === 'signature' ? (current ? 'Tap the page where your signature should go.' : 'Choose or create a signature first.') : t === 'text' ? 'Tap the page to place the text.' : 'Drag your signature to move it. Drag the round corner handle to resize it.';
  });
  const undoBtn = h('button', { type: 'button', class: 'btn', onClick: () => editor?.undo() }, 'Undo');
  const delBtn = h('button', { type: 'button', class: 'btn', onClick: () => editor?.removeSelected() }, 'Remove selected');
  const runBtn = h('button', { type: 'button', class: 'btn primary big' }, '✓ Save signed PDF');
  const result = h('div', { class: 'result' });

  function refresh() {
    result.replaceChildren();
    undoBtn.disabled = !editor?.canUndo();
    delBtn.disabled = !editor?.selected();
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
    h('h2', { class: 'field-label' }, '1. Your signature'),
    tiles, creator, sigStatus,
    h('p', { class: 'hint' }, 'Saved signatures stay only in this browser on this device. Tap ✕ to delete one.'),
    h('h2', { class: 'field-label' }, '2. Place it on the page'),
    tools.el,
    h('div', { class: 'field' }, h('label', { for: 'sig-text', class: 'field-label' }, 'Text to add'), dateText),
    help,
    h('div', { class: 'row' }, undoBtn, delBtn),
    h('div', { class: 'editor-slot' }),
    h('p', { class: 'hint warn' }, 'Visual signature only, not a certificate-based digital signature.'),
    runBtn,
  );

  root.append(h('section', { class: 'tool wide' },
    ...toolHeader('Visual Sign PDF', 'Draw your signature once, save it, and drop it onto any page.'),
    singlePdfPicker('sig-file', async (p) => {
      pdf = p;
      preview?.destroy();
      preview = await openPreview(p.bytes);
      editor = pageEditor({
        preview, pageCount: p.pages, onChange: refresh, onToolDone: () => tools.set('select'),
        settings: () => ({ tool: tools.get(), color: { r: 0.1, g: 0.1, b: 0.1 }, width: 2, textSize: 12, text: dateText.value, signature: current ?? undefined }),
      });
      workspace.querySelector('.editor-slot')!.replaceChildren(editor.el);
      workspace.hidden = false;
      await renderTiles();
      await editor.go(0);
      refresh();
    }, () => { pdf = null; preview?.destroy(); preview = null; editor = null; workspace.hidden = true; result.replaceChildren(); }),
    workspace, result,
  ));
}
