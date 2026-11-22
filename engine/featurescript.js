// Recipe -> Onshape FeatureScript compiler.
//
// The output is one custom feature. Parameters become feature inputs, with the
// given values as defaults, and every expression is translated so the feature
// stays parametric inside Onshape. Block arguments marked `baked` (QR content)
// are evaluated here and embedded as data.

import { BLOCKS, FS_COMMON } from './blocks.js';
import { evaluate, fsNumber, fsString, refs, toFeatureScript } from './expr.js';
import { computeScope, normalizeValues, stepBlock } from './recipe.js';
import { TOP_EDGES, BOTTOM_EDGES, DEFAULT_PRINTABLE_CHAMFER } from './edges.js';

const FS_EDGES = `
// Chamfers and fillets on the edges of a part's lowest and highest faces.
function mgEdge(context is Context, id is Id, edges is Query, kind is string, size is number)
{
    if (kind == "chamfer")
    {
        opChamfer(context, id, { "entities" : edges, "chamferType" : ChamferType.EQUAL_OFFSETS, "width" : size * millimeter });
    }
    else
    {
        opFillet(context, id, { "entities" : edges, "radius" : size * millimeter });
    }
}

// bottom "printable": a 45 degree chamfer of height c at the bed, then a fillet of radius r
// where the chamfer meets the wall, so nothing overhangs more than 45 degrees.
function mgPartEdges(context is Context, id is Id, bodies is array, top is string, topSize is number, bottom is string, bottomSize is number, c is number)
{
    if (size(bodies) == 0)
    {
        return;
    }
    const q = qUnion(bodies);
    const box = evBox3d(context, { "topology" : q });
    const z0 = box.minCorner[2] / millimeter;
    const z1 = box.maxCorner[2] / millimeter;
    if (top != "none" && topSize > 0)
    {
        try silent
        {
            mgEdge(context, id + "top", qAdjacent(qCoincidesWithPlane(qOwnedByBody(q, EntityType.FACE), mgPlane(z1)), AdjacencyType.EDGE, EntityType.EDGE), top, topSize);
        }
    }
    if (bottom != "none" && bottomSize > 0)
    {
        const bottomFaces = qCoincidesWithPlane(qOwnedByBody(q, EntityType.FACE), mgPlane(z0));
        try silent
        {
            if (bottom == "printable" && c > 0)
            {
                opChamfer(context, id + "bch", { "entities" : qAdjacent(bottomFaces, AdjacencyType.EDGE, EntityType.EDGE),
                        "chamferType" : ChamferType.EQUAL_OFFSETS, "width" : c * millimeter });
                const chamferFaces = qCreatedBy(id + "bch", EntityType.FACE);
                const walls = qSubtraction(qOwnedByBody(q, EntityType.FACE), qUnion([chamferFaces, qCoincidesWithPlane(qOwnedByBody(q, EntityType.FACE), mgPlane(z0))]));
                const ring = qIntersection([qAdjacent(chamferFaces, AdjacencyType.EDGE, EntityType.EDGE), qAdjacent(walls, AdjacencyType.EDGE, EntityType.EDGE)]);
                opFillet(context, id + "bfi", { "entities" : ring, "radius" : min(bottomSize, c / 0.292893) * millimeter });
            }
            else
            {
                mgEdge(context, id + "bottom", qAdjacent(bottomFaces, AdjacencyType.EDGE, EntityType.EDGE), bottom == "printable" ? "fillet" : bottom, bottomSize);
            }
        }
    }
}`;

// Version of the Onshape standard library to import. Onshape keeps old
// versions working; replace both lines with the header of a fresh Feature
// Studio if you want the newest one.
export const FS_VERSION = '1576';

const camel = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const pascal = (id) => camel(id).replace(/^./, (c) => c.toUpperCase());
const enumMember = (v) => v.toUpperCase();

function hexToRgb(hex) {
  const n = parseInt((hex || '#cccccc').slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => fsNumber(+(c / 255).toFixed(3)));
}

