// content/chromagram.js

/**
 * Converts FFT frequency data to a 12-element chromagram.
 * @param {Float32Array} freqData  - dB magnitudes from AnalyserNode.getFloatFrequencyData
 * @param {number} sampleRate     - AudioContext sample rate (Hz)
 * @param {number} fftSize        - AnalyserNode fftSize
 * @returns {Float32Array}        - 12-element pitch-class energy (C=0 … B=11)
 */
// Standard concert pitch — ISO 16 defines A4 = 440 Hz = MIDI note 69.
// Used in the MIDI frequency formula: midi = A4_MIDI + 12·log₂(freq / A4_HZ)
const A4_MIDI = 69;
const A4_HZ   = 440;

// Bins below this dB level are considered near-silence and skipped in the chromagram.
// Looser than content.js NOISE_FLOOR_DB (−55 dB) because chromagram accumulates many
// frames — a relaxed floor captures more spectral detail without amplifying noise.
const CHROMA_NOISE_FLOOR_DB = -80;

// Frequency range for key detection — tighter than content.js FREQ_MAX_HZ (1175 Hz for note
// tracking) because higher harmonics add noise to the chromagram without improving key accuracy.
const CHROMA_FREQ_MIN_HZ = 130;  // C3
const CHROMA_FREQ_MAX_HZ = 1047; // C6

function buildChromagram(freqData, sampleRate, fftSize) {
  const chroma = new Float32Array(12);
  const freqPerBin = sampleRate / fftSize;

  for (let bin = 1; bin < freqData.length; bin++) {
    const dB = freqData[bin];
    if (dB < CHROMA_NOISE_FLOOR_DB) continue; // near-silence

    const freq = bin * freqPerBin;
    if (freq < CHROMA_FREQ_MIN_HZ || freq > CHROMA_FREQ_MAX_HZ) continue; // C3–C6: core harmonic range

    const midi = A4_MIDI + 12 * Math.log2(freq / A4_HZ);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    chroma[pc] += Math.pow(10, dB / 20); // dB → linear magnitude
  }

  return chroma;
}

/**
 * Adds a chroma frame into a running sum in-place.
 * @param {Float32Array} sum   - Accumulator (mutated)
 * @param {Float32Array} frame - Frame to add
 */
function accumulateChroma(sum, frame) {
  for (let i = 0; i < 12; i++) sum[i] += frame[i];
}

// Node.js CommonJS exports — only used by tests/test-chromagram.js, not in browser context
if (typeof module !== 'undefined') module.exports = { buildChromagram, accumulateChroma, CHROMA_FREQ_MIN_HZ, CHROMA_FREQ_MAX_HZ, A4_MIDI, A4_HZ, CHROMA_NOISE_FLOOR_DB };
