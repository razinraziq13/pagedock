import { imagesToPdf } from '../core/images';
import { announce, h } from './dom';
import { errorPanel, resultPanel, toolHeader, withBusy } from './common';
import { rectSelector, type FracRect } from './rectselect';

interface Shot {
  id: number;
  name: string;
  bitmap: ImageBitmap; // already upright (EXIF applied by the browser)
  rotate: 0 | 90 | 180 | 270;
  crop: FracRect; // fractions of the rotated image
  url: string; // small preview of the processed image
}

const MAX_SIDE = 3000; // keeps phone memory in check while staying sharp for documents

/** Draw the shot with rotation and crop applied, at most MAX_SIDE pixels on the long edge. */
function processed(s: Shot, maxSide = MAX_SIDE): HTMLCanvasElement {
  const rw = s.rotate % 180 ? s.bitmap.height : s.bitmap.width;
  const rh = s.rotate % 180 ? s.bitmap.width : s.bitmap.height;
  const cw = rw * s.crop.w, ch = rh * s.crop.h;
  const k = Math.min(1, maxSide / Math.max(cw, ch));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(cw * k));
  c.height = Math.max(1, Math.round(ch * k));
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff';
  x.fillRect(0, 0, c.width, c.height);
  x.scale(k, k);
  x.translate(-rw * s.crop.x, -rh * s.crop.y);
  x.translate(rw / 2, rh / 2);
  x.rotate((s.rotate * Math.PI) / 180);
  x.drawImage(s.bitmap, -s.bitmap.width / 2, -s.bitmap.height / 2);
  return c;
}

const toJpeg = (c: HTMLCanvasElement, q = 0.88) =>
  new Promise<Uint8Array>((res, rej) => c.toBlob(async (b) => (b ? res(new Uint8Array(await b.arrayBuffer())) : rej(new Error('Could not process the photo.'))), 'image/jpeg', q));

