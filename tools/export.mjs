// Command-line export, e.g.
//   npm run export -- qr-keychain content=https://example.com style=flush
//   npm run export -- my-generators.json plant-tag size=80    (a recipe or collection file)
// Writes STL, 3MF (filament swap + multi-material), OBJ, SVG, DXF and FeatureScript to out/.
import fs from 'node:fs';
import { nodeEnv, loadRecipes } from './node-env.mjs';
import { validateRecipe } from '../engine/recipe.js';
import { buildModel } from '../engine/build.js';
import { compileFeatureScript } from '../engine/featurescript.js';
import { to3MF, toSTL, toOBJ, toSVG, toDXF } from '../engine/export.js';
import { readCollection } from '../engine/collection.js';

let args = process.argv.slice(2);
let recipes;
if (args[0]?.endsWith('.json')) {
  recipes = readCollection(fs.readFileSync(args.shift(), 'utf8'));
  if (recipes.length === 1 && (!args[0] || args[0].includes('='))) args.unshift(recipes[0].id);
} else {
  recipes = loadRecipes();
}
const [id, ...pairs] = args;
const recipe = recipes.find((r) => r.id === id);
if (!recipe) {
  console.error(`Usage: npm run export -- [file.json] <recipe> [key=value ...]\nRecipes: ${recipes.map((r) => r.id).join(', ')}`);
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
write(`${id}.obj`, toOBJ(model.parts, { name: recipe.name }));
write(`${id}.svg`, toSVG(model.parts, { name: recipe.name }));
write(`${id}.dxf`, toDXF(model.parts));
write(`${id}.fs`, compileFeatureScript(recipe, model.values));
for (const n of model.notes) console.log(`note: ${n}`);
