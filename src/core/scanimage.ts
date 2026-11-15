/**
 * Document-scan image maths, ported from the owner's Prism Scan project.
 * Pure functions on RGBA pixel arrays, so they run (and are tested) without a browser.
 */

export type Pt = [number, number];

export interface Pixels {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel */
  data: Uint8ClampedArray;
}

export const FILTERS = [
  ['magic', 'Magic'],
  ['original', 'Original'],
  ['gray', 'Gray'],
  ['bw', 'B&W'],
  ['vivid', 'Vivid'],
] as const;
export type FilterName = (typeof FILTERS)[number][0];

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Order four points as [top-left, top-right, bottom-right, bottom-left]. */
export function orderCorners(pts: Pt[]): Pt[] {
  const cx = pts.reduce((s, p) => s + p[0], 0) / 4, cy = pts.reduce((s, p) => s + p[1], 0) / 4;
  const sorted = pts.slice().sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  let start = 0;
  sorted.forEach((p, i) => { if (p[0] + p[1] < sorted[start][0] + sorted[start][1]) start = i; });
  return sorted.slice(start).concat(sorted.slice(0, start)).map((p) => [p[0], p[1]] as Pt);
}

/** Solve A·x = b by Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    [b[i], b[p]] = [b[p], b[i]];
    const piv = A[i][i] || 1e-12;
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / piv;
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const x = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c];
    x[i] = s / (A[i][i] || 1e-12);
  }
  return x;
}

/** 8 coefficients of the projective transform taking `from[i]` to `to[i]`. */
export function homography(from: Pt[], to: Pt[]): number[] {
  const A: number[][] = [], b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i], [u, v] = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  return solve(A, b);
}

export function applyHomography(h: number[], [x, y]: Pt): Pt {
  const d = h[6] * x + h[7] * y + 1;
  return [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d];
}

/** Output size for straightening `quad` (TL, TR, BR, BL), capped at `maxSide` pixels. */
export function warpSize(quad: Pt[], maxSide = 2200): { width: number; height: number } {
  const [tl, tr, br, bl] = quad;
  let W = Math.max(dist(tl, tr), dist(bl, br)), H = Math.max(dist(tl, bl), dist(tr, br));
  const s = Math.min(1, maxSide / Math.max(W, H));
  W = Math.max(8, Math.round(W * s)); H = Math.max(8, Math.round(H * s));
  return { width: W, height: H };
}

/** Perspective-correct the quadrilateral `quad` of `src` into a flat rectangle (bilinear sampling). */
export function warp(src: Pixels, quad: Pt[], maxSide = 2200): Pixels {
  const { width: W, height: H } = warpSize(quad, maxSide);
  const h = homography([[0, 0], [W, 0], [W, H], [0, H]], quad);
  const sw = src.width, sh = src.height, sd = src.data;
  const out = new Uint8ClampedArray(W * H * 4);
  const mx = sw - 1.001, my = sh - 1.001, row = sw * 4;
  let o = 0;
  for (let y = 0; y < H; y++) {
    const yy = y + 0.5;
    for (let x = 0; x < W; x++) {
      const xx = x + 0.5;
      const den = h[6] * xx + h[7] * yy + 1;
      let sx = (h[0] * xx + h[1] * yy + h[2]) / den - 0.5;
      let sy = (h[3] * xx + h[4] * yy + h[5]) / den - 0.5;
      sx = sx < 0 ? 0 : sx > mx ? mx : sx;
      sy = sy < 0 ? 0 : sy > my ? my : sy;
      const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + row, i11 = i01 + 4;
      for (let c = 0; c < 3; c++) {
        const t = sd[i00 + c] + (sd[i10 + c] - sd[i00 + c]) * fx;
        const bt = sd[i01 + c] + (sd[i11 + c] - sd[i01 + c]) * fx;
        out[o + c] = t + (bt - t) * fy;
      }
      out[o + 3] = 255;
      o += 4;
    }
  }
  return { width: W, height: H, data: out };
}

/** Box-filter mean of `a` with radius r, via an integral image. */
function localMean(a: Uint8ClampedArray, w: number, h: number, r: number): Float32Array {
  const W = w + 1, I = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += a[y * w + x];
      I[(y + 1) * W + x + 1] = I[y * W + x + 1] + rowSum;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      out[y * w + x] = (I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0]) / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

/**
 * Document filters. Magic/Gray/B&W divide by the local background brightness, which whitens paper
 * and evens out shadows; Vivid boosts colour and contrast. Returns a new pixel buffer.
 */
export function applyFilter(src: Pixels, name: FilterName): Pixels {
  const w = src.width, h = src.height, n = w * h;
  const d = new Uint8ClampedArray(src.data);
  if (name === 'original') return { width: w, height: h, data: d };
  if (name === 'vivid') {
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      for (let c = 0; c < 3; c++) d[i + c] = (l + (d[i + c] - l) * 1.6 - 128) * 1.15 + 134;
    }
    return { width: w, height: h, data: d };
  }
  const lum = new Uint8ClampedArray(n);
  for (let j = 0, i = 0; j < n; j++, i += 4) lum[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const mean = localMean(lum, w, h, Math.max(6, Math.round(Math.max(w, h) / 22)));
  for (let j = 0, i = 0; j < n; j++, i += 4) {
    const m = Math.max(mean[j], 24), l = lum[j];
    if (name === 'magic') {
      const f = 245 / m;
      for (let c = 0; c < 3; c++) d[i + c] = (d[i + c] * f - 140) * 1.35 + 140;
    } else if (name === 'gray') {
      d[i] = d[i + 1] = d[i + 2] = ((l * 240) / m - 140) * 1.25 + 140;
    } else {
      d[i] = d[i + 1] = d[i + 2] = ((l / m - 0.72) / 0.2) * 255;
    }
  }
  return { width: w, height: h, data: d };
}

/** Rotate pixels 90° clockwise. */
export function rotate90(src: Pixels): Pixels {
  const { width: w, height: h, data } = src;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = (y * w + x) * 4, nx = h - 1 - y, ny = x, di = (ny * h + nx) * 4;
    out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2]; out[di + 3] = data[si + 3];
  }
  return { width: h, height: w, data: out };
}
