// Chamfers and fillets on the top and bottom edges of a part.
//
// A part with `edges` is cut to its own outline seen from above, extruded over
// the part's height with the edges broken. That rounds the outer edges and the
// edges of through-holes, even when the part was built from several steps.
// Normally the edged outline is a smooth mesh: rings of the outline moved in
// along the corner directions (smoothEdgedExtrude). Where that would fold over
// itself (thin features such as text strokes) it is a stack of slabs about
// 0.2 mm high instead, like print layers (edgedExtrude). FeatureScript uses
// opChamfer / opFillet (engine/featurescript.js, mgPartEdges).

export const EDGE_KEYS = ['top', 'topSize', 'bottom', 'bottomSize', 'bottomChamfer'];
export const TOP_EDGES = ['none', 'chamfer', 'fillet'];
export const BOTTOM_EDGES = ['none', 'chamfer', 'fillet', 'printable'];
export const DEFAULT_PRINTABLE_CHAMFER = 1;

// slab height: about one fine print layer (the slicer cuts it into layers anyway)
const SLAB = 0.2;
const TAN_22_5 = Math.SQRT2 - 1;
// a printable fillet's radius can be at most chamfer / this before it eats the whole chamfer
const PRINTABLE_LIMIT = 1 - Math.SQRT1_2;

/**
 * Shape of one edge treatment, measured from the face it sits on:
 * { height, inset(d) } where d is the distance from that face (0..height) and
 * inset is how far the wall is pulled in at that distance. null = no treatment.
 */
export function edgeShape(kind, size, chamfer = DEFAULT_PRINTABLE_CHAMFER) {
  if (!kind || kind === 'none' || !(size > 0)) return null;
  if (kind === 'chamfer') return { height: size, inset: (d) => Math.max(0, size - d), join: 'Miter' };
  if (kind === 'fillet') {
    const r = size;
    return { height: r, inset: (d) => r - Math.sqrt(Math.max(0, r * r - (r - d) ** 2)), join: 'Round' };
  }
  if (kind === 'printable') {
    // a 45° chamfer of height c at the bed, then a fillet of radius r blending
    // the top of the chamfer into the wall: nothing overhangs more than 45°
    const c = Math.max(0, chamfer);
    if (c <= 0) return edgeShape('fillet', size);
    const r = Math.min(size, c / PRINTABLE_LIMIT);
    const t = r * TAN_22_5; // tangent length of the fillet on both sides of the corner
    const arcStart = c - t * Math.SQRT1_2;
    return {
      height: c + t,
      inset: (d) => (d <= arcStart ? c - d : r - Math.sqrt(Math.max(0, r * r - (c + t - d) ** 2))),
      join: 'Round',
    };
  }
  throw new Error(`unknown edge '${kind}'`);
}

/** Scale both treatments down when together they are taller than the step. */
function fit(bottom, top, thickness) {
  const total = (bottom?.height || 0) + (top?.height || 0);
  if (total <= thickness || total <= 0) return { bottom, top, scaled: false };
  const k = (thickness * 0.999) / total;
  const scale = (e) => e && { height: e.height * k, inset: (d) => e.inset(d / k) * k, join: e.join };
  return { bottom: scale(bottom), top: scale(top), scaled: true };
}

/**
 * Extrude `profile` (a manifold CrossSection) by `thickness` with the edge
 * treatments in `edges` ({ top: { kind, size }, bottom: { kind, size, chamfer } }).
 * Returns { solid, scaled } where scaled says the edges were shrunk to fit.
 * The solid is a stack of touching slabs: only use it as an intersect tool.
 * grow: push the straight walls and the outer faces this much out, so the
 * tool's faces never coincide with the part's own (that makes booleans slow).
 */
export function edgedExtrude(Manifold, profile, thickness, edges, grow = 0) {
  const { bottom, top, scaled } = fit(
    edgeShape(edges.bottom?.kind, edges.bottom?.size, edges.bottom?.chamfer),
    edgeShape(edges.top?.kind, edges.top?.size),
    thickness,
  );
  const pieces = [];
  const temp = [];
  const slab = (z0, z1, inset, join = 'Miter') => {
    if (z1 - z0 <= 1e-6) return;
    if (z0 <= 1e-9) z0 = -grow;
    if (z1 >= thickness - 1e-9) z1 = thickness + grow;
    let cs = profile;
    const delta = inset > 1e-6 ? -inset : grow;
    if (Math.abs(delta) > 1e-6) {
      cs = profile.offset(delta, join, 2, 48).simplify(0.01);
      temp.push(cs);
      if (cs.isEmpty()) return;
    }
    const m = cs.extrude(z1 - z0);
    pieces.push(m.translate([0, 0, z0]));
    m.delete();
  };
  const band = (e, fromTop) => {
    const n = Math.max(3, Math.min(16, Math.ceil(e.height / SLAB)));
    for (let k = 0; k < n; k++) {
      const d0 = (e.height * k) / n;
      const d1 = (e.height * (k + 1)) / n;
      const inset = e.inset((d0 + d1) / 2);
      if (fromTop) slab(thickness - d1, thickness - d0, inset, e.join);
      else slab(d0, d1, inset, e.join);
    }
  };
  const hb = bottom?.height || 0;
  const ht = top?.height || 0;
  if (bottom) band(bottom, false);
  slab(hb, thickness - ht, 0);
  if (top) band(top, true);
  // compose only collects the slabs (they touch, never overlap); intersecting
  // the part with it merges them, faster than a union first
  const solid = Manifold.compose(pieces);
  for (const p of [...pieces, ...temp]) p.delete();
  return { solid, scaled };
}

