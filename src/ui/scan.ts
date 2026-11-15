/* Scan to PDF — flow and image processing ported from the owner's Prism Scan app:
 * photo → corner adjust (auto edge finding, loupe) → perspective straighten → filter → page list → PDF. */
import { imagesToPdf } from '../core/images';
import { applyFilter, FILTERS, orderCorners, rotate90, warp, type FilterName, type Pixels, type Pt } from '../core/scanimage';
import { announce, h, safeCapture } from './dom';
import { errorPanel, resultPanel, toolHeader, withBusy } from './common';
import { findDocumentCorners, warmUpEdges } from './edges';

const HANDLE_COLORS = ['#a78bfa', '#f472b6', '#fb923c', '#2dd4bf'];
const SVGNS = 'http://www.w3.org/2000/svg';

interface Page { id: number; jpeg: Uint8Array; url: string; w: number; h: number }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
function makeCanvas(w: number, hh: number) { const c = document.createElement('canvas'); c.width = w; c.height = hh; return c; }
function downscale(src: HTMLCanvasElement, max: number): HTMLCanvasElement {
  const s = Math.min(1, max / Math.max(src.width, src.height));
  if (s === 1) return src;
  const c = makeCanvas(Math.round(src.width * s), Math.round(src.height * s));
  const x = c.getContext('2d')!;
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
const pixelsOf = (c: HTMLCanvasElement): Pixels => { const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height); return { width: d.width, height: d.height, data: d.data }; };
function canvasOf(p: Pixels): HTMLCanvasElement { const c = makeCanvas(p.width, p.height); c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0); return c; }
const toBlob = (c: HTMLCanvasElement, type = 'image/jpeg', q = 0.86) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode the image.'))), type, q));

/** Load a photo upright (EXIF applied), at most 2400 px on the long side. */
async function loadPhoto(file: File): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const s = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const c = makeCanvas(Math.round(bmp.width * s), Math.round(bmp.height * s));
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

