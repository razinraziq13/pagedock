import { describe, it, expect } from 'vitest';
import { applyFilter, applyHomography, homography, orderCorners, rotate90, warp, warpSize, type Pixels, type Pt } from '../src/core/scanimage';

function solid(w: number, h: number, fn: (x: number, y: number) => [number, number, number]): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = fn(x, y), i = (y * w + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  return { width: w, height: h, data };
}
const px = (p: Pixels, x: number, y: number) => Array.from(p.data.slice((y * p.width + x) * 4, (y * p.width + x) * 4 + 3));

describe('corner ordering and homography', () => {
  it('orders any 4 points as TL, TR, BR, BL', () => {
    expect(orderCorners([[90, 95], [10, 5], [5, 90], [100, 10]])).toEqual([[10, 5], [100, 10], [90, 95], [5, 90]]);
  });
  it('maps the corners exactly', () => {
    const from: Pt[] = [[0, 0], [100, 0], [100, 50], [0, 50]];
    const to: Pt[] = [[12, 8], [190, 20], [180, 130], [5, 110]];
    const h = homography(from, to);
    from.forEach((p, i) => {
      const q = applyHomography(h, p);
      expect(q[0]).toBeCloseTo(to[i][0], 6);
      expect(q[1]).toBeCloseTo(to[i][1], 6);
    });
  });
});

describe('perspective warp', () => {
  it('straightens a tilted document: the inside of the quad fills the output', () => {
    // Grey background with a white "page" quadrilateral whose top half is red.
    const quad: Pt[] = [[40, 30], [260, 50], [250, 230], [30, 200]];
    const inside = (x: number, y: number) => {
      // point-in-convex-polygon test
      for (let i = 0; i < 4; i++) {
        const [ax, ay] = quad[i], [bx, by] = quad[(i + 1) % 4];
        if ((bx - ax) * (y - ay) - (by - ay) * (x - ax) < 0) return false;
      }
      return true;
    };
    const src = solid(300, 260, (x, y) => (inside(x, y) ? (y < 120 ? [220, 30, 30] : [250, 250, 250]) : [90, 90, 90]));
    const out = warp(src, quad);
    expect([out.width, out.height]).toEqual([warpSize(quad).width, warpSize(quad).height]);
    // No background grey near the edges, red on top, white at the bottom.
    expect(px(out, 5, 5)[0]).toBeGreaterThan(200);
    expect(px(out, out.width - 6, out.height - 6)).toEqual([250, 250, 250]);
    expect(px(out, Math.floor(out.width / 2), 8)).toEqual([220, 30, 30]);
  });
  it('caps the output size', () => {
    expect(warpSize([[0, 0], [5000, 0], [5000, 3000], [0, 3000]], 2200)).toEqual({ width: 2200, height: 1320 });
  });
});

describe('filters', () => {
  // Paper with an uneven shadow (left darker) and dark text strokes.
  const page = solid(220, 160, (x, y) => {
    const paper = 150 + Math.round((x / 220) * 80); // 150..230
    const ink = y % 40 < 6 && x > 20 && x < 200;
    return ink ? [40, 40, 50] : [paper, paper - 5, paper - 15];
  });
  it('Magic whitens shadowed paper and keeps text dark', () => {
    const m = applyFilter(page, 'magic');
    expect(px(m, 10, 20).every((v) => v >= 235)).toBe(true); // shadowed paper -> white
    expect(px(m, 210, 20).every((v) => v >= 235)).toBe(true);
    expect(px(m, 100, 2)[0]).toBeLessThan(110); // text stays dark
  });
  it('B&W gives pure black text on white paper', () => {
    const b = applyFilter(page, 'bw');
    expect(px(b, 10, 20)).toEqual([255, 255, 255]);
    expect(px(b, 100, 2)).toEqual([0, 0, 0]);
  });
  it('Gray removes colour; Original is unchanged; Vivid boosts saturation', () => {
    const g = px(applyFilter(page, 'gray'), 100, 20);
    expect(g[0]).toBe(g[1]);
    expect(g[1]).toBe(g[2]);
    expect(applyFilter(page, 'original').data).toEqual(page.data);
    const colour = solid(4, 4, () => [180, 120, 100]);
    const v = px(applyFilter(colour, 'vivid'), 1, 1);
    expect(v[0] - v[2]).toBeGreaterThan(80);
  });
  it('does not change the input', () => {
    const copy = page.data.slice();
    applyFilter(page, 'magic');
    expect(page.data).toEqual(copy);
  });
});

describe('rotate90', () => {
  it('rotates clockwise', () => {
    const p = solid(3, 2, (x, y) => [x * 10, y * 10, 0]);
    const r = rotate90(p);
    expect([r.width, r.height]).toEqual([2, 3]);
    expect(px(r, 1, 0)).toEqual([0, 0, 0]); // old top-left -> new top-right
    expect(px(r, 0, 2)).toEqual([20, 10, 0]); // old bottom-right -> new bottom-left
  });
});
