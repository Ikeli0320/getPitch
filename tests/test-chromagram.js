// tests/test-chromagram.js
const { buildChromagram, accumulateChroma } = require('../content/chromagram.js');

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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