export function renderScan(root: HTMLElement) {
  let pages: Page[] = [];
  let nextId = 1;
  let queue: File[] = [];
  let queueTotal = 0;
  let source: HTMLCanvasElement | null = null;
  let corners: Pt[] = [];
  let cornersTouched = false;
  let cropToken = 0;
  let warped: Pixels | null = null;
  let filter: FilterName = (() => { try { return (localStorage.getItem('pagedock:scanFilter') as FilterName) || 'magic'; } catch { return 'magic'; } })();

  // ---------------- inputs
  const camera = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'sr-only', id: 'scan-camera' });
  const picker = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'sr-only', id: 'scan-files' });
  const onFiles = (inp: HTMLInputElement) => {
    const files = [...(inp.files ?? [])].filter((f) => !f.type || f.type.startsWith('image/'));
    inp.value = '';
    if (!files.length) return;
    queue = files; queueTotal = files.length;
    processNext();
  };
  camera.addEventListener('change', () => onFiles(camera));
  picker.addEventListener('change', () => onFiles(picker));
  const startButtons = () => h('div', { class: 'scan-dock' },
    h('label', { for: 'scan-camera', class: 'scan-big', onClick: warmUpEdges }, h('span', { class: 'scan-ic g1', 'aria-hidden': 'true' }, '📷'), 'Scan with camera'),
    h('label', { for: 'scan-files', class: 'scan-big', onClick: warmUpEdges }, h('span', { class: 'scan-ic g2', 'aria-hidden': 'true' }, '🖼️'), 'Import photos'),
  );

  // ---------------- views
  const viewStart = h('div', { class: 'scan-view' });
  const viewCrop = h('div', { class: 'scan-view', hidden: true });
  const viewFilter = h('div', { class: 'scan-view', hidden: true });
  const viewPages = h('div', { class: 'scan-view', hidden: true });
  const show = (v: HTMLElement) => { for (const x of [viewStart, viewCrop, viewFilter, viewPages]) x.hidden = x !== v; };

  // ---------------- crop step
  const stage = h('div', { class: 'scan-stage' });
  const cropCanvas = h('canvas', { class: 'scan-canvas', 'aria-hidden': 'true' });
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'scan-svg');
  svg.innerHTML =
    '<defs><linearGradient id="scan-cg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a78bfa"/>' +
    '<stop offset=".5" stop-color="#f472b6"/><stop offset="1" stop-color="#fb923c"/></linearGradient></defs>' +
    '<path class="scan-shade" fill="rgba(8,4,20,.55)" fill-rule="evenodd"/>' +
    '<polygon class="scan-poly" fill="rgba(244,114,182,.12)" stroke="url(#scan-cg)" stroke-width="3" stroke-linejoin="round"/>' +
    HANDLE_COLORS.map((c, i) => `<g class="scan-handle" data-i="${i}"><circle r="22" fill="${c}" opacity=".28"/><circle r="10" fill="${c}" stroke="#fff" stroke-width="3"/></g>`).join('');
  const loupe = h('canvas', { class: 'scan-loupe', width: '240', height: '240', hidden: true, 'aria-hidden': 'true' });
  stage.append(cropCanvas, svg, loupe);
  const status = h('p', { class: 'scan-status', role: 'status' });
  const queuePill = h('span', { class: 'scan-pill', hidden: true });
  let view: { s: number; ox: number; oy: number; dw: number; dh: number } | null = null;

  function setStatus(msg: string, hideAfter?: number) {
    status.textContent = msg;
    if (hideAfter) { const m = msg; setTimeout(() => { if (status.textContent === m) status.textContent = ''; }, hideAfter); }
  }

  function layoutCrop() {
    if (!source) return;
    const W = stage.clientWidth || 600, H = stage.clientHeight || 480, pad = 26;
    const s = Math.min((W - pad * 2) / source.width, (H - pad * 2) / source.height);
    const dw = source.width * s, dh = source.height * s, ox = (W - dw) / 2, oy = (H - dh) / 2;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cropCanvas.width = Math.round(dw * dpr); cropCanvas.height = Math.round(dh * dpr);
    Object.assign(cropCanvas.style, { width: `${dw}px`, height: `${dh}px`, left: `${ox}px`, top: `${oy}px` });
    cropCanvas.getContext('2d')!.drawImage(source, 0, 0, cropCanvas.width, cropCanvas.height);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    view = { s, ox, oy, dw, dh };
    drawOverlay();
  }
  function drawOverlay() {
    const v = view; if (!v || corners.length !== 4) return;
    const P = corners.map(([x, y]) => [v.ox + x * v.s, v.oy + y * v.s]);
    svg.querySelector('.scan-poly')!.setAttribute('points', P.map((p) => p.join(',')).join(' '));
    svg.querySelector('.scan-shade')!.setAttribute('d', `M${v.ox},${v.oy}H${v.ox + v.dw}V${v.oy + v.dh}H${v.ox}Z M${P.map((p) => p.join(',')).join(' L')}Z`);
    svg.querySelectorAll('.scan-handle').forEach((g, i) => g.setAttribute('transform', `translate(${P[i][0]},${P[i][1]})`));
  }

  async function autoDetect(manual: boolean) {
    if (!source) return;
    const token = ++cropToken;
    setStatus('✨ Finding edges…');
    try {
      const small = downscale(source, 640), sc = source.width / small.width;
      const id = small.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, small.width, small.height);
      const q = await findDocumentCorners(id);
      if (token !== cropToken) return;
      if (q) {
        if (manual || !cornersTouched) { corners = orderCorners(q.map(([x, y]) => [x * sc, y * sc] as Pt)); drawOverlay(); }
        setStatus('✅ Document found', 1600);
      } else setStatus('🤔 Edges not found. Drag the coloured dots to the corners.', 3000);
    } catch (e) {
      if (token === cropToken) setStatus(`⚠️ ${(e as Error).message} Drag the dots instead.`, 4000);
    }
  }

  async function processNext() {
    const file = queue.shift();
    if (!file) { showPages(); return; }
    try {
      source = await loadPhoto(file);
    } catch {
      setStatus(`⚠️ ${file.name || 'That photo'} could not be opened. Try JPG or PNG.`, 4000);
      return processNext();
    }
    const { width: w, height: hh } = source, m = 0.05;
    corners = [[w * m, hh * m], [w * (1 - m), hh * m], [w * (1 - m), hh * (1 - m)], [w * m, hh * (1 - m)]];
    cornersTouched = false;
    const done = queueTotal - queue.length;
    queuePill.textContent = `${done} / ${queueTotal}`;
    queuePill.hidden = queueTotal < 2;
    show(viewCrop);
    requestAnimationFrame(() => { layoutCrop(); autoDetect(false); });
  }

  // dragging corners
  let drag: { i: number; offX: number; offY: number } | null = null;
  const stagePoint = (e: PointerEvent): Pt => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  stage.addEventListener('pointerdown', (e) => {
    if (!view || !source) return;
    const [px, py] = stagePoint(e), v = view;
    let best = -1, bd = 60;
    corners.forEach(([x, y], i) => { const d = Math.hypot(v.ox + x * v.s - px, v.oy + y * v.s - py); if (d < bd) { bd = d; best = i; } });
    if (best < 0) return;
    const [cx, cy] = corners[best];
    drag = { i: best, offX: v.ox + cx * v.s - px, offY: v.oy + cy * v.s - py };
    cornersTouched = true; cropToken++; setStatus('');
    safeCapture(stage, e.pointerId);
    loupe.hidden = false; drawLoupe(best);
    e.preventDefault();
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || !view || !source) return;
    const [px, py] = stagePoint(e), v = view;
    corners[drag.i] = [clamp((px + drag.offX - v.ox) / v.s, 0, source.width), clamp((py + drag.offY - v.oy) / v.s, 0, source.height)];
    drawOverlay(); drawLoupe(drag.i);
    e.preventDefault();
  });
  const endDrag = () => { drag = null; loupe.hidden = true; };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  function drawLoupe(i: number) {
    if (!source || !view) return;
    const ctx = loupe.getContext('2d')!, v = view, [x, y] = corners[i];
    const side = 120 / (v.s * 3), scale = 240 / side, sx0 = x - side / 2, sy0 = y - side / 2;
    const ix0 = Math.max(0, sx0), iy0 = Math.max(0, sy0), ix1 = Math.min(source.width, sx0 + side), iy1 = Math.min(source.height, sy0 + side);
    ctx.fillStyle = '#120c24'; ctx.fillRect(0, 0, 240, 240);
    if (ix1 > ix0 && iy1 > iy0) ctx.drawImage(source, ix0, iy0, ix1 - ix0, iy1 - iy0, (ix0 - sx0) * scale, (iy0 - sy0) * scale, (ix1 - ix0) * scale, (iy1 - iy0) * scale);
    ctx.strokeStyle = HANDLE_COLORS[i]; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(120, 70); ctx.lineTo(120, 170); ctx.moveTo(70, 120); ctx.lineTo(170, 120); ctx.stroke();
    loupe.style.left = v.ox + x * v.s < stage.clientWidth / 2 ? `${stage.clientWidth - 132}px` : '12px';
  }

  const tool = (icon: string, cls: string, label: string, fn: () => void) => h('button', { type: 'button', class: 'scan-tool', onClick: fn }, h('span', { class: `scan-ic ${cls}`, 'aria-hidden': 'true' }, icon), label);
  viewCrop.append(
    h('div', { class: 'scan-head' }, h('h2', {}, 'Adjust the corners'), queuePill),
    h('p', { class: 'hint' }, 'Drag the coloured dots onto the corners of the document. A magnifier helps you place them exactly.'),
    stage, status,
    h('div', { class: 'scan-tools' },
      tool('✨', 'g1', 'Auto', () => autoDetect(true)),
      tool('⛶', 'g2', 'Full', () => { if (!source) return; cropToken++; setStatus(''); const { width: w, height: hh } = source; corners = [[0, 0], [w, 0], [w, hh], [0, hh]]; cornersTouched = true; drawOverlay(); }),
      tool('↻', 'g3', 'Rotate', () => {
        if (!source) return;
        cropToken++; setStatus('');
        const H0 = source.height;
        source = canvasOf(rotate90(pixelsOf(source)));
        corners = orderCorners(corners.map(([x, y]) => [H0 - y, x] as Pt));
        layoutCrop();
      }),
      h('button', { type: 'button', class: 'btn', onClick: () => { queue = []; cropToken++; setStatus(''); pages.length ? showPages() : show(viewStart); } }, 'Cancel'),
      h('button', { type: 'button', class: 'btn primary', onClick: async () => {
        if (!source) return;
        cropToken++;
        setStatus('🪄 Straightening…');
        await wait(30);
        warped = warp(pixelsOf(source), orderCorners(corners));
        setStatus('');
        show(viewFilter);
        renderChips(); renderPreview();
      } }, 'Next →'),
    ),
  );
  window.addEventListener('resize', () => { if (!viewCrop.hidden) layoutCrop(); });

  // ---------------- filter step
  const filterCanvas = h('canvas', { class: 'scan-filter-canvas', 'aria-label': 'Preview of the scanned page' });
  const chips = h('div', { class: 'scan-chips', role: 'group', 'aria-label': 'Filter' });
  const busy = h('p', { class: 'hint', role: 'status' });
  function renderChips() {
    if (!warped) return;
    const small = pixelsOf(downscale(canvasOf(warped), 150));
    chips.replaceChildren(...FILTERS.map(([key, label]) => {
      const b = h('button', { type: 'button', class: `scan-chip ${key === filter ? 'on' : ''}`, 'aria-pressed': String(key === filter), onClick: () => {
        filter = key;
        try { localStorage.setItem('pagedock:scanFilter', key); } catch { /* private mode */ }
        chips.querySelectorAll('.scan-chip').forEach((c, i) => { c.classList.toggle('on', FILTERS[i][0] === key); c.setAttribute('aria-pressed', String(FILTERS[i][0] === key)); });
        renderPreview();
      } }, canvasOf(applyFilter(small, key)), label);
      return b;
    }));
  }
  let previewToken = 0;
  async function renderPreview() {
    if (!warped) return;
    const token = ++previewToken;
    busy.textContent = 'Applying filter…';
    await wait(30);
    if (token !== previewToken) return;
    const out = canvasOf(applyFilter(pixelsOf(downscale(canvasOf(warped), 1400)), filter));
    filterCanvas.width = out.width; filterCanvas.height = out.height;
    filterCanvas.getContext('2d')!.drawImage(out, 0, 0);
    busy.textContent = '';
  }
  const saveBtn = h('button', { type: 'button', class: 'btn primary' }, '✓ Save page');
  saveBtn.addEventListener('click', () =>
    withBusy(saveBtn, 'Saving…', async () => {
      if (!warped) return;
      await wait(30);
      const out = canvasOf(applyFilter(warped, filter));
      const blob = await toBlob(out, 'image/jpeg', 0.86);
      pages.push({ id: nextId++, jpeg: new Uint8Array(await blob.arrayBuffer()), url: URL.createObjectURL(await toBlob(downscale(out, 360), 'image/jpeg', 0.72)), w: out.width, h: out.height });
      announce(`Page ${pages.length} saved.`);
      if (queue.length) processNext(); else showPages();
    }),
  );
  viewFilter.append(
    h('div', { class: 'scan-head' }, h('h2', {}, 'Choose a look')),
    h('div', { class: 'scan-filter-frame' }, filterCanvas), busy, chips,
    h('div', { class: 'scan-tools' },
      tool('‹', 'g2', 'Back', () => { show(viewCrop); requestAnimationFrame(layoutCrop); }),
      tool('↻', 'g3', 'Rotate', () => { if (!warped) return; warped = rotate90(warped); renderChips(); renderPreview(); }),
      tool('📷', 'g4', 'Skip photo', () => { queue.length ? processNext() : pages.length ? showPages() : show(viewStart); }),
      saveBtn,
    ),
  );

  // ---------------- pages + PDF
  const grid = h('ol', { class: 'scan-list', 'aria-label': 'Scanned pages in order' });
  const pageSize = h('select', { id: 'scan-size', class: 'text-input' },
    h('option', { value: 'a4width' }, 'A4 width, height follows the scan'),
    h('option', { value: 'a4' }, 'A4 (fit inside, small margin)'),
    h('option', { value: 'letter' }, 'US Letter (fit inside, small margin)'),
  );
  const makeBtn = h('button', { type: 'button', class: 'btn primary big' }, '📕 Make PDF');
  const result = h('div', { class: 'result' });
  function move(i: number, d: number) { const j = i + d; if (j < 0 || j >= pages.length) return; [pages[i], pages[j]] = [pages[j], pages[i]]; showPages(); }
  function showPages() {
    if (!pages.length) { show(viewStart); return; }
    result.replaceChildren();
    grid.replaceChildren(...pages.map((p, i) => h('li', { class: 'scan-item' },
      h('img', { src: p.url, alt: `Page ${i + 1}` }),
      h('span', { class: 'page-label' }, `Page ${i + 1}`),
      h('span', { class: 'page-actions' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Move page ${i + 1} earlier`, disabled: i === 0, onClick: () => move(i, -1) }, '←'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Delete page ${i + 1}`, onClick: () => { URL.revokeObjectURL(p.url); pages = pages.filter((x) => x !== p); showPages(); } }, '✕'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Move page ${i + 1} later`, disabled: i === pages.length - 1, onClick: () => move(i, 1) }, '→'),
      ),
    )));
    show(viewPages);
  }
  makeBtn.addEventListener('click', () =>
    withBusy(makeBtn, 'Making PDF…', async () => {
      try {
        const out = await imagesToPdf(pages.map((p, i) => ({ name: `page-${i + 1}.jpg`, bytes: p.jpeg })), { pageSize: pageSize.value as 'a4width' | 'a4' | 'letter', orientation: 'auto', margin: 18 });
        result.replaceChildren(resultPanel('Your scan is ready', `${pages.length} page${pages.length === 1 ? '' : 's'}`, out, 'scan.pdf', 'application/pdf'));
        announce('Scanned PDF is ready to download.');
      } catch (e) {
        result.replaceChildren(errorPanel(e, 'Making the PDF failed.'));
      }
    }),
  );
  viewPages.append(
    h('div', { class: 'scan-head' }, h('h2', {}, 'Your pages')),
    grid,
    h('p', { class: 'hint' }, 'Add more pages:'),
    startButtons(),
    h('div', { class: 'settings' }, h('div', { class: 'field' }, h('label', { for: 'scan-size', class: 'field-label' }, 'Page size'), pageSize), makeBtn),
    result,
  );

  viewStart.append(
    startButtons(),
    h('ul', { class: 'scan-tips' },
      h('li', {}, 'Put the document on a dark, plain surface for the best automatic edges.'),
      h('li', {}, 'The ', h('b', {}, 'Magic'), ' filter whitens the paper and sharpens text. ', h('b', {}, 'B&W'), ' is best for printing.'),
      h('li', {}, 'You can import several photos at once. Photos never leave this device.'),
    ),
  );

  root.append(h('section', { class: 'tool wide scan' },
    ...toolHeader('Scan to PDF', 'Photograph documents, straighten them automatically, and save one clean PDF.'),
    camera, picker,
    viewStart, viewCrop, viewFilter, viewPages,
    h('p', { class: 'hint' }, 'Automatic edge finding downloads once (about 10 MB) and then works offline. If it is unavailable, drag the corners yourself.'),
  ));
}
