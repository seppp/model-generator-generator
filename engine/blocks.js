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
    description: 'Single line of text, centered. `size` is the capital letter height in mm. `font` is one of the names in engine/fonts.js.',
    args: {
      text: { type: 'string', default: 'Text' },
      size: { type: 'number', default: 8 },
      font: { type: 'enum', options: FONT_NAMES, default: 'regular' },
    },
    profile(a, { CrossSection, fonts }) {
      if (!a.text || !String(a.text).trim() || a.size <= 0) return null;
      const font = fonts[a.font] || fonts.regular; // a missing font (e.g. no own font file yet) falls back
      const polys = textPolygons(font, String(a.text), a.size);
      if (!polys.length) return null;
      const cs = new CrossSection(polys, 'NonZero');
      const b = cs.bounds();
      return cs.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]);
    },
    fs: {
      helper: `
const MG_BOLD_FONTS = [${FONT_NAMES.filter((n) => FONTS[n].fsBold).map((n) => `"${n}"`).join(', ')}];

// Onshape text box height is roughly the font's em size; Open Sans caps are 0.714 em.
// Onshape has its own font list, so every font is drawn with Open Sans here.
function mgText(context is Context, id is Id, z is number, t is number, txt is string, capHeight is number, font is string) returns Query
{
    const mm = millimeter;
    const em = capHeight / 0.714;
    const sk = newSketchOnPlane(context, id + "sk", { "sketchPlane" : mgPlane(z) });
    skText(sk, "t", { "text" : txt, "fontName" : isIn(font, MG_BOLD_FONTS) ? "OpenSans-Bold.ttf" : "OpenSans-Regular.ttf", "firstCorner" : vector(0, 0) * mm, "secondCorner" : vector(em, em) * mm });
    skSolve(sk);
    const q = mgExtrude(context, id, id + "sk", t);
    const box = evBox3d(context, { "topology" : q });
    const c = (box.minCorner + box.maxCorner) / 2;
    opTransform(context, id + "center", { "bodies" : q, "transform" : transform(vector(-c[0], -c[1], 0 * mm)) });
    return q;
}`,
      call: (f) => ({ guard: `${f.text} != ""`, code: `mgText(context, ID, Z, T, ${f.text}, ${f.size}, ${f.font})` }),
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
