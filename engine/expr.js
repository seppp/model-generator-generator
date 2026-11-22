// Tiny expression language used inside recipes.
//
// Recipes are plain JSON, so every value that should depend on a parameter is
// written as a string expression, e.g. "width - 2 * margin" or
// "style == 'raised'". The same parsed expression is evaluated in JavaScript
// (browser / Node) and translated to FeatureScript source, which is what keeps
// a single recipe usable for both targets.
//
// Grammar (lowest to highest precedence):
//   ternary   a ? b : c
//   or        a || b
//   and       a && b
//   equality  == !=
//   compare   < <= > >=
//   additive  + -
//   mult      * / %
//   unary     - !
//   primary   number | 'string' | "string" | true | false | name | fn(args) | ( expr )

export const FUNCTIONS = {
  min: { js: Math.min, fs: (a) => nest('min', a) },
  max: { js: Math.max, fs: (a) => nest('max', a) },
  abs: { js: Math.abs, fs: (a) => `abs(${a[0]})`, arity: 1 },
  sqrt: { js: Math.sqrt, fs: (a) => `sqrt(${a[0]})`, arity: 1 },
  floor: { js: Math.floor, fs: (a) => `floor(${a[0]})`, arity: 1 },
  ceil: { js: Math.ceil, fs: (a) => `ceil(${a[0]})`, arity: 1 },
  round: { js: Math.round, fs: (a) => `round(${a[0]})`, arity: 1 },
  sin: { js: (d) => Math.sin((d * Math.PI) / 180), fs: (a) => `sin((${a[0]}) * degree)`, arity: 1 },
  cos: { js: (d) => Math.cos((d * Math.PI) / 180), fs: (a) => `cos((${a[0]}) * degree)`, arity: 1 },
  tan: { js: (d) => Math.tan((d * Math.PI) / 180), fs: (a) => `tan((${a[0]}) * degree)`, arity: 1 },
  clamp: { js: (x, lo, hi) => Math.min(hi, Math.max(lo, x)), fs: (a) => `clamp(${a[0]}, ${a[1]}, ${a[2]})`, arity: 3 },
};

function nest(name, args) {
  if (args.length === 1) return args[0];
  return args.slice(1).reduce((acc, a) => `${name}(${acc}, ${a})`, args[0]);
}

export const CONSTANTS = { pi: { js: Math.PI, fs: 'PI' } };

