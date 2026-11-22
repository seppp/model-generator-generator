// Text -> polygons using an opentype.js Font. Output is in mm, y up.

function flatten(commands, scale, tol) {
  const polys = [];
  let cur = null;
  let x = 0, y = 0;
  const push = (px, py) => cur.push([px * scale, -py * scale]);
  for (const c of commands) {
    switch (c.type) {
      case 'M':
        if (cur && cur.length > 2) polys.push(cur);
        cur = [];
        x = c.x; y = c.y; push(x, y);
        break;
      case 'L':
        x = c.x; y = c.y; push(x, y);
        break;
      case 'Q': {
        const n = steps(Math.hypot(c.x - x, c.y - y) * scale, tol);
        for (let i = 1; i <= n; i++) {
          const t = i / n, u = 1 - t;
          push(u * u * x + 2 * u * t * c.x1 + t * t * c.x, u * u * y + 2 * u * t * c.y1 + t * t * c.y);
        }
        x = c.x; y = c.y;
        break;
      }
      case 'C': {
        const n = steps(Math.hypot(c.x - x, c.y - y) * scale, tol);
        for (let i = 1; i <= n; i++) {
          const t = i / n, u = 1 - t;
          push(
            u * u * u * x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
            u * u * u * y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y,
          );
        }
        x = c.x; y = c.y;
        break;
      }
      case 'Z':
        if (cur && cur.length > 2) polys.push(cur);
        cur = null;
        break;
    }
  }
  if (cur && cur.length > 2) polys.push(cur);
  return polys;
}

function steps(len, tol) {
  return Math.max(2, Math.min(24, Math.ceil(len / tol)));
}

/** capHeight in mm. */
export function textPolygons(font, text, capHeight) {
  const capUnits = font.tables.os2?.sCapHeight || font.unitsPerEm * 0.7;
  const fontSize = font.unitsPerEm; // work in font units, scale afterwards
  let commands;
  try {
    commands = font.getPath(text, 0, 0, fontSize).commands;
  } catch {
    // some fonts use OpenType substitutions opentype.js can't apply: lay out glyph by glyph
    commands = [];
    let x = 0;
    let prev = null;
    for (const ch of text) {
      const g = font.charToGlyph(ch);
      if (prev) x += font.getKerningValue(prev, g);
      commands.push(...g.getPath(x, 0, fontSize).commands);
      x += g.advanceWidth || 0;
      prev = g;
    }
  }
  const scale = capHeight / capUnits;
  return flatten(commands, scale, 0.25);
}
