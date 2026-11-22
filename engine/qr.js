// QR encoding: content -> boolean module matrix (no quiet zone).
import qrcode from 'qrcode-generator';

const cache = new Map();

export function qrMatrix(content, ecc = 'M') {
  const key = ecc + '\u0000' + content;
  if (cache.has(key)) return cache.get(key);
  // qrcode-generator's Byte mode takes one char per byte, so pre-encode as UTF-8.
  const utf8 = Array.from(new TextEncoder().encode(String(content)), (b) => String.fromCharCode(b)).join('');
  const qr = qrcode(0, ecc);
  qr.addData(utf8, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const m = [];
  for (let r = 0; r < n; r++) {
    const row = [];
    for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
    m.push(row);
  }
  if (cache.size > 50) cache.clear();
  cache.set(key, m);
  return m;
}

/** Horizontal runs of dark modules: [row, startColumn, length]. */
export function qrRuns(m) {
  const runs = [];
  m.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (!row[c]) { c++; continue; }
      const start = c;
      while (c < row.length && row[c]) c++;
      runs.push([r, start, c - start]);
    }
  });
  return runs;
}
