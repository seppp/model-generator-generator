// The generic generator page: builds the form from a recipe, rebuilds the
// model on every change, previews it and offers the exports.
import { validateRecipe, normalizeValues, computeScope, isVisible } from '../engine/recipe.js';
import { buildModel, disposeModel, fontsNeeded } from '../engine/build.js';
import { toSTL, to3MF, toOBJ, toSVG, toDXF, colorChangeLayer } from '../engine/export.js';
import { compileFeatureScript } from '../engine/featurescript.js';
import { browserEnv, ownFont } from './env.js';
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

const SLOW_MS = 300; // above this, live update pauses itself

// "Live update": rebuild while typing or dragging (default), or only on Enter / release.
const live = {
  get() { try { return localStorage.getItem('mgg-live') !== 'off'; } catch { return true; } },
  set(on) { try { localStorage.setItem('mgg-live', on ? 'on' : 'off'); } catch { /* ignore */ } },
};

function liveToggle(onChange) {
  const cb = h('input', { type: 'checkbox', id: 'live-update', checked: live.get() });
  cb.addEventListener('change', () => { live.set(cb.checked); onChange(cb.checked); });
  liveToggle.cb = cb;
  return h('div', { class: 'live', title: 'Rebuild the model while you type or drag. Turn it off if the page feels slow.' },
    h('label', { for: 'live-update' }, 'Live'),
    h('label', { class: 'switch' }, cb, h('span')));
}

/** A small "i" button that shows or hides `text` (returns [button, note]). */
function tip(text) {
  const note = h('small', { class: 'help', hidden: true }, text);
  const b = h('button', { type: 'button', class: 'info', 'aria-label': 'More info', 'aria-expanded': 'false', title: typeof text === 'string' ? text : null }, 'i');
  b.addEventListener('click', () => {
    note.hidden = !note.hidden;
    b.setAttribute('aria-expanded', String(!note.hidden));
  });
  return [b, note];
}

function readHash() {
  const out = {};
  for (const [k, v] of new URLSearchParams(location.hash.slice(1))) out[k] = v;
  return out;
}

/**
 * Mounts a generator for `recipe` into `root`.
 * options.syncUrl: keep parameter values in the URL hash (shareable links)
 * options.shareLink: async () => URL for the Share card (default: the page URL)
 */
