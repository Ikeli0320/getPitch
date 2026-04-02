// content/content.js

const KEY_LOCK_MS       = 15000;
const TICK_MS           = 200;
const NOISE_FLOOR_DB    = -55;
const FREQ_MIN_HZ       = 130;
const FREQ_MAX_HZ       = 1175;
const ONSET_TICK_MS     = 50;
const ONSET_HISTORY_MAX = 400; // 20 seconds of onset data

let audioCtx     = null;
let analyserNode = null;
let audioSource  = null;
let tickTimer    = null;
let onsetTimer   = null;

let chromaSum    = new Float32Array(12);
let frameCount   = 0;
let maxMidi      = null;
let detectedKey  = null;
let keyLocked    = false;
let startTime    = null;

// BPM detection state
let onsetHistory    = [];
let prevOnsetData   = null;

// ── Message listener ───────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'start') startAnalysis();
  if (msg.action === 'stop')  stopAnalysis();
});

// ── Public API ─────────────────────────────────────────────────────────────
async function startAnalysis() {
  const video = document.querySelector('video');
  if (!video) {
    _send({ error: '找不到影片元素，請確認影片正在播放' });
    return;
  }

  // Reset state
  chromaSum    = new Float32Array(12);
  frameCount   = 0;
  maxMidi      = null;
  detectedKey  = null;
  keyLocked    = false;
  startTime    = Date.now();
  onsetHistory = [];
  prevOnsetData = null;

  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    if (!audioSource) {
      analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 4096;
      analyserNode.smoothingTimeConstant = 0.3;
      audioSource = audioCtx.createMediaElementSource(video);
      audioSource.connect(analyserNode);
      analyserNode.connect(audioCtx.destination); // Keep audio audible
    }
  } catch (e) {
    _send({ error: '音訊初始化失敗: ' + e.message });
    return;
  }

  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(_tick, TICK_MS);
  if (onsetTimer) clearInterval(onsetTimer);
  onsetTimer = setInterval(_onsetTick, ONSET_TICK_MS);
  _send({ isAnalyzing: true, keyLocked: false, error: null });
}

function stopAnalysis() {
  if (tickTimer)  { clearInterval(tickTimer);  tickTimer  = null; }
  if (onsetTimer) { clearInterval(onsetTimer); onsetTimer = null; }
  _send({ isAnalyzing: false });
}

// ── Tick ───────────────────────────────────────────────────────────────────
function _tick() {
  if (!analyserNode) return;

  const freqData = new Float32Array(analyserNode.frequencyBinCount);
  analyserNode.getFloatFrequencyData(freqData);

  // Accumulate chromagram
  const frame = buildChromagram(freqData, audioCtx.sampleRate, analyserNode.fftSize);
  accumulateChroma(chromaSum, frame);
  frameCount++;

  // Track highest note
  const noteMidi = _findMaxNote(freqData);
  if (noteMidi !== null && (maxMidi === null || noteMidi > maxMidi)) {
    maxMidi = noteMidi;
  }

  const elapsed = Date.now() - startTime;

  // Lock key at 15s
  if (!keyLocked && elapsed >= KEY_LOCK_MS && frameCount > 0) {
    detectedKey = detectKey(chromaSum);
    keyLocked   = true;
  }

  const recommended = (keyLocked && maxMidi !== null)
    ? recommendKey(detectedKey, maxMidi)
    : null;

  _send({
    isAnalyzing: true,
    keyLocked,
    elapsedMs:      elapsed,
    detectedKey:    keyLocked ? detectedKey : null,
    maxNote:        maxMidi !== null ? midiToName(maxMidi) : null,
    maxNoteSolfege: maxMidi !== null ? midiToSolfege(maxMidi) : null,
    recommendedKey: recommended,
    bpm:            _estimateBPM(),
    error:          null,
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────
function _findMaxNote(freqData) {
  const freqPerBin = audioCtx.sampleRate / analyserNode.fftSize;
  let best = null;

  for (let bin = 1; bin < freqData.length - 1; bin++) {
    if (freqData[bin] < NOISE_FLOOR_DB) continue;
    // Local peak only
    if (freqData[bin] < freqData[bin - 1] || freqData[bin] < freqData[bin + 1]) continue;

    const freq = bin * freqPerBin;
    if (freq < FREQ_MIN_HZ || freq > FREQ_MAX_HZ) continue;

    const midi = Math.round(69 + 12 * Math.log2(freq / 440));
    if (best === null || midi > best) best = midi;
  }
  return best;
}

// ── BPM (onset detection) ──────────────────────────────────────────────────
function _onsetTick() {
  if (!analyserNode) return;
  const freqData = new Float32Array(analyserNode.frequencyBinCount);
  analyserNode.getFloatFrequencyData(freqData);

  if (prevOnsetData) {
    // Spectral flux: sum positive differences across all bins
    let onset = 0;
    for (let i = 0; i < freqData.length; i++) {
      const diff = freqData[i] - prevOnsetData[i];
      if (diff > 0) onset += diff;
    }
    onsetHistory.push(onset);
    if (onsetHistory.length > ONSET_HISTORY_MAX) onsetHistory.shift();
  }
  prevOnsetData = freqData;
}

function _estimateBPM() {
  const n = onsetHistory.length;
  if (n < 100) return null; // Need ~5 seconds of data

  const ticksPerSec  = 1000 / ONSET_TICK_MS; // 20
  const minPeriod    = Math.round(ticksPerSec * 60 / 200); // fastest: 200 BPM
  const maxPeriod    = Math.round(ticksPerSec * 60 / 50);  // slowest: 50 BPM

  // Remove DC offset
  const mean = onsetHistory.reduce((a, b) => a + b, 0) / n;
  const norm = onsetHistory.map(v => v - mean);

  let bestPeriod = null, bestCorr = -Infinity;
  for (let p = minPeriod; p <= maxPeriod; p++) {
    let corr = 0;
    const len = n - p;
    for (let i = 0; i < len; i++) corr += norm[i] * norm[i + p];
    corr /= len;
    if (corr > bestCorr) { bestCorr = corr; bestPeriod = p; }
  }

  if (!bestPeriod) return null;
  const bpm = Math.round((ticksPerSec * 60) / bestPeriod);
  return (bpm >= 50 && bpm <= 200) ? bpm : null;
}

function _send(data) {
  chrome.runtime.sendMessage({ action: 'updateResults', data });
}
