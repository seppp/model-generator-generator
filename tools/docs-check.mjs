// Fails `npm run check` when the docs that people and AIs work from fall behind
// the code: docs/RECIPES.md, and its AI-chat version without dev-only parts
// (engine/docs.js), must each mention every block, block argument, enum option, font, param type,
// step key and expression function; the README must list every npm script.
// When this fails, update the docs (and the skills / web/app/prompt.js rules
// if the change affects how recipes are written) in the same change.
import fs from 'node:fs';
import { BLOCKS } from '../engine/blocks.js';
import { FONTS } from '../engine/fonts.js';
import { PARAM_TYPES, STEP_KEYS } from '../engine/recipe.js';
import { FUNCTIONS, CONSTANTS } from '../engine/expr.js';
import { chatReference } from '../engine/docs.js';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

export function docsProblems() {
  const full = read('docs/RECIPES.md');
  const problems = [
    ...referenceProblems(full, 'docs/RECIPES.md'),
    ...referenceProblems(chatReference(full), 'the AI-chat version of docs/RECIPES.md'),
  ];
  const chat = chatReference(full);
  for (const leak of ['npm run', 'engine/', 'recipes/', 'dist/', 'node_modules']) {
    if (chat.includes(leak)) problems.push(`the AI-chat version of docs/RECIPES.md mentions repo-only '${leak}': wrap it in <!-- dev-only --> markers`);
  }
  const readme = read('README.md');
  const scripts = JSON.parse(read('package.json')).scripts;
  for (const s of Object.keys(scripts)) if (!readme.includes(`npm run ${s}`)) problems.push(`README.md does not mention the command npm run ${s}`);
  return problems;
}

function referenceProblems(recipes, file) {
  const problems = [];
  const code = (s) => `\`${s}\``;
  const need = (text, token, what) => {
    if (!text.includes(token)) problems.push(`${file} does not mention ${what} ${token}`);
  };

  for (const [name, block] of Object.entries(BLOCKS)) {
    const head = `**${code(name)}**`;
    const start = recipes.indexOf(head);
    if (start < 0) { problems.push(`${file} has no section ${head} for block '${name}'`); continue; }
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
      problems.push(`${file} "Expressions" does not mention the function or constant ${fn}`);
    }
  }
  return problems;
}
