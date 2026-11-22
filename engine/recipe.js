// Recipe handling shared by every target: validation, parameter values and
// turning the step list into a concrete plan for one set of values.

import { BLOCKS } from './blocks.js';
import { compile, evaluate, refs, RESERVED } from './expr.js';
import { EDGE_KEYS, TOP_EDGES, BOTTOM_EDGES, DEFAULT_PRINTABLE_CHAMFER } from './edges.js';

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
// FeatureScript keywords that cannot be used as names.
const FS_RESERVED = new Set(('annotation as break case catch const default else enum export false for function if import ' +
  'in inf is new operator precondition predicate return switch throw true try type typecheck undefined var while ' +
  'context id definition').split(' '));
export const PARAM_TYPES = ['number', 'text', 'select', 'boolean'];
export const STEP_KEYS = new Set(['add', 'subtract', 'part', 'from', 'when', 'x', 'y', 'z', 'rotate', 'thickness', 'through', 'comment']);

export function stepBlock(step) {
  return step.add ?? step.subtract;
}

/** Throws an Error listing every problem found in the recipe. */
export function validateRecipe(recipe) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (!recipe || typeof recipe !== 'object') throw new Error('Recipe must be a JSON object');
  if (!recipe.id || !/^[a-z0-9-]+$/.test(recipe.id)) err('id must be lowercase letters, digits and dashes');
  if (!recipe.name) err('name is required');
  const parts = recipe.parts || {};
  if (!Object.keys(parts).length) err('parts needs at least one part');
  for (const [k, p] of Object.entries(parts)) {
    if (!IDENT.test(k)) err(`part name '${k}' must be an identifier`);
    if (p.color && !/^#[0-9a-fA-F]{6}$/.test(p.color)) err(`part '${k}' color must look like #rrggbb`);
  }

  const known = new Set();
  for (const p of recipe.params || []) {
    const where = `param '${p.key}'`;
    if (!p.key || !IDENT.test(p.key)) { err(`param key '${p.key}' must be an identifier`); continue; }
    if (known.has(p.key)) err(`${where} is defined twice`);
    if (RESERVED.has(p.key) || FS_RESERVED.has(p.key)) err(`${where} uses a reserved name`);
    known.add(p.key);
    if (!PARAM_TYPES.includes(p.type)) err(`${where}: type must be one of ${PARAM_TYPES.join(', ')}`);
    if (p.type === 'number') {
      if (typeof p.min !== 'number' || typeof p.max !== 'number') err(`${where}: number params need min and max`);
      if (typeof p.default !== 'number' || p.default < p.min || p.default > p.max) err(`${where}: default must be within min..max`);
      if (p.unit && !['mm', 'deg'].includes(p.unit)) err(`${where}: unit must be mm, deg or omitted`);
    }
    if (p.type === 'select') {
      if (!Array.isArray(p.options) || !p.options.length) err(`${where}: select params need options`);
      for (const o of p.options || []) if (!IDENT.test(o.value)) err(`${where}: option value '${o.value}' must be an identifier`);
      if (!(p.options || []).some((o) => o.value === p.default)) err(`${where}: default must be one of the options`);
    }
    if (p.type === 'boolean' && typeof p.default !== 'boolean') err(`${where}: default must be true or false`);
    if (p.type === 'text' && typeof p.default !== 'string') err(`${where}: default must be a string`);
  }

  const checkExpr = (value, where) => {
    if (typeof value !== 'string') return;
    try {
      for (const r of refs(value)) if (!known.has(r)) err(`${where}: unknown name '${r}' in "${value}"`);
    } catch (e) {
      err(`${where}: ${e.message} in "${value}"`);
    }
  };

  for (const p of recipe.params || []) if (p.showIf) checkExpr(p.showIf, `param '${p.key}' showIf`);
  for (const [k, v] of Object.entries(recipe.derived || {})) {
    if (!IDENT.test(k) || RESERVED.has(k) || FS_RESERVED.has(k)) err(`derived name '${k}' is not allowed`);
    if (known.has(k)) err(`derived '${k}' clashes with a param`);
    checkExpr(v, `derived '${k}'`);
    known.add(k);
  }

  for (const [k, p] of Object.entries(parts)) {
    if (p.edges === undefined) continue;
    const where = `part '${k}' edges`;
    if (!p.edges || typeof p.edges !== 'object' || Array.isArray(p.edges)) { err(`${where} must be an object`); continue; }
    for (const [ek, v] of Object.entries(p.edges)) {
      if (!EDGE_KEYS.includes(ek)) { err(`${where}: unknown key '${ek}' (has: ${EDGE_KEYS.join(', ')})`); continue; }
      const options = ek === 'top' ? TOP_EDGES : ek === 'bottom' ? BOTTOM_EDGES : null;
      if (options && options.includes(v)) continue; // literal option
      if (options && typeof v === 'string' && IDENT.test(v) && !known.has(v)) { err(`${where} ${ek}: '${v}' must be one of ${options.join(', ')} (or an expression)`); continue; }
      checkExpr(v, `${where} ${ek}`);
    }
    if (p.edges.top !== undefined && p.edges.topSize === undefined) err(`${where}: "top" needs "topSize"`);
    if (p.edges.bottom !== undefined && p.edges.bottomSize === undefined) err(`${where}: "bottom" needs "bottomSize"`);
  }

  (recipe.steps || []).forEach((s, i) => {
    const where = `step ${i + 1}`;
    const name = stepBlock(s);
    const block = BLOCKS[name];
    if (('add' in s) === ('subtract' in s)) err(`${where}: needs exactly one of "add" or "subtract"`);
    if (!block) { err(`${where}: unknown block '${name}' (known: ${Object.keys(BLOCKS).join(', ')})`); return; }
    if ('add' in s && !parts[s.part]) err(`${where}: "part" must be one of ${Object.keys(parts).join(', ')}`);
    if ('subtract' in s && s.from) {
      for (const f of [].concat(s.from)) if (!parts[f]) err(`${where}: unknown part '${f}' in "from"`);
    }
    if (s.through && 'add' in s) err(`${where}: "through" only makes sense for subtract`);
    for (const [k, v] of Object.entries(s)) {
      if (STEP_KEYS.has(k)) {
        if (['when', 'x', 'y', 'z', 'rotate', 'thickness'].includes(k)) checkExpr(v, `${where} ${k}`);
        continue;
      }
      const spec = block.args[k];
      if (!spec) { err(`${where}: block '${name}' has no argument '${k}' (has: ${Object.keys(block.args).join(', ')})`); continue; }
      if (spec.type === 'enum' && spec.options.includes(v)) continue; // literal option
      checkExpr(v, `${where} ${k}`);
    }
    if (!s.through && s.thickness === undefined) err(`${where}: needs "thickness" (or "through": true)`);
  });
  if (!(recipe.steps || []).length) err('steps must not be empty');
  for (const [i, n] of (recipe.notes || []).entries()) {
    if (n.when) checkExpr(n.when, `note ${i + 1} when`);
    for (const m of String(n.text || '').matchAll(/\{([^}]+)\}/g)) checkExpr(m[1], `note ${i + 1}`);
  }

  if (errors.length) {
    const e = new Error(`Recipe '${recipe.id || '?'}' has problems:\n- ${errors.join('\n- ')}`);
    e.problems = errors;
    throw e;
  }
  return recipe;
}

