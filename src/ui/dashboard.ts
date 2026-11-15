import { CATEGORIES, TOOLS, type ToolInfo } from '../tools';
import { h } from './dom';

const ICONS: Record<string, string> = {
  Organize: 'M4 5h7v6H4zM13 5h7v6h-7zM4 13h7v6H4zM13 13h7v6h-7z',
  Convert: 'M4 8h12l-3-3M20 16H8l3 3',
  'Edit & Forms': 'M4 20h4L19 9l-4-4L4 16z',
  'Scan & Text': 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M7 12h10',
  Compare: 'M4 4h7v16H4zM13 4h7v16h-7z',
};

function icon(category: string) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('card-icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[category] ?? ICONS.Organize);
  svg.append(path);
  return svg;
}

function card(t: ToolInfo) {
  return h(
    'a',
    { class: 'card', href: `#/${t.id}` },
    icon(t.category),
    h('span', { class: 'card-name' }, t.name),
    h('span', { class: 'card-benefit' }, t.benefit),
    h('span', { class: 'card-input' }, t.input),
  );
}

export function renderDashboard(root: HTMLElement) {
  const released = TOOLS.filter((t) => t.released);
  let category: string = 'All';
  let query = '';

  const grid = h('div', { class: 'grid', role: 'list' });
  const empty = h('p', { class: 'empty', hidden: true }, 'No tools match your search.');

  const draw = () => {
    const q = query.trim().toLowerCase();
    const list = released.filter(
      (t) => (category === 'All' || t.category === category) && (!q || `${t.name} ${t.benefit} ${t.category}`.toLowerCase().includes(q)),
    );
    grid.replaceChildren(...list.map((t) => { const c = card(t); c.setAttribute('role', 'listitem'); return c; }));
    empty.hidden = list.length > 0;
  };

  // Only show filter chips for categories that have released tools, so no chip leads to an empty page.
  const cats = CATEGORIES.filter((c) => c === 'All' || released.some((t) => t.category === c));
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by category' });
  const drawChips = () =>
    chips.replaceChildren(
      ...cats.map((c) =>
        h('button', { type: 'button', class: 'chip', 'aria-pressed': String(c === category), onClick: () => { category = c; drawChips(); draw(); } }, c),
      ),
    );
  drawChips();

  const search = h('input', {
    type: 'search',
    class: 'search',
    placeholder: 'Search PDF tools…',
    'aria-label': 'Search PDF tools',
    onInput: (e: Event) => { query = (e.target as HTMLInputElement).value; draw(); },
  });

  root.append(
    h('section', { class: 'hero' },
      h('h1', {}, 'Free PDF tools that stay on your device.'),
      h('p', { class: 'lead' }, 'No uploads, no account, no paywall. Everything runs in your browser.'),
      search,
      chips,
    ),
    grid,
    empty,
    h('p', { class: 'roadmap-note' }, `${released.length} of ${TOOLS.length} planned tools are available. More are added only after they pass testing.`),
  );
  draw();
}
