// The generator generator: validates every recipe in recipes/ and produces the
// static website in dist/: one page that runs every recipe, the collection file
// generators.json it loads them from (same format as a user's exported file),
// and each recipe's default Onshape FeatureScript. GitHub Actions publishes
// dist/ to GitHub Pages.
import fs from 'node:fs';
import path from 'node:path';
import { loadRecipes, BUNDLED_FONTS, fontPath } from './node-env.mjs';
import { FONTS, fontFile } from '../engine/fonts.js';
import { validateRecipe } from '../engine/recipe.js';
import { compileFeatureScript } from '../engine/featurescript.js';
import { makeCollection } from '../engine/collection.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dist = path.join(root, 'dist');
const pkgDir = (name) => path.join(root, 'node_modules', name);

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
const copy = (from, to) => {
  fs.mkdirSync(path.dirname(path.join(dist, to)), { recursive: true });
  fs.cpSync(from, path.join(dist, to), { recursive: true });
};

// Vendored browser dependencies (no CDN, no bundler)
copy(path.join(pkgDir('three'), 'build/three.module.js'), 'vendor/three/three.module.js');
copy(path.join(pkgDir('three'), 'build/three.core.js'), 'vendor/three/three.core.js');
copy(path.join(pkgDir('three'), 'examples/jsm/controls/OrbitControls.js'), 'vendor/three/addons/controls/OrbitControls.js');
copy(path.join(pkgDir('manifold-3d'), 'manifold.js'), 'vendor/manifold/manifold.js');
copy(path.join(pkgDir('manifold-3d'), 'manifold.wasm'), 'vendor/manifold/manifold.wasm');
copy(path.join(pkgDir('qrcode-generator'), 'dist/qrcode.mjs'), 'vendor/qrcode/qrcode.mjs');
copy(path.join(pkgDir('opentype.js'), 'dist/opentype.mjs'), 'vendor/opentype/opentype.mjs');
for (const n of BUNDLED_FONTS) copy(fontPath(n), `vendor/fonts/${fontFile(n)}`);
for (const pkg of new Set(BUNDLED_FONTS.map((n) => FONTS[n].pkg))) copy(pkgDir(`@fontsource/${pkg}/LICENSE`), `vendor/fonts/LICENSE-${pkg}.txt`);

// Engine (shared with Node) and the web app
copy(path.join(root, 'engine'), 'engine');
copy(path.join(root, 'web/app'), 'app');
copy(path.join(root, 'web/style.css'), 'style.css');
copy(path.join(root, 'docs/RECIPES.md'), 'docs/RECIPES.md'); // included in the AI prompt

const partial = (name) => fs.readFileSync(path.join(root, 'web', name), 'utf8').trim();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const page = (file, vars = {}) => {
  let html = partial(file).replace('{{head}}', partial('_head.html')).replace('{{header}}', partial('_header.html'));
  for (const [k, v] of Object.entries(vars)) html = html.replaceAll(`{{${k}}}`, esc(v));
  return html + '\n';
};
const write = (rel, data) => {
  fs.mkdirSync(path.dirname(path.join(dist, rel)), { recursive: true });
  fs.writeFileSync(path.join(dist, rel), data);
};

const recipes = loadRecipes();
for (const recipe of recipes) {
  validateRecipe(recipe);
  // old per-generator URLs now open the single page
  write(`${recipe.id}/index.html`, page('redirect.html', { target: `../?recipe=${recipe.id}` }));
  write(`featurescript/${recipe.id}.fs`, compileFeatureScript(recipe));
  console.log(`generated ?recipe=${recipe.id} and featurescript/${recipe.id}.fs`);
}
write('generators.json', `${JSON.stringify(makeCollection(recipes), null, 2)}\n`);
write('index.html', page('index.html'));
// the old Recipe lab URL (lab.html?recipe=<id>) uses the same query
write('lab.html', page('redirect.html', { target: './' }).replace("location.replace('./' + location.hash)", "location.replace('./' + location.search + location.hash)"));
write('.nojekyll', '');
console.log(`\n${recipes.length} generators -> dist/generators.json`);
