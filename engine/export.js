// File exports: binary STL, 3MF (with PrusaSlicer part/extruder metadata),
// OBJ (mesh with vertex colors) and the top-view outlines as SVG and DXF.

import { partMesh } from './build.js';

// ---------------------------------------------------------------- STL

export function toSTL(parts) {
  const meshes = parts.map(partMesh);
  const triCount = meshes.reduce((n, m) => n + m.indices.length / 3, 0);
  const buf = new ArrayBuffer(84 + triCount * 50);
  const dv = new DataView(buf);
  const header = 'binary STL - model generator generator';
  for (let i = 0; i < header.length; i++) dv.setUint8(i, header.charCodeAt(i));
  dv.setUint32(80, triCount, true);
  let o = 84;
  for (const { positions: p, indices: ix } of meshes) {
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      for (const v of [nx, ny, nz, p[a], p[a + 1], p[a + 2], p[b], p[b + 1], p[b + 2], p[c], p[c + 1], p[c + 2]]) {
        dv.setFloat32(o, v, true);
        o += 4;
      }
      dv.setUint16(o, 0, true);
      o += 2;
    }
  }
  return new Uint8Array(buf);
}

// ---------------------------------------------------------------- 3MF

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = (v) => String(+v.toFixed(5));

/**
 * First layer top Z that is above `z`, i.e. the layer that has to be printed in
 * the new colour.
 */
export function colorChangeLayer(z, layerHeight = 0.2, firstLayer = layerHeight) {
  if (z <= firstLayer + 1e-6) return +firstLayer.toFixed(3);
  const n = Math.ceil((z - firstLayer) / layerHeight - 1e-6);
  let top = firstLayer + n * layerHeight;
  if (top <= z + 1e-6) top += layerHeight;
  return +top.toFixed(3);
}

/**
 * One object with one volume per part. PrusaSlicer reads the volumes and
 * extruders from Metadata/Slic3r_PE_model.config; other slicers see one mesh.
 * options.mode: 'mmu' -> part i uses extruder i+1
 *               'colorchange' -> single extruder, M600 at each part boundary
 */
export function to3MF(parts, { name = 'model', mode = 'mmu', changes = [], layerHeight = 0.2, firstLayer, bedCenter = null } = {}) {
  const verts = [];
  const tris = [];
  const volumes = [];
  let zMin = Infinity;
  for (const p of parts) zMin = Math.min(zMin, p.bounds.min[2]);
  for (const [i, part] of parts.entries()) {
    const { positions, indices } = partMesh(part);
    const base = verts.length / 3;
    for (let k = 0; k < positions.length; k += 3) verts.push(positions[k], positions[k + 1], positions[k + 2] - zMin);
    const first = tris.length / 3;
    for (let k = 0; k < indices.length; k++) tris.push(indices[k] + base);
    volumes.push({ part, first, last: tris.length / 3 - 1, extruder: mode === 'mmu' ? i + 1 : 1 });
  }

  const vx = [];
  for (let k = 0; k < verts.length; k += 3) vx.push(`<vertex x="${num(verts[k])}" y="${num(verts[k + 1])}" z="${num(verts[k + 2])}"/>`);
  const tx = [];
  for (let k = 0; k < tris.length; k += 3) tx.push(`<triangle v1="${tris[k]}" v2="${tris[k + 1]}" v3="${tris[k + 2]}"/>`);

  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06">
 <metadata name="Title">${esc(name)}</metadata>
 <metadata name="Application">model-generator-generator</metadata>
 <resources>
  <object id="1" type="model" name="${esc(name)}">
   <mesh>
    <vertices>
${vx.join('\n')}
    </vertices>
    <triangles>
${tx.join('\n')}
    </triangles>
   </mesh>
  </object>
 </resources>
 <build>
  <item objectid="1"${bedCenter ? ` transform="1 0 0 0 1 0 0 0 1 ${bedCenter[0]} ${bedCenter[1]} 0"` : ''} printable="1"/>
 </build>
</model>
`;

  const config = `<?xml version="1.0" encoding="UTF-8"?>
<config>
 <object id="1" instances_count="1">
  <metadata type="object" key="name" value="${esc(name)}"/>
${volumes
  .map(
    (v) => `  <volume firstid="${v.first}" lastid="${v.last}">
   <metadata type="volume" key="name" value="${esc(v.part.label)}"/>
   <metadata type="volume" key="volume_type" value="ModelPart"/>
   <metadata type="volume" key="extruder" value="${v.extruder}"/>
  </volume>`,
  )
  .join('\n')}
 </object>
</config>
`;

  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>
`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
`],
    ['3D/3dmodel.model', model],
    ['Metadata/Slic3r_PE_model.config', config],
  ];

  if (mode === 'colorchange' && changes.length) {
    const codes = changes.map((c) => {
      const z = colorChangeLayer(c.z - zMin, layerHeight, firstLayer ?? layerHeight);
      return ` <code print_z="${z}" type="0" extruder="1" color="${esc(c.color)}" extra="" gcode="M600"/>`;
    });
    files.push(['Metadata/Prusa_Slicer_custom_gcode_per_print_z.xml', `<?xml version="1.0" encoding="utf-8"?>
<custom_gcodes_per_print_z>
${codes.join('\n')}
<mode value="SingleExtruder"/>
</custom_gcodes_per_print_z>
`]);
  }
  return zip(files);
}

// ---------------------------------------------------------------- OBJ

const hexRGB = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  const n = m ? parseInt(m[1], 16) : 0xcccccc;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => +(v / 255).toFixed(4));
};

/** Wavefront OBJ, one object per part, vertex colors (read by Blender, MeshLab, most CAD mesh importers). */
export function toOBJ(parts, { colors = {}, name = 'model' } = {}) {
  let zMin = Infinity;
  for (const p of parts) zMin = Math.min(zMin, p.bounds.min[2]);
  const out = [`# ${name} - model generator generator`, '# units: millimeters'];
  let base = 1;
  for (const part of parts) {
    const { positions, indices } = partMesh(part);
    const rgb = hexRGB(colors[part.key] || part.color).join(' ');
    out.push(`o ${part.key}`);
    for (let k = 0; k < positions.length; k += 3) out.push(`v ${num(positions[k])} ${num(positions[k + 1])} ${num(positions[k + 2] - zMin)} ${rgb}`);
    for (let k = 0; k < indices.length; k += 3) out.push(`f ${indices[k] + base} ${indices[k + 1] + base} ${indices[k + 2] + base}`);
    base += positions.length / 3;
  }
  return `${out.join('\n')}\n`;
}

