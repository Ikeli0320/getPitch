// scripts/generate-icons.js
// Run: node scripts/generate-icons.js
// Generates icons/icon16.png, icon48.png, icon128.png
// No external dependencies — pure Node.js (uses built-in zlib for PNG compression)

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── Minimal PNG encoder ────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const b = Buffer.alloc(4 + 4 + data.length + 4);
  b.writeUInt32BE(data.length, 0);
  b.write(type, 4, 'ascii');
  data.copy(b, 8);
  b.writeUInt32BE(crc32(b.slice(4, 8 + data.length)), 8 + data.length);
  return b;
}

function encodePNG(width, height, rgba) {
  const sig  = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); ihdr.writeUInt8(6, 9); // 8-bit RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter=None
    for (let x = 0; x < width; x++) {
      const o = y * (1 + width * 4) + 1 + x * 4;
      const s = (y * width + x) * 4;
      raw[o] = rgba[s]; raw[o+1] = rgba[s+1]; raw[o+2] = rgba[s+2]; raw[o+3] = rgba[s+3];
    }
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ── Pixel helpers ──────────────────────────────────────────────────────────

function makePixels(size) { return new Uint8Array(size * size * 4); }

function setPixel(buf, size, x, y, r, g, b, a = 255) {
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const i = (y * size + x) * 4;
  buf[i] = r; buf[i+1] = g; buf[i+2] = b; buf[i+3] = a;
}

function fillRect(buf, size, x0, y0, w, h, r, g, b, a = 255) {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++)
      setPixel(buf, size, x, y, r, g, b, a);
}

function fillEllipse(buf, size, cx, cy, rx, ry, r, g, b, a = 255) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) setPixel(buf, size, x, y, r, g, b, a);
    }
}

function fillRoundRect(buf, size, x0, y0, w, h, radius, r, g, b, a = 255) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      // Check corner circles
      let inside = true;
      const corners = [
        [x0 + radius, y0 + radius],
        [x0 + w - 1 - radius, y0 + radius],
        [x0 + radius, y0 + h - 1 - radius],
        [x0 + w - 1 - radius, y0 + h - 1 - radius],
      ];
      if (x < x0 + radius && y < y0 + radius) {
        const dx = x - corners[0][0], dy = y - corners[0][1];
        inside = dx * dx + dy * dy <= radius * radius;
      } else if (x >= x0 + w - radius && y < y0 + radius) {
        const dx = x - corners[1][0], dy = y - corners[1][1];
        inside = dx * dx + dy * dy <= radius * radius;
      } else if (x < x0 + radius && y >= y0 + h - radius) {
        const dx = x - corners[2][0], dy = y - corners[2][1];
        inside = dx * dx + dy * dy <= radius * radius;
      } else if (x >= x0 + w - radius && y >= y0 + h - radius) {
        const dx = x - corners[3][0], dy = y - corners[3][1];
        inside = dx * dx + dy * dy <= radius * radius;
      }
      if (inside) setPixel(buf, size, x, y, r, g, b, a);
    }
  }
}

// ── Icon drawing ───────────────────────────────────────────────────────────

function drawIcon(size) {
  const buf = makePixels(size);
  const s = size / 128; // scale factor

  // Background: rounded square, dark navy #1a1a2e
  fillRoundRect(buf, size, 0, 0, size, size, Math.round(20 * s), 26, 26, 46, 255);

  // Note head: tilted ellipse approximated as ellipse, #4a90e2 blue
  const hcx = Math.round(52 * s), hcy = Math.round(88 * s);
  const hrx = Math.round(22 * s), hry = Math.round(15 * s);
  fillEllipse(buf, size, hcx, hcy, hrx, hry, 74, 144, 226);

  // Stem: right edge of ellipse upward
  const stemX = Math.round(72 * s);
  const stemTop = Math.round(28 * s), stemBot = Math.round(88 * s);
  const stemW = Math.max(2, Math.round(4 * s));
  fillRect(buf, size, stemX, stemTop, stemW, stemBot - stemTop, 74, 144, 226);

  // Flag (eighth-note flag): curve from stem top rightward
  // Approximate with two arcs of small ellipses
  if (size >= 48) {
    const fx = stemX + stemW;
    const fy0 = stemTop;
    for (let t = 0; t <= 1; t += 0.01) {
      // Cubic bezier: P0=(fx,fy0) P1=(fx+20s,fy0+8s) P2=(fx+18s,fy0+20s) P3=(fx+6s,fy0+28s)
      const p0x = fx,              p0y = fy0;
      const p1x = fx + 20 * s,    p1y = fy0 + 8  * s;
      const p2x = fx + 18 * s,    p2y = fy0 + 20 * s;
      const p3x = fx + 6  * s,    p3y = fy0 + 28 * s;
      const u = 1 - t;
      const bx = u*u*u*p0x + 3*u*u*t*p1x + 3*u*t*t*p2x + t*t*t*p3x;
      const by = u*u*u*p0y + 3*u*u*t*p1y + 3*u*t*t*p2y + t*t*t*p3y;
      fillEllipse(buf, size, Math.round(bx), Math.round(by),
        Math.max(1, Math.round(2.5 * s)), Math.max(1, Math.round(2.5 * s)), 74, 144, 226);
    }
  }

  return buf;
}

// ── Generate all sizes ─────────────────────────────────────────────────────

const sizes = [16, 32, 48, 128];
const outDir = path.join(__dirname, '..', 'icons');

for (const size of sizes) {
  const pixels = drawIcon(size);
  const png = encodePNG(size, size, pixels);
  const out = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(out, png);
  console.log(`✅ icons/icon${size}.png (${png.length} bytes)`);
}

console.log('\nDone! Icons saved to icons/');
