// The Generator Generator page: pick a generator (the site's, one of yours, or
// a new one), use it, and change it in the collapsible section, all on one page.
// URLs: ./?recipe=<id>#<settings>   ./?mine=<id>   ./?recipe=new   (?edit opens the section)
//       ./?shared#g=<compressed recipe>&<settings>   a version someone shared
import { loadCollection } from './env.js';
import { mountWorkbench } from './workbench.js';
import { mine } from './mine.js';
import { formatRecipe } from '../engine/format.js';
import { decodeShare } from '../engine/collection.js';

const $ = (id) => document.getElementById(id);
const picker = $('picker');
const title = $('title');
const box = $('workbench');
const banner = $('banner');
const startWrap = $('start-wrap');
const start = $('start');

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

const site = await loadCollection();
const siteIds = site.map((r) => r.id);
const siteRecipe = (id) => site.find((r) => r.id === id) || null;
let bench = null;

// ------------------------------------------------------------ routing
function routeFromUrl() {
  const p = new URL(location.href).searchParams;
  if (p.has('shared')) return { kind: 'shared' };
  if (p.get('mine') && mine.get(p.get('mine'))) return { kind: 'mine', id: p.get('mine') };
  const id = p.get('recipe');
  if (id === 'new') return { kind: 'new' };
  return { kind: 'site', id: siteRecipe(id) ? id : siteIds[0] };
}

function urlFor(route) {
  if (route.kind === 'mine') return `?mine=${encodeURIComponent(route.id)}`;
  if (route.kind === 'new') return '?recipe=new';
  if (route.kind === 'shared') return `?shared${location.hash}`;
  return `?recipe=${encodeURIComponent(route.id)}`;
}

function go(route, opts = {}) {
  const hash = opts.hash ?? '';
  history.pushState(null, '', urlFor(route) + (route.kind === 'shared' ? '' : hash));
  return show(route, opts);
}

const dot = (colors) => colors.map((c) => `<i style="background:${c}"></i>`).join('');
const colorsOf = (r) => Object.values(r.parts || {}).map((p) => p.color || '#cccccc');

function chip(label, colors, route, active, cls = '') {
  const a = document.createElement('a');
  a.href = urlFor(route);
  a.className = `chip ${cls}`.trim();
  if (active) a.setAttribute('aria-current', 'page');
  a.innerHTML = `${dot(colors)}<span></span>`;
  a.querySelector('span').textContent = label;
  a.addEventListener('click', (e) => {
    e.preventDefault();
    if (!active) go(route);
  });
  return a;
}

function renderPicker(route) {
  picker.replaceChildren();
  const is = (kind, id) => route.kind === kind && route.id === id;
  for (const r of site) picker.append(chip(r.name, colorsOf(r), { kind: 'site', id: r.id }, is('site', r.id)));
  const own = mine.list();
  if (own.length) {
    const label = document.createElement('span');
    label.className = 'picker-label';
    label.textContent = 'Mine:';
    picker.append(label);
    for (const r of own) {
      const name = siteRecipe(r.id) ? `${r.name} (my version)` : r.name;
      picker.append(chip(name, colorsOf(r), { kind: 'mine', id: r.id }, is('mine', r.id), 'mine'));
    }
  }
  picker.append(chip('+ New generator', [], { kind: 'new' }, route.kind === 'new', 'new'));
  $('mine-count').textContent = own.length
    ? `${own.length} saved in this browser.`
    : 'None saved yet: use "Save to my generators" below a generator.';
  $('export').disabled = !own.length;
}

// ------------------------------------------------------------ pages
const onSave = (recipe, { replaced }) => go({ kind: 'mine', id: recipe.id }, {
  hash: new URLSearchParams([...new URLSearchParams(location.hash.slice(1))].filter(([k]) => k !== 'g')).toString().replace(/^(.)/, '#$1'),
  open: true,
  message: `${replaced ? 'Updated' : 'Saved'} "${recipe.name}" in My generators (this browser). Export all of them as one file at the top, or share or submit it here.`,
});
const onRemove = () => go({ kind: 'site', id: siteIds[0] });

