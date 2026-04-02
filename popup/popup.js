// popup/popup.js

const KEY_LOCK_MS = 15000;

const ALLOWED_KEY_NAMES = [
  'C 大調','G 大調','D 大調','A 大調',
  'F 大調','Bb 大調','Eb 大調',
  'A 小調','E 小調','B 小調','F# 小調',
  'D 小調','G 小調','C 小調',
];

let _isAnalyzing     = false;
let _showDetail      = false;
let _transposeOffset = 0;
let _lastState       = null;

// Allowed keys for transpose adjustment (same list as key-detector.js)
const _ALLOWED_KEYS = [
  { root:0,  mode:'major', name:'C 大調',  acc:0  },
  { root:7,  mode:'major', name:'G 大調',  acc:1  },
  { root:2,  mode:'major', name:'D 大調',  acc:2  },
  { root:9,  mode:'major', name:'A 大調',  acc:3  },
  { root:5,  mode:'major', name:'F 大調',  acc:-1 },
  { root:10, mode:'major', name:'Bb 大調', acc:-2 },
  { root:3,  mode:'major', name:'Eb 大調', acc:-3 },
  { root:9,  mode:'minor', name:'A 小調',  acc:0  },
  { root:4,  mode:'minor', name:'E 小調',  acc:1  },
  { root:11, mode:'minor', name:'B 小調',  acc:2  },
  { root:6,  mode:'minor', name:'F# 小調', acc:3  },
  { root:2,  mode:'minor', name:'D 小調',  acc:-1 },
  { root:7,  mode:'minor', name:'G 小調',  acc:-2 },
  { root:0,  mode:'minor', name:'C 小調',  acc:-3 },
];

document.addEventListener('DOMContentLoaded', async () => {
  // Populate allowed-keys chips once
  const allowedEl = document.getElementById('d-allowed');
  ALLOWED_KEY_NAMES.forEach(name => {
    const el = document.createElement('span');
    el.className = 'chip';
    el.textContent = name;
    allowedEl.appendChild(el);
  });

  // Check if we're on a YouTube watch page
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes('youtube.com/watch')) {
    _showMsg('請前往 YouTube 播放歌曲後使用');
    document.getElementById('start-btn').disabled = true;
    return;
  }

  // Show song title (strip " - YouTube" suffix from tab title)
  const songTitle = (tab.title || '').replace(/\s*[-–]\s*YouTube\s*$/, '').trim();
  if (songTitle) {
    document.getElementById('song-title').textContent = songTitle;
    document.getElementById('song-title-bar').classList.remove('hidden');
  }

  // Load latest state from background
  const state = await chrome.runtime.sendMessage({ action: 'getState' });
  if (state) { _lastState = state; _updateUI(state); }

  // Button: start / stop
  document.getElementById('start-btn').addEventListener('click', () => {
    if (_isAnalyzing) {
      chrome.runtime.sendMessage({ action: 'stopAnalysis' });
    } else {
      chrome.runtime.sendMessage({ action: 'startAnalysis' });
    }
  });

  // Button: detail toggle
  document.getElementById('detail-btn').addEventListener('click', () => {
    _showDetail = !_showDetail;
    document.getElementById('detail-section').classList.toggle('hidden', !_showDetail);
    document.getElementById('detail-btn').textContent = _showDetail ? '簡略 ▲' : '詳細 ▼';
  });

  // Live updates via storage
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.getPitchState) {
      _lastState = changes.getPitchState.newValue;
      _updateUI(_lastState);
    }
  });

  // Transpose slider
  document.getElementById('transpose-slider').addEventListener('input', (e) => {
    _transposeOffset = parseInt(e.target.value, 10);
    const label = _transposeOffset === 0 ? '0'
      : (_transposeOffset > 0 ? `+${_transposeOffset}` : `${_transposeOffset}`);
    document.getElementById('transpose-value').textContent = label;
    if (_lastState) _updateUI(_lastState);
  });
});

// ── Transpose adjustment ───────────────────────────────────────────────────
// Applies _transposeOffset semitones to a recommended key, staying within allowed list.
function _getAdjustedKey(baseKey) {
  if (!baseKey || _transposeOffset === 0) return baseKey;
  const newRoot = ((baseKey.root + _transposeOffset) % 12 + 12) % 12;
  const pool = _ALLOWED_KEYS.filter(k => k.mode === baseKey.mode);

  const exact = pool.find(k => k.root === newRoot);
  if (exact) return { ...exact, semitoneShift: (baseKey.semitoneShift || 0) + _transposeOffset };

  // Find nearest in allowed pool
  let best = null, bestDist = Infinity, bestIsUp = false;
  for (const k of pool) {
    const up   = ((k.root - newRoot) + 12) % 12;
    const down = ((newRoot - k.root) + 12) % 12;
    const dist = Math.min(up, down);
    const isUp = up <= down;
    if (dist < bestDist || (dist === bestDist && isUp && !bestIsUp)) {
      bestDist = dist; best = k; bestIsUp = isUp;
    }
  }
  const extra = bestIsUp ? bestDist : -bestDist;
  return { ...best, semitoneShift: (baseKey.semitoneShift || 0) + _transposeOffset + extra };
}

