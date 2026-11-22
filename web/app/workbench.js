// A generator plus one collapsible "Change this generator" section: describe a
// change for an AI chat, paste the answer back, or edit the recipe directly.
// The generator always runs whatever recipe is in the editor, so every change
// is previewed before anything is published.
import { mountGenerator } from './generator.js';
import { REPO } from './env.js';
import { formatRecipe } from '../engine/format.js';
import { validateRecipe } from '../engine/recipe.js';
import { buildPrompt, extractRecipe } from './prompt.js';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

export function lineDiff(a, b) {
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

const TEMPLATE = `
<summary>
  <span class="wb-title">Change this generator</span>
  <span class="state" data-ref="state"></span>
  <span class="wb-hint">Describe a change for an AI chat or edit the recipe, preview it here, then publish.</span>
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
      <small>Paste it into ChatGPT, Claude, Gemini or similar. It contains the recipe, the format rules and your current settings. Or edit the recipe below yourself.</small>
    </div>
    <div class="step">
      <h2><span>2</span> Paste the AI's answer</h2>
      <textarea data-ref="answer" rows="3" placeholder="Paste the whole reply here"></textarea>
      <button class="btn primary" type="button" data-ref="apply-answer">Apply to preview</button>
      <small data-ref="answer-msg" role="status">The recipe is taken from the answer, checked, and loaded into the preview below.</small>
    </div>
    <div class="step">
      <h2><span>3</span> Check it and publish</h2>
      <p>Try it in the preview below and look at the changes. When it looks right:</p>
      <div class="btns">
        <button class="btn primary" type="button" data-ref="github">Propose on GitHub</button>
        <button class="btn" type="button" data-ref="download">Download</button>
      </div>
      <small>GitHub opens the recipe file with the new version on your clipboard: select everything, paste, then <em>Commit changes / Propose changes</em>. That creates a pull request; once it is merged, the website updates within minutes. Needs a free GitHub account.</small>
    </div>
  </section>
  <div class="lab-bar">
    <strong class="wb-sub">Recipe</strong>
    <div class="btns">
      <button class="btn" type="button" data-ref="reset">Reset to published</button>
      <button class="btn" type="button" data-ref="copy">Copy recipe</button>
      <a class="btn" href="https://github.com/${REPO}/blob/main/docs/RECIPES.md" target="_blank" rel="noopener">Recipe format</a>
    </div>
  </div>
  <div class="wb-grid">
    <div class="editor">
      <textarea data-ref="src" spellcheck="false" wrap="off" aria-label="Recipe JSON"></textarea>
      <pre data-ref="problems" class="problems" hidden></pre>
    </div>
    <div class="diff" data-ref="diff" aria-label="Changes against the published recipe"></div>
  </div>
</div>`;

/**
 * @param container element to fill (section + generator)
 * @param opts.sourceId  id of the published recipe being changed, or null for a new one
 * @param opts.published the published recipe object (null for a new one)
 * @param opts.start     recipe text to start a new generator from
 * @param opts.syncUrl   keep generator settings in the URL hash
 * @param opts.open      start with the section expanded
 */
export async function mountWorkbench(container, { sourceId = null, published = null, start = '', syncUrl = true, open = false, draftKey } = {}) {
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

  let publishedText = published ? formatRecipe(published) : '';
  let current = null;
  let lastRecipe = null;
  let keep = null;
  let applyCount = 0;
  const key = draftKey || `mgg-draft:${sourceId || 'new'}`;

  function renderDiff() {
    const diffEl = ref('diff');
    diffEl.replaceChildren();
    const msg = (t) => diffEl.append(Object.assign(document.createElement('p'), { textContent: t }));
    if (!publishedText) { msg('New generator: everything is new.'); return 0; }
    const d = lineDiff(publishedText, src.value);
    const changed = d.filter(([t]) => t !== ' ').length;
    if (!changed) { msg('No changes yet. Changes against the published recipe show up here.'); return 0; }
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

  function updateState() {
    const changed = renderDiff();
    const state = ref('state');
    if (!publishedText) { state.textContent = 'New, not published'; state.dataset.kind = 'new'; }
    else if (!changed) { state.textContent = ''; state.dataset.kind = 'clean'; }
    else { state.textContent = `Preview uses your changes (${changed} line${changed > 1 ? 's' : ''})`; state.dataset.kind = 'draft'; }
    ref('reset').disabled = !publishedText || !changed;
    ref('reset').hidden = !publishedText;
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
      const g = await mountGenerator(app, recipe, { syncUrl, ...(keep || {}) });
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
    if (publishedText && src.value === publishedText) store.del(key);
    else store.set(key, src.value);
  }

  function setText(text) {
    src.value = text;
    updateState();
    return apply();
  }

  const flash = (btn, text) => {
    const old = btn.textContent;
    btn.textContent = text;
    setTimeout(() => (btn.textContent = old), 1600);
  };
  const editedId = () => { try { return JSON.parse(src.value).id || 'recipe'; } catch { return sourceId || 'recipe'; } };

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
        ? `The AI's recipe has problems. Send these lines back to the AI and ask for a corrected complete recipe:\n${err.problems.map((p) => `- ${p}`).join('\n')}`
        : err.message;
      return;
    }
    src.value = formatRecipe(recipe);
    saveDraft();
    msg.className = 'ok';
    msg.textContent = sourceId && recipe.id !== sourceId
      ? `Loaded. Note: the AI changed the id to '${recipe.id}', so this becomes a new generator.`
      : 'Loaded into the preview below. Check it, then publish (step 3).';
    updateState();
    await apply();
    app.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  ref('copy').addEventListener('click', async (e) => {
    await navigator.clipboard.writeText(src.value);
    flash(e.target, 'Copied');
  });

  ref('download').addEventListener('click', () => {
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([src.value], { type: 'application/json' })),
      download: `${editedId()}.json`,
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  ref('github').addEventListener('click', async (e) => {
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

  ref('reset').addEventListener('click', () => {
    store.del(key);
    setText(publishedText);
  });

  // ---------------------------------------------------------- start
  const draft = store.get(key);
  if (publishedText) {
    src.value = publishedText;
    if (draft && draft !== publishedText) {
      const n = lineDiff(publishedText, draft).filter(([t]) => t !== ' ').length;
      ref('notice-text').textContent = `You have an unpublished draft of this generator from an earlier visit (${n} changed line${n > 1 ? 's' : ''}).`;
      ref('notice').hidden = false;
      ref('restore').addEventListener('click', () => { ref('notice').hidden = true; details.open = true; setText(draft); });
      ref('discard').addEventListener('click', () => { ref('notice').hidden = true; store.del(key); });
    }
  } else {
    src.value = draft ?? start;
  }
  updateState();
  await apply();

  return {
    get generator() { return current; },
    details,
    /** Replace the recipe being edited (used by the New generator page). */
    load(text) { store.del(key); return setText(text); },
  };
}
