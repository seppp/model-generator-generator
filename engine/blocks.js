// Building blocks.
//
// Every block is a 2D profile, centered on the origin, that the engine extrudes
// from `z` by `thickness` and then rotates/moves to `x`, `y`. Each block is
// implemented twice:
//   profile(args, env)  -> manifold CrossSection (browser + Node), or null to skip
//   warnings(args)      -> optional, printability hints shown under the preview
//   fs                  -> a FeatureScript helper function + how to call it
// Keeping both implementations side by side is what makes a recipe compile to
// the website and to Onshape. To add a block, add an entry here, document it
// in docs/RECIPES.md and run `npm run check`.

import { qrMatrix, qrRuns } from './qr.js';
import { textPolygons } from './text.js';
import { FONT_NAMES, FONTS } from './fonts.js';
import { fsNumber, fsString } from './expr.js';

const C45 = Math.SQRT1_2;

// Faux text styles (the same for every font): italic slants by 12 degrees, bold
// grows the outline by this share of the cap height, underline sizes are shares
// of the cap height (thickness at least UNDERLINE.min mm, so it prints).
const TEXT_SLANT = Math.tan((12 * Math.PI) / 180);
const TEXT_BOLD = 0.045;
const UNDERLINE = { thickness: 0.1, min: 0.8, gap: 0.15 };
const underlineSize = (cap) => ({ thickness: Math.max(UNDERLINE.thickness * cap, UNDERLINE.min), gap: UNDERLINE.gap * cap });

function circleSegments(d) {
  return Math.max(24, Math.min(256, Math.round((Math.PI * d) / 0.4)));
}

function roundedRectPoints(w, h, r) {
  r = Math.min(r, (Math.min(w, h) / 2) * 0.999);
  if (r <= 1e-6) return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  const seg = Math.max(4, Math.ceil(circleSegments(2 * r) / 4));
  const pts = [];
  const corners = [
    [w / 2 - r, -h / 2 + r, -90],
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, 90],
    [-w / 2 + r, -h / 2 + r, 180],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = ((a0 + (90 * i) / seg) * Math.PI) / 180;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return pts;
}

function regularPolygonPoints(d, sides) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = Math.PI / 2 + (2 * Math.PI * i) / sides; // first vertex points up (+y)
    pts.push([(d / 2) * Math.cos(a), (d / 2) * Math.sin(a)]);
  }
  return pts;
}


// Outer and inner outline of a `frame`: the inner one is the outer one moved
// inwards by the line width (null when the line fills the whole shape).
function shapeProfile(a, CrossSection) {
  switch (a.shape) {
    case 'circle':
      if (a.diameter <= 0) return null;
      return CrossSection.circle(a.diameter / 2, circleSegments(a.diameter));
    case 'polygon':
      if (a.diameter <= 0) return null;
      return new CrossSection([regularPolygonPoints(a.diameter, Math.max(3, Math.round(a.sides)))]);
    case 'rect':
      if (a.width <= 0 || a.height <= 0) return null;
      return CrossSection.square([a.width, a.height], true);
    default:
      if (a.width <= 0 || a.height <= 0) return null;
      return new CrossSection([roundedRectPoints(a.width, a.height, Math.max(0, a.radius))]);
  }
}

export function frameInner(a) {
  const lw = a.lineWidth;
  if (a.shape === 'circle') return { ...a, diameter: a.diameter - 2 * lw };
  if (a.shape === 'polygon') return { ...a, diameter: a.diameter - (2 * lw) / Math.cos(Math.PI / Math.max(3, Math.round(a.sides))) };
  const r = Math.min(Math.max(0, a.radius), (Math.min(a.width, a.height) / 2) * 0.999);
  return { ...a, width: a.width - 2 * lw, height: a.height - 2 * lw, radius: Math.max(r - lw, 0) };
}

