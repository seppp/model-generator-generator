// Reviews a generator submitted through the website ("Submit to the site"
// opens a GitHub issue). Reads the issue body on stdin, finds the recipe (the
// JSON block, or the share link that holds it compressed), validates and builds
// it with many settings, and shows what it changes compared to recipes/.
//
//   gh api repos/<owner>/<repo>/issues/<n> --jq .body | npm run -s submission
//   ... | npm run -s submission -- --apply      also writes recipes/<id>.json
//
// The issue is untrusted input: recipes are data (expressions are parsed by
// engine/expr.js, never evaluated as JavaScript), and nothing else from the
// issue is run.
import fs from 'node:fs';
import { nodeEnv } from './node-env.mjs';
import { readCollection, decodeShare } from '../engine/collection.js';
import { formatRecipe } from '../engine/format.js';
import { lineDiff, diffHunks } from '../engine/diff.js';
import { verifyRecipe } from './verify.mjs';

const apply = process.argv.includes('--apply');
const body = fs.readFileSync(0, 'utf8');

async function findRecipes(text) {
  const notes = [];
  for (const m of text.matchAll(/```(?:json|JSON)?\s*\n([\s\S]*?)```/g)) {
    try { return { recipes: readCollection(m[1]), from: 'the JSON in the issue', notes }; } catch (e) { notes.push(`JSON block skipped: ${e.message}`); }
  }
  for (const m of text.matchAll(/[#&]g=([A-Za-z0-9_-]{20,})/g)) {
    try { return { recipes: [await decodeShare(m[1])], from: 'the share link', notes }; } catch (e) { notes.push(`share link skipped: ${e.message}`); }
  }
  return { recipes: [], from: null, notes };
}

const { recipes, from, notes } = await findRecipes(body);
notes.forEach((n) => console.log(`note: ${n}`));
if (!recipes.length) {
  console.log('No recipe found in the issue (no valid ```json block and no share link with #g=...).');
  process.exit(1);
}
console.log(`Found ${recipes.length} recipe(s) in ${from}.\n`);

const env = await nodeEnv();
let failed = 0;
fs.mkdirSync('out/submissions', { recursive: true });
for (const recipe of recipes) {
  const text = formatRecipe(recipe);
  const file = /^[a-z0-9-]+$/.test(recipe.id) ? `recipes/${recipe.id}.json` : null;
  const existing = file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  console.log(`## ${recipe.name || '(no name)'} (id: ${recipe.id})`);
  if (!existing) console.log(`New generator, ${recipe.params?.length || 0} params, ${recipe.steps?.length || 0} steps, parts: ${Object.keys(recipe.parts || {}).join(', ')}`);
  else if (existing === text) console.log(`Identical to ${file}: nothing to change.`);
  else {
    const d = lineDiff(existing, text);
    console.log(`Changes ${file} (${d.filter(([t]) => t !== ' ').length} lines):`);
    for (const row of diffHunks(d)) console.log(row ? `  ${row[0]} ${row[1]}` : '  ···');
  }
  const { errors, results, notes: printNotes } = verifyRecipe(recipe, env);
  if (errors.length) {
    failed++;
    console.log(`✗ ${errors.length} problem(s):`);
    errors.forEach((e) => console.log(`  - ${e}`));
  } else {
    console.log(`✓ built ${results.length} variations`);
    printNotes.forEach((n) => console.log(`  print note: ${n}`));
  }
  const out = `out/submissions/${String(recipe.id).replace(/[^a-z0-9-]/g, '_')}.json`;
  fs.writeFileSync(out, text);
  console.log(`saved ${out}`);
  if (apply && !errors.length && file) {
    fs.writeFileSync(file, text);
    console.log(`wrote ${file}`);
  }
  console.log('');
}
process.exit(failed ? 1 : 0);
