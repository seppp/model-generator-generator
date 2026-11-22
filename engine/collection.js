// A collection is one JSON file holding many recipes. The website loads its
// generators from one (dist/generators.json, built from recipes/), and people
// export and import their own generators in the same format, so the two files
// are interchangeable. Share links carry one recipe, compressed, in the URL.
// Web-standard APIs only (CompressionStream, btoa), so this runs in browsers and Node 18+.

export const COLLECTION_FORMAT = 'generator-generator/1';

export function makeCollection(recipes) {
  return { format: COLLECTION_FORMAT, generators: recipes };
}

const isRecipe = (o) => o && typeof o === 'object' && !Array.isArray(o) && typeof o.id === 'string' && Array.isArray(o.params) && Array.isArray(o.steps);

/** Recipes from a collection, an array of recipes, or a single recipe. */
export function readCollection(data) {
  const obj = typeof data === 'string' ? JSON.parse(data) : data;
  let list;
  if (isRecipe(obj)) list = [obj];
  else if (Array.isArray(obj)) list = obj;
  else if (obj && Array.isArray(obj.generators)) list = obj.generators;
  else throw new Error('This file holds no generators: expected {"format": "generator-generator/1", "generators": [...]} or a single recipe.');
  const bad = list.findIndex((r) => !isRecipe(r));
  if (bad >= 0) throw new Error(`Entry ${bad + 1} is not a recipe (it needs "id", "params" and "steps").`);
  return list;
}

function toBase64Url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const b = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** Compact URL-safe text for a recipe (deflate + base64url). */
export async function encodeShare(recipe) {
  return toBase64Url(await pipe(new TextEncoder().encode(JSON.stringify(recipe)), new CompressionStream('deflate-raw')));
}

export async function decodeShare(text) {
  let json;
  try {
    json = new TextDecoder().decode(await pipe(fromBase64Url(text.trim()), new DecompressionStream('deflate-raw')));
  } catch {
    throw new Error('This share link is damaged or incomplete. Ask for the whole link again.');
  }
  const [recipe] = readCollection(json);
  return recipe;
}