function lineWarnings(a) {
  return a.lineWidth > 0 && a.lineWidth < 0.8 ? [`Lines ${+a.lineWidth.toFixed(2)} mm wide print poorly; use 0.8 mm or more.`] : [];
}

export const LINE_PATTERNS = ['solid', 'dashed', 'dotted'];
const MIN_GAP = 0.1;

/**
 * The pieces of a `line` along X, centered on the origin, as [center, length]:
 * dashes are stretched so the line starts and ends with a full dash, dots
 * (diameter = line width) are spread so the first and last sit at the ends.
 */
export function linePieces(a) {
  const L = a.length;
  const w = a.lineWidth;
  if (L <= 0 || w <= 0) return [];
  const g = Math.max(a.gap, MIN_GAP);
  if (a.pattern === 'dotted') {
    if (L <= w) return [[0, w]];
    const n = Math.max(1, Math.floor((L - w) / (w + g)));
    const s = (L - w) / n;
    return Array.from({ length: n + 1 }, (_, i) => [-L / 2 + w / 2 + i * s, w]);
  }
  if (a.pattern === 'dashed') {
    let n = Math.max(1, Math.floor((L + g) / (Math.max(a.dash, MIN_GAP) + g) + 0.5));
    let d = (L + g) / n - g;
    if (d <= 0) { n = 1; d = L; }
    return Array.from({ length: n }, (_, i) => [-L / 2 + d / 2 + i * (d + g), d]);
  }
  return [[0, L]];
}

