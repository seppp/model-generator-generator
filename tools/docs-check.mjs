// Fails `npm run check` when the docs that people and AIs work from fall behind
// the code: docs/RECIPES.md (also pasted into the AI-chat prompt on the site)
// must mention every block, block argument, enum option, font, param type,
// step key and expression function; the README must list every npm script.
// When this fails, update the docs (and the skills / web/app/prompt.js rules
// if the change affects how recipes are written) in the same change.
import fs from 'node:fs';
import { BLOCKS } from '../engine/blocks.js';
import { FONTS } from '../engine/fonts.js';
import { PARAM_TYPES, STEP_KEYS } from '../engine/recipe.js';
import { FUNCTIONS, CONSTANTS } from '../engine/expr.js';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

export function docsProblems() {
  const problems = [];
  const recipes = read('docs/RECIPES.md');
  const readme = read('README.md');
  const code = (s) => `\`${s}\``;
  const need = (text, token, what, file = 'docs/RECIPES.md') => {
    if (!text.includes(token)) problems.push(`${file} does not mention ${what} ${token}`);
  };

  for (const [name, block] of Object.entries(BLOCKS)) {
    const head = `**${code(name)}**`;
    const start = recipes.indexOf(head);
    if (start < 0) { problems.push(`docs/RECIPES.md has no section ${head} for block '${name}'`); continue; }
    const next = recipes.slice(start + head.length).search(/\n\*\*`|\n## /);
    const section = recipes.slice(start, next < 0 ? undefined : start + head.length + next);
    for (const [arg, spec] of Object.entries(block.args)) {
      need(section, code(arg), `in the '${name}' section the argument`);
      if (spec.type === 'enum') for (const o of spec.options) need(section, code(o), `in the '${name}' section the option`);
    }
  }
  for (const f of Object.keys(FONTS)) need(recipes, code(f), 'the font');
  for (const t of PARAM_TYPES) need(recipes, code(t), 'the param type');
  for (const k of STEP_KEYS) need(recipes, code(k), 'the step key');
  for (const fn of [...Object.keys(FUNCTIONS), ...Object.keys(CONSTANTS)]) {
    if (!new RegExp(`\\b${fn}\\b`).test(recipes.slice(recipes.indexOf('## Expressions'), recipes.indexOf('## `parts`')))) {
      problems.push(`docs/RECIPES.md "Expressions" does not mention the function or constant ${fn}`);
    }
  }
  const scripts = JSON.parse(read('package.json')).scripts;
  for (const s of Object.keys(scripts)) need(readme, `npm run ${s}`, 'the command', 'README.md');
  return problems;
}
