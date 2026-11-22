// Builds a self-contained prompt for any AI chat (ChatGPT, Claude, Gemini...)
// to change a recipe, and pulls the updated recipe back out of the answer.
// The prompt = these rules + docs/RECIPES.md, so keep both in step with the
// engine (npm run check fails when RECIPES.md misses a block, option or font).
import { BLOCKS } from '../engine/blocks.js';
import { FONTS } from '../engine/fonts.js';

let referencePromise;
function reference() {
  referencePromise ??= fetch(new URL('docs/RECIPES.md', document.baseURI))
    .then((r) => (r.ok ? r.text() : ''))
    .catch(() => '');
  return referencePromise;
}

export async function buildPrompt({ recipeText, change, values }) {
  const ref = await reference();
  const wish = change?.trim() || '<<< DESCRIBE THE CHANGE YOU WANT HERE >>>';
  return `I want to change a parametric 3D-print generator. The generator is defined entirely by a JSON "recipe" (format reference below). A website turns the recipe into the generator: a settings form, a live 3D preview, STL/3MF downloads and an Onshape FeatureScript feature. Please edit the recipe.

## The change I want

${wish}

## Rules for your answer

- Reply with the COMPLETE updated recipe in a single \`\`\`json code block. Do not shorten it or leave parts out; I will paste it back as is.
- Only use the blocks (${Object.keys(BLOCKS).join(', ')}), step keys and param fields described in the reference. If the change is impossible with them, say so and suggest the closest alternative instead of inventing fields.
- Values in steps, "derived", "when" and "showIf" are expression strings; a literal piece of text needs inner single quotes, e.g. "'Hello'".
- Number params need "min" and "max", and the default must lie between them. Select option values must be identifiers.
- Keep existing param "key"s and the recipe "id" unless the change requires otherwise (shared links use the keys).
- Text fonts: ${Object.keys(FONTS).map((f) => `'${f}'`).join(', ')}. To let people choose, add a select param whose option values are these names and set the text step's "font" to that param.
- Keep it printable on an FDM printer with a 0.4 mm nozzle (walls and raised lines >= 0.8 mm, text >= 4 mm tall, QR modules >= 1 mm).
- After the JSON block, list what you changed in 2 to 4 short bullet points.

## My current settings (for context; these are form values, not defaults)

\`\`\`json
${JSON.stringify(values || {}, null, 2)}
\`\`\`

## Current recipe

\`\`\`json
${recipeText.trim()}
\`\`\`

## Recipe format reference

${ref.trim() || '(reference unavailable; follow the structure of the current recipe)'}
`;
}

/** Finds the recipe JSON in an AI answer (code block or bare JSON). */
export function extractRecipe(answer) {
  const text = String(answer || '').trim();
  if (!text) throw new Error('Paste the AI answer first.');
  const candidates = [];
  for (const m of text.matchAll(/```(?:json|JSON)?\s*\n([\s\S]*?)```/g)) candidates.push(m[1]);
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));
  let lastError;
  // Prefer the largest block that parses: answers sometimes contain small snippets too.
  for (const c of candidates.sort((a, b) => b.length - a.length)) {
    try {
      const obj = JSON.parse(c);
      if (obj && typeof obj === 'object' && obj.steps && obj.params) return obj;
      lastError = new Error('The JSON found does not look like a recipe (no "params" / "steps").');
    } catch (e) {
      lastError = new Error(`The recipe in the answer is not valid JSON: ${e.message}. Ask the AI to send the complete recipe again as one JSON code block.`);
    }
  }
  throw lastError || new Error('No JSON recipe found in the answer. Ask the AI to reply with the complete recipe in a ```json code block.');
}
