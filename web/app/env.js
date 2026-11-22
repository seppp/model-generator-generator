// Engine environment for the browser: manifold WASM + fonts, loaded once.
import Module from 'manifold-3d';
import * as opentype from 'opentype.js';

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

export async function loadRecipe(id) {
  const res = await fetch(new URL(`recipes/${id}.json`, document.baseURI));
  if (!res.ok) throw new Error(`Recipe '${id}' not found`);
  return res.json();
}

export async function loadIndex() {
  const res = await fetch(new URL('recipes/index.json', document.baseURI));
  return res.json();
}