export async function mountGenerator(root, recipe, { syncUrl = true, initialValues, initialColors, view, shareLink } = {}) {
  validateRecipe(recipe);
  root.replaceChildren();
  root.classList.add('generator');

  const initial = syncUrl ? readHash() : {};
  let values = normalizeValues(recipe, initialValues || initial);
  const colors = Object.fromEntries(Object.entries(recipe.parts).map(([k, p]) => [k, initialColors?.[k] || initial[`color.${k}`] || p.color || '#cccccc']));
  let layerHeight = Number(initial.layer) || 0.2;
  let model = null;

  // ------------------------------------------------------------ layout
  // settings | preview | downloads; below 1200px the downloads open as a sheet from the Download button
  const form = h('form', { class: 'params', onsubmit: (e) => e.preventDefault() });
  const viewport = h('div', { class: 'viewport' });
  const status = h('div', { class: 'status' }, 'Loading geometry kernel...');
  const statsEl = h('div', { class: 'stats' });
  const notesEl = h('ul', { class: 'notes' });
  const exportsEl = h('div', { class: 'exports' });
  const setSheet = (open) => {
    root.classList.toggle('sheet-open', open);
    sheetBtn.setAttribute('aria-expanded', String(open));
    if (open) outputs.querySelector('.close').focus();
  };
  const sheetBtn = h('button', { class: 'btn primary sheet-btn', type: 'button', 'aria-expanded': 'false', 'aria-controls': `out-${recipe.id}`, onclick: () => setSheet(true) }, 'Download');
  const outputs = h('section', { class: 'outputs', id: `out-${recipe.id}`, 'aria-label': 'Download' },
    h('div', { class: 'panel-head' }, h('h2', {}, 'Download'),
      h('button', { class: 'icon-btn close', type: 'button', 'aria-label': 'Close', onclick: () => { setSheet(false); sheetBtn.focus(); } }, '×')),
    notesEl, exportsEl);
  const onKey = (e) => { if (e.key === 'Escape' && root.classList.contains('sheet-open')) { setSheet(false); sheetBtn.focus(); } };
  document.addEventListener('keydown', onKey);
  root.append(
    h('aside', { class: 'sidebar' },
      h('div', { class: 'panel-head' }, h('h2', {}, 'Settings'), liveToggle(() => { paused = false; })),
      recipe.description ? h('p', { class: 'lead' }, recipe.description) : null,
      form),
    h('section', { class: 'stage' }, h('div', { class: 'view-wrap' }, viewport, statsEl, status,
      h('div', { class: 'view-tools' }, sheetBtn,
        h('button', { class: 'icon-btn', type: 'button', title: 'Reset view', 'aria-label': 'Reset view', onclick: () => viewer.fit() }, '⤢')))),
    outputs,
    h('div', { class: 'sheet-backdrop', onclick: () => setSheet(false) }),
  );
  const viewer = new Viewer(viewport);
  if (view) viewer.setView(view);
  const applyTheme = () => {
    const css = getComputedStyle(document.documentElement);
    viewer.setTheme(css.getPropertyValue('--view-bg').trim(), css.getPropertyValue('--view-grid').trim());
  };
  applyTheme();
  onThemeChange(applyTheme);

  // ------------------------------------------------------------ form
  const rows = [];
  const groups = new Map();
  const groupEl = (name, open = true) => {
    if (!groups.has(name)) {
      const body = h('div', { class: 'group-body' });
      form.append(h('details', { class: 'group', open }, h('summary', {}, name), body));
      groups.set(name, body);
    }
    return groups.get(name);
  };

  // A select with a 'custom' option (fonts) gets a file picker for your own font.
  const fontPickers = [];
  function ownFontPicker(key) {
    const note = h('small', { class: 'help' }, ownFont.name() ? `Your font: ${ownFont.name()}` : 'Choose a .ttf, .otf or .woff file. It stays in this browser; Onshape uses Open Sans instead.');
    const file = h('input', { type: 'file', accept: '.ttf,.otf,.woff,font/ttf,font/otf,font/woff', 'aria-label': 'Your own font file' });
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f || !env) return;
      try {
        const { family, kept } = await ownFont.set(f, env);
        note.textContent = `Your font: ${family}${kept ? '' : ' (too big to keep in this browser; choose it again next visit)'}`;
        render();
      } catch {
        note.textContent = `${f.name} is not a font file this page can read (use .ttf, .otf or .woff).`;
      }
    });
    const el = h('div', { class: 'own-font' }, file, note);
    fontPickers.push({ key, el });
    return el;
  }

  for (const p of recipe.params) {
    const id = `p-${p.key}`;
    let input;
    // commit = false for in-between values (typing, dragging): those rebuild only with Live update on
    const set = (v, commit = true) => { values = normalizeValues(recipe, { ...values, [p.key]: v }); changed(commit); };
    if (p.type === 'number') {
      const step = p.step ?? (p.integer ? 1 : 0.1);
      const range = h('input', { type: 'range', min: p.min, max: p.max, step, value: values[p.key], 'aria-label': p.label });
      const num = h('input', { type: 'number', id, min: p.min, max: p.max, step, value: values[p.key] });
      range.addEventListener('input', () => { num.value = range.value; set(range.value, false); });
      range.addEventListener('change', () => set(range.value));
      // live: typing, arrow keys and the mouse wheel update the model without Enter
      num.addEventListener('input', () => {
        if (num.value === '' || !Number.isFinite(Number(num.value))) return; // half-typed
        set(num.value, false);
        range.value = values[p.key];
      });
      num.addEventListener('wheel', (e) => {
        if (document.activeElement !== num) return; // only a focused field takes the wheel; otherwise the page scrolls
        e.preventDefault();
        const v = Math.min(p.max, Math.max(p.min, Number(num.value) + (e.deltaY < 0 ? step : -step)));
        const decimals = (String(step).split('.')[1] || '').length;
        num.value = String(Number((Math.round(v / step) * step).toFixed(decimals)));
        num.dispatchEvent(new Event('input'));
      }, { passive: false });
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
      input.addEventListener('input', () => set(input.value, false));
      input.addEventListener('change', () => set(input.value));
    }
    const [infoBtn, helpNote] = p.help ? tip(p.help) : [null, null];
    const row = h('div', { class: `row row-${p.type}` },
      h('div', { class: 'label-line' }, h('label', { for: id, class: 'label' }, p.label || p.key), infoBtn),
      input,
      helpNote,
      p.type === 'select' && p.options.some((o) => o.value === 'custom') ? ownFontPicker(p.key) : null);
    rows.push({ p, row });
    groupEl(p.group || 'Settings').append(row);
  }

  const colorBody = groupEl('Colors', false);
  for (const [k, part] of Object.entries(recipe.parts)) {
    const c = h('input', { type: 'color', value: colors[k], id: `c-${k}` });
    c.addEventListener('input', () => { colors[k] = c.value; viewer.show(model?.parts || [], colors); writeHash(); });
    colorBody.append(h('div', { class: 'row row-color' }, h('label', { for: `c-${k}`, class: 'label' }, part.label || k), c));
  }
  {
    const [b, note] = tip('Colors are for the preview, images, SVG and OBJ. Printed colors come from the filament you load.');
    colorBody.prepend(h('div', { class: 'label-line' }, h('span', { class: 'help' }, 'Preview colors'), b), note);
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

  const flash = (el, text) => {
    const old = el.textContent;
    el.textContent = text;
    setTimeout(() => (el.textContent = old), 1500);
  };
  const transparent = h('input', { type: 'checkbox', id: `transparent-${recipe.id}` });
  async function saveImage(type) {
    const { blob, ext } = await viewer.image({ type, scale: 2, transparent: transparent.checked && type !== 'image/jpeg' });
    download(`${fileBase()}.${ext}`, blob);
  }
  const group = (title, info, ...body) => {
    const [b, note] = tip(info);
    return h('div', { class: 'ex-group' }, h('h3', {}, title, b), note, ...body);
  };

  function renderExports() {
    exportsEl.replaceChildren();
    if (!model || !model.parts.length) return;
    const multi = model.parts.length > 1;
    const swap = model.colorChanges;
    const zero = model.stats.min[2];
    const fs = () => compileFeatureScript(recipe, values, { colors });

    const print = [];
    if (multi && swap.length) {
      print.push(
        btn('3MF, filament swap', () => download(`${fileBase()}-swap.3mf`, to3MF(model.parts, { name: recipe.name, mode: 'colorchange', changes: swap, layerHeight }), 'model/3mf'), { class: 'btn primary wide' }),
        h('div', { class: 'swap-line' },
          h('span', {}, swap.map((c) => `${c.label} from ${colorChangeLayer(c.z - zero, layerHeight)} mm`).join(', ')),
          h('label', { class: 'inline' }, 'Layer ', layerInput, ' mm')));
    }
    if (multi) print.push(btn('3MF, multi-material', () => download(`${fileBase()}-mmu.3mf`, to3MF(model.parts, { name: recipe.name, mode: 'mmu' }), 'model/3mf'), { class: swap.length ? 'btn wide' : 'btn primary wide' }));
    print.push(h('div', { class: 'btns' },
      btn(multi ? 'STL, all parts' : 'STL', () => download(`${fileBase()}.stl`, toSTL(model.parts), 'model/stl'), { class: multi ? 'btn' : 'btn primary' }),
      multi ? model.parts.map((p) => btn(`STL, ${p.label}`, () => download(`${fileBase()}-${p.key}.stl`, toSTL([p]), 'model/stl'))) : null));
    const printInfo = [
      multi && swap.length ? 'Filament swap: a PrusaSlicer project with the color change (M600) already at the right layer for this layer height. One nozzle, no MMU needed.' : null,
      multi ? `Multi-material: one object with ${model.parts.length} parts on extruders ${model.parts.map((p, i) => `${i + 1} = ${p.label}`).join(', ')}, for MMU, INDX or tool changers.` : null,
      multi ? 'STL: everything in one file, or one file per part to load as parts in any slicer.' : 'STL: one solid body for any slicer.',
    ].filter(Boolean).join(' ');

    exportsEl.append(
      group('3D print', printInfo, ...print),
      group('Image', 'The current view, at twice the screen resolution. Turn the model first to pick the angle.',
        h('div', { class: 'btns' },
          btn('PNG', () => saveImage('image/png')), btn('JPG', () => saveImage('image/jpeg')), btn('WebP', () => saveImage('image/webp'))),
        h('label', { class: 'inline check' }, transparent, 'Transparent background (PNG, WebP)')),
      group('Vector', 'Outline of each part seen from above, in millimeters, one layer per part. For laser cutters, vinyl cutters, CNC or drawing programs.',
        h('div', { class: 'btns' },
          btn('SVG', () => download(`${fileBase()}.svg`, toSVG(model.parts, { colors, name: recipe.name }), 'image/svg+xml')),
          btn('DXF', () => download(`${fileBase()}.dxf`, toDXF(model.parts), 'application/dxf')))),
      group('CAD', 'OBJ is the mesh with colors, for Blender, Fusion, FreeCAD and other mesh importers (3MF and STL work there too). For real CAD geometry, paste the FeatureScript into an Onshape Feature Studio: it becomes a parametric feature with these values as defaults, and Onshape exports STEP, Parasolid and more from it.',
        h('div', { class: 'btns' },
          btn('OBJ', () => download(`${fileBase()}.obj`, toOBJ(model.parts, { colors, name: recipe.name }), 'model/obj')),
          btn('Onshape .fs', () => download(`${recipe.id}.fs`, fs(), 'text/plain')),
          btn('Copy .fs', async (e) => { await navigator.clipboard.writeText(fs()); flash(e.target, 'Copied'); }))),
      group('Share', shareLink ? 'A link with this generator and all settings in it.' : 'A link with all settings in it.',
        h('div', { class: 'btns' },
          btn('Copy link', async (e) => { await navigator.clipboard.writeText(shareLink ? await shareLink() : location.href); flash(e.target, 'Copied'); }))),
    );
  }

  // ------------------------------------------------------------ rebuild
  function writeHash() {
    if (!syncUrl) return;
    const q = new URLSearchParams();
    const shared = new URLSearchParams(location.hash.slice(1)).get('g'); // a shared recipe stays in the link
    if (shared) q.set('g', shared);
    for (const p of recipe.params) if (values[p.key] !== p.default) q.set(p.key, String(values[p.key]));
    for (const [k, part] of Object.entries(recipe.parts)) if (colors[k] !== part.color) q.set(`color.${k}`, colors[k]);
    if (layerHeight !== 0.2) q.set('layer', String(layerHeight));
    const s = q.toString();
    history.replaceState(null, '', s ? `#${s}` : location.pathname + location.search);
  }

  let env;
  let timer;
  let lastMs = 0;
  let paused = false; // live update paused automatically because builds are slow
  let builds = 0;
  function changed(commit = true) {
    writeHash();
    if ((!live.get() || paused) && !commit) {
      status.textContent = 'Live update is off: press Enter, leave the field or release the slider to rebuild.';
      status.className = 'status';
      return;
    }
    clearTimeout(timer);
    // wait a little longer when rebuilds are slow, so fast typing only builds the last value
    timer = setTimeout(render, Math.min(600, Math.max(60, lastMs * 1.5)));
  }

  function updateVisibility() {
    for (const { key, el } of fontPickers) el.hidden = values[key] !== 'custom';
    let scope;
    try { scope = computeScope(recipe, values); } catch { return; }
    for (const { p, row } of rows) row.hidden = !isVisible(p, scope);
  }

  let renderSeq = 0;
  async function render() {
    updateVisibility();
    if (!env) return;
    const n = ++renderSeq;
    let fontsUsed = [];
    try { fontsUsed = fontsNeeded(recipe, values); } catch { /* build reports it */ }
    const missing = fontsUsed.filter((f) => !env.fonts[f]);
    if (missing.length && env.loadFont) {
      status.textContent = 'Loading font...';
      status.className = 'status';
      await Promise.all(missing.map((f) => env.loadFont(f)));
      if (n !== renderSeq) return; // settings changed meanwhile
    }
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
    lastMs = ms;
    // the first build also warms up the kernel and fonts, so it doesn't count
    const first = builds++ === 0;
    const slow = ms > SLOW_MS && live.get() && !paused && !first;
    if (slow) { paused = true; liveToggle.cb.checked = false; }
    status.textContent = slow ? `Each rebuild takes about ${ms} ms here, so live update is paused for this generator. Values apply on Enter or when you release a slider; switch Live update on again to override.`
      : !model.parts.length ? 'Nothing to show with these settings.'
      : fontsUsed.includes('custom') && !env.fonts.custom ? 'Choose your font file under the font setting; showing Open Sans until then.'
      : fontsUsed.some((f) => !env.fonts[f]) ? 'A font could not be loaded; showing Open Sans instead.' : '';
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
    get colors() { return colors; },
    getView: () => viewer.getView(),
    destroy() { document.removeEventListener('keydown', onKey); disposeModel(model); viewer.dispose(); },
  };
}
