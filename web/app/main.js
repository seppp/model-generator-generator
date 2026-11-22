// The Generator Generator page: pick a generator (or start a new one), use
// it, and change it in the collapsible section, all on one page.
// URL: ./?recipe=<id>#<settings>   ./?recipe=new   (?edit opens the section)
import { loadIndex, loadRecipe } from './env.js';
import { mountWorkbench } from './workbench.js';
import { formatRecipe } from '../engine/format.js';

const picker = document.getElementById('picker');
const title = document.getElementById('title');
const box = document.getElementById('workbench');
const startWrap = document.getElementById('start-wrap');
const start = document.getElementById('start');

const BLANK = {
  id: 'my-generator',
  name: 'My generator',
  description: 'Describe what it makes.',
  parts: { base: { label: 'Plate', color: '#0f766e' }, accent: { label: 'Text', color: '#f8fafc' } },
  params: [
    { key: 'label', type: 'text', label: 'Text', default: 'Hello', group: 'Text' },
    { key: 'size', type: 'number', unit: 'mm', label: 'Size', default: 60, min: 20, max: 200, step: 1, group: 'Plate' },
    { key: 'thickness', type: 'number', unit: 'mm', label: 'Thickness', default: 3, min: 1, max: 10, step: 0.2, group: 'Plate' },
  ],
  derived: {},
  steps: [
    { add: 'shape', part: 'base', shape: 'roundedRect', width: 'size', height: 'size / 2', radius: 4, thickness: 'thickness' },
    { add: 'text', part: 'accent', text: 'label', size: 'size / 6', font: 'bold', z: 'thickness', thickness: 1 },
  ],
  notes: [],
};

const index = await loadIndex();
let bench = null;

function renderPicker(active) {
  picker.replaceChildren();
  for (const r of [...index, { id: 'new', name: 'New generator', colors: [] }]) {
    const a = document.createElement('a');
    a.href = `?recipe=${r.id}`;
    a.className = `chip${r.id === 'new' ? ' new' : ''}`;
    if (r.id === active) a.setAttribute('aria-current', 'page');
    a.innerHTML = `${r.colors.map((c) => `<i style="background:${c}"></i>`).join('')}<span></span>`;
    a.querySelector('span').textContent = r.id === 'new' ? '+ New generator' : r.name;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (r.id !== active) show(r.id, { push: true });
    });
    picker.append(a);
  }
}

async function show(id, { push = false, edit = false } = {}) {
  if (!index.some((r) => r.id === id) && id !== 'new') id = index[0]?.id || 'new';
  const url = new URL(location.href);
  url.searchParams.set('recipe', id);
  url.searchParams.delete('edit');
  if (push) {
    url.hash = '';
    history.pushState(null, '', url);
  } else {
    history.replaceState(null, '', url);
  }
  renderPicker(id);
  bench?.generator?.destroy();
  if (id === 'new') {
    title.textContent = 'New generator';
    document.title = 'New generator · Generator Generator';
    startWrap.hidden = false;
    bench = await mountWorkbench(box, { start: formatRecipe(BLANK), publishedIds: index.map((r) => r.id), syncUrl: false, open: true });
    bench.details.querySelector('.wb-title').textContent = 'Build your generator';
  } else {
    const entry = index.find((r) => r.id === id);
    title.textContent = entry.name;
    document.title = `${entry.name} · Generator Generator`;
    startWrap.hidden = true;
    bench = await mountWorkbench(box, { sourceId: id, published: await loadRecipe(id), publishedIds: index.map((r) => r.id), syncUrl: true, open: edit });
  }
}

start.append(new Option('Blank', ''));
for (const r of index) start.append(new Option(`Copy of ${r.name}`, r.id));
start.addEventListener('change', async () => {
  let recipe = BLANK;
  if (start.value) {
    recipe = await loadRecipe(start.value);
    recipe = { ...recipe, id: `${recipe.id}-copy`, name: `${recipe.name} (copy)` };
  }
  await bench.load(formatRecipe(recipe));
});

window.addEventListener('popstate', () => {
  const p = new URL(location.href).searchParams;
  show(p.get('recipe') || index[0]?.id);
});

const params = new URL(location.href).searchParams;
await show(params.get('recipe') || index[0]?.id || 'new', { edit: params.has('edit') });
