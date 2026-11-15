export type DiffOp = { type: 'same' | 'del' | 'add'; text: string };

/**
 * Line diff using the Myers O(ND) algorithm. 'del' lines are only in A, 'add' lines only in B.
 * `maxEdits` bounds work on very different documents; past it, the rest is reported as replaced.
 */
export function diffLines(a: string[], b: string[], maxEdits = 4000): DiffOp[] {
  const n = a.length, m = b.length, max = Math.min(n + m, maxEdits);
  const v = new Map<number, number>([[1, 0]]);
  const trace: Map<number, number>[] = [];
  let found = false;
  outer: for (let d = 0; d <= max; d++) {
    trace.push(new Map(v));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1)) ? (v.get(k + 1) ?? 0) : (v.get(k - 1) ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v.set(k, x);
      if (x >= n && y >= m) { found = true; trace.push(new Map(v)); break outer; }
    }
  }
  if (!found) {
    // Too different to diff in reasonable time: show everything as replaced.
    return [...a.map((text): DiffOp => ({ type: 'del', text })), ...b.map((text): DiffOp => ({ type: 'add', text }))];
  }
  // Backtrack
  const ops: DiffOp[] = [];
  let x = n, y = m;
  for (let d = trace.length - 2; d >= 0 && (x > 0 || y > 0); d--) {
    const vd = trace[d];
    const k = x - y;
    const prevK = k === -d || (k !== d && (vd.get(k - 1) ?? -1) < (vd.get(k + 1) ?? -1)) ? k + 1 : k - 1;
    const prevX = vd.get(prevK) ?? 0;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) { ops.push({ type: 'same', text: a[x - 1] }); x--; y--; }
    if (d === 0) break;
    if (x === prevX) { ops.push({ type: 'add', text: b[y - 1] }); y--; }
    else { ops.push({ type: 'del', text: a[x - 1] }); x--; }
  }
  while (x > 0 && y > 0) { ops.push({ type: 'same', text: a[x - 1] }); x--; y--; }
  return ops.reverse();
}

export function diffSummary(ops: DiffOp[]) {
  return {
    same: ops.filter((o) => o.type === 'same').length,
    removed: ops.filter((o) => o.type === 'del').length,
    added: ops.filter((o) => o.type === 'add').length,
  };
}
