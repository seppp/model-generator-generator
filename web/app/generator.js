// The generic generator page: builds the form from a recipe, rebuilds the
// model on every change, previews it and offers the exports.
import { validateRecipe, normalizeValues, computeScope, isVisible } from '../engine/recipe.js';
import { buildModel, disposeModel } from '../engine/build.js';
import { toSTL, to3MF, colorChangeLayer } from '../engine/export.js';
import { compileFeatureScript } from '../engine/featurescript.js';
import { browserEnv } from './env.js';
import { Viewer } from './viewer.js';
import { onThemeChange } from './theme.js';

const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
};

function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function readHash() {
  const out = {};
  for (const [k, v] of new URLSearchParams(location.hash.slice(1))) out[k] = v;
  return out;
}

/**
 * Mounts a generator for `recipe` into `root`.
 * options.syncUrl: keep parameter values in the URL hash (shareable links)
 */
export async function mountGenerator(root, recipe, { syncUrl = true } = {}) {
  validateRecipe(recipe);
  root.replaceChildren();
  root.classList.add('generator');

  const initial = syncUrl ? readHash() : {};
  let values = normalizeValues(recipe, initial);
  const colors = Object.fromEntries(Object.entries(recipe.parts).map(([k, p]) => [k, initial[`color.${k}`] || p.color || '#cccccc']));
  let layerHeight = Number(initial.layer) || 0.2;
  let model = null;

  // ------------------------------------------------------------ layout
  const form = h('form', { class: 'params', onsubmit: (e) => e.preventDefault() });
  const viewport = h('div', { class: 'viewport' });
  const status = h('div', { class: 'status' }, 'Loading geometry kernel...');
  const statsEl = h('div', { class: 'stats' });
  const notesEl = h('ul', { class: 'notes' });
  const exportsEl = h('div', { class: 'exports' });
  root.append(
    h('aside', { class: 'sidebar' }, h('p', { class: 'lead' }, recipe.description || ''), form),
    h('section', { class: 'stage' }, h('div', { class: 'view-wrap' }, viewport, statsEl, status,
      h('button', { class: 'icon-btn fit', type: 'button', title: 'Reset view', 'aria-label': 'Reset view', onclick: () => viewer.fit() }, '⤢'))),
    h('section', { class: 'outputs' }, notesEl, exportsEl),
  );
  const viewer = new Viewer(viewport);
  const applyTheme = () => {
    const css = getComputedStyle(document.documentElement);
    viewer.setTheme(css.getPropertyValue('--view-bg').trim(), css.getPropertyValue('--view-grid').trim());
  };
  applyTheme();
  onThemeChange(applyTheme);

  // ------------------------------------------------------------ form
  const rows = [];
  const groups = new Map();
  const groupEl = (name) => {
    if (!groups.has(name)) {
      const body = h('div', { class: 'group-body' });
      const fs = h('fieldset', {}, h('legend', {}, name), body);
      groups.set(name, body);
      form.append(fs);
    }
    return groups.get(name);
  };

  for (const p of recipe.params) {
    const id = `p-${p.key}`;
    let input;
    const set = (v) => { values = normalizeValues(recipe, { ...values, [p.key]: v }); changed(); };
    if (p.type === 'number') {
      const step = p.step ?? (p.integer ? 1 : 0.1);
      const range = h('input', { type: 'range', min: p.min, max: p.max, step, value: values[p.key], 'aria-label': p.label });
      const num = h('input', { type: 'number', id, min: p.min, max: p.max, step, value: values[p.key] });
      range.addEventListener('input', () => { num.value = range.value; set(range.value); });
      num.addEventListener('change', () => { set(num.value); num.value = values[p.key]; range.value = values[p.key]; });
      input = h('div', { class: 'num' }, range, num, p.unit ? h('span', { class: 'unit' }, p.unit === 'deg' ? '°' : p.unit) : null);
    } else if (p.type === 'boolean') {
      const cb = h('input', { type: 'checkbox', id, checked: values[p.key] });
      cb.addEventListener('change', () => set(cb.checked));
      input = h('label', { class: 'switch' }, cb, h('span'));
    } else if (p.type === 'select') {
      if (p.options.length <= 3) {
        input = h('div', { class: 'segmented', role: 'radiogroup', id });
        for (const o of p.options) {
          const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(values[p.key] === o.value), 'data-v': o.value }, o.label || o.value);
          b.addEventListener('click', () => {
            for (const x of input.children) x.setAttribute('aria-checked', String(x === b));
            set(o.value);
          });
          input.append(b);
        }
      } else {
        input = h('select', { id }, p.options.map((o) => h('option', { value: o.value, selected: values[p.key] === o.value }, o.label || o.value)));
        input.addEventListener('change', () => set(input.value));
      }
    } else {
      input = h('input', { type: 'text', id, value: values[p.key], spellcheck: 'false' });
      input.addEventListener('input', () => set(input.value));
    }
    const row = h('div', { class: `row row-${p.type}` },
      h('label', { for: id, class: 'label' }, p.label || p.key),
      input,
      p.help ? h('small', { class: 'help' }, p.help) : null);
    rows.push({ p, row });
    groupEl(p.group || 'Settings').append(row);
  }

  const colorBody = groupEl('Colors (preview)');
  for (const [k, part] of Object.entries(recipe.parts)) {
    const c = h('input', { type: 'color', value: colors[k], id: `c-${k}` });
    c.addEventListener('input', () => { colors[k] = c.value; viewer.show(model?.parts || [], colors); writeHash(); });
    colorBody.append(h('div', { class: 'row row-color' }, h('label', { for: `c-${k}`, class: 'label' }, part.label || k), c));
  }

  // ------------------------------------------------------------ exports
  const fileBase = () => {
    const first = recipe.params.find((p) => p.type === 'text' && values[p.key]);
    const slug = first ? String(values[first.key]).replace(/^https?:\/\//, '').replace(/[^A-Za-z0-9]+/g, '-').slice(0, 30).replace(/^-|-$/g, '') : '';
    return slug ? `${recipe.id}-${slug}` : recipe.id;
  };
  const btn = (label, onclick, extra = {}) => h('button', { type: 'button', class: 'btn', onclick, ...extra }, label);
  const layerInput = h('input', { type: 'number', min: 0.05, max: 0.4, step: 0.05, value: layerHeight, class: 'small' });
  layerInput.addEventListener('change', () => { layerHeight = Math.min(0.4, Math.max(0.05, Number(layerInput.value) || 0.2)); layerInput.value = layerHeight; render(); writeHash(); });

  function renderExports() {
    exportsEl.replaceChildren();
    if (!model || !model.parts.length) return;
    const multi = model.parts.length > 1;
    const swap = model.colorChanges;
    const cards = [];
    if (multi && swap.length) {
      cards.push(h('div', { class: 'card' },
        h('h3', {}, '3MF, single nozzle'),
        h('p', {}, 'PrusaSlicer project with the filament swap (M600) already placed: ',
          ...swap.map((c, i) => [i ? ', ' : '', h('strong', {}, `${c.label} from layer ${colorChangeLayer(c.z - model.stats.min[2], layerHeight)} mm`)])),
        h('label', { class: 'inline' }, 'Layer height ', layerInput, ' mm'),
        btn('Download 3MF (filament swap)', () => download(`${fileBase()}-swap.3mf`, to3MF(model.parts, { name: recipe.name, mode: 'colorchange', changes: swap, layerHeight }), 'model/3mf'), { class: 'btn primary' })));
    }
    if (multi) {
      cards.push(h('div', { class: 'card' },
        h('h3', {}, '3MF, multi-material'),
        h('p', {}, `One object, ${model.parts.length} parts, extruders ${model.parts.map((p, i) => `${i + 1} = ${p.label}`).join(', ')}. For MMU, INDX or tool changers.`),
        btn('Download 3MF (multi-material)', () => download(`${fileBase()}-mmu.3mf`, to3MF(model.parts, { name: recipe.name, mode: 'mmu' }), 'model/3mf'), { class: swap.length ? 'btn' : 'btn primary' })));
    }
    cards.push(h('div', { class: 'card' },
      h('h3', {}, 'STL'),
      h('p', {}, multi ? 'All parts in one file, or one file per part to load as parts in any slicer.' : 'Single body.'),
      h('div', { class: 'btns' },
        btn(multi ? 'All parts' : 'Download STL', () => download(`${fileBase()}.stl`, toSTL(model.parts), 'model/stl'), multi ? {} : { class: 'btn primary' }),
        multi ? model.parts.map((p) => btn(p.label, () => download(`${fileBase()}-${p.key}.stl`, toSTL([p]), 'model/stl'))) : null)));
    cards.push(h('div', { class: 'card' },
      h('h3', {}, 'Onshape FeatureScript'),
      h('p', {}, 'A parametric custom feature generated from this recipe, with the current values as defaults. Paste it into a Feature Studio.'),
      h('div', { class: 'btns' },
        btn('Download .fs', () => download(`${recipe.id}.fs`, compileFeatureScript(recipe, values, { colors }), 'text/plain')),
        btn('Copy', async (e) => {
          await navigator.clipboard.writeText(compileFeatureScript(recipe, values, { colors }));
          e.target.textContent = 'Copied';
          setTimeout(() => (e.target.textContent = 'Copy'), 1500);
        }))));
    cards.push(h('div', { class: 'card' },
      h('h3', {}, 'Share'),
      h('p', {}, 'The link contains all settings.'),
      btn('Copy link', async (e) => {
        await navigator.clipboard.writeText(location.href);
        e.target.textContent = 'Copied';
        setTimeout(() => (e.target.textContent = 'Copy link'), 1500);
      })));
    exportsEl.append(...cards);
  }

  // ------------------------------------------------------------ rebuild
  function writeHash() {
    if (!syncUrl) return;
    const q = new URLSearchParams();
    for (const p of recipe.params) if (values[p.key] !== p.default) q.set(p.key, String(values[p.key]));
    for (const [k, part] of Object.entries(recipe.parts)) if (colors[k] !== part.color) q.set(`color.${k}`, colors[k]);
    if (layerHeight !== 0.2) q.set('layer', String(layerHeight));
    const s = q.toString();
    history.replaceState(null, '', s ? `#${s}` : location.pathname + location.search);
  }

  let env;
  let timer;
  function changed() {
    writeHash();
    clearTimeout(timer);
    timer = setTimeout(render, 60);
  }

  function updateVisibility() {
    let scope;
    try { scope = computeScope(recipe, values); } catch { return; }
    for (const { p, row } of rows) row.hidden = !isVisible(p, scope);
  }

  function render() {
    updateVisibility();
    if (!env) return;
    const t0 = performance.now();
    let next;
    try {
      next = buildModel(recipe, values, env);
    } catch (e) {
      status.textContent = e.message;
      status.className = 'status error';
      return;
    }
    disposeModel(model);
    model = next;
    viewer.show(model.parts, colors);
    const ms = Math.round(performance.now() - t0);
    status.textContent = model.parts.length ? '' : 'Nothing to show with these settings.';
    status.className = 'status';
    const s = model.stats;
    statsEl.textContent = s
      ? `${s.size.map((v) => v.toFixed(1)).join(' × ')} mm · ${(s.volume / 1000).toFixed(1)} cm³ · ≈${s.grams.toFixed(0)} g PLA · ${ms} ms`
      : '';
    notesEl.replaceChildren(...model.notes.map((n) => h('li', {}, n)));
    renderExports();
  }

  updateVisibility();
  try {
    env = await browserEnv();
  } catch (e) {
    status.textContent = `Could not load the geometry kernel: ${e.message}`;
    status.className = 'status error';
    throw e;
  }
  render();
  return {
    get model() { return model; },
    get values() { return values; },
    destroy() { disposeModel(model); viewer.dispose(); },
  };
}
