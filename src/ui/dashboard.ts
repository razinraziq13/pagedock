import { CATEGORIES, TOOLS, type ToolInfo } from '../tools';
import { h } from './dom';
import { CATEGORY_CLASS, toolIcon } from './icons';

function card(t: ToolInfo) {
  return h('a', { class: `card ${CATEGORY_CLASS[t.category]}`, href: `#/${t.id}` },
    h('span', { class: 'card-badge' }, toolIcon(t.id)),
    h('span', { class: 'card-name' }, t.name),
    h('span', { class: 'card-benefit' }, t.benefit),
    h('span', { class: 'card-input' }, t.input),
  );
}

export function renderDashboard(root: HTMLElement) {
  const released = TOOLS.filter((t) => t.released);
  let category: string = (() => { try { return sessionStorage.getItem('pagedock:cat') || 'All'; } catch { return 'All'; } })();
  let query = '';

  const results = h('div', { class: 'tool-results' });
  const resultCount = h('p', { class: 'catalog-count', role: 'status' });
  const empty = h('p', { class: 'empty', hidden: true }, 'No tools match your search. Try "merge", "sign" or "word".');

  const draw = () => {
    const q = query.trim().toLowerCase();
    const list = released.filter(
      (t) => (category === 'All' || t.category === category) && (!q || `${t.name} ${t.benefit} ${t.category} ${t.input}`.toLowerCase().includes(q)),
    );
    empty.hidden = list.length > 0;
    results.replaceChildren(h('ul', { class: 'grid', 'aria-label': 'Matching tools' },
      ...list.map((tool) => h('li', {}, card(tool))),
    ));
    resultCount.textContent = list.length + (list.length === 1 ? ' tool' : ' tools');
  };

  const cats = CATEGORIES.filter((c) => c === 'All' || released.some((t) => t.category === c));
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by category' });
  const drawChips = () =>
    chips.replaceChildren(
      ...cats.map((c) => {
        const n = c === 'All' ? released.length : released.filter((t) => t.category === c).length;
        return h('button', { type: 'button', class: `chip ${c === 'All' ? 'cat-all' : CATEGORY_CLASS[c]}`, 'aria-pressed': String(c === category), onClick: () => {
          category = c;
          try { sessionStorage.setItem('pagedock:cat', c); } catch { /* ignore */ }
          drawChips();
          chips.querySelector<HTMLButtonElement>('[aria-pressed=true]')?.focus();
          draw();
        } }, c, h('span', { class: 'chip-count', 'aria-label': `${n} tools` }, String(n)));
      }),
    );
  drawChips();

  const search = h('input', {
    type: 'search', class: 'search', placeholder: 'Search tools — e.g. merge, sign, word…', 'aria-label': 'Search PDF tools',
    onInput: (e: Event) => { query = (e.target as HTMLInputElement).value; draw(); },
  });
  const searchIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  searchIcon.setAttribute('viewBox', '0 0 24 24');
  searchIcon.setAttribute('class', 'search-icon');
  searchIcon.setAttribute('aria-hidden', 'true');
  searchIcon.innerHTML = '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>';

  root.append(
    h('section', { class: 'hero' },
      h('h1', {}, 'PDF & Word tools'),
      h('p', { class: 'lead' }, 'Edit, sign, organize and convert files directly on your device.'),
      h('div', { class: 'search-wrap' }, searchIcon, search),
    ),
    h('div', { class: 'tool-catalog' },
      h('aside', { class: 'finder' }, h('h2', {}, 'Categories'), chips),
      h('section', { class: 'catalog-body', 'aria-labelledby': 'catalog-title' },
        h('div', { class: 'catalog-heading' }, h('h2', { id: 'catalog-title' }, 'Browse tools'), resultCount),
        results,
        empty,
      ),
    ),
  );
  draw();
}
