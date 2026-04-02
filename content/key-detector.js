// content/key-detector.js

// Krumhansl-Schmuckler (1990) key profiles — index 0 = tonic
const MAJOR_PROFILE = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
const MINOR_PROFILE = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];

// All 24 keys: root=pitch class (0=C…11=B), acc=sharps(+) / flats(-)
const ALL_KEYS = [
  { root:0,  mode:'major', name:'C 大調',  acc:0  },
  { root:7,  mode:'major', name:'G 大調',  acc:1  },
  { root:2,  mode:'major', name:'D 大調',  acc:2  },
  { root:9,  mode:'major', name:'A 大調',  acc:3  },
  { root:4,  mode:'major', name:'E 大調',  acc:4  },
  { root:11, mode:'major', name:'B 大調',  acc:5  },
  { root:6,  mode:'major', name:'F# 大調', acc:6  },
  { root:1,  mode:'major', name:'Db 大調', acc:-5 },
  { root:8,  mode:'major', name:'Ab 大調', acc:-4 },
  { root:3,  mode:'major', name:'Eb 大調', acc:-3 },
  { root:10, mode:'major', name:'Bb 大調', acc:-2 },
  { root:5,  mode:'major', name:'F 大調',  acc:-1 },
  { root:9,  mode:'minor', name:'A 小調',  acc:0  },
  { root:4,  mode:'minor', name:'E 小調',  acc:1  },
  { root:11, mode:'minor', name:'B 小調',  acc:2  },
  { root:6,  mode:'minor', name:'F# 小調', acc:3  },
  { root:1,  mode:'minor', name:'C# 小調', acc:4  },
  { root:8,  mode:'minor', name:'G# 小調', acc:5  },
  { root:3,  mode:'minor', name:'Eb 小調', acc:-6 },
  { root:2,  mode:'minor', name:'D 小調',  acc:-1 },
  { root:7,  mode:'minor', name:'G 小調',  acc:-2 },
  { root:0,  mode:'minor', name:'C 小調',  acc:-3 },
  { root:5,  mode:'minor', name:'F 小調',  acc:-4 },
  { root:10, mode:'minor', name:'Bb 小調', acc:-5 },
];

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

// Pearson correlation: rotate chroma by rootOffset, compare against profile
function _pearson(chroma, profile, rootOffset) {
  const n = 12;
  let sc = 0, sp = 0;
  for (let i = 0; i < n; i++) { sc += chroma[(i + rootOffset) % 12]; sp += profile[i]; }
  const mc = sc / n, mp = sp / n;
  let num = 0, vc = 0, vp = 0;
  for (let i = 0; i < n; i++) {
    const dc = chroma[(i + rootOffset) % 12] - mc;
    const dp = profile[i] - mp;
    num += dc * dp; vc += dc * dc; vp += dp * dp;
  }
  return (vc === 0 || vp === 0) ? 0 : num / Math.sqrt(vc * vp);
}

/**
 * Detects the most likely key from an accumulated chromagram.
 * @param {Float32Array} chromaSum
 * @returns {{ root, mode, name, acc }}
 */
function detectKey(chromaSum) {
  let best = null, bestCorr = -Infinity;
  for (const key of ALL_KEYS) {
    const prof = key.mode === 'major' ? MAJOR_PROFILE : MINOR_PROFILE;
    const corr = _pearson(chromaSum, prof, key.root);
    if (corr > bestCorr) { bestCorr = corr; best = key; }
  }
  return best;
}

/**
 * Converts a MIDI note number to a note name string (e.g. 74 → "D5").
 * @param {number} midi
 * @returns {string}
 */
function midiToName(midi) {
  const octave = Math.floor(midi / 12) - 1;
  const pc = ((midi % 12) + 12) % 12;
  return NOTE_NAMES[pc] + octave;
}

// Chinese solfège names for each pitch class (0=C … 11=B)
const SOLFEGE_NAMES = ['Do','升Do','Re','升Re','Mi','Fa','升Fa','Sol','升Sol','La','升La','Si'];

/**
 * Converts a MIDI note number to a Chinese solfège description.
 * e.g. 74 (D5) → "高音Re"
 * Octave 3 = 低音, octave 4 = (none), octave 5 = 高音, ≥6 = 超高音
 * @param {number} midi
 * @returns {string}
 */
function midiToSolfege(midi) {
  const octave = Math.floor(midi / 12) - 1;
  const pc = ((midi % 12) + 12) % 12;
  const note = SOLFEGE_NAMES[pc];
  let prefix;
  if (octave <= 2)      prefix = '倍低音';
  else if (octave === 3) prefix = '低音';
  else if (octave === 4) prefix = '';
  else if (octave === 5) prefix = '高音';
  else                   prefix = '超高音';
  return prefix + note;
}

/**
 * Recommends the best key to sing in.
 * - Transposes so highest note ≤ D5 (MIDI 74)
 * - Only considers keys with |acc| ≤ 3
 * - On tie, prefers the key whose root is higher (upward direction)
 *
 * @param {{ root, mode }} detectedKey
 * @param {number} maxMidi  Highest MIDI note detected so far
 * @returns {{ root, mode, name, acc, semitoneShift }}
 */
function recommendKey(detectedKey, maxMidi) {
  const D5 = 74;
  const shift = D5 - maxMidi;
  const targetRoot = ((detectedKey.root + shift) % 12 + 12) % 12;
  const allowed = ALL_KEYS.filter(k => k.mode === detectedKey.mode && Math.abs(k.acc) <= 3);

  const exact = allowed.find(k => k.root === targetRoot);
  if (exact) return { ...exact, semitoneShift: shift };

  let best = null, bestDist = Infinity, bestIsUp = false;
  for (const key of allowed) {
    const upDist   = ((key.root - targetRoot) + 12) % 12;
    const downDist = ((targetRoot - key.root) + 12) % 12;
    const dist = Math.min(upDist, downDist);
    const isUp = upDist <= downDist;
    if (dist < bestDist || (dist === bestDist && isUp && !bestIsUp)) {
      bestDist = dist; best = key; bestIsUp = isUp;
    }
  }

  const actualShift = shift + (bestIsUp ? bestDist : -bestDist);
  return { ...best, semitoneShift: actualShift };
}

if (typeof module !== 'undefined') module.exports = { detectKey, recommendKey, midiToName, midiToSolfege, ALL_KEYS };
