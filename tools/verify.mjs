// Builds a recipe with many parameter combinations: defaults, every select
// option and boolean flipped one at a time, min/max of numbers, empty texts.
// Used by `npm run check` and by `npm run submission`.
import { validateRecipe, defaultValues } from '../engine/recipe.js';
import { buildModel, disposeModel } from '../engine/build.js';
import { compileFeatureScript } from '../engine/featurescript.js';
import { to3MF, toSTL } from '../engine/export.js';

export function variations(recipe) {
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

/** Returns { errors: string[], results: string[], notes: string[] } (notes of the default build). */
export function verifyRecipe(recipe, env) {
  const errors = [];
  const results = [];
  let notes = [];
  try {
    validateRecipe(recipe);
  } catch (e) {
    return { errors: e.problems || [e.message], results, notes };
  }
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
      if (v.name === 'defaults') notes = model.notes;
      results.push(`${v.name}: ${model.parts.map((p) => `${p.key} ${p.volume.toFixed(0)}mm³`).join(', ') || 'empty'}`);
      disposeModel(model);
    } catch (e) {
      errors.push(`[${v.name}] ${e.message}`);
    }
  }
  return { errors, results, notes };
}
