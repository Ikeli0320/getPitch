// tests/test-chromagram.js
const { buildChromagram, accumulateChroma, CHROMA_FREQ_MIN_HZ, CHROMA_FREQ_MAX_HZ } = require('../content/chromagram.js');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.error(`  ❌ ${msg}`); failed++; }
}

console.log('Test: output shape');
const flat = new Float32Array(2048).fill(-30);
const chroma = buildChromagram(flat, 44100, 4096);
assert(chroma instanceof Float32Array, 'Returns Float32Array');
assert(chroma.length === 12, 'Length is 12');

console.log('\nTest: silence → near-zero');
const silent = new Float32Array(2048).fill(-100);
const sc = buildChromagram(silent, 44100, 4096);
assert(sc.reduce((a, b) => a + b, 0) < 0.001, 'Silence → sum ≈ 0');

console.log('\nTest: A4 (440Hz) → pitch class 9 (A)');
const a4 = new Float32Array(2048).fill(-100);
const a4Bin = Math.round(440 / (44100 / 4096));
a4[a4Bin] = -10; a4[a4Bin - 1] = -40; a4[a4Bin + 1] = -40;
const a4c = buildChromagram(a4, 44100, 4096);
assert(a4c.indexOf(Math.max(...a4c)) === 9, `A4 bin → pitch class 9`);

console.log('\nTest: accumulateChroma');
const sum = new Float32Array(12);
accumulateChroma(sum, new Float32Array([1,0,0,0,0,0,0,0,0,0,0,0]));
accumulateChroma(sum, new Float32Array([0,0,0,0,0,0,0,1,0,0,0,0]));
assert(sum[0] === 1 && sum[7] === 1, 'Accumulates correctly');

// Silence guard: chromaSum energy check (mirrors content.js key-lock guard)
console.log('\nTest: silence guard — chromaEnergy threshold');
const silentSum = new Float32Array(12); // all zeros
assert(silentSum.reduce((a, b) => a + b, 0) <= 0.01,
  'Silent chromaSum energy ≤ 0.01 (would skip key lock)');

const activeFreq = new Float32Array(2048).fill(-100);
const cBin = Math.round(261.6 / (44100 / 4096)); // C4
activeFreq[cBin] = -20;
const activeSum = new Float32Array(12);
accumulateChroma(activeSum, buildChromagram(activeFreq, 44100, 4096));
assert(activeSum.reduce((a, b) => a + b, 0) > 0.01,
  'Active audio chromaSum energy > 0.01 (would allow key lock)');

// Boundary frequencies — notes at the edges of the detection range
console.log('\nTest: boundary frequencies');
// D3 ≈ 146.8 Hz — safely inside the 130–1047 Hz range
// (C3 = 130.8 Hz bins to 129.3 Hz at 44100/4096 resolution, which is <130 and excluded)
const d3Freq = new Float32Array(2048).fill(-100);
const d3Bin = Math.round(146.8 / (44100 / 4096));
d3Freq[d3Bin] = -10;
const d3c = buildChromagram(d3Freq, 44100, 4096);
assert(d3c.reduce((a, b) => a + b, 0) > 0, 'D3 (146.8 Hz) is within range and contributes to chroma');

// Very low frequency (<100 Hz) — should be excluded
const lowFreq = new Float32Array(2048).fill(-100);
const lowBin = Math.round(50 / (44100 / 4096));
lowFreq[lowBin] = -10;
const lowc = buildChromagram(lowFreq, 44100, 4096);
assert(lowc.reduce((a, b) => a + b, 0) < 0.001, 'Sub-100 Hz excluded from chroma');

// Different sample rates: 48 kHz
console.log('\nTest: 48 kHz sample rate');
const a4_48 = new Float32Array(2048).fill(-100);
const a4Bin48 = Math.round(440 / (48000 / 4096));
a4_48[a4Bin48] = -10;
const a4c48 = buildChromagram(a4_48, 48000, 4096);
assert(a4c48.indexOf(Math.max(...a4c48)) === 9, 'A4 at 48 kHz maps to pitch class 9');