// ── Key signature staff SVG ────────────────────────────────────────────────
// Staff: 5 lines, spacing 8px, top line y=8. Positions use treble clef layout.
// Sharp order: F C G D A E B  (each position = note's staff y-coordinate)
// Flat order:  B E A D G C F
const _SHARP_Y = [8, 20, 4, 16, 28, 12, 24];
const _FLAT_Y  = [24, 12, 28, 16, 32, 20, 36];

function _renderKeySigSVG(acc) {
  const count   = Math.abs(acc);
  const isSharp = acc > 0;
  const yArr    = isSharp ? _SHARP_Y.slice(0, count) : _FLAT_Y.slice(0, count);
  const sym     = isSharp ? '♯' : '♭';

  const LINES = [8, 16, 24, 32, 40];
  const H = 50, ACC_W = 12, GAP = 2, PAD = 4;
  const W = Math.max(PAD + count * (ACC_W + GAP) + PAD, 36);

  const lines = LINES.map(y =>
    `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#4a4a6a" stroke-width="0.8"/>`
  ).join('');

  const accs = yArr.map((y, i) => {
    const x = PAD + i * (ACC_W + GAP) + ACC_W * 0.5;
    return `<text x="${x}" y="${y}" font-size="15" fill="#cce0ff" font-family="serif" ` +
           `text-anchor="middle" dominant-baseline="central">${sym}</text>`;
  }).join('');

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${lines}${accs}</svg>`;
}

function _showMsg(text) {
  const bar = document.getElementById('msg-bar');
  bar.textContent = text;
  bar.classList.remove('hidden');
}

function _updateUI(state) {
  if (!state) return;
  _isAnalyzing = !!state.isAnalyzing;

  const btn = document.getElementById('start-btn');
  btn.textContent = _isAnalyzing ? '⏹ 停止分析' : '▶ 開始分析';
  btn.classList.toggle('stop', _isAnalyzing);

  // Detected key + staff SVG + progress bar
  const keyEl   = document.getElementById('detected-key');
  const staffEl = document.getElementById('key-sig-staff');
  const progEl  = document.getElementById('key-progress');
  if (state.keyLocked && state.detectedKey) {
    keyEl.textContent = state.detectedKey.name;
    staffEl.innerHTML = _renderKeySigSVG(state.detectedKey.acc);
    progEl.innerHTML  = '<span class="status">已鎖定 ✓</span>';
  } else if (_isAnalyzing) {
    keyEl.textContent = '偵測中...';
    staffEl.innerHTML = _renderKeySigSVG(0);
    const pct = Math.min(100, Math.round(((state.elapsedMs || 0) / KEY_LOCK_MS) * 100));
    progEl.innerHTML  = `<div class="progress-bar"><div class="progress-inner" style="width:${pct}%"></div></div>`;
  } else {
    keyEl.textContent = state.detectedKey ? state.detectedKey.name : '—';
    staffEl.innerHTML = state.detectedKey ? _renderKeySigSVG(state.detectedKey.acc) : '';
    progEl.innerHTML  = '';
  }

  // Max note
  document.getElementById('max-note').textContent = state.maxNote || '—';
  document.getElementById('max-note-solfege').textContent =
    state.maxNoteSolfege ? state.maxNoteSolfege : '';
  document.getElementById('note-status').textContent = _isAnalyzing ? '持續追蹤中...' : '';

  // BPM
  const bpmEl    = document.getElementById('bpm-value');
  const bpmUnit  = document.getElementById('bpm-unit');
  const bpmStat  = document.getElementById('bpm-status');
  if (state.bpm) {
    bpmEl.textContent   = state.bpm;
    bpmUnit.textContent = 'BPM';
    bpmStat.textContent = '（估算）';
  } else {
    bpmEl.textContent   = '—';
    bpmUnit.textContent = '';
    bpmStat.textContent = _isAnalyzing ? '收集中（需約 5 秒）...' : '';
  }

  // Recommended key (with transpose offset applied)
  const recEl    = document.getElementById('recommended-key');
  const shiftEl  = document.getElementById('shift-info');
  const recStaff = document.getElementById('rec-sig-staff');
  const adjKey   = _getAdjustedKey(state.recommendedKey);
  if (adjKey) {
    recEl.textContent  = adjKey.name;
    recStaff.innerHTML = _renderKeySigSVG(adjKey.acc);
    const s = adjKey.semitoneShift;
    const label = s === 0
      ? '無需調整'
      : (s > 0 ? `升 ${s} 個半音` : `降 ${Math.abs(s)} 個半音`);
    shiftEl.textContent = label;
  } else {
    recEl.textContent  = '—';
    recStaff.innerHTML = '';
    shiftEl.textContent = '';
  }

  // Detail section
  document.getElementById('d-status').textContent = state.keyLocked
    ? '已鎖定 (15s)'
    : (_isAnalyzing ? '偵測中...' : '—');

  if (state.recommendedKey) {
    const s = state.recommendedKey.semitoneShift;
    document.getElementById('d-shift').textContent = s === 0
      ? '0'
      : `${s > 0 ? '+' : ''}${s} 個半音`;
  } else {
    document.getElementById('d-shift').textContent = '—';
  }

  // Error
  if (state.error) _showMsg(state.error);
}
