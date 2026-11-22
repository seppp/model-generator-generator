// Engine environment for Node (check / export tools).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import Module from 'manifold-3d';
import opentype from 'opentype.js';

const require = createRequire(import.meta.url);

import { FONTS, fontFile } from '../engine/fonts.js';

/** Path of a bundled font (engine/fonts.js name) in node_modules. */
export function fontPath(name) {
  return require.resolve(`@fontsource/${FONTS[name].pkg}/files/${fontFile(name)}`);
}

export const BUNDLED_FONTS = Object.keys(FONTS).filter((n) => fontFile(n));

export async function nodeEnv() {
  const wasm = await Module();
  wasm.setup();
  const fonts = {};
  for (const k of BUNDLED_FONTS) {
    const b = fs.readFileSync(fontPath(k));
    fonts[k] = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  }
  return { wasm, fonts };
}

export function loadRecipes(dir = new URL('../recipes/', import.meta.url)) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const text = fs.readFileSync(new URL(f, dir), 'utf8');
      const recipe = JSON.parse(text);
      Object.defineProperty(recipe, '__text', { value: text, enumerable: false });
      if (recipe.id !== f.replace(/\.json$/, '')) throw new Error(`recipes/${f}: id must match the file name`);
      return recipe;
    });
}