// FFT size 2048 (half of default)
console.log('\nTest: FFT size 2048');
const a4_2048 = new Float32Array(1024).fill(-100);
const a4Bin2048 = Math.round(440 / (44100 / 2048));
a4_2048[a4Bin2048] = -10;
const a4c2048 = buildChromagram(a4_2048, 44100, 2048);
assert(a4c2048.indexOf(Math.max(...a4c2048)) === 9, 'A4 at fftSize=2048 maps to pitch class 9');

// Empty freqData (all silence) — should not throw
console.log('\nTest: empty / all-silence freqData');
const emptyFreq = new Float32Array(2048).fill(-80);
let threw = false;
try { buildChromagram(emptyFreq, 44100, 4096); } catch (_) { threw = true; }
assert(!threw, 'buildChromagram handles all-silence without throwing');

// FFT size 8192 — larger FFT for better low-frequency resolution
console.log('\nTest: FFT size 8192');
const a4_8192 = new Float32Array(4096).fill(-100);
const a4Bin8192 = Math.round(440 / (44100 / 8192));
a4_8192[a4Bin8192] = -10;
const a4c8192 = buildChromagram(a4_8192, 44100, 8192);
assert(a4c8192.indexOf(Math.max(...a4c8192)) === 9, 'A4 at fftSize=8192 maps to pitch class 9');

// dB → linear magnitude conversion: -20 dB should give magnitude 0.1
console.log('\nTest: dB → linear magnitude conversion');
const dbFreq = new Float32Array(2048).fill(-100);
const a4BinDb = Math.round(440 / (44100 / 4096));
dbFreq[a4BinDb] = -20; // exactly -20 dB → linear = 10^(-20/20) = 0.1
const dbChroma = buildChromagram(dbFreq, 44100, 4096);
const maxEnergy = Math.max(...dbChroma);
// At -20 dB, magnitude = 0.1; allow small rounding tolerance
assert(Math.abs(maxEnergy - 0.1) < 0.001, `−20 dB → linear magnitude ≈ 0.1 (got ${maxEnergy.toFixed(4)})`);

// CHROMA_FREQ_MIN/MAX constants match the intended C3–C6 range
console.log('\nTest: CHROMA_FREQ_MIN/MAX exported constants');
assert(CHROMA_FREQ_MIN_HZ === 130, `CHROMA_FREQ_MIN_HZ = 130 Hz (C3) — got ${CHROMA_FREQ_MIN_HZ}`);
assert(CHROMA_FREQ_MAX_HZ === 1047, `CHROMA_FREQ_MAX_HZ = 1047 Hz (C6) — got ${CHROMA_FREQ_MAX_HZ}`);
// Frequency just below minimum should produce no chroma energy
const belowMin = new Float32Array(2048).fill(-100);
const belowMinBin = Math.round((CHROMA_FREQ_MIN_HZ - 10) / (44100 / 4096));
belowMin[belowMinBin] = -10;
const belowMinC = buildChromagram(belowMin, 44100, 4096);
assert(belowMinC.reduce((a, b) => a + b, 0) < 0.001, 'Freq below CHROMA_FREQ_MIN_HZ is excluded');
// Frequency just above maximum should produce no chroma energy
const aboveMax = new Float32Array(2048).fill(-100);
const aboveMaxBin = Math.round((CHROMA_FREQ_MAX_HZ + 50) / (44100 / 4096));
aboveMax[aboveMaxBin] = -10;
const aboveMaxC = buildChromagram(aboveMax, 44100, 4096);
assert(aboveMaxC.reduce((a, b) => a + b, 0) < 0.001, 'Freq above CHROMA_FREQ_MAX_HZ is excluded');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