export const BLOCKS = {
  shape: {
    description: 'Basic outline: rect, roundedRect, circle or polygon (regular, first vertex pointing up).',
    args: {
      shape: { type: 'enum', options: ['rect', 'roundedRect', 'circle', 'polygon'], default: 'rect' },
      width: { type: 'number', default: 10, help: 'rect / roundedRect' },
      height: { type: 'number', default: 10, help: 'rect / roundedRect' },
      radius: { type: 'number', default: 0, help: 'corner radius of roundedRect' },
      diameter: { type: 'number', default: 10, help: 'circle; polygon (corner to corner)' },
      sides: { type: 'number', default: 6, help: 'polygon' },
    },
    profile(a, { CrossSection }) {
      return shapeProfile(a, CrossSection);
    },
    fs: {
      helper: `
function mgShape(context is Context, id is Id, z is number, t is number, shape is string, w is number, h is number, r is number, d is number, sides is number) returns Query
{
    const mm = millimeter;
    const sk = newSketchOnPlane(context, id + "sk", { "sketchPlane" : mgPlane(z) });
    if (shape == "circle")
    {
        skCircle(sk, "c", { "center" : vector(0, 0) * mm, "radius" : d / 2 * mm });
    }
    else if (shape == "polygon")
    {
        skRegularPolygon(sk, "p", { "center" : vector(0, 0) * mm, "firstVertex" : vector(0, d / 2) * mm, "sides" : round(sides) });
    }
    else
    {
        const rr = shape == "rect" ? 0 : min(r, min(w, h) / 2 * 0.999);
        const x0 = -w / 2;
        const x1 = w / 2;
        const y0 = -h / 2;
        const y1 = h / 2;
        if (rr <= 1e-6)
        {
            skRectangle(sk, "r", { "firstCorner" : vector(x0, y0) * mm, "secondCorner" : vector(x1, y1) * mm });
        }
        else
        {
            const k = rr - rr * ${C45};
            skLineSegment(sk, "l1", { "start" : vector(x0 + rr, y0) * mm, "end" : vector(x1 - rr, y0) * mm });
            skArc(sk, "a1", { "start" : vector(x1 - rr, y0) * mm, "mid" : vector(x1 - k, y0 + k) * mm, "end" : vector(x1, y0 + rr) * mm });
            skLineSegment(sk, "l2", { "start" : vector(x1, y0 + rr) * mm, "end" : vector(x1, y1 - rr) * mm });
            skArc(sk, "a2", { "start" : vector(x1, y1 - rr) * mm, "mid" : vector(x1 - k, y1 - k) * mm, "end" : vector(x1 - rr, y1) * mm });
            skLineSegment(sk, "l3", { "start" : vector(x1 - rr, y1) * mm, "end" : vector(x0 + rr, y1) * mm });
            skArc(sk, "a3", { "start" : vector(x0 + rr, y1) * mm, "mid" : vector(x0 + k, y1 - k) * mm, "end" : vector(x0, y1 - rr) * mm });
            skLineSegment(sk, "l4", { "start" : vector(x0, y1 - rr) * mm, "end" : vector(x0, y0 + rr) * mm });
            skArc(sk, "a4", { "start" : vector(x0, y0 + rr) * mm, "mid" : vector(x0 + k, y0 + k) * mm, "end" : vector(x0 + rr, y0) * mm });
        }
    }
    skSolve(sk);
    return mgExtrude(context, id, id + "sk", t);
}`,
      call: (f) => `mgShape(context, ID, Z, T, ${f.shape}, ${f.width}, ${f.height}, ${f.radius}, ${f.diameter}, ${f.sides})`,
    },
  },

  frame: {
    description: 'Border line along an outline (rect, roundedRect, circle or polygon): the outline given is the outer edge, the line goes `lineWidth` inwards.',
    args: {
      shape: { type: 'enum', options: ['rect', 'roundedRect', 'circle', 'polygon'], default: 'rect' },
      width: { type: 'number', default: 10, help: 'rect / roundedRect' },
      height: { type: 'number', default: 10, help: 'rect / roundedRect' },
      radius: { type: 'number', default: 0, help: 'corner radius of roundedRect' },
      diameter: { type: 'number', default: 10, help: 'circle; polygon (corner to corner)' },
      sides: { type: 'number', default: 6, help: 'polygon' },
      lineWidth: { type: 'number', default: 1, help: 'width of the border line, measured inwards' },
    },
    warnings: lineWarnings,
    profile(a, { CrossSection }) {
      if (a.lineWidth <= 0) return null;
      const outer = shapeProfile(a, CrossSection);
      if (!outer) return null;
      const inner = shapeProfile(frameInner(a), CrossSection);
      if (!inner) return outer;
      const ring = outer.subtract(inner);
      outer.delete();
      inner.delete();
      return ring;
    },
    fs: {
      needs: ['shape'],
      helper: `
// Outer outline minus the same outline moved inwards by lw.
function mgFrame(context is Context, id is Id, z is number, t is number, shape is string, w is number, h is number, r is number, d is number, sides is number, lw is number) returns Query
{
    const outer = mgShape(context, id + "o", z, t, shape, w, h, r, d, sides);
    const rr = max(min(r, min(w, h) / 2 * 0.999), 0);
    const iw = w - 2 * lw;
    const ih = h - 2 * lw;
    var idia = d - 2 * lw;
    if (shape == "polygon")
    {
        idia = d - 2 * lw / cos(180 / max(round(sides), 3) * degree);
    }
    const filled = (shape == "circle" || shape == "polygon") ? idia <= 0 : (iw <= 0 || ih <= 0);
    if (!filled)
    {
        const inner = mgShape(context, id + "i", z - 1, t + 2, shape, iw, ih, max(rr - lw, 0), idia, sides);
        opBoolean(context, id + "cut", { "tools" : inner, "targets" : outer, "operationType" : BooleanOperationType.SUBTRACTION });
    }
    return outer;
}`,
      call: (f) => ({ guard: `${f.lineWidth} > 0`, code: `mgFrame(context, ID, Z, T, ${f.shape}, ${f.width}, ${f.height}, ${f.radius}, ${f.diameter}, ${f.sides}, ${f.lineWidth})` }),
    },
  },

  line: {
    description: 'Straight line along X, centered: solid, dashed or dotted, with flat or round ends. Turn it with the step\'s `rotate`.',
    args: {
      length: { type: 'number', default: 20, help: 'end to end' },
      lineWidth: { type: 'number', default: 1 },
      pattern: { type: 'enum', options: LINE_PATTERNS, default: 'solid' },
      dash: { type: 'number', default: 3, help: 'dashed: dash length (adjusted so the line ends with a full dash)' },
      gap: { type: 'number', default: 2, help: 'dashed / dotted: space between pieces' },
      ends: { type: 'enum', options: ['flat', 'round'], default: 'flat' },
    },
    warnings: lineWarnings,
    profile(a, { CrossSection }) {
      const pieces = linePieces(a);
      if (!pieces.length) return null;
      const w = a.lineWidth;
      const round = a.pattern === 'dotted' || a.ends === 'round';
      const shapes = pieces.map(([c, len]) => {
        if (round && len <= w + 1e-6) return CrossSection.circle(w / 2, circleSegments(w)).translate([c, 0]);
        if (round) return new CrossSection([roundedRectPoints(len, w, w / 2)]).translate([c, 0]);
        return CrossSection.square([len, w], true).translate([c, 0]);
      });
      return shapes.length === 1 ? shapes[0] : CrossSection.union(shapes);
    },
    fs: {
      helper: `
// One dash: a rectangle, or with round ends a slot (a circle when it is no longer than wide).
function mgSlot(sk is Sketch, name is string, cx is number, len is number, w is number, roundEnds is boolean)
{
    const mm = millimeter;
    const r = w / 2;
    if (!roundEnds)
    {
        skRectangle(sk, name, { "firstCorner" : vector(cx - len / 2, -r) * mm, "secondCorner" : vector(cx + len / 2, r) * mm });
    }
    else if (len <= w + 1e-6)
    {
        skCircle(sk, name, { "center" : vector(cx, 0) * mm, "radius" : r * mm });
    }
    else
    {
        const x0 = cx - len / 2 + r;
        const x1 = cx + len / 2 - r;
        skLineSegment(sk, name ~ "b", { "start" : vector(x0, -r) * mm, "end" : vector(x1, -r) * mm });
        skArc(sk, name ~ "r", { "start" : vector(x1, -r) * mm, "mid" : vector(x1 + r, 0) * mm, "end" : vector(x1, r) * mm });
        skLineSegment(sk, name ~ "t", { "start" : vector(x1, r) * mm, "end" : vector(x0, r) * mm });
        skArc(sk, name ~ "l", { "start" : vector(x0, r) * mm, "mid" : vector(x0 - r, 0) * mm, "end" : vector(x0, -r) * mm });
    }
}

// Same layout as linePieces() in the website's engine.
function mgLine(context is Context, id is Id, z is number, t is number, len is number, w is number, pattern is string, dash is number, gap is number, ends is string) returns Query
{
    const sk = newSketchOnPlane(context, id + "sk", { "sketchPlane" : mgPlane(z) });
    const g = max(gap, ${MIN_GAP});
    const roundEnds = ends == "round";
    if (pattern == "dotted")
    {
        if (len <= w)
        {
            mgSlot(sk, "p0", 0, w, w, true);
        }
        else
        {
            const n = max(1, floor((len - w) / (w + g)));
            const s = (len - w) / n;
            for (var i = 0; i <= n; i += 1)
            {
                mgSlot(sk, "p" ~ i, -len / 2 + w / 2 + i * s, w, w, true);
            }
        }
    }
    else if (pattern == "dashed")
    {
        var n = max(1, floor((len + g) / (max(dash, ${MIN_GAP}) + g) + 0.5));
        var d = (len + g) / n - g;
        if (d <= 0)
        {
            n = 1;
            d = len;
        }
        for (var i = 0; i < n; i += 1)
        {
            mgSlot(sk, "p" ~ i, -len / 2 + d / 2 + i * (d + g), d, w, roundEnds);
        }
    }
    else
    {
        mgSlot(sk, "p0", 0, len, w, roundEnds);
    }
    skSolve(sk);
    return mgExtrude(context, id, id + "sk", t);
}`,
      call: (f) => ({ guard: `${f.length} > 0 && ${f.lineWidth} > 0`, code: `mgLine(context, ID, Z, T, ${f.length}, ${f.lineWidth}, ${f.pattern}, ${f.dash}, ${f.gap}, ${f.ends})` }),
    },
  },

  qr: {
    description: 'QR code, `size` mm square (quiet zone not included). Content and error correction are baked into FeatureScript exports.',
    args: {
      content: { type: 'string', default: 'https://example.com', baked: true },
      size: { type: 'number', default: 20 },
      ecc: { type: 'enum', options: ['L', 'M', 'Q', 'H'], default: 'M', baked: true },
    },
    warnings(a) {
      if (!a.content || a.size <= 0) return [];
      const n = qrMatrix(a.content, a.ecc).length;
      const module = a.size / n;
      return module < 1
        ? [`QR modules are ${module.toFixed(2)} mm; aim for 1 mm. Make the code bigger or the content shorter.`]
        : [];
    },
    profile(a, { CrossSection }) {
      if (!a.content || a.size <= 0) return null;
      const m = qrMatrix(a.content, a.ecc);
      const n = m.length;
      const s = a.size / n;
      const rects = qrRuns(m).map(([row, col, len]) =>
        CrossSection.square([len * s, s]).translate([-a.size / 2 + col * s, a.size / 2 - (row + 1) * s]),
      );
      return CrossSection.union(rects);
    },
    fs: {
      helper: `
// Draws the dark modules as row runs. Even and odd rows go into separate
// sketches so no two rectangles in one sketch touch and every region is a module run.
function mgQr(context is Context, id is Id, z is number, t is number, n is number, runs is array, side is number) returns Query
{
    const mm = millimeter;
    const m = side / n;
    var bodies = [];
    for (var parity = 0; parity < 2; parity += 1)
    {
        const sid = id + ("sk" ~ parity);
        const sk = newSketchOnPlane(context, sid, { "sketchPlane" : mgPlane(z) });
        var any = false;
        for (var i = 0; i < size(runs); i += 1)
        {
            const run = runs[i];
            if (run[0] % 2 == parity)
            {
                const x0 = -side / 2 + run[1] * m;
                const y1 = side / 2 - run[0] * m;
                skRectangle(sk, "r" ~ i, { "firstCorner" : vector(x0, y1 - m) * mm, "secondCorner" : vector(x0 + run[2] * m, y1) * mm });
                any = true;
            }
        }
        skSolve(sk);
        if (any)
        {
            bodies = append(bodies, mgExtrude(context, id + ("ex" ~ parity), sid, t));
        }
        else
        {
            opDeleteBodies(context, id + ("del" ~ parity), { "entities" : qCreatedBy(sid, EntityType.BODY) });
        }
    }
    return qUnion(bodies);
}`,
      call: (f, js) => {
        if (!js.content) return null;
        const m = qrMatrix(js.content, js.ecc);
        const runs = qrRuns(m).map((r) => `[${r.join(', ')}]`);
        const lines = [];
        for (let i = 0; i < runs.length; i += 16) lines.push(runs.slice(i, i + 16).join(', '));
        return {
          comment: `QR content baked in: ${JSON.stringify(js.content)} (error correction ${js.ecc}). Regenerate from the website to change it.`,
          code: `mgQr(context, ID, Z, T, ${m.length}, [\n            ${lines.join(',\n            ')}\n        ], ${f.size})`,
        };
      },
    },
  },

  text: {
    description: 'Single line of text, centered. `size` is the capital letter height in mm. `font` is one of the names in engine/fonts.js. `bold`, `italic` and `underline` style it.',
    args: {
      text: { type: 'string', default: 'Text' },
      size: { type: 'number', default: 8 },
      font: { type: 'enum', options: FONT_NAMES, default: 'regular' },
      bold: { type: 'boolean', default: false, help: 'thicker strokes' },
      italic: { type: 'boolean', default: false, help: 'slanted' },
      underline: { type: 'boolean', default: false, help: 'line under the text' },
    },
    profile(a, { CrossSection, fonts }) {
      if (!a.text || !String(a.text).trim() || a.size <= 0) return null;
      const font = fonts[a.font] || fonts.regular; // a missing font (e.g. no own font file yet) falls back
      let polys = textPolygons(font, String(a.text), a.size);
      if (!polys.length) return null;
      let x0 = Infinity, x1 = -Infinity;
      for (const poly of polys) for (const [x] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
      // faux styles, so they work with every font: slant around the baseline, grow the outline
      if (a.italic) polys = polys.map((poly) => poly.map(([x, y]) => [x + y * TEXT_SLANT, y]));
      const pieces = [];
      let cs = new CrossSection(polys, 'NonZero');
      const grow = a.bold ? TEXT_BOLD * a.size : 0;
      if (grow > 0) {
        pieces.push(cs);
        cs = cs.offset(grow, 'Round', 2, 16);
      }
      if (a.underline) {
        const { thickness, gap } = underlineSize(a.size);
        const line = CrossSection.square([x1 - x0 + 2 * grow, thickness]).translate([x0 - grow, -gap - grow - thickness]);
        pieces.push(cs, line);
        cs = cs.add(line);
      }
      const b = cs.bounds();
      const out = cs.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]);
      pieces.push(cs);
      for (const p of pieces) p.delete();
      return out;
    },
    fs: {
      helper: `
const MG_BOLD_FONTS = [${FONT_NAMES.filter((n) => FONTS[n].fsBold).map((n) => `"${n}"`).join(', ')}];

// Onshape text box height is roughly the font's em size; Open Sans caps are 0.714 em.
// Onshape has its own font list, so every font is drawn with Open Sans here, in
// its Bold, Italic or BoldItalic file for bold and italic text.
function mgText(context is Context, id is Id, z is number, t is number, txt is string, capHeight is number, font is string, bold is boolean, italic is boolean, underline is boolean) returns Query
{
    const mm = millimeter;
    const em = capHeight / 0.714;
    const heavy = bold || isIn(font, MG_BOLD_FONTS);
    const fontName = "OpenSans-" ~ (heavy ? (italic ? "BoldItalic" : "Bold") : (italic ? "Italic" : "Regular")) ~ ".ttf";
    const sk = newSketchOnPlane(context, id + "sk", { "sketchPlane" : mgPlane(z) });
    skText(sk, "t", { "text" : txt, "fontName" : fontName, "firstCorner" : vector(0, 0) * mm, "secondCorner" : vector(em, em) * mm });
    skSolve(sk);
    var bodies = [];
    if (underline)
    {
        // the baseline is the bottom of a capital H drawn the same way
        const textBox = evBox3d(context, { "topology" : qSketchRegion(id + "sk", true) });
        const ref = newSketchOnPlane(context, id + "ref", { "sketchPlane" : mgPlane(z) });
        skText(ref, "h", { "text" : "H", "fontName" : fontName, "firstCorner" : vector(0, 0) * mm, "secondCorner" : vector(em, em) * mm });
        skSolve(ref);
        const baseline = evBox3d(context, { "topology" : qSketchRegion(id + "ref", true) }).minCorner[1] / mm;
        opDeleteBodies(context, id + "refdel", { "entities" : qCreatedBy(id + "ref", EntityType.BODY) });
        const th = max(${UNDERLINE.thickness} * capHeight, ${UNDERLINE.min});
        const top = baseline - ${UNDERLINE.gap} * capHeight;
        const ul = newSketchOnPlane(context, id + "ulsk", { "sketchPlane" : mgPlane(z) });
        skRectangle(ul, "r", { "firstCorner" : vector(textBox.minCorner[0] / mm, top - th) * mm, "secondCorner" : vector(textBox.maxCorner[0] / mm, top) * mm });
        skSolve(ul);
        bodies = append(bodies, mgExtrude(context, id + "ul", id + "ulsk", t));
    }
    const q = qUnion(append(bodies, mgExtrude(context, id, id + "sk", t)));
    const box = evBox3d(context, { "topology" : q });
    const c = (box.minCorner + box.maxCorner) / 2;
    opTransform(context, id + "center", { "bodies" : q, "transform" : transform(vector(-c[0], -c[1], 0 * mm)) });
    return q;
}`,
      call: (f) => ({ guard: `${f.text} != ""`, code: `mgText(context, ID, Z, T, ${f.text}, ${f.size}, ${f.font}, ${f.bold}, ${f.italic}, ${f.underline})` }),
    },
  },
};

