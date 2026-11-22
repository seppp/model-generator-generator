// Validates every recipe and builds it with many parameter combinations.
// Run: npm run check   (CI runs this on every push)
import { nodeEnv, loadRecipes } from './node-env.mjs';
import { formatRecipe } from '../engine/format.js';
import { verifyRecipe } from './verify.mjs';
import { docsProblems } from './docs-check.mjs';
import fs from 'node:fs';
import { validateRecipe } from '../engine/recipe.js';

const env = await nodeEnv();
let failed = 0;

const recipes = loadRecipes();
const ids = new Set();
for (const recipe of recipes) {
  if (ids.has(recipe.id)) { console.error(`✗ duplicate id ${recipe.id}`); failed++; }
  ids.add(recipe.id);
  if (recipe.__text !== formatRecipe(recipe)) {
    console.error(`✗ recipes/${recipe.id}.json is not canonically formatted: run npm run format`);
    failed++;
  }
  const { errors, results } = verifyRecipe(recipe, env);
  for (const e of errors) console.error(`✗ ${recipe.id} ${e}`);
  failed += errors.length;
  if (results.length) console.log(`✓ ${recipe.id}: ${results.length} variations built`);
  if (process.argv.includes('-v')) results.forEach((r) => console.log(`    ${r}`));
}

// Backwards compatibility: older versions of recipes live on in people's saved
// generators, exported files and share links, so they must keep working.
const compatDir = new URL('../tests/compat/', import.meta.url);
const compat = fs.readdirSync(compatDir).filter((f) => f.endsWith('.json'));
let compatBad = 0;
for (const f of compat) {
  try {
    const recipe = JSON.parse(fs.readFileSync(new URL(f, compatDir), 'utf8'));
    validateRecipe(recipe);
    const { errors } = verifyRecipe(recipe, env);
    for (const e of errors) { console.error(`✗ compat ${f}: ${e}`); compatBad++; }
  } catch (e) {
    console.error(`✗ compat ${f} no longer works: ${e.message}`);
    compatBad++;
  }
}
failed += compatBad;
if (!compatBad) console.log(`✓ ${compat.length} older recipe versions (tests/compat) still build`);

for (const p of docsProblems()) { console.error(`✗ docs: ${p}`); failed++; }
if (!failed) console.log('✓ docs cover every block, option, font, param type, step key and function');

if (failed) {
  console.error(`\n${failed} problem(s)`);
  process.exit(1);
}
console.log('\nAll recipes OK');
