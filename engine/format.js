// Canonical text of a recipe file. The Recipe lab produces exactly this, so
// a recipe edited in the browser diffs cleanly against the repository file.
export function formatRecipe(recipe) {
  return JSON.stringify(recipe, null, 2) + '\n';
}
