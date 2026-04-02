// content/content.js

const KEY_LOCK_MS         = 15000;
const TICK_MS             = 200;
const NOISE_FLOOR_DB      = -55;
const FREQ_MIN_HZ         = 130;
const FREQ_MAX_HZ         = 1175;
const ONSET_TICK_MS       = 50;
const ONSET_HISTORY_MAX   = 400; // 20 seconds of onset data
// Frequency band used for BPM onset detection (spectral flux).
// Captures kick drum + bass transients; avoids mids/highs that vary too much by genre.
const ONSET_FREQ_MIN_HZ   = 50;
const ONSET_FREQ_MAX_HZ   = 500;
// If chromaEnergy stays near-zero beyond this threshold, the video is likely
// muted or has no audio track — show an error rather than silently hanging.
const SILENT_TIMEOUT_MS   = 20000;
// BPM autocorrelation search range — songs outside this range are rare in practice.
const BPM_MIN = 60;
const BPM_MAX = 180;

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
let _bpmBuffer      = []; // smoothing: median of last N estimates

// Max-note confirmation: require note to appear in ≥2 of last 3 frames
// before accepting it — prevents single-frame transient spikes from instruments.
const NOTE_WINDOW   = 3;
const NOTE_MIN_HITS = 2;
let _noteWindow     = [];

// ── Detection state reset ──────────────────────────────────────────────────
// Centralised reset used by both startAnalysis() and yt-navigate-finish.
// Callers that need startTime set to Date.now() must do so after this call.
function _resetDetectionState() {
  chromaSum     = new Float32Array(12);
  frameCount    = 0;
  maxMidi       = null;
  detectedKey   = null;
  keyLocked     = false;
  startTime     = null;
  onsetHistory  = [];
  prevOnsetData = null;
  _bpmBuffer    = [];
  _noteWindow   = [];
}

// ── Message listener ───────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'start') startAnalysis();
  if (msg.action === 'stop')  stopAnalysis();
});

// ── Public API ─────────────────────────────────────────────────────────────
async function startAnalysis() {
  // Guard: chromagram.js and key-detector.js must be loaded before this script.
  // If they fail to inject (permissions error, MV3 race), report clearly instead
  // of throwing a cryptic ReferenceError mid-analysis.
  if (typeof buildChromagram !== 'function' || typeof detectKey !== 'function') {
    _send({ isAnalyzing: false, error: '擴充功能載入不完整，請重新整理頁面' });
    return;
  }
  const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
  if (!video || video.readyState < 2) {
    _send({ isAnalyzing: false, error: '找不到影片元素，請確認影片正在播放' });
    return;
  }
  if (video.paused) {
    _send({ isAnalyzing: false, error: '請先播放影片，再開始分析' });
    return;
  }

  // Reset all detection state before starting fresh
  _resetDetectionState();
  startTime = Date.now();

  try {
    // If context was closed (e.g. browser memory pressure), recreate it.
    // A closed AudioContext cannot be resumed — only a new one works.
    if (audioCtx && audioCtx.state === 'closed') {
      audioCtx    = null;
      audioSource = null;   // source belongs to the dead context
      analyserNode = null;  // analyser belongs to the dead context too;
                            // must null it so the !audioSource block below recreates
                            // both together — otherwise audioSource.connect(analyserNode)
                            // would wire the new source into a dead-context analyser
                            // that silently returns -Infinity for all frequency bins.
    }
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    // Guard against stale audioSource pointing to a different video element
    // (e.g. extension loaded mid-video, or missed yt-navigate-finish event).
    if (audioSource && audioSource?.mediaElement !== video) {
      audioSource = null;
    }
    if (!audioSource) {
      analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 4096;
      analyserNode.smoothingTimeConstant = 0.3;
      audioSource = audioCtx.createMediaElementSource(video);
      audioSource.connect(analyserNode);
      analyserNode.connect(audioCtx.destination); // Keep audio audible
    }
  } catch (e) {
    _send({ isAnalyzing: false, error: '音訊初始化失敗: ' + e.message });
    return;
  }

  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(_tick, TICK_MS);
  if (onsetTimer) clearInterval(onsetTimer);
  onsetTimer = setInterval(_onsetTick, ONSET_TICK_MS);
  _send({ isAnalyzing: true, keyLocked: false, error: null });
}

// error is optional — pass a string to include it in the single outgoing message,
// avoiding a redundant { isAnalyzing: false } send followed by a second error send.
function stopAnalysis(error = null) {
  if (tickTimer)  { clearInterval(tickTimer);  tickTimer  = null; }
  if (onsetTimer) { clearInterval(onsetTimer); onsetTimer = null; }
  _send(error ? { isAnalyzing: false, error } : { isAnalyzing: false });
}

