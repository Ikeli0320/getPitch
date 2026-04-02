// tests/test-key-detector.js
const { detectKey, recommendKey, midiToName, midiToSolfege } = require('../content/key-detector.js');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.error(`  ❌ ${msg}`); failed++; }
}

// midiToName
console.log('Test: midiToName');
assert(midiToName(60) === 'C4', `midiToName(60)='C4' (got ${midiToName(60)})`);
assert(midiToName(74) === 'D5', `midiToName(74)='D5' (got ${midiToName(74)})`);
assert(midiToName(69) === 'A4', `midiToName(69)='A4' (got ${midiToName(69)})`);

// detectKey
console.log('\nTest: detectKey C major');
const cMajor = new Float32Array(12);
[0,2,4,5,7,9,11].forEach(pc => { cMajor[pc] = 1.0; });
const r1 = detectKey(cMajor);
assert(r1.root === 0 && r1.mode === 'major', `C major chroma → C 大調 (got ${r1.name})`);
assert(typeof r1.confidence === 'number' && r1.confidence >= 0 && r1.confidence <= 100,
  `detectKey returns confidence 0–100 (got ${r1.confidence})`);
assert(r1.confidence > 0, `C major clear chroma has confidence > 0 (got ${r1.confidence})`);

console.log('\nTest: detectKey G major');
const gMajor = new Float32Array(12);
[7,9,11,0,2,4,6].forEach(pc => { gMajor[pc] = 1.0; }); // G A B C D E F#
const r2 = detectKey(gMajor);
assert(r2.root === 7 && r2.mode === 'major', `G major chroma → G 大調 (got ${r2.name})`);
assert(r2.confidence > 0, `G major confidence > 0 (got ${r2.confidence})`);

console.log('\nTest: detectKey A harmonic minor');
// Natural minor A B C D E F G = same pcs as C major → profile ambiguous.
// Use harmonic minor (raised 7th G# = pc8) to distinguish from relative major.
const aMinor = new Float32Array(12);
[9,11,0,2,4,5,8].forEach(pc => { aMinor[pc] = 1.0; }); // A B C D E F G#
const r3 = detectKey(aMinor);
assert(r3.root === 9 && r3.mode === 'minor', `A harmonic minor chroma → A 小調 (got ${r3.name})`);
assert(r3.confidence > 0, `A minor confidence > 0 (got ${r3.confidence})`);

// recommendKey
console.log('\nTest: recommendKey — max=D5(74), key=C major → no shift');
const rec1 = recommendKey({ root: 0, mode: 'major' }, 74);
assert(rec1.semitoneShift === 0, `Shift=0 (got ${rec1.semitoneShift})`);
assert(rec1.name === 'C 大調', `Rec=C 大調 (got ${rec1.name})`);

console.log('\nTest: recommendKey — max=F5(77), key=G major → target=E(excluded) → F 大調');
// shift=-3, targetRoot=(7-3+12)%12=4=E(4#,excluded), nearest allowed: F(5,1b) 1st up
const rec2 = recommendKey({ root: 7, mode: 'major' }, 77);
assert(rec2.name === 'F 大調', `Rec=F 大調 (got ${rec2.name})`);

console.log('\nTest: recommendKey — max=B4(71), key=C major → target=Eb(allowed)');
// shift=+3, targetRoot=(0+3)%12=3=Eb(3b,allowed)
const rec3 = recommendKey({ root: 0, mode: 'major' }, 71);
assert(rec3.name === 'Eb 大調', `Rec=Eb 大調 (got ${rec3.name})`);

console.log('\nTest: recommendKey — minor key, max=D5(74), key=A minor → no shift');
const rec4 = recommendKey({ root: 9, mode: 'minor' }, 74);
assert(rec4.semitoneShift === 0, `Minor key shift=0 (got ${rec4.semitoneShift})`);
assert(rec4.name === 'A 小調', `Minor rec=A 小調 (got ${rec4.name})`);

console.log('\nTest: recommendKey — same key, shift=0 → 無需調整 text (semitoneShift=0)');
const rec5 = recommendKey({ root: 0, mode: 'major' }, 62); // C major, max=D4(62), shift=+12 → normalized 0
assert(rec5.semitoneShift === 0, `Large positive shift normalized to 0 (got ${rec5.semitoneShift})`);

console.log('\nTest: recommendKey — null/invalid detectedKey → null (guard)');
assert(recommendKey(null, 74) === null,
  'recommendKey(null, 74) returns null');
assert(recommendKey({ root: 0, mode: 'dorian' }, 74) === null,
  'recommendKey with invalid mode returns null');
assert(recommendKey(undefined, 74) === null,
  'recommendKey(undefined, 74) returns null');

console.log('\nTest: detectKey — all-zero chroma → confidence = 0');
const zeroChroma = new Float32Array(12); // all zeros
const rZero = detectKey(zeroChroma);
assert(typeof rZero === 'object' && rZero !== null,
  'detectKey(zeros) returns an object (Pearson handles zero variance)');
assert(rZero.confidence === 0,
  `detectKey(zeros) confidence = 0 (got ${rZero.confidence})`);

// midiToSolfege
console.log('\nTest: midiToSolfege');
assert(midiToSolfege(74) === '高音Re',   `midiToSolfege(74)='高音Re' (got ${midiToSolfege(74)})`);
assert(midiToSolfege(60) === 'Do',       `midiToSolfege(60)='Do' (got ${midiToSolfege(60)})`);
assert(midiToSolfege(69) === 'La',       `midiToSolfege(69)='La' (got ${midiToSolfege(69)})`);
assert(midiToSolfege(72) === '高音Do',   `midiToSolfege(72)='高音Do' (got ${midiToSolfege(72)})`);
assert(midiToSolfege(48) === '低音Do',   `midiToSolfege(48)='低音Do' (got ${midiToSolfege(48)})`);
assert(midiToSolfege(84) === '超高音Do', `midiToSolfege(84)='超高音Do' (got ${midiToSolfege(84)})`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
