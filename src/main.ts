import './styles.css';
import { TOOLS } from './tools';
import { renderDashboard } from './ui/dashboard';
import { renderMerge } from './ui/merge';
import { renderSplit } from './ui/split';
import { renderRotate } from './ui/rotate';
import { renderOrganize } from './ui/organize';

const views: Record<string, (root: HTMLElement) => void> = {
  merge: renderMerge,
  split: renderSplit,
  rotate: renderRotate,
  organize: renderOrganize,
};

function route() {
  const main = document.getElementById('main')!;
  main.replaceChildren();
  const id = location.hash.replace(/^#\/?/, '');
  const tool = TOOLS.find((t) => t.id === id && t.released);
  if (tool && views[tool.id]) {
    document.title = `${tool.name} · PageDock Free`;
    views[tool.id](main);
    main.focus();
  } else {
    document.title = 'PageDock Free';
    renderDashboard(main);
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
route();