/**
 * Smooth version of edgedExtrude: extrudes the outline with extra vertex rings
 * in the edge bands and moves each ring inwards along the corner (miter)
 * directions, so chamfers are flat and fillets are smooth instead of stepped.
 * Only works while the pulled-in outline doesn't fold over itself (thin
 * features like text strokes do); returns null then, use edgedExtrude.
 * The result is a proper solid (grow as in edgedExtrude).
 */
export function smoothEdgedExtrude(wasm, profile, thickness, edges, grow = 0) {
  const { Manifold, CrossSection } = wasm;
  const { bottom, top, scaled } = fit(
    edgeShape(edges.bottom?.kind, edges.bottom?.size, edges.bottom?.chamfer),
    edgeShape(edges.top?.kind, edges.top?.size),
    thickness,
  );
  const hb = bottom?.height || 0;
  const ht = top?.height || 0;
  const base = grow > 0 ? profile.offset(grow, 'Miter', 2) : profile;
  const polys = base.toPolygons().map((poly) => poly.map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.y])));
  if (base !== profile) base.delete();

  // inward miter direction of every outline vertex (outer contours run
  // counter-clockwise, holes clockwise, so the left normal points into the material)
  const miter = new Map();
  const key = (x, y) => `${x.toFixed(4)},${y.toFixed(4)}`;
  for (const poly of polys) {
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const [ax, ay] = poly[(i + n - 1) % n];
      const [bx, by] = poly[i];
      const [cx, cy] = poly[(i + 1) % n];
      const l1 = Math.hypot(bx - ax, by - ay);
      const l2 = Math.hypot(cx - bx, cy - by);
      if (l1 < 1e-9 || l2 < 1e-9) return null;
      const n1 = [-(by - ay) / l1, (bx - ax) / l1];
      const n2 = [-(cy - by) / l2, (cx - bx) / l2];
      const d = 1 + n1[0] * n2[0] + n1[1] * n2[1];
      if (d < 0.05) return null; // hairpin corner: the miter would shoot off
      miter.set(key(bx, by), [(n1[0] + n2[0]) / d, (n1[1] + n2[1]) / d]);
    }
  }
  // check the deepest inset doesn't fold the outline over itself
  const maxInset = Math.max(bottom ? bottom.inset(0) : 0, top ? top.inset(0) : 0) + grow;
  const moved = polys.map((poly) => poly.map(([x, y]) => { const m = miter.get(key(x, y)); return [x + m[0] * maxInset, y + m[1] * maxInset]; }));
  const signed = moved.reduce((s, poly) => s + poly.reduce((a, [x, y], i) => { const [x2, y2] = poly[(i + 1) % poly.length]; return a + x * y2 - x2 * y; }, 0) / 2, 0);
  const check = new CrossSection(moved, 'Positive');
  const filled = check.area();
  check.delete();
  if (!(signed > 0) || Math.abs(filled - signed) > 1e-3 * signed) return null;

  // vertex ring heights: fine steps in the edge bands, nothing in between
  const zs = [-grow];
  const steps = (h) => Math.max(4, Math.min(24, Math.ceil(h / 0.1)));
  if (bottom) { const n = steps(hb); for (let k = 1; k <= n; k++) zs.push((hb * k) / n); }
  if (top) {
    const start = thickness - ht;
    if (start > zs[zs.length - 1] + 1e-6) zs.push(start);
    const n = steps(ht);
    for (let k = 1; k < n; k++) zs.push(start + (ht * k) / n);
  }
  zs.push(thickness + grow);
  const insetAt = (z) => {
    if (bottom && z < hb - 1e-9) return bottom.inset(Math.max(0, z));
    if (top && z > thickness - ht + 1e-9) return top.inset(Math.max(0, thickness - z));
    return 0;
  };
  // build the mesh by hand: rings of the moved outline for the walls, and the
  // end faces triangulated from their own (moved) outline
  const N = polys.reduce((n, p) => n + p.length, 0);
  const vert = new Float32Array(zs.length * N * 3);
  const flatAt = [];
  zs.forEach((z, j) => {
    const t = insetAt(z);
    const move = t > 0 ? t + grow : 0;
    const ring = [];
    let o = j * N * 3;
    for (const poly of polys) {
      const out = [];
      for (const [x, y] of poly) {
        const m = miter.get(key(x, y));
        const px = x + m[0] * move;
        const py = y + m[1] * move;
        vert[o++] = px; vert[o++] = py; vert[o++] = z;
        out.push([px, py]);
      }
      ring.push(out);
    }
    flatAt.push(ring);
  });
  const tris = [];
  let start = 0;
  for (const poly of polys) {
    const n = poly.length;
    for (let j = 0; j < zs.length - 1; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * N + start + i;
        const b = j * N + start + ((i + 1) % n);
        tris.push(a, b, b + N, a, b + N, a + N);
      }
    }
    start += n;
  }
  const cap = (j, up) => {
    for (const [a, b, c] of wasm.triangulate(flatAt[j], 1e-6)) {
      if (up) tris.push(j * N + a, j * N + b, j * N + c);
      else tris.push(j * N + a, j * N + c, j * N + b);
    }
  };
  cap(0, false);
  cap(zs.length - 1, true);
  let solid;
  try {
    solid = new Manifold(new wasm.Mesh({ numProp: 3, vertProperties: vert, triVerts: new Uint32Array(tris) }));
  } catch {
    return null;
  }
  if (solid.status() !== 'NoError' || solid.isEmpty()) { solid.delete(); return null; }
  return { solid, scaled };
}
