import { CATEGORIES, TOOLS, type Category, type ToolInfo } from '../tools';
import { h } from './dom';
import { CATEGORY_CLASS, toolIcon } from './icons';

const CATEGORY_BLURB: Record<Category, string> = {
  Organize: 'Combine, split and arrange pages',
  Convert: 'Change PDFs to and from other formats',
  'Edit & Forms': 'Mark up, sign and fill in',
  'Scan & Text': 'Capture paper and pull out text',
  Compare: 'Spot what changed',
};

function card(t: ToolInfo) {
  return h('a', { class: `card ${CATEGORY_CLASS[t.category]}`, href: `#/${t.id}`, role: 'listitem' },
    h('span', { class: 'card-badge' }, toolIcon(t.id)),
    h('span', { class: 'card-name' }, t.name),
    h('span', { class: 'card-benefit' }, t.benefit),
    h('span', { class: 'card-input' }, t.input),
  );
}

/** Decorative hero art: stacked pages in the brand colours (pure SVG, no image files). */
function heroArt(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 220 180');
  svg.setAttribute('class', 'hero-art');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <circle cx="170" cy="40" r="26" fill="#fbbf24" opacity=".9"/>
    <circle cx="40" cy="150" r="18" fill="#fb7c6b" opacity=".85"/>
    <g transform="rotate(-10 90 95)"><rect x="46" y="34" width="92" height="118" rx="12" fill="#ffffff" opacity=".35"/></g>
    <g transform="rotate(6 120 95)"><rect x="78" y="30" width="92" height="118" rx="12" fill="#ffffff" opacity=".55"/></g>
    <rect x="62" y="26" width="96" height="124" rx="12" fill="#ffffff"/>
    <rect x="76" y="44" width="52" height="10" rx="5" fill="#7c3aed"/>
    <rect x="76" y="64" width="68" height="6" rx="3" fill="#cbd5e1"/>
    <rect x="76" y="78" width="60" height="6" rx="3" fill="#cbd5e1"/>
    <rect x="76" y="92" width="66" height="6" rx="3" fill="#cbd5e1"/>
    <rect x="76" y="112" width="30" height="22" rx="6" fill="#14b8a6"/>
    <rect x="112" y="112" width="30" height="22" rx="6" fill="#fb7c6b"/>
    <path d="M150 128l10 10 22-26" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M150 128l10 10 22-26" fill="none" stroke="#0f766e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
  return svg;
}

export function renderDashboard(root: HTMLElement) {
  const released = TOOLS.filter((t) => t.released);
  let category: string = (() => { try { return sessionStorage.getItem('pagedock:cat') || 'All'; } catch { return 'All'; } })();
  let query = '';

  const results = h('div', { class: 'tool-results' });
  const empty = h('p', { class: 'empty', hidden: true }, 'No tools match your search. Try "merge", "sign" or "word".');

  const draw = () => {
    const q = query.trim().toLowerCase();
    const list = released.filter(
      (t) => (category === 'All' || t.category === category) && (!q || `${t.name} ${t.benefit} ${t.category} ${t.input}`.toLowerCase().includes(q)),
    );
    empty.hidden = list.length > 0;
    if (category === 'All' && !q) {
      // Grouped by purpose, each group in its own colour.
      results.replaceChildren(...(CATEGORIES.filter((c) => c !== 'All') as Category[]).map((c) => {
        const tools = list.filter((t) => t.category === c);
        if (!tools.length) return null;
        return h('section', { class: `tool-group ${CATEGORY_CLASS[c]}`, 'aria-labelledby': `grp-${CATEGORY_CLASS[c]}` },
          h('div', { class: 'group-head' },
            h('h2', { id: `grp-${CATEGORY_CLASS[c]}` }, c),
            h('span', { class: 'group-blurb' }, CATEGORY_BLURB[c]),
          ),
          h('div', { class: 'grid', role: 'list' }, ...tools.map(card)),
        );
      }).filter((x): x is HTMLElement => x !== null));
    } else {
      results.replaceChildren(h('div', { class: 'grid', role: 'list', 'aria-label': 'Matching tools' }, ...list.map(card)));
    }
  };

  const cats = CATEGORIES.filter((c) => c === 'All' || released.some((t) => t.category === c));
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by category' });
  const drawChips = () =>
    chips.replaceChildren(
      ...cats.map((c) => {
        const n = c === 'All' ? released.length : released.filter((t) => t.category === c).length;
        return h('button', { type: 'button', class: `chip ${c === 'All' ? 'cat-all' : CATEGORY_CLASS[c as Category]}`, 'aria-pressed': String(c === category), onClick: () => {
          category = c;
          try { sessionStorage.setItem('pagedock:cat', c); } catch { /* ignore */ }
          drawChips(); draw();
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
      h('div', { class: 'hero-text' },
        h('p', { class: 'eyebrow' }, 'PageDock'),
        h('h1', {}, 'Free PDF tools that stay on your device.'),
        h('p', { class: 'lead' }, 'Merge, sign, scan, convert and more, right in your browser. No uploads, no account, no paywall.'),
        h('ul', { class: 'trust', 'aria-label': 'Why PageDock' },
          h('li', {}, '🔒 Files never leave your device'),
          h('li', {}, '⚡ Works offline'),
          h('li', {}, '💸 100% free'),
        ),
      ),
      heroArt(),
    ),
    h('div', { class: 'finder' }, h('div', { class: 'search-wrap' }, searchIcon, search), chips),
    results,
    empty,
    h('p', { class: 'roadmap-note' }, `All ${released.length} tools are free and tested. Need help? See `, h('a', { href: '#/about' }, 'Help & privacy'), '.'),
  );
  draw();
}
