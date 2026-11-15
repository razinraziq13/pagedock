/* PageDock: finds the edges of a document in a photo, using OpenCV.js (Apache-2.0).
 * Runs in its own worker so the main page keeps its strict security policy and stays responsive.
 * Edge-finding logic ported from the owner's Prism Scan project. Nothing leaves the device. */
'use strict';

let cvReady = null;

function loadCV() {
  if (cvReady) return cvReady;
  cvReady = new Promise((resolve, reject) => {
    try {
      importScripts('vendor/opencv/opencv.js'); // served by this site, cached for offline use
    } catch (e) {
      cvReady = null;
      reject(new Error('Could not load the edge finder. It downloads once (about 10 MB) and then works offline.'));
      return;
    }
    let done = false;
    const finish = (m) => {
      if (done || !m || !m.Mat) return;
      done = true;
      clearInterval(iv);
      clearTimeout(to);
      resolve({ cv: m }); // wrapped: the OpenCV module is "thenable"
    };
    const c = self.cv;
    const iv = setInterval(() => self.cv && self.cv.Mat && finish(self.cv), 200);
    const to = setTimeout(() => { if (!done) { clearInterval(iv); cvReady = null; reject(new Error('The edge finder took too long to start.')); } }, 90000);
    if (!c) return;
    if (c.Mat) return finish(c);
    if (typeof c.then === 'function') { try { c.then((m) => finish(m)); } catch (e) { /* ignore */ } }
    const prev = c.onRuntimeInitialized;
    c.onRuntimeInitialized = () => { if (prev) prev(); finish(self.cv && self.cv.Mat ? self.cv : c); };
  });
  return cvReady;
}

function matPts(m) {
  const p = [];
  for (let j = 0; j < 4; j++) p.push([m.data32S[j * 2], m.data32S[j * 2 + 1]]);
  return p;
}

function findQuad(cv, edges, minArea, maxArea, mats) {
  const contours = new cv.MatVector(), hier = new cv.Mat();
  mats.push(contours, hier);
  cv.findContours(edges, contours, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
  let best = null, bestA = 0, bigIdx = -1, bigA = 0;
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i);
    const a = cv.contourArea(c);
    if (a < minArea) { c.delete(); continue; }
    if (a > bigA && a < maxArea) { bigA = a; bigIdx = i; }
    const ap = new cv.Mat();
    cv.approxPolyDP(c, ap, 0.02 * cv.arcLength(c, true), true);
    if (ap.rows === 4 && cv.isContourConvex(ap)) {
      const aa = cv.contourArea(ap);
      if (aa > bestA && aa < maxArea) { bestA = aa; best = matPts(ap); }
    }
    ap.delete(); c.delete();
  }
  if (best) return best;
  if (bigIdx >= 0) {
    const c = contours.get(bigIdx), hull = new cv.Mat();
    cv.convexHull(c, hull, false, true);
    const peri = cv.arcLength(hull, true);
    let res = null;
    for (let eps = 0.02; eps <= 0.15 && !res; eps += 0.01) {
      const ap = new cv.Mat();
      cv.approxPolyDP(hull, ap, eps * peri, true);
      if (ap.rows === 4) res = matPts(ap);
      ap.delete();
    }
    hull.delete(); c.delete();
    return res;
  }
  return null;
}

function detectQuad(cv, imageData) {
  const W = imageData.width, H = imageData.height;
  const mats = [], m = (x) => (mats.push(x), x);
  try {
    const src = m(cv.matFromImageData(imageData));
    const gray = m(new cv.Mat()); cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    const blur = m(new cv.Mat()); cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    const k = m(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5)));
    const e1 = m(new cv.Mat()); cv.Canny(blur, e1, 40, 120); cv.dilate(e1, e1, k);
    const e2 = m(new cv.Mat()); cv.threshold(blur, e2, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    cv.morphologyEx(e2, e2, cv.MORPH_CLOSE, k);
    for (const e of [e1, e2]) {
      const q = findQuad(cv, e, W * H * 0.12, W * H * 0.985, mats);
      if (q) return q;
    }
    return null;
  } finally {
    mats.forEach((x) => { try { x.delete(); } catch (e) { /* already freed */ } });
  }
}

self.onmessage = async (e) => {
  const { id, type, imageData } = e.data || {};
  try {
    const { cv } = await loadCV();
    if (type === 'warmup') { self.postMessage({ id, ok: true }); return; }
    self.postMessage({ id, ok: true, quad: detectQuad(cv, imageData) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
