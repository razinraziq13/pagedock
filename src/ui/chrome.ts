/**
 * Visual chrome for tool screens: a coloured title badge and a 4-step guide
 * (Choose → Adjust → Process → Download). Purely presentational: it watches the screen and highlights
 * the current step; it never changes what a tool does.
 */
import type { ToolInfo } from '../tools';
import { h } from './dom';
import { CATEGORY_CLASS, toolIcon } from './icons';

const STEPS = ['Choose files', 'Adjust', 'Process', 'Download'];

/** Compare has no file to download, so it gets its own two honest steps. */
const STEPS_BY_TOOL: Record<string, string[]> = { compare: ['Choose 2 files', 'See differences'] };

function currentStep(root: HTMLElement, toolId: string): number {
  if (toolId === 'compare') return root.querySelector('.diff-list, .diff .hint') ? 1 : 0;
  if (root.querySelector('div.done')) return 3; // the result card (not the guide's own finished steps)
  const busy = [...root.querySelectorAll<HTMLButtonElement>('button:disabled, .btn:disabled')].some((b) => /…$/.test(b.textContent ?? ''));
  const progress = root.querySelector<HTMLElement>('progress:not([hidden])') || [...root.querySelectorAll('[role=status]')].some((s) => /^(Reading|Converting|Checking|Preparing|Starting|Straightening|Applying)/.test(s.textContent ?? ''));
  if (busy || progress) return 2;
  const started =
    root.querySelector('.picked.file:not(.bad)') ||
    root.querySelector('.file-list li') ||
    root.querySelector('.scan-view:not(:first-of-type):not([hidden])') ||
    root.querySelector('.form-fields, .text-out, .compare:not([hidden]), .edit-stage');
  return started ? 1 : 0;
}

export function decorateTool(main: HTMLElement, tool: ToolInfo): () => void {
  const section = main.querySelector<HTMLElement>('section.tool') ?? main;
  section.classList.add(CATEGORY_CLASS[tool.category]);
  const h1 = section.querySelector('h1');
  if (h1 && !h1.parentElement?.classList.contains('tool-title')) {
    const title = h('div', { class: 'tool-title' }, h('span', { class: 'card-badge' }, toolIcon(tool.id)));
    h1.replaceWith(title);
    title.append(h1);
  }
  const items = (STEPS_BY_TOOL[tool.id] ?? STEPS).map((s) => h('li', {}, s));
  const steps = h('ol', { class: 'steps', 'aria-label': 'Progress' }, ...items);
  const lead = section.querySelector('.tool-title + .lead') ?? section.querySelector('.tool-title');
  lead?.after(steps);

  let last = -1;
  const update = () => {
    const n = currentStep(section, tool.id);
    if (n === last) return;
    last = n;
    items.forEach((li, i) => {
      li.classList.toggle('done', i < n);
      if (i === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
  };
  update();
  const obs = new MutationObserver(update);
  obs.observe(section, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'disabled', 'class'], characterData: true });
  return () => obs.disconnect();
}
