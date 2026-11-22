// Command-line export, e.g.
//   npm run export -- qr-keychain content=https://example.com style=flush
// Writes STL, 3MF (filament swap + multi-material) and FeatureScript to out/.
import fs from 'node:fs';
import { nodeEnv, loadRecipes } from './node-env.mjs';
import { validateRecipe } from '../engine/recipe.js';
import { buildModel } from '../engine/build.js';
import { compileFeatureScript } from '../engine/featurescript.js';
import { to3MF, toSTL } from '../engine/export.js';

const [id, ...pairs] = process.argv.slice(2);
const recipes = loadRecipes();
const recipe = recipes.find((r) => r.id === id);
if (!recipe) {
  console.error(`Usage: npm run export -- <recipe> [key=value ...]\nRecipes: ${recipes.map((r) => r.id).join(', ')}`);
  process.exit(1);
}
validateRecipe(recipe);
const values = Object.fromEntries(pairs.map((p) => [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)]));
const model = buildModel(recipe, values, await nodeEnv());
fs.mkdirSync('out', { recursive: true });
const write = (name, data) => { fs.writeFileSync(`out/${name}`, data); console.log(`out/${name}`); };
write(`${id}.stl`, toSTL(model.parts));
for (const p of model.parts) write(`${id}-${p.key}.stl`, toSTL([p]));
write(`${id}-multimaterial.3mf`, to3MF(model.parts, { name: recipe.name, mode: 'mmu' }));
if (model.colorChanges.length) write(`${id}-filament-swap.3mf`, to3MF(model.parts, { name: recipe.name, mode: 'colorchange', changes: model.colorChanges }));
write(`${id}.fs`, compileFeatureScript(recipe, model.values));
for (const n of model.notes) console.log(`note: ${n}`);