export const RESERVED = new Set(['true', 'false', ...Object.keys(CONSTANTS), ...Object.keys(FUNCTIONS)]);

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new Error(`Bad number at ${i}`);
      tokens.push({ t: 'num', v: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === "'" || c === '"') {
      const end = src.indexOf(c, i + 1);
      if (end < 0) throw new Error('Unterminated string');
      tokens.push({ t: 'str', v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
      tokens.push({ t: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) {
      tokens.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if ('+-*/%<>!?:(),'.includes(c)) {
      tokens.push({ t: 'op', v: c });
      i++;
      continue;
    }
    throw new Error(`Unexpected character '${c}'`);
  }
  return tokens;
}

export function parse(src) {
  if (typeof src !== 'string') throw new Error('Expression must be a string');
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
  const expect = (v) => {
    if (!isOp(v)) throw new Error(`Expected '${v}'`);
    pos++;
  };

  function ternary() {
    const cond = binary(0);
    if (isOp('?')) {
      pos++;
      const a = ternary();
      expect(':');
      const b = ternary();
      return { k: 'if', cond, a, b };
    }
    return cond;
  }
  const LEVELS = [['||'], ['&&'], ['==', '!='], ['<', '<=', '>', '>='], ['+', '-'], ['*', '/', '%']];
  function binary(level) {
    if (level >= LEVELS.length) return unary();
    let left = binary(level + 1);
    while (peek() && peek().t === 'op' && LEVELS[level].includes(peek().v)) {
      const op = tokens[pos++].v;
      const right = binary(level + 1);
      left = { k: 'bin', op, left, right };
    }
    return left;
  }
  function unary() {
    if (isOp('-') || isOp('!')) {
      const op = tokens[pos++].v;
      return { k: 'un', op, arg: unary() };
    }
    return primary();
  }
  function primary() {
    const tok = tokens[pos++];
    if (!tok) throw new Error('Unexpected end of expression');
    if (tok.t === 'num') return { k: 'num', v: tok.v };
    if (tok.t === 'str') return { k: 'str', v: tok.v };
    if (tok.t === 'id') {
      if (tok.v === 'true' || tok.v === 'false') return { k: 'bool', v: tok.v === 'true' };
      if (isOp('(')) {
        pos++;
        const args = [];
        if (!isOp(')')) {
          args.push(ternary());
          while (isOp(',')) { pos++; args.push(ternary()); }
        }
        expect(')');
        const fn = FUNCTIONS[tok.v];
        if (!fn) throw new Error(`Unknown function '${tok.v}'`);
        if (fn.arity && fn.arity !== args.length) throw new Error(`${tok.v}() takes ${fn.arity} argument(s)`);
        if (!args.length) throw new Error(`${tok.v}() needs arguments`);
        return { k: 'call', fn: tok.v, args };
      }
      return { k: 'var', v: tok.v };
    }
    if (tok.t === 'op' && tok.v === '(') {
      const e = ternary();
      expect(')');
      return e;
    }
    throw new Error(`Unexpected '${tok.v}'`);
  }

  const ast = ternary();
  if (pos !== tokens.length) throw new Error(`Unexpected '${tokens[pos].v}'`);
  return ast;
}

const cache = new Map();
export function compile(src) {
  if (!cache.has(src)) cache.set(src, parse(src));
  return cache.get(src);
}

/** Names of variables an expression refers to. */
export function refs(src, out = new Set()) {
  const walk = (n) => {
    switch (n.k) {
      case 'var': if (!CONSTANTS[n.v]) out.add(n.v); break;
      case 'bin': walk(n.left); walk(n.right); break;
      case 'un': walk(n.arg); break;
      case 'if': walk(n.cond); walk(n.a); walk(n.b); break;
      case 'call': n.args.forEach(walk); break;
    }
  };
  walk(compile(src));
  return out;
}

/** Evaluate a recipe value: numbers/booleans pass through, strings are expressions. */
export function evaluate(value, scope) {
  if (typeof value !== 'string') return value;
  return evalNode(compile(value), scope, value);
}

function evalNode(n, scope, src) {
  switch (n.k) {
    case 'num': case 'str': case 'bool': return n.v;
    case 'var':
      if (n.v in CONSTANTS) return CONSTANTS[n.v].js;
      if (!(n.v in scope)) throw new Error(`Unknown name '${n.v}' in "${src}"`);
      return scope[n.v];
    case 'un': {
      const a = evalNode(n.arg, scope, src);
      return n.op === '-' ? -a : !a;
    }
    case 'if': return evalNode(n.cond, scope, src) ? evalNode(n.a, scope, src) : evalNode(n.b, scope, src);
    case 'call': return FUNCTIONS[n.fn].js(...n.args.map((a) => evalNode(a, scope, src)));
    case 'bin': {
      if (n.op === '&&') return evalNode(n.left, scope, src) && evalNode(n.right, scope, src);
      if (n.op === '||') return evalNode(n.left, scope, src) || evalNode(n.right, scope, src);
      const a = evalNode(n.left, scope, src);
      const b = evalNode(n.right, scope, src);
      switch (n.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return a / b;
        case '%': return a % b;
        case '==': return a === b;
        case '!=': return a !== b;
        case '<': return a < b;
        case '<=': return a <= b;
        case '>': return a > b;
        case '>=': return a >= b;
      }
    }
  }
  throw new Error(`Cannot evaluate "${src}"`);
}

/**
 * Translate a recipe value to FeatureScript source.
 * `names` maps recipe identifiers to FeatureScript variable names.
 */
export function toFeatureScript(value, names) {
  if (typeof value === 'number') return fsNumber(value);
  if (typeof value === 'boolean') return String(value);
  return fsNode(compile(value), names, value);
}

export function fsNumber(v) {
  if (!Number.isFinite(v)) throw new Error(`Cannot emit ${v}`);
  return Number.isInteger(v) ? String(v) : String(+v.toPrecision(12));
}

export function fsString(s) {
  return JSON.stringify(String(s));
}

function fsNode(n, names, src) {
  const r = (x) => fsNode(x, names, src);
  switch (n.k) {
    case 'num': return fsNumber(n.v);
    case 'str': return fsString(n.v);
    case 'bool': return String(n.v);
    case 'var':
      if (n.v in CONSTANTS) return CONSTANTS[n.v].fs;
      if (!names[n.v]) throw new Error(`Unknown name '${n.v}' in "${src}"`);
      return names[n.v];
    case 'un': return `(${n.op}${r(n.arg)})`;
    case 'if': return `(${r(n.cond)} ? ${r(n.a)} : ${r(n.b)})`;
    case 'call': return FUNCTIONS[n.fn].fs(n.args.map(r));
    case 'bin': {
      // FeatureScript concatenates strings with ~
      const op = n.op === '+' && (n.left.k === 'str' || n.right.k === 'str') ? '~' : n.op;
      return `(${r(n.left)} ${op} ${r(n.right)})`;
    }
  }
  throw new Error(`Cannot translate "${src}"`);
}

/** Replace {expr} placeholders in note templates. */
export function template(text, scope) {
  return text.replace(/\{([^}]+)\}/g, (_, e) => {
    const v = evaluate(e, scope);
    return typeof v === 'number' ? String(+v.toFixed(2)) : String(v);
  });
}
