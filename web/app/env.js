// Engine environment for the browser: manifold WASM + fonts, loaded once.
import Module from 'manifold-3d';
import * as opentype from 'opentype.js';
import { readCollection } from '../engine/collection.js';

const FONT_FILES = {
  regular: 'vendor/fonts/open-sans-latin-400-normal.woff',
  bold: 'vendor/fonts/open-sans-latin-700-normal.woff',
};

export const REPO = 'seppp/model-generator-generator';

let envPromise;

export function browserEnv() {
  envPromise ??= (async () => {
    const wasm = await Module();
    wasm.setup();
    const fonts = {};
    await Promise.all(
      Object.entries(FONT_FILES).map(async ([k, url]) => {
        const res = await fetch(new URL(url, document.baseURI));
        fonts[k] = opentype.parse(await res.arrayBuffer());
      }),
    );
    return { wasm, fonts };
  })();
  return envPromise;
}

/** The site's generators, from the single collection file built from recipes/. */
export async function loadCollection() {
  const res = await fetch(new URL('generators.json', document.baseURI));
  if (!res.ok) throw new Error('Could not load generators.json');
  return readCollection(await res.json());
}
