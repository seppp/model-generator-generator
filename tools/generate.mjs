// The generator generator: validates every recipe in recipes/ and produces the
// static website in dist/ (one generator page per recipe plus its default
// Onshape FeatureScript). GitHub Actions publishes dist/ to GitHub Pages.
import fs from 'node:fs';
import path from 'node:path';
import { loadRecipes, FONT_FILES, fontPath } from './node-env.mjs';
import { validateRecipe } from '../engine/recipe.js';
import { compileFeatureScript } from '../engine/featurescript.js';

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
for (const f of Object.values(FONT_FILES)) copy(fontPath(f), `vendor/fonts/${f}`);

// Engine (shared with Node) and the web app
copy(path.join(root, 'engine'), 'engine');
copy(path.join(root, 'web/app'), 'app');
copy(path.join(root, 'web/style.css'), 'style.css');

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

const index = [];
for (const recipe of loadRecipes()) {
  validateRecipe(recipe);
  write(`recipes/${recipe.id}.json`, JSON.stringify(recipe, null, 2));
  write(`${recipe.id}/index.html`, page('generator.html', recipe));
  write(`featurescript/${recipe.id}.fs`, compileFeatureScript(recipe));
  index.push({
    id: recipe.id,
    name: recipe.name,
    description: recipe.description || '',
    params: recipe.params.length,
    parts: Object.keys(recipe.parts).length,
    colors: Object.values(recipe.parts).map((p) => p.color || '#cccccc'),
  });
  console.log(`generated ${recipe.id}/ and featurescript/${recipe.id}.fs`);
}
write('recipes/index.json', JSON.stringify(index, null, 2));
write('index.html', page('index.html'));
write('lab.html', page('lab.html'));
write('.nojekyll', '');
console.log(`\n${index.length} generators -> dist/`);
