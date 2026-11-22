// Runs a recipe with manifold-3d and returns one watertight solid per part.

import { BLOCKS } from './blocks.js';
import { template, evaluate } from './expr.js';
import { computeScope, normalizeValues, planSteps, partEdges } from './recipe.js';
import { edgedExtrude, smoothEdgedExtrude } from './edges.js';

/**
 * @param recipe validated recipe
 * @param rawValues parameter values (missing ones fall back to defaults)
 * @param env { wasm: initialised manifold-3d module, fonts: { <name>: opentype font } }
 *   (see engine/fonts.js; load the ones fontsNeeded() lists first, missing ones fall back to regular)
 */
/** Font names the text steps use with these values (so a browser can load them before building). */
export function fontsNeeded(recipe, rawValues) {
  const scope = computeScope(recipe, normalizeValues(recipe, rawValues));
  const names = planSteps(recipe, scope).filter((s) => s.block === 'text' && String(s.args.text ?? '').trim()).map((s) => s.args.font);
  return [...new Set(names)];
}

export function buildModel(recipe, rawValues, env) {
  const { Manifold, CrossSection } = env.wasm;
  const values = normalizeValues(recipe, rawValues);
  const scope = computeScope(recipe, values);
  const plan = planSteps(recipe, scope);
  const garbage = [];
  const keep = (o) => (garbage.push(o), o);

  const solids = Object.fromEntries(Object.keys(recipe.parts).map((k) => [k, null]));
  const blockEnv = { CrossSection, fonts: env.fonts || {} };

  const warnings = [];
  for (const step of plan) {
    for (const w of BLOCKS[step.block].warnings?.(step.args) || []) if (!warnings.includes(w)) warnings.push(w);
    const profile = BLOCKS[step.block].profile(step.args, blockEnv);
    if (!profile || step.thickness <= 0) continue;
    keep(profile);
    let tool = keep(profile.extrude(step.thickness));
    if (step.rotate) tool = keep(tool.rotate([0, 0, step.rotate]));
    tool = keep(tool.translate([step.x, step.y, step.z]));

    if (step.op === 'add') {
      for (const k of Object.keys(solids)) {
        if (k !== step.part && solids[k]) solids[k] = keep(solids[k].subtract(tool));
      }
      solids[step.part] = solids[step.part] ? keep(solids[step.part].add(tool)) : tool;
    } else {
      for (const k of step.from) if (solids[k]) solids[k] = keep(solids[k].subtract(tool));
    }
  }

  // chamfers and fillets: cut each part to its own outline seen from above,
  // extruded over its height with the edges broken (outer edges and through-holes)
  for (const [key, def] of Object.entries(recipe.parts)) {
    const edges = partEdges(def, scope, key);
    const m = solids[key];
    if (!edges || !m || m.isEmpty()) continue;
    const bb = m.boundingBox();
    const height = bb.max[2] - bb.min[2];
    const outline = keep(keep(m.project()).simplify(0.01));
    // a plain extruded outline (no pockets, no steps in height) is replaced by
    // the edged outline; anything else is cut to it
    const prismatic = Math.abs(m.volume() - outline.area() * height) < 1e-3 * m.volume();
    const smooth = smoothEdgedExtrude(env.wasm, outline, height, edges, prismatic ? 0 : 0.05);
    const { solid, scaled } = smooth || edgedExtrude(Manifold, outline, height, edges, 0.05);
    const placed = keep(keep(solid).translate([0, 0, bb.min[2]]));
    solids[key] = smooth && prismatic ? placed : keep(m.intersect(placed));
    const w = `${def.label || key}: edges shrunk to fit the height.`;
    if (scaled && !warnings.includes(w)) warnings.push(w);
  }

  const parts = [];
  for (const [key, def] of Object.entries(recipe.parts)) {
    const m = solids[key];
    if (!m || m.isEmpty()) continue;
    const result = m.asOriginal(); // fresh handle we hand out (not in garbage)
    const bb = result.boundingBox();
    parts.push({
      key,
      label: def.label || key,
      color: def.color || '#cccccc',
      manifold: result,
      volume: result.volume(),
      bounds: { min: bb.min, max: bb.max },
    });
  }
  for (const g of garbage) {
    try { g.delete(); } catch { /* already freed */ }
  }

  const notes = (recipe.notes || [])
    .filter((n) => n.when === undefined || evaluate(n.when, scope))
    .map((n) => template(n.text, scope))
    .concat(warnings);

  return { values, scope, parts, notes, colorChanges: colorChanges(parts), stats: stats(parts) };
}

/** Free the WASM memory held by a model returned from buildModel. */
export function disposeModel(model) {
  for (const p of model?.parts || []) {
    try { p.manifold.delete(); } catch { /* ignore */ }
  }
}

/**
 * Filament swaps for single-nozzle printers. Only possible when the parts are
 * stacked: each part starts at or above the top of every part below it.
 */
export function colorChanges(parts) {
  if (parts.length < 2) return [];
  const sorted = [...parts].sort((a, b) => a.bounds.min[2] - b.bounds.min[2]);
  const changes = [];
  let top = sorted[0].bounds.max[2];
  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i];
    if (p.bounds.min[2] < top - 1e-4) return [];
    changes.push({ z: p.bounds.min[2], part: p.key, label: p.label, color: p.color });
    top = Math.max(top, p.bounds.max[2]);
  }
  return changes;
}

function stats(parts) {
  if (!parts.length) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let volume = 0;
  for (const p of parts) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p.bounds.min[i]);
      max[i] = Math.max(max[i], p.bounds.max[i]);
    }
    volume += p.volume;
  }
  return { size: max.map((v, i) => v - min[i]), min, max, volume, grams: (volume / 1000) * 1.24 };
}

/** Flat triangle data for one part: { positions: Float32Array, indices: Uint32Array }. */
export function partMesh(part) {
  const mesh = part.manifold.getMesh();
  const np = mesh.numProp;
  const n = mesh.vertProperties.length / np;
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    positions[i * 3] = mesh.vertProperties[i * np];
    positions[i * 3 + 1] = mesh.vertProperties[i * np + 1];
    positions[i * 3 + 2] = mesh.vertProperties[i * np + 2];
  }
  return { positions, indices: new Uint32Array(mesh.triVerts) };
}
