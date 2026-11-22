// Recipe lab: edit a recipe and run it as a live generator, without
// committing anything. Shows the changes against the published recipe and
// hands the result back (copy, download, or an edit on GitHub).
import { mountGenerator } from './generator.js';
import { loadIndex, loadRecipe, REPO } from './env.js';
import { formatRecipe } from '../engine/format.js';
import { validateRecipe } from '../engine/recipe.js';
import { buildPrompt, extractRecipe } from './prompt.js';

const $ = (id) => document.getElementById(id);
const src = $('src');
const problems = $('problems');
const app = $('app');
const pick = $('pick');
const state = $('state');
const diffEl = $('diff');
const NEW = '__new__';

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

let sourceId = null; // recipe the edit started from (null for a new one)
let published = ''; // its canonical published text
let current = null; // mounted generator
let applyCount = 0;
let lastRecipe = null;
let keep = null; // settings and camera carried over between rebuilds
let opened = false;

const draftKey = () => `mgg-lab:${sourceId || NEW}`;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

// ------------------------------------------------------------ diff

function lineDiff(a, b) {
  const x = a.split('\n');
  const y = b.split('\n');
  const n = x.length, m = y.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) { out.push([' ', x[i], i + 1]); i++; j++; }
    else if (j < m && (i >= n || lcs[i][j + 1] > lcs[i + 1][j])) { out.push(['+', y[j], j + 1]); j++; }
    else { out.push(['-', x[i], i + 1]); i++; }
  }
  return out;
}

function renderDiff() {
  diffEl.replaceChildren();
  const text = src.value;
  if (!published) {
    diffEl.append(Object.assign(document.createElement('p'), { textContent: 'New recipe: everything is new.' }));
    return 0;
  }
  const d = lineDiff(published, text);
  const changed = d.filter(([t]) => t !== ' ').length;
  if (!changed) {
    diffEl.append(Object.assign(document.createElement('p'), { textContent: 'No changes against the published recipe.' }));
    return 0;
  }
  const show = d.map((_, k) => d.slice(Math.max(0, k - 2), k + 3).some(([t]) => t !== ' '));
  let gap = false;
  d.forEach(([t, line, no], k) => {
    if (!show[k]) { gap = true; return; }
    if (gap) { diffEl.append(Object.assign(document.createElement('div'), { className: 'gap', textContent: '···' })); gap = false; }
    const row = document.createElement('div');
    row.className = t === '+' ? 'add' : t === '-' ? 'del' : 'ctx';
    row.textContent = `${t} ${line}`;
    row.title = `line ${no}`;
    diffEl.append(row);
  });
  return changed;
}

// ------------------------------------------------------------ state

function updateState() {
  const changed = renderDiff();
  if (!sourceId) state.textContent = 'New recipe (not published)';
  else if (!changed) state.textContent = 'Same as published';
  else state.textContent = `Draft: ${changed} changed line${changed > 1 ? 's' : ''}`;
  state.dataset.kind = !sourceId ? 'new' : changed ? 'draft' : 'clean';
  $('changes').textContent = `Changes${changed ? ` (${changed})` : ''}`;
  $('reset').disabled = !sourceId || !changed;
}

async function apply() {
  const n = ++applyCount;
  let recipe;
  try {
    recipe = JSON.parse(src.value);
  } catch (e) {
    problems.hidden = false;
    problems.textContent = `JSON: ${e.message}`;
    return;
  }
  try {
    validateRecipe(recipe); // keep the old preview while the recipe is broken
  } catch (e) {
    problems.hidden = false;
    problems.textContent = e.message;
    return;
  }
  if (current) {
    // carry over only what the user changed, so edited defaults show up
    const oldDefaults = Object.fromEntries((lastRecipe?.params || []).map((p) => [p.key, p.default]));
    const changed = Object.fromEntries(Object.entries(current.values).filter(([k, v]) => oldDefaults[k] !== v));
    keep = { initialValues: changed, initialColors: current.colors, view: current.getView() };
  }
  try {
    current?.destroy();
    current = null;
    const g = await mountGenerator(app, recipe, { syncUrl: false, ...(keep || {}) });
    if (n !== applyCount) { g.destroy(); return; }
    current = g;
    lastRecipe = recipe;
    problems.hidden = true;
  } catch (e) {
    problems.hidden = false;
    problems.textContent = e.message;
  }
}

function saveDraft() {
  if (sourceId && src.value === published) store.del(draftKey());
  else store.set(draftKey(), src.value);
}

