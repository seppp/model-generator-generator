// Opens every official generator in a real browser (Playwright, Chromium) and
// checks what `npm run check` can't: that the page loads without errors and
// every form input shows its values (each select lists all its options with
// the default selected). Run after `npm run build` (npm run test:page).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { generators } = JSON.parse(fs.readFileSync(path.join(root, 'dist/generators.json'), 'utf8'));
const port = 8000 + Math.floor(Math.random() * 900);
const server = spawn(process.execPath, [path.join(root, 'tools/serve.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
const failures = [];

try {
  await new Promise((r) => setTimeout(r, 500));
  const browser = await chromium.launch();
  for (const recipe of generators) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`http://localhost:${port}/?recipe=${recipe.id}`);
    await page.waitForSelector('#p-' + recipe.params[0].key, { timeout: 20000 });
    for (const p of recipe.params.filter((x) => x.type === 'select')) {
      const shown = await page.evaluate((key) => {
        const el = document.getElementById(`p-${key}`);
        if (!el) return null;
        if (el.tagName === 'SELECT') return { values: [...el.options].map((o) => o.value), texts: [...el.options].map((o) => o.textContent), selected: el.value };
        const buttons = [...el.querySelectorAll('button')];
        return { values: buttons.map((b) => b.dataset.v), texts: buttons.map((b) => b.textContent), selected: buttons.find((b) => b.getAttribute('aria-checked') === 'true')?.dataset.v };
      }, p.key);
      const where = `${recipe.id}: ${p.key}`;
      if (!shown) { failures.push(`${where}: input missing`); continue; }
      const want = p.options.map((o) => o.value).sort();
      if (JSON.stringify([...shown.values].sort()) !== JSON.stringify(want)) failures.push(`${where}: shows [${shown.values}] instead of [${want}]`);
      if (shown.texts.some((t) => !t.trim() || t.includes('[object'))) failures.push(`${where}: option without a readable label`);
      if (shown.selected !== p.default) failures.push(`${where}: '${shown.selected}' selected instead of the default '${p.default}'`);
    }
    await page.waitForTimeout(1500);
    for (const e of errors) failures.push(`${recipe.id}: ${e}`);
    await page.close();
    console.log(`${failures.length ? '…' : '✓'} ${recipe.id}`);
  }
  await browser.close();
} finally {
  server.kill();
}

if (failures.length) {
  console.error(failures.map((f) => `✗ ${f}`).join('\n'));
  process.exit(1);
}
console.log('✓ every generator page loads and its selects list their options');
