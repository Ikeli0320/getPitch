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
// Minimum onset samples before attempting BPM autocorrelation.
// At ONSET_TICK_MS=50ms (20 ticks/sec), 5 s × 20 ticks = 100 samples.
const BPM_ONSET_MIN_SAMPLES = Math.round(1000 / ONSET_TICK_MS * 5);
// AnalyserNode configuration — tuned for ~200ms accuracy at pop/rock tempo resolution.
const FFT_SIZE         = 4096; // frequency bins; higher = better low-freq resolution
const SMOOTHING_CONSTANT = 0.3; // time averaging: 0=instant, 1=maximum smoothing
// Minimum chromagram energy to consider audio "present" (guards against silent/muted video).
// Value is empirically derived: real music yields ~0.1–10+; silence/mute yields <0.001.
const CHROMA_ENERGY_THRESHOLD = 0.01;
// Minimum frames before the key can lock — prevents locking on startup transients.
// At TICK_MS=200ms, 10 frames = 2 s of audio minimum before the 15 s lock window expires.
const MIN_FRAMES_FOR_KEY_LOCK = 10;

let audioCtx     = null;
let analyserNode = null;
let audioSource  = null;
let tickTimer    = null;
let onsetTimer   = null;

// Reusable frequency data buffers — allocated once per analysis session when
// analyserNode is created, then refilled in-place each tick to avoid GC pressure.
// Must be reset to null whenever analyserNode is torn down (closed context, etc.)
let _freqBuf     = null; // for _tick()
let _onsetBuf    = null; // for _onsetTick()

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
  chromaSum.fill(0); // reuse existing buffer — avoids per-reset allocation
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
// Initialises (or reuses) AudioContext + AnalyserNode + MediaElementSource for video.
// Returns null on success, or an error string if setup fails.
async function _setupAudioGraph(video) {
  // If context was closed (e.g. browser memory pressure), recreate everything.
  // A closed AudioContext cannot be resumed — only a new one works.
  if (audioCtx && audioCtx.state === 'closed') {
    audioCtx = null; audioSource = null; analyserNode = null;
    _freqBuf = null; _onsetBuf = null; // buffers belong to the old analyser's bin count
  }
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') await audioCtx.resume();

  // Guard against stale audioSource pointing to a different video element
  // (e.g. extension loaded mid-video, or missed yt-navigate-finish event).
  if (audioSource && audioSource?.mediaElement !== video) audioSource = null;

  if (!audioSource) {
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = FFT_SIZE;
    analyserNode.smoothingTimeConstant = SMOOTHING_CONSTANT;
    audioSource = audioCtx.createMediaElementSource(video);
    audioSource.connect(analyserNode);
    analyserNode.connect(audioCtx.destination); // Keep audio audible
    // Allocate reusable buffers sized to this analyser's bin count
    _freqBuf  = new Float32Array(analyserNode.frequencyBinCount);
    _onsetBuf = new Float32Array(analyserNode.frequencyBinCount);
  }
  return null; // success
}

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

  _resetDetectionState();
  startTime = Date.now();

  try {
    await _setupAudioGraph(video);
  } catch (e) {
    _send({ isAnalyzing: false, error: '音訊初始化失敗: ' + e.message });
    return;
  }

  if (tickTimer)  clearInterval(tickTimer);
  tickTimer  = setInterval(_tick, TICK_MS);
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

// Updates maxMidi using a rolling confirmation window (≥NOTE_MIN_HITS of last NOTE_WINDOW frames).
// Prevents single-frame transient spikes from instruments being accepted as the highest note.
function _updateMaxNote(freqData) {
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
}

// ── Tick ───────────────────────────────────────────────────────────────────
function _tick() {
  if (!audioCtx || !analyserNode || !_freqBuf) return;
  // Skip processing while video is paused — accumulating chroma from silence
  // degrades key detection accuracy and wastes CPU.
  if (audioSource && audioSource.mediaElement && audioSource.mediaElement.paused) return;

  analyserNode.getFloatFrequencyData(_freqBuf);

  // Accumulate chromagram
  const frame = buildChromagram(_freqBuf, audioCtx.sampleRate, analyserNode.fftSize);
  accumulateChroma(chromaSum, frame);
  frameCount++;

  // Track highest note (confirmation window handled in _updateMaxNote)
  _updateMaxNote(_freqBuf);

  const elapsed = Date.now() - startTime;
  const chromaEnergy = chromaSum.reduce((a, b) => a + b, 0);

  // Silence guard: if audio energy has been near-zero for SILENT_TIMEOUT_MS,
  // the video is likely muted, at OS-level silence, or has no audio track.
  // Stop analysis and show a helpful error instead of hanging indefinitely.
  if (!keyLocked && elapsed >= SILENT_TIMEOUT_MS && chromaEnergy <= CHROMA_ENERGY_THRESHOLD) {
    stopAnalysis('未偵測到音訊，請確認影片未靜音、系統音量已開啟且影片正在播放');
    return;
  }

  // Lock key at 15s — only if sufficient audio energy was observed.
  // A near-zero chromaSum (silent/muted video) would yield an arbitrary key.
  // MIN_FRAMES_FOR_KEY_LOCK: at TICK_MS=200ms, 10 frames = 2 s minimum before the 15 s window expires
  if (!keyLocked && elapsed >= KEY_LOCK_MS && frameCount >= MIN_FRAMES_FOR_KEY_LOCK) {
    if (chromaEnergy > CHROMA_ENERGY_THRESHOLD) {
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

    const midi = Math.round(A4_MIDI + 12 * Math.log2(freq / A4_HZ)); // A4_MIDI/A4_HZ defined in chromagram.js
    if (best === null || midi > best) best = midi;
  }
  return best;
}

// ── BPM (onset detection) ──────────────────────────────────────────────────
function _onsetTick() {
  if (!audioCtx || !analyserNode || !_onsetBuf) return;
  if (audioSource && audioSource.mediaElement && audioSource.mediaElement.paused) return;
  analyserNode.getFloatFrequencyData(_onsetBuf);

  if (prevOnsetData) {
    // Spectral flux: positive dB differences in low-mid range (50–500 Hz)
    // This range captures kick drum and bass transients — most reliable for BPM
    const freqPerBin = audioCtx.sampleRate / analyserNode.fftSize;
    let onset = 0;
    for (let i = 1; i < _onsetBuf.length; i++) {
      const freq = i * freqPerBin;
      if (freq < ONSET_FREQ_MIN_HZ || freq > ONSET_FREQ_MAX_HZ) continue;
      const diff = _onsetBuf[i] - prevOnsetData[i];
      if (diff > 0) onset += diff;
    }
    onsetHistory.push(onset);
    if (onsetHistory.length > ONSET_HISTORY_MAX) onsetHistory.shift();
  }
  // Copy current frame into prevOnsetData for next tick's flux calculation
  if (!prevOnsetData || prevOnsetData.length !== _onsetBuf.length) {
    prevOnsetData = new Float32Array(_onsetBuf);
  } else {
    prevOnsetData.set(_onsetBuf);
  }
}

function _estimateBPM() {
  const n = onsetHistory.length;
  if (n < BPM_ONSET_MIN_SAMPLES) return null; // Need ~5 seconds of data

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

  // No periodic signal found: bestCorr ≤ 0 means all norm[] values were identical
  // (e.g. sustained chord with no detectable beats) — return null rather than a spurious BPM.
  if (!bestPeriod || bestCorr <= 0) return null;
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
