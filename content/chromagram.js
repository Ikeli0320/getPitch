// content/chromagram.js

/**
 * Converts FFT frequency data to a 12-element chromagram.
 * @param {Float32Array} freqData  - dB magnitudes from AnalyserNode.getFloatFrequencyData
 * @param {number} sampleRate     - AudioContext sample rate (Hz)
 * @param {number} fftSize        - AnalyserNode fftSize
 * @returns {Float32Array}        - 12-element pitch-class energy (C=0 … B=11)
 */
function buildChromagram(freqData, sampleRate, fftSize) {
  const chroma = new Float32Array(12);
  const freqPerBin = sampleRate / fftSize;

  for (let bin = 1; bin < freqData.length; bin++) {
    const dB = freqData[bin];
    if (dB < -80) continue; // near-silence

    const freq = bin * freqPerBin;
    if (freq < 65 || freq > 2093) continue; // C2–C7 singing range

    const midi = 69 + 12 * Math.log2(freq / 440);
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

if (typeof module !== 'undefined') module.exports = { buildChromagram, accumulateChroma };
