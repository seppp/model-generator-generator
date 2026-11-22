// Line diff (longest common subsequence), used to show changes against the
// published recipe in the browser and to review submissions in Node.
export function lineDiff(a, b) {
  const x = a.split('\n');
  const y = b.split('\n');
  const n = x.length, m = y.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) { out.push([' ', x[i], i + 1]); i++; j++; }
    else if (j < m && (i >= n || lcs[i][j + 1] > lcs[i + 1][j])) { out.push(['+', y[j], j + 1]); j++; }
    else { out.push(['-', x[i], i + 1]); i++; }
  }
  return out;
}

/** Changed lines with two lines of context; gaps are marked with null. */
export function diffHunks(d, context = 2) {
  const show = d.map((_, k) => d.slice(Math.max(0, k - context), k + context + 1).some(([t]) => t !== ' '));
  const out = [];
  let gap = false;
  d.forEach((row, k) => {
    if (!show[k]) { gap = true; return; }
    if (gap && out.length) out.push(null);
    gap = false;
    out.push(row);
  });
  return out;
}