async function open(id) {
  sourceId = id === NEW ? null : id;
  published = sourceId ? formatRecipe(await loadRecipe(sourceId)) : '';
  const draft = store.get(draftKey());
  src.value = draft ?? (published || formatRecipe(BLANK));
  pick.value = id;
  const url = new URL(location.href);
  url.searchParams.set('recipe', id === NEW ? 'new' : id);
  history.replaceState(null, '', url);
  current?.destroy();
  current = null;
  if (opened) keep = null;
  opened = true;
  updateState();
  await apply();
}

// ------------------------------------------------------------ hand-off

function flash(btn, text) {
  const old = btn.textContent;
  btn.textContent = text;
  setTimeout(() => (btn.textContent = old), 1600);
}

function editedId() {
  try { return JSON.parse(src.value).id || 'recipe'; } catch { return sourceId || 'recipe'; }
}

$('copy').addEventListener('click', async (e) => {
  await navigator.clipboard.writeText(src.value);
  flash(e.target, 'Copied');
});

$('download').addEventListener('click', () => {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([src.value], { type: 'application/json' })),
    download: `${editedId()}.json`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('github').addEventListener('click', async (e) => {
  const id = editedId();
  let url;
  if (sourceId && id === sourceId) {
    url = `https://github.com/${REPO}/edit/main/recipes/${id}.json`;
  } else {
    url = `https://github.com/${REPO}/new/main?filename=${encodeURIComponent(`recipes/${id}.json`)}`;
    const withValue = `${url}&value=${encodeURIComponent(src.value)}`;
    if (withValue.length < 7500) url = withValue;
  }
  try { await navigator.clipboard.writeText(src.value); } catch { /* still open GitHub */ }
  window.open(url, '_blank', 'noopener');
  flash(e.target, 'Recipe copied');
});

$('reset').addEventListener('click', () => {
  if (!sourceId) return;
  src.value = published;
  store.del(draftKey());
  updateState();
  apply();
});

$('changes').addEventListener('click', () => {
  const show = diffEl.hidden;
  diffEl.hidden = !show;
  $('changes').setAttribute('aria-pressed', String(show));
});

// ------------------------------------------------------------ editor

let timer;
src.addEventListener('input', () => {
  saveDraft();
  updateState();
  clearTimeout(timer);
  timer = setTimeout(apply, 350);
});
src.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault();
    document.execCommand('insertText', false, '  ');
  }
});
pick.addEventListener('change', () => open(pick.value));

// ------------------------------------------------------------ AI chat hand-off

$('prompt').addEventListener('click', async (e) => {
  const text = await buildPrompt({ recipeText: src.value, change: $('wish').value, values: current?.values });
  try {
    await navigator.clipboard.writeText(text);
    flash(e.target, 'Copied: paste it into your AI chat');
  } catch {
    // clipboard blocked: show the prompt so it can be copied by hand
    const out = $('prompt-out');
    out.hidden = false;
    out.value = text;
    out.select();
    flash(e.target, 'Copy the text below');
  }
});

$('apply-answer').addEventListener('click', () => {
  const msg = $('answer-msg');
  let recipe;
  try {
    recipe = extractRecipe($('answer').value);
    validateRecipe(recipe);
  } catch (err) {
    msg.className = 'bad';
    msg.textContent = err.problems
      ? `The AI's recipe has problems. Send these lines back to the AI and ask for a corrected complete recipe:\n${err.problems.map((p) => `- ${p}`).join('\n')}`
      : err.message;
    return;
  }
  src.value = formatRecipe(recipe);
  saveDraft();
  updateState();
  diffEl.hidden = false;
  $('changes').setAttribute('aria-pressed', 'true');
  msg.className = 'ok';
  msg.textContent = sourceId && recipe.id !== sourceId
    ? `Loaded. Note: the AI changed the id to '${recipe.id}', so this becomes a new generator.`
    : 'Loaded into the preview. Check it, then publish (step 3).';
  apply();
});

const index = await loadIndex();
for (const r of index) pick.append(new Option(r.name, r.id));
pick.append(new Option('New recipe...', NEW));
const wanted = new URL(location.href).searchParams.get('recipe');
// settings handed over from a generator page (lab.html?recipe=id#key=value...)
const handed = Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
if (Object.keys(handed).length) {
  keep = { initialValues: Object.fromEntries(Object.entries(handed).filter(([k]) => !k.startsWith('color.') && k !== 'layer')) };
  history.replaceState(null, '', location.pathname + location.search);
}
const first = wanted === 'new' ? NEW : index.some((r) => r.id === wanted) ? wanted : index[0]?.id || NEW;
await open(first);