export function renderScan(root: HTMLElement) {
  let shots: Shot[] = [];
  let nextId = 1;

  const camera = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'sr-only', id: 'scan-camera' });
  const picker = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/*', multiple: true, class: 'sr-only', id: 'scan-files' });
  const list = h('ol', { class: 'scan-list', 'aria-label': 'Scanned pages in order' });
  const editor = h('div', { class: 'scan-editor', hidden: true });
  const status = h('p', { class: 'hint', role: 'status' });
  const pageSize = h('select', { id: 'scan-size', class: 'text-input' }, h('option', { value: 'a4' }, 'A4'), h('option', { value: 'letter' }, 'US Letter'), h('option', { value: 'fit' }, 'Same size as photo'));
  const runBtn = h('button', { type: 'button', class: 'btn primary big' }, 'Make PDF');
  const result = h('div', { class: 'result' });

  async function add(files: FileList) {
    result.replaceChildren();
    for (const f of Array.from(files)) {
      try {
        const bitmap = await createImageBitmap(f, { imageOrientation: 'from-image' });
        const s: Shot = { id: nextId++, name: f.name || 'photo.jpg', bitmap, rotate: 0, crop: { x: 0, y: 0, w: 1, h: 1 }, url: '' };
        await refreshThumb(s);
        shots.push(s);
      } catch {
        status.textContent = `${f.name}: this photo could not be opened. Try JPG or PNG (iPhone: Settings → Camera → Formats → Most Compatible).`;
      }
    }
    draw();
  }

  async function refreshThumb(s: Shot) {
    const c = processed(s, 300);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.8));
    if (s.url) URL.revokeObjectURL(s.url);
    s.url = blob ? URL.createObjectURL(blob) : '';
  }

  function openEditor(s: Shot) {
    const unrot = { ...s, crop: { x: 0, y: 0, w: 1, h: 1 } };
    const full = processed(unrot, 900);
    full.className = 'preview-canvas';
    const stage = h('div', { class: 'crop-stage' }, full);
    let crop = { ...s.crop };
    const sel = rectSelector(stage, crop, (r) => { crop = r; });
    void sel;
    editor.replaceChildren(
      h('h2', {}, `Crop ${s.name}`),
      h('p', { class: 'hint' }, 'Drag the box or its corners around the document.'),
      stage,
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn primary', onClick: async () => { s.crop = crop; await refreshThumb(s); editor.hidden = true; draw(); } }, 'Apply crop'),
        h('button', { type: 'button', class: 'btn', onClick: async () => { s.crop = { x: 0, y: 0, w: 1, h: 1 }; await refreshThumb(s); editor.hidden = true; draw(); } }, 'Reset'),
        h('button', { type: 'button', class: 'btn', onClick: () => { editor.hidden = true; } }, 'Cancel'),
      ),
    );
    editor.hidden = false;
    editor.scrollIntoView({ block: 'start' });
  }

  function move(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= shots.length) return;
    [shots[i], shots[j]] = [shots[j], shots[i]];
    draw();
  }

  function draw() {
    result.replaceChildren();
    list.replaceChildren(...shots.map((s, i) => h('li', { class: 'scan-item' },
      h('img', { src: s.url, alt: `Page ${i + 1}` }),
      h('span', { class: 'page-label' }, `Page ${i + 1}`),
      h('span', { class: 'page-actions' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Move page ${i + 1} earlier`, disabled: i === 0, onClick: () => move(i, -1) }, '←'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Rotate page ${i + 1}`, onClick: async () => { s.rotate = ((s.rotate + 90) % 360) as Shot['rotate']; s.crop = { x: 0, y: 0, w: 1, h: 1 }; await refreshThumb(s); draw(); } }, '↻'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Crop page ${i + 1}`, onClick: () => openEditor(s) }, '⛶'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Remove page ${i + 1}`, onClick: () => { s.bitmap.close(); URL.revokeObjectURL(s.url); shots = shots.filter((x) => x !== s); draw(); } }, '✕'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Move page ${i + 1} later`, disabled: i === shots.length - 1, onClick: () => move(i, 1) }, '→'),
      ),
    )));
    status.textContent = shots.length ? `${shots.length} page${shots.length === 1 ? '' : 's'}.` : 'Take a photo or choose photos to start.';
    runBtn.disabled = shots.length === 0;
  }

  runBtn.addEventListener('click', () =>
    withBusy(runBtn, 'Making PDF…', async () => {
      try {
        const images = [];
        for (const s of shots) {
          const c = processed(s);
          images.push({ name: s.name, bytes: await toJpeg(c) });
          c.width = c.height = 0;
        }
        const out = await imagesToPdf(images, { pageSize: pageSize.value as 'a4' | 'letter' | 'fit', orientation: 'auto', margin: pageSize.value === 'fit' ? 0 : 18 });
        result.replaceChildren(resultPanel('Your scan is ready', `${shots.length} page${shots.length === 1 ? '' : 's'}`, out, 'scan.pdf', 'application/pdf'));
        announce('Scanned PDF is ready to download.');
      } catch (e) {
        result.replaceChildren(errorPanel(e, 'Making the PDF failed.'));
      }
    }),
  );

  camera.addEventListener('change', () => { if (camera.files?.length) add(camera.files); camera.value = ''; });
  picker.addEventListener('change', () => { if (picker.files?.length) add(picker.files); picker.value = ''; });

  root.append(h('section', { class: 'tool' },
    ...toolHeader('Scan to PDF', 'Photograph documents with your phone, tidy them up, and save one PDF.'),
    camera, picker,
    h('div', { class: 'row' },
      h('label', { for: 'scan-camera', class: 'btn primary' }, '📷 Take photo'),
      h('label', { for: 'scan-files', class: 'btn' }, 'Choose photos'),
    ),
    h('p', { class: 'hint' }, 'If the camera button does not open your camera, use "Choose photos". Photos stay on this device.'),
    list, editor, status,
    h('div', { class: 'settings' }, h('div', { class: 'field' }, h('label', { for: 'scan-size', class: 'field-label' }, 'Page size'), pageSize), runBtn),
    result,
  ));
  draw();
}
