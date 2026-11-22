// "My generators": recipes a visitor saved in this browser (localStorage),
// exported and imported as one collection file in the same format as the
// site's generators.json.
import { makeCollection, readCollection } from '../engine/collection.js';
import { validateRecipe } from '../engine/recipe.js';

const KEY = 'mgg-mine';

function read() {
  try { return readCollection(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(makeCollection(list)));
    return true;
  } catch {
    return false;
  }
}

export const mine = {
  list: read,
  get: (id) => read().find((r) => r.id === id) || null,
  /** Saves (or replaces) a recipe; returns false when the browser refuses storage. */
  save(recipe) {
    const list = read().filter((r) => r.id !== recipe.id);
    return write([...list, recipe]);
  },
  remove(id) { write(read().filter((r) => r.id !== id)); },
  /** Imports a collection or single recipe file; invalid recipes are skipped. */
  import(text) {
    const incoming = readCollection(text);
    const list = read();
    const result = { added: [], replaced: [], skipped: [] };
    for (const r of incoming) {
      try { validateRecipe(r); } catch { result.skipped.push(r.id || '?'); continue; }
      const i = list.findIndex((x) => x.id === r.id);
      if (i >= 0) { list[i] = r; result.replaced.push(r.id); } else { list.push(r); result.added.push(r.id); }
    }
    if (!write(list)) throw new Error('This browser does not allow saving (private window or storage blocked).');
    return result;
  },
  exportText: () => `${JSON.stringify(makeCollection(read()), null, 2)}\n`,
};
