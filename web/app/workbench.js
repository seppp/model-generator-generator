// A generator plus one collapsible "Change this generator" section: describe a
// change for an AI chat, paste the answer back, preview it, then save it in
// this browser, share it as a link or submit it to the site. The recipe code
// is behind its own toggle. The generator always runs whatever recipe is in
// the editor, so every change is previewed first.
import { mountGenerator } from './generator.js';
import { REPO } from './env.js';
import { mine } from './mine.js';
import { formatRecipe } from '../engine/format.js';
import { validateRecipe } from '../engine/recipe.js';
import { encodeShare } from '../engine/collection.js';
import { lineDiff, diffHunks } from '../engine/diff.js';
import { buildPrompt, extractRecipe } from './prompt.js';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

/** Link that opens `recipe` (compressed into the #fragment) with the given settings. */
export async function shareLink(recipe, settingsHash = '') {
  const q = new URLSearchParams(settingsHash.replace(/^#/, ''));
  q.delete('g');
  const rest = q.toString();
  return `${location.origin}${location.pathname}?shared#g=${await encodeShare(recipe)}${rest ? `&${rest}` : ''}`;
}

/** Plain-words summary of a recipe, or of what changed compared to `before`. */
export function describeChange(before, after) {
  if (!before) {
    return `New generator "${after.name || after.id}": ${after.description || 'no description'} (${after.params.length} settings, parts: ${Object.values(after.parts || {}).map((p) => p.label).join(', ')}).`;
  }
  const lines = [];
  const old = Object.fromEntries(before.params.map((p) => [p.key, p]));
  const now = Object.fromEntries(after.params.map((p) => [p.key, p]));
  const label = (p) => p.label || p.key;
  for (const p of after.params) {
    const o = old[p.key];
    if (!o) { lines.push(`Added setting "${label(p)}" (default ${JSON.stringify(p.default)})`); continue; }
    if (JSON.stringify(o.default) !== JSON.stringify(p.default)) lines.push(`"${label(p)}" default ${JSON.stringify(o.default)} -> ${JSON.stringify(p.default)}`);
    if (o.min !== p.min || o.max !== p.max) lines.push(`"${label(p)}" range ${o.min}-${o.max} -> ${p.min}-${p.max}`);
    if (JSON.stringify(o.options) !== JSON.stringify(p.options)) lines.push(`"${label(p)}" options changed`);
  }
  for (const o of before.params) if (!now[o.key]) lines.push(`Removed setting "${label(o)}"`);
  if (JSON.stringify(before.steps) !== JSON.stringify(after.steps)) lines.push('Geometry steps changed');
  if (JSON.stringify(before.derived) !== JSON.stringify(after.derived)) lines.push('Derived values changed');
  if (JSON.stringify(before.notes) !== JSON.stringify(after.notes)) lines.push('Print notes changed');
  if (before.name !== after.name || before.description !== after.description) lines.push('Name or description changed');
  if (JSON.stringify(before.parts) !== JSON.stringify(after.parts)) lines.push('Parts or colors changed');
  return lines.length ? `Changes to "${before.name}":\n${lines.map((l) => `- ${l}`).join('\n')}` : `No changes to "${before.name}" (same as the published version).`;
}

const MAX_URL = 8000; // GitHub refuses much longer new-issue links

const TEMPLATE = `
<summary>
  <span class="wb-title">Change this generator</span>
  <span class="state" data-ref="state"></span>
  <span class="wb-hint">Ask an AI chat for a change, preview it, then save, share or submit it.</span>
</summary>
<div class="wb-body">
  <div class="draft-notice" data-ref="notice" hidden>
    <span data-ref="notice-text"></span>
    <button class="btn" type="button" data-ref="restore">Restore draft</button>
    <button class="btn" type="button" data-ref="discard">Discard</button>
  </div>
  <section class="flow" aria-label="Change in three steps">
    <div class="step">
      <h2><span>1</span> Describe the change</h2>
      <textarea data-ref="wish" rows="3" placeholder="e.g. make the keyring hole bigger by default and add an option for a round tag"></textarea>
      <button class="btn primary" type="button" data-ref="prompt">Copy prompt for an AI chat</button>
      <textarea data-ref="prompt-out" rows="4" readonly hidden aria-label="Prompt"></textarea>
      <small>Paste it into ChatGPT, Claude, Gemini or similar.</small>
    </div>
    <div class="step">
      <h2><span>2</span> Paste the AI's answer</h2>
      <textarea data-ref="answer" rows="3" placeholder="Paste the whole reply here"></textarea>
      <button class="btn primary" type="button" data-ref="apply-answer">Apply to preview</button>
      <small data-ref="answer-msg" role="status">The recipe is checked and loaded into the preview.</small>
    </div>
    <div class="step">
      <h2><span>3</span> Keep it, share it or submit it</h2>
      <div class="btns">
        <button class="btn primary" type="button" data-ref="save">Save to my generators</button>
        <button class="btn" type="button" data-ref="share">Copy share link</button>
        <button class="btn" type="button" data-ref="submit">Submit to the site</button>
        <button class="btn" type="button" data-ref="remove" hidden>Remove from my generators</button>
      </div>
      <input data-ref="share-out" readonly hidden aria-label="Share link">
      <small data-ref="keep-msg" role="status">Saving keeps it in this browser. A share link works for anyone. Submitting needs a GitHub account.</small>
    </div>
  </section>
  <details class="code" data-ref="code">
    <summary>Recipe code <span class="wb-hint" data-ref="code-hint"></span></summary>
    <div class="lab-bar">
      <div class="btns">
        <button class="btn" type="button" data-ref="reset">Reset</button>
        <button class="btn" type="button" data-ref="copy">Copy recipe</button>
        <button class="btn" type="button" data-ref="download">Download .json</button>
        <a class="btn" href="https://github.com/${REPO}/blob/main/docs/RECIPES.md" target="_blank" rel="noopener">Recipe format</a>
      </div>
    </div>
    <div class="wb-grid">
      <div class="editor">
        <textarea data-ref="src" spellcheck="false" wrap="off" aria-label="Recipe JSON"></textarea>
      </div>
      <div class="diff" data-ref="diff" aria-label="Changes"></div>
    </div>
  </details>
  <pre data-ref="problems" class="problems" hidden></pre>
</div>`;

/**
 * @param container element to fill (section + generator)
 * @param opts.kind      'site' | 'mine' | 'new' | 'shared'
 * @param opts.base      recipe that changes are compared to and reset to (null: none)
 * @param opts.baseLabel what `base` is, for labels: 'published' or 'saved'
 * @param opts.start     recipe text to start from (defaults to the base)
 * @param opts.draftKey  localStorage key for unsaved edits (null: no drafts)
 * @param opts.siteIds   ids of the site's generators
 * @param opts.syncUrl   keep generator settings in the URL hash
 * @param opts.open      start with the section expanded
 * @param opts.message   status text to show in step 3 (e.g. after saving)
 * @param opts.onSave    called with the recipe after it was saved to My generators
 * @param opts.onRemove  called with the id after a saved generator was removed
 */
export async function mountWorkbench(container, {
  kind = 'site', base = null, baseLabel = 'published', start = '', draftKey = null, siteIds = [], siteRecipes = [],
  syncUrl = true, open = false, message = '', onSave = () => {}, onRemove = () => {},
} = {}) {
  container.replaceChildren();
  const details = document.createElement('details');
  details.className = 'workbench';
  details.innerHTML = TEMPLATE;
  details.open = open;
  const app = document.createElement('div');
  app.className = 'app';
  container.append(details, app);
  const ref = (name) => details.querySelector(`[data-ref="${name}"]`);
  const src = ref('src');
  const keepMsg = ref('keep-msg');
  const say = (text, ok = true) => { keepMsg.className = ok ? 'ok' : 'bad'; keepMsg.textContent = text; };

  const baseText = base ? formatRecipe(base) : '';
  const siteRecipe = (id) => siteRecipes.find((r) => r.id === id) || null;
  let current = null;
  let lastRecipe = null;
  let keep = null;
  let applyCount = 0;

  function renderDiff() {
    const diffEl = ref('diff');
    diffEl.replaceChildren();
    const msg = (t) => diffEl.append(Object.assign(document.createElement('p'), { textContent: t }));
    if (!baseText) { msg('New generator: everything is new.'); return 0; }
    const d = lineDiff(baseText, src.value);
    const changed = d.filter(([t]) => t !== ' ').length;
    if (!changed) { msg(`No changes yet. Changes against the ${baseLabel} version show up here.`); return 0; }
    for (const row of diffHunks(d)) {
      if (!row) { diffEl.append(Object.assign(document.createElement('div'), { className: 'gap', textContent: '···' })); continue; }
      const [t, line, no] = row;
      diffEl.append(Object.assign(document.createElement('div'), { className: t === '+' ? 'add' : t === '-' ? 'del' : 'ctx', textContent: `${t} ${line}`, title: `line ${no}` }));
    }
    return changed;
  }

  function updateState() {
    const changed = renderDiff();
    const state = ref('state');
    const lines = `${changed} line${changed > 1 ? 's' : ''}`;
    if (!baseText) { state.textContent = kind === 'shared' ? 'Shared version' : 'New, not saved'; state.dataset.kind = 'new'; }
    else if (!changed) { state.textContent = kind === 'shared' ? 'Same as published' : ''; state.dataset.kind = 'clean'; }
    else { state.textContent = baseLabel === 'saved' ? `Unsaved changes (${lines})` : `Preview uses your changes (${lines})`; state.dataset.kind = 'draft'; }
    ref('code-hint').textContent = baseText && changed ? `${lines} changed against the ${baseLabel} version` : 'for editing by hand';
    ref('reset').textContent = `Reset to ${baseLabel}`;
    ref('reset').disabled = !baseText || !changed;
    ref('reset').hidden = !baseText;
  }

  async function apply() {
    const n = ++applyCount;
    const problems = ref('problems');
    let recipe;
    try {
      recipe = JSON.parse(src.value);
      validateRecipe(recipe); // a broken recipe keeps the last good preview
    } catch (e) {
      problems.hidden = false;
      problems.textContent = e instanceof SyntaxError ? `JSON: ${e.message}` : e.message;
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
      // a saved or new generator only exists in this browser: its link must carry the recipe
      const link = kind === 'mine' || kind === 'new' ? () => shareLink(recipe, location.hash) : undefined;
      const g = await mountGenerator(app, recipe, { syncUrl, shareLink: link, ...(keep || {}) });
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
    if (!draftKey) return;
    if (src.value === (baseText || start)) store.del(draftKey);
    else store.set(draftKey, src.value);
  }

  function setText(text) {
    src.value = text;
    updateState();
    return apply();
  }

  /** The recipe in the editor, or null (with a message) when it is broken. */
  function validRecipe() {
    try {
      const r = JSON.parse(src.value);
      validateRecipe(r);
      return r;
    } catch (e) {
      say(`Fix the recipe first: ${e instanceof SyntaxError ? `JSON: ${e.message}` : e.message}`, false);
      return null;
    }
  }

  const flash = (btn, text) => {
    const old = btn.textContent;
    btn.textContent = text;
    setTimeout(() => (btn.textContent = old), 1600);
  };

  // ---------------------------------------------------------- events
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

  ref('prompt').addEventListener('click', async (e) => {
    const text = await buildPrompt({ recipeText: src.value, change: ref('wish').value, values: current?.values });
    try {
      await navigator.clipboard.writeText(text);
      flash(e.target, 'Copied: paste it into your AI chat');
    } catch {
      const out = ref('prompt-out');
      out.hidden = false;
      out.value = text;
      out.select();
      flash(e.target, 'Copy the text below');
    }
  });

  ref('apply-answer').addEventListener('click', async () => {
    const msg = ref('answer-msg');
    let recipe;
    try {
      recipe = extractRecipe(ref('answer').value);
      validateRecipe(recipe);
    } catch (err) {
      msg.className = 'bad';
      msg.textContent = err.problems
        ? `Problems found. Send these back to the AI:\n${err.problems.map((p) => `- ${p}`).join('\n')}`
        : err.message;
      return;
    }
    src.value = formatRecipe(recipe);
    saveDraft();
    msg.className = 'ok';
    msg.textContent = base && recipe.id !== base.id
      ? `Loaded. The id changed to '${recipe.id}', so this is a separate generator.`
      : 'Loaded. Check the preview, then keep it (step 3).';
    updateState();
    await apply();
    app.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  ref('save').addEventListener('click', () => {
    const recipe = validRecipe();
    if (!recipe) return;
    const replacing = mine.get(recipe.id);
    if (!mine.save(recipe)) { say('This browser blocks saving. Use Download .json under Recipe code.', false); return; }
    if (draftKey) store.del(draftKey);
    onSave(recipe, { replaced: !!replacing });
  });

  ref('share').addEventListener('click', async (e) => {
    const recipe = validRecipe();
    if (!recipe) return;
    const link = await shareLink(recipe, location.hash);
    try {
      await navigator.clipboard.writeText(link);
      flash(e.target, 'Link copied');
    } catch {
      const out = ref('share-out');
      out.hidden = false;
      out.value = link;
      out.select();
    }
    say('Link copied. It holds this version and your settings.');
  });

  ref('submit').addEventListener('click', async () => {
    const recipe = validRecipe();
    if (!recipe) return;
    const change = siteIds.includes(recipe.id);
    const link = await shareLink(recipe, location.hash);
    const q = new URLSearchParams({
      template: 'generator.yml',
      title: `${change ? 'Change' : 'New generator'}: ${recipe.name || recipe.id}`,
      'based-on': change ? recipe.id : 'new',
      // the form requires a description: the user's wish, else an automatic summary
      what: [ref('wish').value.trim(), describeChange(change ? siteRecipe(recipe.id) : null, recipe)].filter(Boolean).join('\n\n'),
      link,
    });
    const url = () => `https://github.com/${REPO}/issues/new?${q}`;
    q.set('recipe', JSON.stringify(recipe));
    if (url().length > MAX_URL) q.delete('recipe'); // the share link holds the recipe anyway
    if (url().length > MAX_URL) { say('Too large to submit by link. Download the .json and attach it to a GitHub issue.', false); return; }
    window.open(url(), '_blank', 'noopener');
    say('Submission form opened on GitHub. Check it, then click Create.');
  });

  let removeArmed = false;
  ref('remove').hidden = kind !== 'mine';
  ref('remove').addEventListener('click', (e) => {
    if (!removeArmed) {
      removeArmed = true;
      e.target.textContent = 'Click again to remove';
      setTimeout(() => { removeArmed = false; e.target.textContent = 'Remove from my generators'; }, 4000);
      return;
    }
    const id = base?.id;
    mine.remove(id);
    if (draftKey) store.del(draftKey);
    onRemove(id);
  });

  ref('copy').addEventListener('click', async (e) => {
    await navigator.clipboard.writeText(src.value);
    flash(e.target, 'Copied');
  });

  ref('download').addEventListener('click', () => {
    let id = 'recipe';
    try { id = JSON.parse(src.value).id || id; } catch { /* keep default */ }
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([src.value], { type: 'application/json' })),
      download: `${id}.json`,
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  ref('reset').addEventListener('click', () => {
    if (draftKey) store.del(draftKey);
    setText(baseText);
  });

  // ---------------------------------------------------------- start
  const initial = start || baseText;
  src.value = initial;
  const draft = draftKey ? store.get(draftKey) : null;
  if (draft && draft !== initial) {
    if (!baseText) src.value = draft; // a new generator just continues where it was
    else {
      const n = lineDiff(initial, draft).filter(([t]) => t !== ' ').length;
      ref('notice-text').textContent = `You have unsaved changes to this generator from an earlier visit (${n} changed line${n > 1 ? 's' : ''}).`;
      ref('notice').hidden = false;
      ref('restore').addEventListener('click', () => { ref('notice').hidden = true; details.open = true; setText(draft); });
      ref('discard').addEventListener('click', () => { ref('notice').hidden = true; store.del(draftKey); });
    }
  }
  if (message) say(message);
  updateState();
  await apply();

  return {
    get generator() { return current; },
    details,
    /** Replace the recipe being edited (used by the New generator page). */
    load(text) { if (draftKey) store.del(draftKey); return setText(text); },
  };
}
