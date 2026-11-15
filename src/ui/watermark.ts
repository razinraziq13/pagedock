import { sniffImage } from '../core/images';
import { parsePageRanges } from '../core/pages';
import { watermarkPdf, type WatermarkOptions, type WatermarkPosition } from '../core/stamp';
import { announce, h } from './dom';
import { errorPanel, resultPanel, singlePdfPicker, toolHeader, withBusy, type LoadedPdf } from './common';
import { livePreview } from './live-preview';

const COLORS: Record<string, { r: number; g: number; b: number }> = {
  grey: { r: 0.5, g: 0.5, b: 0.5 },
  red: { r: 0.79, g: 0.23, b: 0.32 },
  blue: { r: 0.2, g: 0.4, b: 0.91 },
  black: { r: 0.09, g: 0.14, b: 0.23 },
};

export function renderWatermark(root: HTMLElement) {
  let pdf: LoadedPdf | null = null;
  let image: { bytes: Uint8Array; type: 'png' | 'jpg'; name: string } | null = null;

  const kindText = h('input', { type: 'radio', name: 'wm-kind', value: 'text', checked: true });
  const kindImage = h('input', { type: 'radio', name: 'wm-kind', value: 'image' });
  const text = h('input', { type: 'text', id: 'wm-text', class: 'text-input', value: 'CONFIDENTIAL', maxlength: '200', autocomplete: 'off' });
  const fontSize = h('select', { id: 'wm-size', class: 'text-input' }, h('option', { value: '28' }, 'Small'), h('option', { value: '48', selected: true }, 'Medium'), h('option', { value: '72' }, 'Large'), h('option', { value: '110' }, 'Extra large'));
  const color = h('select', { id: 'wm-color', class: 'text-input' }, ...Object.keys(COLORS).map((c) => h('option', { value: c }, c[0].toUpperCase() + c.slice(1))));
  const imgInput = h('input', { type: 'file', id: 'wm-image', accept: 'image/png,image/jpeg,.png,.jpg,.jpeg', class: 'text-input' });
  const imgScale = h('select', { id: 'wm-img-scale', class: 'text-input' }, h('option', { value: '0.2' }, 'Small'), h('option', { value: '0.4', selected: true }, 'Medium'), h('option', { value: '0.7' }, 'Large'));
  const imgHint = h('p', { class: 'hint' }, 'PNG with a transparent background works best.');
  const position = h('select', { id: 'wm-pos', class: 'text-input' },
    ...([['center', 'Centre'], ['top-left', 'Top left'], ['top-center', 'Top centre'], ['top-right', 'Top right'], ['middle-left', 'Middle left'], ['middle-right', 'Middle right'], ['bottom-left', 'Bottom left'], ['bottom-center', 'Bottom centre'], ['bottom-right', 'Bottom right']] as const)
      .map(([v, l]) => h('option', { value: v }, l)),
  );
  const rotation = h('select', { id: 'wm-rot', class: 'text-input' }, h('option', { value: '45', selected: true }, 'Diagonal (45°)'), h('option', { value: '0' }, 'Horizontal'), h('option', { value: '-45' }, 'Diagonal down (−45°)'), h('option', { value: '90' }, 'Vertical'));
  const opacity = h('input', { type: 'range', id: 'wm-opacity', min: '5', max: '100', step: '5', value: '30' });
  const opacityOut = h('output', { for: 'wm-opacity' }, '30%');
  const pages = h('input', { type: 'text', id: 'wm-pages', class: 'text-input', inputmode: 'numeric', autocomplete: 'off', placeholder: 'All pages' });
  const pagesHint = h('p', { class: 'hint', id: 'wm-pages-hint' }, 'Leave empty for all pages.');
  const runBtn = h('button', { type: 'button', class: 'btn primary big' }, 'Add watermark');
  const result = h('div', { class: 'result' });
  pages.setAttribute('aria-describedby', 'wm-pages-hint');

  const textFields = h('div', { class: 'field-group' },
    h('div', { class: 'field' }, h('label', { for: 'wm-text', class: 'field-label' }, 'Text'), text),
    h('div', { class: 'field-row' },
      h('div', { class: 'field' }, h('label', { for: 'wm-size', class: 'field-label' }, 'Size'), fontSize),
      h('div', { class: 'field' }, h('label', { for: 'wm-color', class: 'field-label' }, 'Colour'), color),
    ),
  );
  const imageFields = h('div', { class: 'field-group', hidden: true },
    h('div', { class: 'field' }, h('label', { for: 'wm-image', class: 'field-label' }, 'Image'), imgInput, imgHint),
    h('div', { class: 'field' }, h('label', { for: 'wm-img-scale', class: 'field-label' }, 'Size'), imgScale),
  );

  const options = (): WatermarkOptions => ({
    kind: kindImage.checked ? 'image' : 'text',
    text: text.value,
    fontSize: Number(fontSize.value),
    color: COLORS[color.value],
    image: image ?? undefined,
    imageScale: Number(imgScale.value),
    position: position.value as WatermarkPosition,
    rotation: Number(rotation.value),
    opacity: Number(opacity.value) / 100,
    pages: pages.value.trim() || 'all',
  });

  const preview = livePreview(async () => {
    if (!pdf) return null;
    const o = options();
    if (o.kind === 'image' && !o.image) return null;
    const first = o.pages === 'all' ? 0 : parsePageRanges(o.pages, pdf.pages).flat().sort((a, b) => a - b)[0];
    return { bytes: await watermarkPdf(pdf, o), pageIndex: first };
  });

  function update() {
    result.replaceChildren();
    textFields.hidden = kindImage.checked;
    imageFields.hidden = !kindImage.checked;
    opacityOut.textContent = `${opacity.value}%`;
    let ok = true;
    if (pdf && pages.value.trim()) {
      try { parsePageRanges(pages.value, pdf.pages); pagesHint.classList.remove('bad'); pagesHint.textContent = 'Only these pages get the watermark.'; }
      catch (e) { ok = false; pagesHint.textContent = (e as Error).message; pagesHint.classList.add('bad'); }
    } else {
      pagesHint.classList.remove('bad');
      pagesHint.textContent = 'Leave empty for all pages.';
    }
    if (kindImage.checked ? !image : !text.value.trim()) ok = false;
    runBtn.disabled = !ok;
    if (ok) preview.refresh();
  }
  [kindText, kindImage, fontSize, color, imgScale, position, rotation].forEach((el) => el.addEventListener('change', update));
  [text, opacity, pages].forEach((el) => el.addEventListener('input', update));

  imgInput.addEventListener('change', async () => {
    const f = imgInput.files?.[0];
    image = null;
    if (f) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const kind = sniffImage(bytes);
      if (kind) { image = { bytes, type: kind, name: f.name }; imgHint.textContent = f.name; imgHint.classList.remove('bad'); }
      else { imgHint.textContent = `${f.name} is not a PNG or JPG image.`; imgHint.classList.add('bad'); }
    }
    update();
  });

  runBtn.addEventListener('click', () =>
    withBusy(runBtn, 'Adding watermark…', async () => {
      if (!pdf) return;
      try {
        const out = await watermarkPdf(pdf, options());
        result.replaceChildren(resultPanel('Your watermarked PDF is ready', `${pdf.pages} pages`, out, `${pdf.name.replace(/\.pdf$/i, '')}-watermarked.pdf`, 'application/pdf',
          'A watermark is a visible mark. It can be removed with PDF editing software, so it is not a security measure.'));
        announce('Watermarked PDF is ready to download.');
      } catch (e) {
        result.replaceChildren(errorPanel(e, 'Adding the watermark failed.'));
      }
    }),
  );

  const settings = h('div', { class: 'settings two-col', hidden: true },
    h('div', { class: 'controls' },
      h('fieldset', { class: 'radios inline' },
        h('legend', { class: 'field-label' }, 'Watermark type'),
        h('label', { class: 'radio' }, kindText, ' Text'),
        h('label', { class: 'radio' }, kindImage, ' Image'),
      ),
      textFields,
      imageFields,
      h('div', { class: 'field-row' },
        h('div', { class: 'field' }, h('label', { for: 'wm-pos', class: 'field-label' }, 'Position'), position),
        h('div', { class: 'field' }, h('label', { for: 'wm-rot', class: 'field-label' }, 'Angle'), rotation),
      ),
      h('div', { class: 'field' }, h('label', { for: 'wm-opacity', class: 'field-label' }, 'Opacity ', opacityOut), opacity),
      h('div', { class: 'field' }, h('label', { for: 'wm-pages', class: 'field-label' }, 'Pages'), pages, pagesHint),
      runBtn,
    ),
    preview.el,
  );

  root.append(
    h('section', { class: 'tool wide' },
      ...toolHeader('Watermark PDF', 'Stamp text or an image across your pages.'),
      singlePdfPicker('wm-file', (p) => { pdf = p; settings.hidden = false; update(); }, () => { pdf = null; settings.hidden = true; result.replaceChildren(); }),
      settings,
      result,
    ),
  );
}
