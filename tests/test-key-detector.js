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

console.log('\nTest: detectKey G major');
const gMajor = new Float32Array(12);
[7,9,11,0,2,4,6].forEach(pc => { gMajor[pc] = 1.0; }); // G A B C D E F#
const r2 = detectKey(gMajor);
assert(r2.root === 7 && r2.mode === 'major', `G major chroma → G 大調 (got ${r2.name})`);

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