// ── Tick ───────────────────────────────────────────────────────────────────
function _tick() {
  if (!audioCtx || !analyserNode) return;
  // Skip processing while video is paused — accumulating chroma from silence
  // degrades key detection accuracy and wastes CPU.
  if (audioSource && audioSource.mediaElement && audioSource.mediaElement.paused) return;

  const freqData = new Float32Array(analyserNode.frequencyBinCount);
  analyserNode.getFloatFrequencyData(freqData);

  // Accumulate chromagram
  const frame = buildChromagram(freqData, audioCtx.sampleRate, analyserNode.fftSize);
  accumulateChroma(chromaSum, frame);
  frameCount++;

  // Track highest note — require ≥2 of last 3 frames to agree before accepting
  const noteMidi = _findMaxNote(freqData);
  _noteWindow.push(noteMidi);
  if (_noteWindow.length > NOTE_WINDOW) _noteWindow.shift();
  const noteCounts = {};
  for (const n of _noteWindow) { if (n !== null) noteCounts[n] = (noteCounts[n] || 0) + 1; }
  const confirmed = Object.keys(noteCounts)
    .filter(n => noteCounts[n] >= NOTE_MIN_HITS)
    .map(Number);
  if (confirmed.length > 0) {
    const top = Math.max(...confirmed);
    if (maxMidi === null || top > maxMidi) maxMidi = top;
  }

  const elapsed = Date.now() - startTime;
  const chromaEnergy = chromaSum.reduce((a, b) => a + b, 0);

  // Silence guard: if audio energy has been near-zero for SILENT_TIMEOUT_MS,
  // the video is likely muted, at OS-level silence, or has no audio track.
  // Stop analysis and show a helpful error instead of hanging indefinitely.
  if (!keyLocked && elapsed >= SILENT_TIMEOUT_MS && chromaEnergy <= 0.01) {
    stopAnalysis('未偵測到音訊，請確認影片未靜音、系統音量已開啟且影片正在播放');
    return;
  }

  // Lock key at 15s — only if sufficient audio energy was observed.
  // A near-zero chromaSum (silent/muted video) would yield an arbitrary key.
  if (!keyLocked && elapsed >= KEY_LOCK_MS && frameCount >= 10) {
    if (chromaEnergy > 0.01) {
      detectedKey = detectKey(chromaSum);
      keyLocked   = true;
    }
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
  if (!audioCtx || !analyserNode) return;
  if (audioSource && audioSource.mediaElement && audioSource.mediaElement.paused) return;
  const freqData = new Float32Array(analyserNode.frequencyBinCount);
  analyserNode.getFloatFrequencyData(freqData);

  if (prevOnsetData) {
    // Spectral flux: positive dB differences in low-mid range (50–500 Hz)
    // This range captures kick drum and bass transients — most reliable for BPM
    const freqPerBin = audioCtx.sampleRate / analyserNode.fftSize;
    let onset = 0;
    for (let i = 1; i < freqData.length; i++) {
      const freq = i * freqPerBin;
      if (freq < ONSET_FREQ_MIN_HZ || freq > ONSET_FREQ_MAX_HZ) continue;
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
  const minPeriod    = Math.round(ticksPerSec * 60 / BPM_MAX); // period for BPM_MAX (fastest)
  const maxPeriod    = Math.round(ticksPerSec * 60 / BPM_MIN); // period for BPM_MIN (slowest)

  // Remove DC offset
  const mean = onsetHistory.reduce((a, b) => a + b, 0) / n;
  const norm = onsetHistory.map(v => v - mean);

  let bestPeriod = null, bestCorr = -Infinity;
  for (let p = minPeriod; p <= maxPeriod; p++) {
    const len = n - p;
    if (len <= 0) continue; // guard: skip if history too short for this period
    let corr = 0;
    for (let i = 0; i < len; i++) corr += norm[i] * norm[i + p];
    corr /= len;
    if (corr > bestCorr) { bestCorr = corr; bestPeriod = p; }
  }

  if (!bestPeriod) return null;
  const bpm = Math.round((ticksPerSec * 60) / bestPeriod);
  if (bpm < BPM_MIN || bpm > BPM_MAX) return null;

  // Median filter over last 5 estimates to prevent flickering
  _bpmBuffer.push(bpm);
  if (_bpmBuffer.length > 5) _bpmBuffer.shift();
  const sorted = [..._bpmBuffer].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function _send(data) {
  // sendMessage throws if the receiving end (background) is not available.
  chrome.runtime.sendMessage({ action: 'updateResults', data }).catch(e => {
    // Log to DevTools console for debugging — not visible to users.
    console.debug('[getPitch] updateResults failed:', e?.message);
  });
}

// ── Auto-reset on YouTube SPA navigation ───────────────────────────────────
// YouTube fires 'yt-navigate-finish' on document after each SPA video change.
document.addEventListener('yt-navigate-finish', () => {
  if (tickTimer || onsetTimer) {
    // Analysis was running — stop timers
    if (tickTimer)  { clearInterval(tickTimer);  tickTimer  = null; }
    if (onsetTimer) { clearInterval(onsetTimer); onsetTimer = null; }
  }

  // If YouTube replaced the <video> element, the old audioSource is stale.
  // Reset it so startAnalysis() reconnects to the new element.
  const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
  if (audioSource && (!video || audioSource?.mediaElement !== video)) {
    audioSource = null;
  }

  // Reset all detection state (new video = fresh start)
  _resetDetectionState();

  chrome.runtime.sendMessage({ action: 'resetState' }).catch(() => {});
});
