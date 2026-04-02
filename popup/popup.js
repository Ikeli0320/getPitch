// popup/popup.js

const KEY_LOCK_MS = 15000;

const ALLOWED_KEY_NAMES = [
  'C 大調','G 大調','D 大調','A 大調',
  'F 大調','Bb 大調','Eb 大調',
  'A 小調','E 小調','B 小調','F# 小調',
  'D 小調','G 小調','C 小調',
];

let _isAnalyzing = false;
let _showDetail  = false;

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
  if (state) _updateUI(state);

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
      _updateUI(changes.getPitchState.newValue);
    }
  });
});

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
    state.maxNoteSolfege ? `（${state.maxNoteSolfege}）` : '';
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

  // Recommended key
  const recEl   = document.getElementById('recommended-key');
  const shiftEl = document.getElementById('shift-info');
  if (state.recommendedKey) {
    recEl.textContent = state.recommendedKey.name;
    const s = state.recommendedKey.semitoneShift;
    const label = s === 0
      ? '無需調整'
      : (s > 0 ? `升 ${s} 個半音` : `降 ${Math.abs(s)} 個半音`);
    const accInfo = state.recommendedKey.acc === 0
      ? '（無升降記號）'
      : state.recommendedKey.acc > 0
        ? `（${state.recommendedKey.acc}#）`
        : `（${Math.abs(state.recommendedKey.acc)}b）`;
    shiftEl.textContent = `${label} ${accInfo}`;
  } else {
    recEl.textContent   = '—';
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