export const FS_COMMON = `
function mgPlane(z is number) returns Plane
{
    return plane(vector(0, 0, z) * millimeter, Z_DIRECTION, X_DIRECTION);
}

function mgExtrude(context is Context, id is Id, sketchId is Id, t is number) returns Query
{
    opExtrude(context, id + "ex", {
            "entities" : qSketchRegion(sketchId, true),
            "direction" : Z_DIRECTION,
            "endBound" : BoundingType.BLIND,
            "endDepth" : t * millimeter
    });
    opDeleteBodies(context, id + "cleanup", { "entities" : qCreatedBy(sketchId, EntityType.BODY) });
    return qCreatedBy(id + "ex", EntityType.BODY);
}

function mgPlace(context is Context, id is Id, bodies is Query, x is number, y is number, rot is number)
{
    if (x == 0 && y == 0 && rot == 0)
    {
        return;
    }
    opTransform(context, id, { "bodies" : bodies,
            "transform" : transform(vector(x, y, 0) * millimeter) * rotationAround(line(vector(0, 0, 0) * millimeter, Z_DIRECTION), rot * degree) });
}

// Parts never overlap: adding to one part carves the tool out of all others.
function mgAdd(context is Context, id is Id, parts is map, name is string, tool is Query) returns map
{
    var i = 0;
    for (var key, bodies in parts)
    {
        if (key != name && size(bodies) > 0)
        {
            try silent
            {
                opBoolean(context, id + ("carve" ~ i), { "tools" : tool, "targets" : qUnion(bodies),
                        "operationType" : BooleanOperationType.SUBTRACTION, "keepTools" : true });
            }
            i += 1;
        }
    }
    var result = parts;
    result[name] = append(result[name], tool);
    return result;
}

function mgSubtract(context is Context, id is Id, parts is map, names is array, tool is Query)
{
    var targets = [];
    for (var n in names)
    {
        targets = concatenateArrays([targets, parts[n]]);
    }
    if (size(targets) > 0)
    {
        try silent
        {
            opBoolean(context, id + "cut", { "tools" : tool, "targets" : qUnion(targets),
                    "operationType" : BooleanOperationType.SUBTRACTION, "keepTools" : true });
        }
    }
    opDeleteBodies(context, id + "del", { "entities" : tool });
}

function mgFinish(context is Context, id is Id, bodies is array, name is string, rgb is array)
{
    if (size(bodies) == 0)
    {
        return;
    }
    const q = qUnion(bodies);
    if (size(evaluateQuery(context, q)) > 1)
    {
        try silent
        {
            opBoolean(context, id + "union", { "tools" : q, "operationType" : BooleanOperationType.UNION });
        }
    }
    setProperty(context, { "entities" : q, "propertyType" : PropertyType.NAME, "value" : name });
    setProperty(context, { "entities" : q, "propertyType" : PropertyType.APPEARANCE, "value" : color(rgb[0], rgb[1], rgb[2]) });
}
`;

export { fsNumber, fsString };
