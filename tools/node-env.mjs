// Engine environment for Node (check / export tools).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import Module from 'manifold-3d';
import opentype from 'opentype.js';

const require = createRequire(import.meta.url);

export const FONT_FILES = {
  regular: 'open-sans-latin-400-normal.woff',
  bold: 'open-sans-latin-700-normal.woff',
};

export function fontPath(file) {
  return require.resolve(`@fontsource/open-sans/files/${file}`);
}

export async function nodeEnv() {
  const wasm = await Module();
  wasm.setup();
  const fonts = {};
  for (const [k, file] of Object.entries(FONT_FILES)) {
    const b = fs.readFileSync(fontPath(file));
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
      const recipe = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
      if (recipe.id !== f.replace(/\.json$/, '')) throw new Error(`recipes/${f}: id must match the file name`);
      return recipe;
    });
}
