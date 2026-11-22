// Validates every recipe and builds it with many parameter combinations.
// Run: npm run check   (CI runs this on every push)
import { nodeEnv, loadRecipes } from './node-env.mjs';
import { validateRecipe, defaultValues } from '../engine/recipe.js';
import { buildModel, disposeModel } from '../engine/build.js';
import { compileFeatureScript } from '../engine/featurescript.js';
import { to3MF, toSTL } from '../engine/export.js';

const env = await nodeEnv();
let failed = 0;

/** Defaults, plus every select option / boolean flipped one at a time, plus min/max of numbers. */
function variations(recipe) {
  const base = defaultValues(recipe);
  const out = [{ name: 'defaults', values: base }];
  for (const p of recipe.params) {
    if (p.type === 'select') for (const o of p.options) if (o.value !== p.default) out.push({ name: `${p.key}=${o.value}`, values: { ...base, [p.key]: o.value } });
    if (p.type === 'boolean') out.push({ name: `${p.key}=${!p.default}`, values: { ...base, [p.key]: !p.default } });
    if (p.type === 'number') {
      out.push({ name: `${p.key}=min`, values: { ...base, [p.key]: p.min }, soft: true });
      out.push({ name: `${p.key}=max`, values: { ...base, [p.key]: p.max }, soft: true });
    }
    if (p.type === 'text') out.push({ name: `${p.key}=""`, values: { ...base, [p.key]: '' }, soft: true });
  }
  return out;
}

for (const recipe of loadRecipes()) {
  try {
    validateRecipe(recipe);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    failed++;
    continue;
  }
  const results = [];
  for (const v of variations(recipe)) {
    try {
      const model = buildModel(recipe, v.values, env);
      const bad = model.parts.filter((p) => p.manifold.status() !== 'NoError');
      if (bad.length) throw new Error(`invalid solid: ${bad.map((p) => p.key).join(', ')}`);
      if (!model.parts.length && !v.soft) throw new Error('produced no geometry');
      if (model.parts.length) {
        toSTL(model.parts);
        to3MF(model.parts, { name: recipe.name, mode: 'colorchange', changes: model.colorChanges });
      }
      compileFeatureScript(recipe, v.values);
      results.push(`${v.name}: ${model.parts.map((p) => `${p.key} ${p.volume.toFixed(0)}mm³`).join(', ') || 'empty'}`);
      disposeModel(model);
    } catch (e) {
      console.error(`✗ ${recipe.id} [${v.name}]: ${e.message}`);
      failed++;
    }
  }
  console.log(`✓ ${recipe.id}: ${results.length} variations built`);
  if (process.argv.includes('-v')) results.forEach((r) => console.log(`    ${r}`));
}

if (failed) {
  console.error(`\n${failed} problem(s)`);
  process.exit(1);
}
console.log('\nAll recipes OK');
