import { sanitizeFileName } from '../core/pdf';
import { h } from './dom';

/** Offer a generated file: a normal download link, plus Share where the browser can share files (the better route on iPhone). */
export function makeSaveControls(bytes: Uint8Array, fileName: string, mime: string): HTMLElement {
  const name = sanitizeFileName(fileName, 'pagedock.pdf');
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const row = h('div', { class: 'save-row' }, h('a', { class: 'btn primary', href: url, download: name }, 'Download'));

  const file = new File([blob], name, { type: mime });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    row.append(
      h('button', { type: 'button', class: 'btn', onClick: () => navigator.share({ files: [file], title: name }).catch(() => {}) }, 'Share / Save to Files'),
    );
  }
  return row;
}