// ---------------------------------------------------------------- 2D outlines (SVG, DXF)

/**
 * Each part seen from above: [{ key, label, color, polygons: [[[x, y], ...], ...] }].
 * Holes are separate polygons with opposite winding (use even-odd filling).
 */
export function outlines(parts) {
  return parts.map((part) => {
    const cs = part.manifold.project();
    const polygons = cs.toPolygons().map((poly) => poly.map((pt) => (Array.isArray(pt) ? [pt[0], pt[1]] : [pt.x, pt.y])));
    cs.delete();
    return { key: part.key, label: part.label, color: part.color, polygons };
  });
}

function outlineBounds(shapes) {
  const min = [Infinity, Infinity];
  const max = [-Infinity, -Infinity];
  for (const s of shapes) for (const poly of s.polygons) for (const [x, y] of poly) {
    min[0] = Math.min(min[0], x); min[1] = Math.min(min[1], y);
    max[0] = Math.max(max[0], x); max[1] = Math.max(max[1], y);
  }
  return Number.isFinite(min[0]) ? { min, max } : { min: [0, 0], max: [0, 0] };
}

/** SVG in millimeters, one group (layer) per part, filled with the part color. */
export function toSVG(parts, { colors = {}, name = 'model', margin = 2 } = {}) {
  const shapes = outlines(parts);
  const { min, max } = outlineBounds(shapes);
  const w = max[0] - min[0] + 2 * margin;
  const hgt = max[1] - min[1] + 2 * margin;
  // SVG y points down: flip so the drawing matches the top view
  const pt = ([x, y]) => `${num(x - min[0] + margin)} ${num(max[1] - y + margin)}`;
  const groups = shapes.map((s) => {
    const d = s.polygons.map((poly) => `M${poly.map(pt).join('L')}Z`).join('');
    const color = colors[s.key] || s.color || '#cccccc';
    return ` <g id="${esc(s.key)}" inkscape:groupmode="layer" inkscape:label="${esc(s.label)}">\n  <path d="${d}" fill="${esc(color)}" fill-rule="evenodd" stroke="#000" stroke-width="0.1"/>\n </g>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${num(w)}mm" height="${num(hgt)}mm" viewBox="0 0 ${num(w)} ${num(hgt)}">
 <title>${esc(name)}</title>
${groups.join('\n')}
</svg>
`;
}

/** ASCII DXF (R12 entities, millimeters), one layer per part, closed polylines. */
export function toDXF(parts) {
  const shapes = outlines(parts);
  const layer = (s) => s.key.replace(/[^A-Za-z0-9_-]/g, '_').toUpperCase();
  const L = [];
  const g = (code, value) => L.push(String(code), String(value));
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSUNITS'); g(70, 4); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES'); g(0, 'TABLE'); g(2, 'LAYER'); g(70, shapes.length);
  shapes.forEach((s, i) => { g(0, 'LAYER'); g(2, layer(s)); g(70, 0); g(62, (i % 6) + 1); g(6, 'CONTINUOUS'); });
  g(0, 'ENDTAB'); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  for (const s of shapes) {
    for (const poly of s.polygons) {
      g(0, 'POLYLINE'); g(8, layer(s)); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, 1);
      for (const [x, y] of poly) { g(0, 'VERTEX'); g(8, layer(s)); g(10, num(x)); g(20, num(y)); g(30, 0); }
      g(0, 'SEQEND'); g(8, layer(s));
    }
  }
  g(0, 'ENDSEC'); g(0, 'EOF');
  return `${L.join('\n')}\n`;
}

// ---------------------------------------------------------------- zip (store only)

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of files) {
    const data = typeof content === 'string' ? enc.encode(content) : content;
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, 0, true);
    local.setUint16(12, 0x21, true); // 1980-01-01
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, 0, true);
    cd.setUint16(14, 0x21, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}