export function compileFeatureScript(recipe, rawValues = {}, { colors = {} } = {}) {
  const values = normalizeValues(recipe, rawValues);
  const scope = computeScope(recipe, values);
  const names = {};
  for (const p of recipe.params || []) names[p.key] = `p_${p.key}`;
  for (const k of Object.keys(recipe.derived || {})) names[k] = `d_${k}`;

  // Which params are still needed once baked arguments are taken out?
  const used = new Set();
  const use = (v) => { if (typeof v === 'string') refs(v, used); };
  Object.values(recipe.derived || {}).forEach(use);
  for (const part of Object.values(recipe.parts)) {
    for (const [k, v] of Object.entries(part.edges || {})) if (!(k === 'top' && TOP_EDGES.includes(v)) && !(k === 'bottom' && BOTTOM_EDGES.includes(v))) use(v);
  }
  for (const s of recipe.steps) {
    ['when', 'x', 'y', 'z', 'rotate', 'thickness'].forEach((k) => use(s[k]));
    if ('add' in s && !recipe.parts[s.part]) use(s.part);
    const block = BLOCKS[stepBlock(s)];
    for (const [k, spec] of Object.entries(block.args)) {
      if (spec.baked || s[k] === undefined) continue;
      if (spec.type === 'enum' && spec.options.includes(s[k])) continue;
      use(s[k]);
    }
  }
  const params = (recipe.params || []).filter((p) => used.has(p.key));
  const enumName = (p) => `Mg${pascal(recipe.id)}${pascal(p.key)}`;

  const out = [];
  const w = (s = '') => out.push(s);
  w(`FeatureScript ${FS_VERSION};`);
  w(`import(path : "onshape/std/geometry.fs", version : "${FS_VERSION}.0");`);
  w();
  w(`// ${recipe.name}`);
  w(`// Generated by model-generator-generator from recipes/${recipe.id}.json - do not edit by hand.`);
  w('// In Onshape: create a Feature Studio, replace its contents with this file, commit,');
  w('// then add the feature to a Part Studio from the custom features toolbar.');
  const baked = new Set();
  for (const s of recipe.steps) {
    const block = BLOCKS[stepBlock(s)];
    for (const [k, spec] of Object.entries(block.args)) if (spec.baked && s[k] !== undefined) baked.add(k);
  }
  const unused = (recipe.params || []).filter((p) => !used.has(p.key));
  if (unused.length) {
    w('// Fixed at export time (not Onshape inputs): ' + unused.map((p) => `${p.label || p.key} = ${JSON.stringify(values[p.key])}`).join('; '));
  }
  w();

  for (const p of params.filter((p) => p.type === 'select')) {
    // Enum default is its first member, so put the chosen value first.
    const opts = [...p.options].sort((a, b) => (a.value === values[p.key] ? -1 : b.value === values[p.key] ? 1 : 0));
    w(`export enum ${enumName(p)}`);
    w('{');
    opts.forEach((o, i) => {
      w(`    annotation { "Name" : ${fsString(o.label || o.value)} }`);
      w(`    ${enumMember(o.value)}${i < opts.length - 1 ? ',' : ''}`);
    });
    w('}');
    w();
  }

  w(`annotation { "Feature Type Name" : ${fsString(recipe.name)} }`);
  w(`export const ${camel(recipe.id)} = defineFeature(function(context is Context, id is Id, definition is map)`);
  w('    precondition');
  w('    {');
  for (const p of params) {
    const label = fsString(p.label || p.key);
    const v = values[p.key];
    if (p.type === 'number') {
      const bound = `[${fsNumber(p.min)}, ${fsNumber(v)}, ${fsNumber(p.max)}]`;
      w(`        annotation { "Name" : ${label} }`);
      if (p.unit === 'mm') w(`        isLength(definition.${p.key}, { (millimeter) : ${bound} } as LengthBoundSpec);`);
      else if (p.unit === 'deg') w(`        isAngle(definition.${p.key}, { (degree) : ${bound} } as AngleBoundSpec);`);
      else if (p.integer) w(`        isInteger(definition.${p.key}, { (unitless) : ${bound} } as IntegerBoundSpec);`);
      else w(`        isReal(definition.${p.key}, { (unitless) : ${bound} } as RealBoundSpec);`);
    } else if (p.type === 'boolean') {
      w(`        annotation { "Name" : ${label}, "Default" : ${v} }`);
      w(`        definition.${p.key} is boolean;`);
    } else if (p.type === 'text') {
      w(`        annotation { "Name" : ${label}, "Default" : ${fsString(v)} }`);
      w(`        definition.${p.key} is string;`);
    } else if (p.type === 'select') {
      w(`        annotation { "Name" : ${label} }`);
      w(`        definition.${p.key} is ${enumName(p)};`);
    }
    w();
  }
  if (out[out.length - 1] === '') out.pop();
  w('    }');
  w('    {');

  for (const p of params) {
    const n = names[p.key];
    if (p.type === 'number') {
      const conv = p.unit === 'mm' ? ' / millimeter' : p.unit === 'deg' ? ' / degree' : '';
      w(`        const ${n} = definition.${p.key}${conv};`);
    } else if (p.type === 'select') {
      w(`        var ${n} = "";`);
      for (const o of p.options) w(`        if (definition.${p.key} == ${enumName(p)}.${enumMember(o.value)}) { ${n} = ${fsString(o.value)}; }`);
    } else {
      w(`        const ${n} = definition.${p.key};`);
    }
  }
  // Params that were baked still need a name if a derived value refers to them.
  for (const p of unused) names[p.key] = p.type === 'number' ? fsNumber(values[p.key]) : p.type === 'boolean' ? String(values[p.key]) : fsString(values[p.key]);
  for (const [k, e] of Object.entries(recipe.derived || {})) w(`        const ${names[k]} = ${toFeatureScript(e, names)};`);
  w();
  w(`        var parts = { ${Object.keys(recipe.parts).map((k) => `${fsString(k)} : []`).join(', ')} };`);

  recipe.steps.forEach((s, i) => {
    const name = stepBlock(s);
    const block = BLOCKS[name];
    const f = {};
    const js = {};
    for (const [k, spec] of Object.entries(block.args)) {
      const v = s[k];
      if (spec.baked) js[k] = v === undefined ? spec.default : evaluate(v, scope);
      if (v === undefined) f[k] = typeof spec.default === 'number' ? fsNumber(spec.default) : fsString(spec.default);
      else if (spec.type === 'enum' && spec.options.includes(v)) f[k] = fsString(v);
      else f[k] = toFeatureScript(v, names);
    }
    let call = block.fs.call(f, js);
    w();
    const what = 'add' in s ? `add ${name} to "${s.part}"` : `subtract ${name}`;
    w(`        // step ${i + 1}: ${what}${s.comment ? ` - ${s.comment}` : ''}`);
    if (!call) { w('        // (skipped: nothing to draw with the exported values)'); return; }
    if (typeof call === 'string') call = { code: call };
    if (call.comment) w(`        // ${call.comment}`);
    const sid = `id + "s${i + 1}"`;
    const z = s.through ? '-1000' : s.z === undefined ? '0' : toFeatureScript(s.z, names);
    const t = s.through ? '2000' : toFeatureScript(s.thickness, names);
    const conds = [];
    if (s.when !== undefined) conds.push(toFeatureScript(s.when, names));
    if (call.guard) conds.push(`(${call.guard})`);
    if (!s.through) conds.push(`${t} > 0`);
    if (!conds.length) conds.push('true');
    w(`        if (${conds.join(' && ')})`);
    w('        {');
    w(`            const tool = ${call.code.replace('ID', `${sid}`).replace('Z, T', `${z}, ${t}`)};`);
    const x = s.x === undefined ? '0' : toFeatureScript(s.x, names);
    const y = s.y === undefined ? '0' : toFeatureScript(s.y, names);
    const r = s.rotate === undefined ? '0' : toFeatureScript(s.rotate, names);
    w(`            mgPlace(context, id + "s${i + 1}place", tool, ${x}, ${y}, ${r});`);
    if ('add' in s) {
      w(`            parts = mgAdd(context, id + "s${i + 1}add", parts, ${recipe.parts[s.part] ? fsString(s.part) : toFeatureScript(s.part, names)}, tool);`);
    } else {
      const from = s.from ? [].concat(s.from) : Object.keys(recipe.parts);
      w(`            mgSubtract(context, id + "s${i + 1}sub", parts, [${from.map(fsString).join(', ')}], tool);`);
    }
    w('        }');
  });

  w();
  for (const [k, part] of Object.entries(recipe.parts)) {
    const rgb = hexToRgb(colors[k] || part.color);
    w(`        mgFinish(context, id + ${fsString('finish_' + k)}, parts[${fsString(k)}], ${fsString(part.label || k)}, [${rgb.join(', ')}]);`);
    const e = part.edges;
    if (e) {
      const kind = (v, options) => (v === undefined ? '"none"' : options.includes(v) ? fsString(v) : toFeatureScript(v, names));
      const n = (v, d) => (v === undefined ? fsNumber(d) : toFeatureScript(v, names));
      w(`        mgPartEdges(context, id + ${fsString('edges_' + k)}, parts[${fsString(k)}], ${kind(e.top, TOP_EDGES)}, ${n(e.topSize, 0)}, ${kind(e.bottom, BOTTOM_EDGES)}, ${n(e.bottomSize, 0)}, ${n(e.bottomChamfer, DEFAULT_PRINTABLE_CHAMFER)});`);
    }
  }
  w('    });');
  w();
  w('// ---- helpers (shared by all generated features) ----');
  w(FS_COMMON.trim());
  if (Object.values(recipe.parts).some((p) => p.edges)) { w(); w(FS_EDGES.trim()); }
  const helpers = new Set();
  for (const b of recipe.steps.map(stepBlock)) {
    for (const n of BLOCKS[b].fs.needs || []) helpers.add(n);
    helpers.add(b);
  }
  for (const b of helpers) {
    w();
    w(BLOCKS[b].fs.helper.trim());
  }
  return out.join('\n') + '\n';
}