export function defaultValues(recipe) {
  return Object.fromEntries((recipe.params || []).map((p) => [p.key, p.default]));
}

/** Coerce raw values (from a form or URL) to valid typed values. */
export function normalizeValues(recipe, raw = {}) {
  const out = {};
  for (const p of recipe.params || []) {
    let v = raw[p.key];
    if (v === undefined || v === null || v === '') v = p.type === 'text' ? (v ?? p.default) : p.default;
    switch (p.type) {
      case 'number':
        v = Number(v);
        if (!Number.isFinite(v)) v = p.default;
        if (p.integer) v = Math.round(v);
        v = Math.min(p.max, Math.max(p.min, v));
        break;
      case 'boolean':
        v = v === true || v === 'true' || v === '1' || v === 1;
        break;
      case 'select':
        if (!p.options.some((o) => o.value === v)) v = p.default;
        break;
      default:
        v = String(v);
    }
    out[p.key] = v;
  }
  return out;
}

export function computeScope(recipe, values) {
  const scope = { ...values };
  for (const [k, e] of Object.entries(recipe.derived || {})) scope[k] = evaluate(e, scope);
  return scope;
}

export function isVisible(param, scope) {
  return !param.showIf || !!evaluate(param.showIf, scope);
}

function evalArg(spec, value, scope) {
  if (value === undefined) return spec.default;
  if (spec.type === 'enum' && spec.options.includes(value)) return value;
  const v = evaluate(value, scope);
  if (spec.type === 'enum' && !spec.options.includes(v)) throw new Error(`'${v}' is not one of ${spec.options.join(', ')}`);
  if (spec.type === 'number' && !Number.isFinite(v)) throw new Error(`argument evaluated to ${v}`);
  return v;
}

function edgeKind(value, options, scope, where) {
  if (value === undefined) return 'none';
  const v = options.includes(value) ? value : evaluate(value, scope);
  if (!options.includes(v)) throw new Error(`${where}: '${v}' is not one of ${options.join(', ')}`);
  return v;
}

/** A part's chamfers and fillets for one set of values, or null when it has none. */
export function partEdges(part, scope, key = '?') {
  const e = part.edges;
  if (!e) return null;
  const num = (v, d) => (v === undefined ? d : Number(evaluate(v, scope)));
  const out = {
    top: { kind: edgeKind(e.top, TOP_EDGES, scope, `part '${key}' edges top`), size: num(e.topSize, 0) },
    bottom: { kind: edgeKind(e.bottom, BOTTOM_EDGES, scope, `part '${key}' edges bottom`), size: num(e.bottomSize, 0), chamfer: num(e.bottomChamfer, DEFAULT_PRINTABLE_CHAMFER) },
  };
  const on = (x) => x.kind !== 'none' && x.size > 0;
  return on(out.top) || on(out.bottom) ? out : null;
}

/** Concrete list of operations for one set of values. */
export function planSteps(recipe, scope) {
  const allParts = Object.keys(recipe.parts);
  const plan = [];
  (recipe.steps || []).forEach((s, index) => {
    if (s.when !== undefined && !evaluate(s.when, scope)) return;
    const name = stepBlock(s);
    const block = BLOCKS[name];
    const args = {};
    for (const [k, spec] of Object.entries(block.args)) {
      try {
        args[k] = evalArg(spec, s[k], scope);
      } catch (e) {
        throw new Error(`step ${index + 1} (${name}) ${k}: ${e.message}`);
      }
    }
    const num = (v, d) => (v === undefined ? d : Number(evaluate(v, scope)));
    plan.push({
      index,
      op: 'add' in s ? 'add' : 'subtract',
      block: name,
      part: s.part,
      from: s.from ? [].concat(s.from) : allParts,
      args,
      x: num(s.x, 0),
      y: num(s.y, 0),
      z: s.through ? -1000 : num(s.z, 0),
      thickness: s.through ? 2000 : num(s.thickness, 1),
      rotate: num(s.rotate, 0),
    });
  });
  return plan;
}

export { compile };