async function show(route, { open = false, message = '' } = {}) {
  renderPicker(route);
  fillStart();
  bench?.generator?.destroy();
  banner.hidden = true;
  startWrap.hidden = route.kind !== 'new';
  const common = { siteIds, siteRecipes: site, onSave, onRemove, message };
  const setTitle = (t) => { title.textContent = t; document.title = `${t} · Generator Generator`; };

  if (route.kind === 'new') {
    setTitle('New generator');
    bench = await mountWorkbench(box, { ...common, kind: 'new', start: formatRecipe(BLANK), draftKey: 'mgg-draft:new', syncUrl: false, open: true });
    bench.details.querySelector('.wb-title').textContent = 'Build your generator';
  } else if (route.kind === 'mine') {
    const recipe = mine.get(route.id);
    setTitle(recipe.name);
    bench = await mountWorkbench(box, { ...common, kind: 'mine', base: recipe, baseLabel: 'saved', draftKey: `mgg-draft:mine:${recipe.id}`, open });
  } else if (route.kind === 'shared') {
    let recipe;
    try {
      recipe = await decodeShare(new URLSearchParams(location.hash.slice(1)).get('g') || '');
    } catch (e) {
      setTitle('Broken share link');
      box.replaceChildren(Object.assign(document.createElement('p'), { className: 'problems', textContent: e.message }));
      return;
    }
    const official = siteRecipe(recipe.id);
    setTitle(`${recipe.name} (shared)`);
    banner.hidden = false;
    $('banner-text').textContent = official
      ? `This is a modified version of "${official.name}" that someone shared with you. It is not the official generator.`
      : 'This is a generator someone made and shared with you. It is not one of the official generators.';
    $('banner-official').hidden = !official;
    $('banner-official').onclick = () => go({ kind: 'site', id: official.id });
    $('banner-save').onclick = () => bench.details.querySelector('[data-ref="save"]').click();
    bench = await mountWorkbench(box, { ...common, kind: 'shared', base: official, start: formatRecipe(recipe), open });
  } else {
    const recipe = siteRecipe(route.id);
    setTitle(recipe.name);
    bench = await mountWorkbench(box, { ...common, kind: 'site', base: recipe, draftKey: `mgg-draft:${recipe.id}`, open });
  }
}

// ------------------------------------------------------------ New: start from
function fillStart() {
  start.replaceChildren(new Option('Blank', ''));
  for (const r of site) start.append(new Option(`Copy of ${r.name}`, `site:${r.id}`));
  for (const r of mine.list()) start.append(new Option(`Copy of my ${r.name}`, `mine:${r.id}`));
}
start.addEventListener('change', async () => {
  let recipe = BLANK;
  const [from, id] = start.value.split(':');
  const src = from === 'site' ? siteRecipe(id) : from === 'mine' ? mine.get(id) : null;
  if (src) recipe = { ...src, id: `${src.id}-copy`, name: `${src.name} (copy)` };
  await bench.load(formatRecipe(recipe));
});

// ------------------------------------------------------------ My generators: file
function setMineMsg(text, ok = true) {
  const el = $('mine-msg');
  el.textContent = text;
  el.className = ok ? 'ok' : 'bad';
}
$('export').addEventListener('click', () => {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([mine.exportText()], { type: 'application/json' })),
    download: 'my-generators.json',
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const r = mine.import(await file.text());
    const parts = [];
    if (r.added.length) parts.push(`added ${r.added.length}`);
    if (r.replaced.length) parts.push(`updated ${r.replaced.length}`);
    if (r.skipped.length) parts.push(`skipped ${r.skipped.length} broken (${r.skipped.join(', ')})`);
    setMineMsg(`Imported ${file.name}: ${parts.join(', ') || 'nothing new'}.`);
    renderPicker(routeFromUrl());
    fillStart();
  } catch (err) {
    setMineMsg(`Could not import ${file.name}: ${err.message}`, false);
  }
});

window.addEventListener('popstate', () => show(routeFromUrl()));

const params = new URL(location.href).searchParams;
const first = routeFromUrl();
history.replaceState(null, '', urlFor(first) + (first.kind === 'shared' ? '' : location.hash));
await show(first, { open: params.has('edit') });
