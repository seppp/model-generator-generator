// Engine environment for the browser: manifold WASM + fonts, loaded once.
import Module from 'manifold-3d';
import * as opentype from 'opentype.js';
import { readCollection } from '../engine/collection.js';
import { FONTS, fontFile } from '../engine/fonts.js';

export const REPO = 'seppp/model-generator-generator';

const OWN_FONT_KEY = 'mgg-own-font';

function parseFont(buffer) {
  return opentype.parse(buffer);
}

/** Your own font file, kept in this browser (base64 in localStorage). */
export const ownFont = {
  name() { try { return JSON.parse(localStorage.getItem(OWN_FONT_KEY))?.name || null; } catch { return null; } },
  async set(file, env) {
    const buffer = await file.arrayBuffer();
    const font = parseFont(buffer); // throws on files that are not fonts
    env.fonts.custom = font;
    let kept = true;
    try {
      let s = '';
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      localStorage.setItem(OWN_FONT_KEY, JSON.stringify({ name: file.name, data: btoa(s) }));
    } catch { kept = false; } // too big or storage blocked: works until the page is closed
    return { family: font.names?.fontFamily?.en || file.name, kept };
  },
  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(OWN_FONT_KEY));
      if (!saved) return null;
      return parseFont(Uint8Array.from(atob(saved.data), (c) => c.charCodeAt(0)).buffer);
    } catch { return null; }
  },
};

let envPromise;

/** manifold WASM plus fonts; fonts other than regular load on demand via env.loadFont(name). */
export function browserEnv() {
  envPromise ??= (async () => {
    const fonts = {};
    const tried = new Set();
    const fetchFont = async (name) => {
      const res = await fetch(new URL(`vendor/fonts/${fontFile(name)}`, document.baseURI));
      if (!res.ok) throw new Error(`font ${name}: HTTP ${res.status}`);
      return parseFont(await res.arrayBuffer());
    };
    const [wasm, regular] = await Promise.all([Module(), fetchFont('regular')]);
    wasm.setup();
    fonts.regular = regular;
    /** Loads a font if possible; a font that can't be loaded stays missing (the text block falls back). */
    async function loadFont(name) {
      if (fonts[name] || tried.has(name) || !FONTS[name]) return;
      tried.add(name);
      if (name === 'custom') { const f = ownFont.load(); if (f) fonts.custom = f; return; }
      try { fonts[name] = await fetchFont(name); } catch (e) { console.warn(e.message); }
    }
    return { wasm, fonts, loadFont };
  })();
  return envPromise;
}

/** The site's generators, from the single collection file built from recipes/. */
export async function loadCollection() {
  const res = await fetch(new URL('generators.json', document.baseURI));
  if (!res.ok) throw new Error('Could not load generators.json');
  return readCollection(await res.json());
}
