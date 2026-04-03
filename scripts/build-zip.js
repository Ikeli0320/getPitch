// scripts/build-zip.js
// Builds a Chrome Web Store submission ZIP: getPitch-<version>.zip
// Includes only the files Chrome needs; excludes dev/tooling artefacts.
// Run: node scripts/build-zip.js   (or: npm run build:zip)
// No external dependencies — uses Node.js built-in zlib + fs.

'use strict';

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const { version } = require('../manifest.json');
const OUT = path.join(__dirname, '..', `getPitch-${version}.zip`);

// Files and directories to include in the ZIP (relative to repo root)
const INCLUDE = [
  'manifest.json',
  'background/background.js',
  'content/chromagram.js',
  'content/key-detector.js',
  'content/content.js',
  'popup/popup.html',
  'popup/popup.css',
  'popup/popup.js',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png',
  'privacy-policy.html',
];

// ── Minimal ZIP writer (store-only, no compression needed for text; deflate for binary) ──

const ROOT = path.join(__dirname, '..');

/** CRC-32 lookup table */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function u16le(v) { const b = Buffer.allocUnsafe(2); b.writeUInt16LE(v, 0); return b; }
function u32le(v) { const b = Buffer.allocUnsafe(4); b.writeUInt32LE(v >>> 0, 0); return b; }

function dosDateTime() {
  const d = new Date();
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  return { date: date >>> 0, time: time >>> 0 };
}

const entries = [];
const localParts = [];

for (const rel of INCLUDE) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) { console.error(`  ✗ Missing: ${rel}`); process.exit(1); }

  const raw      = fs.readFileSync(full);
  const deflated = zlib.deflateRawSync(raw, { level: 9 });
  // Use deflate only if it actually saves space
  const useDeflate = deflated.length < raw.length;
  const data   = useDeflate ? deflated : raw;
  const method = useDeflate ? 8 : 0;

  const crc    = crc32(raw);
  const name   = Buffer.from(rel.replace(/\\/g, '/'), 'utf8');
  const { date, time } = dosDateTime();

  const localOffset = localParts.reduce((s, p) => s + p.length, 0);

  // Local file header
  const local = Buffer.concat([
    Buffer.from([0x50,0x4B,0x03,0x04]),  // signature
    u16le(20),                            // version needed
    u16le(0),                             // flags
    u16le(method),                        // compression
    u16le(time), u16le(date),
    u32le(crc),
    u32le(data.length),                   // compressed size
    u32le(raw.length),                    // uncompressed size
    u16le(name.length),
    u16le(0),                             // extra length
    name,
    data,
  ]);
  localParts.push(local);

  entries.push({ name, crc, method, compSize: data.length, uncompSize: raw.length, offset: localOffset, date, time });
}

// Central directory
const cdParts = entries.map(e => Buffer.concat([
  Buffer.from([0x50,0x4B,0x01,0x02]),
  u16le(20), u16le(20),
  u16le(0),
  u16le(e.method),
  u16le(e.time), u16le(e.date),
  u32le(e.crc),
  u32le(e.compSize),
  u32le(e.uncompSize),
  u16le(e.name.length),
  u16le(0), u16le(0), u16le(0), u16le(0),
  u32le(0),
  u32le(e.offset),
  e.name,
]));

const localBuf = Buffer.concat(localParts);
const cdBuf    = Buffer.concat(cdParts);
const cdOffset = localBuf.length;
const cdSize   = cdBuf.length;

const eocd = Buffer.concat([
  Buffer.from([0x50,0x4B,0x05,0x06]),
  u16le(0), u16le(0),
  u16le(entries.length), u16le(entries.length),
  u32le(cdSize),
  u32le(cdOffset),
  u16le(0),
]);

fs.writeFileSync(OUT, Buffer.concat([localBuf, cdBuf, eocd]));

const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log(`  ✓  ${path.basename(OUT)}  (${kb} KB, ${entries.length} files)`);
entries.forEach(e => console.log(`     + ${e.name.toString()}`));
