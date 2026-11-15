// Draws the PageDock icon as PNGs (needed for iOS/Android home-screen icons) with no image libraries.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function png(size, { rounded, pad }) {
  const s = size / 64;
  const inRR = (x, y, x0, y0, x1, y1, r) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = [0];
    for (let px = 0; px < size; px++) {
      // maskable icons get padding so the art stays inside the safe zone
      const x = ((px + 0.5) / s - 32) / pad + 32, y = ((py + 0.5) / s - 32) / pad + 32;
      let c = [0, 0, 0, 0];
      const bgX = (px + 0.5) / s, bgY = (py + 0.5) / s;
      if (!rounded || inRR(bgX, bgY, 0, 0, 64, 64, 14)) c = [0x32, 0x67, 0xe8, 255];
      if (inRR(x, y, 18, 14, 46, 52, 2) && !(x > 37 && y < 23 && (x - 37) > (y - 14))) c = [255, 255, 255, 255];
      if (x >= 37 && x <= 46 && y >= 14 && y <= 23 && (x - 37) <= (y - 14)) c = [0xdd, 0xe5, 0xf0, 255];
      if (inRR(x, y, 14, 40, 50, 50, 4) || (x >= 14 && x <= 50 && y >= 40 && y <= 44)) c = [0x14, 0xb8, 0xa6, 255];
      row.push(...c);
    }
    rows.push(Buffer.from(row));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
writeFileSync('public/icon-192.png', png(192, { rounded: true, pad: 1 }));
writeFileSync('public/icon-512.png', png(512, { rounded: true, pad: 1 }));
writeFileSync('public/icon-maskable-512.png', png(512, { rounded: false, pad: 0.8 }));
writeFileSync('public/apple-touch-icon.png', png(180, { rounded: false, pad: 0.85 }));
console.log('icons written');
