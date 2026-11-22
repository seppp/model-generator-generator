// Rewrites every recipes/*.json in canonical formatting (npm run format).
import fs from 'node:fs';
import { formatRecipe } from '../engine/format.js';

const dir = new URL('../recipes/', import.meta.url);
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const url = new URL(f, dir);
  const before = fs.readFileSync(url, 'utf8');
  const after = formatRecipe(JSON.parse(before));
  if (before !== after) {
    fs.writeFileSync(url, after);
    console.log(`formatted recipes/${f}`);
  }
}
