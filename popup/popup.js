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
  // Show version from manifest so it stays in sync automatically
  document.getElementById('version-bar').textContent =
    'v' + chrome.runtime.getManifest().version;

  // Populate allowed-keys chips once (data-key used for active highlighting)
  const allowedEl = document.getElementById('d-allowed');
  ALLOWED_KEY_NAMES.forEach(name => {
    const el = document.createElement('span');
    el.className = 'chip';
    el.setAttribute('role', 'listitem');
    el.dataset.key = name;
    el.textContent = name;
    allowedEl.appendChild(el);
  });

  // Check if we're on a YouTube watch or Shorts page
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const _isYouTubeWatch = (() => {
    try {
      const u = new URL(tab && tab.url ? tab.url : '');
      const ytHosts = ['www.youtube.com', 'youtube.com', 'm.youtube.com', 'music.youtube.com'];
      return ytHosts.includes(u.hostname) &&
             (u.pathname === '/watch' || u.pathname.startsWith('/shorts/'));
    } catch (_) { return false; }
  })();
  if (!_isYouTubeWatch) {
    _showMsg('請前往 YouTube 播放歌曲後使用');
    document.getElementById('start-btn').disabled = true;
    return;
  }

  // Show song title (strip " - YouTube" suffix from tab title)
  const rawTitle = (tab.title || '').replace(/\s*[-–]\s*YouTube\s*$/, '').trim();
  // Truncate very long titles to prevent layout overflow on edge cases
  const songTitle = rawTitle.length > 60 ? rawTitle.slice(0, 57) + '…' : rawTitle;
  if (songTitle) {
    const titleEl = document.getElementById('song-title');
    titleEl.textContent = songTitle;
    titleEl.title = rawTitle; // tooltip always shows full title
    document.getElementById('song-title-bar').classList.remove('hidden');
  }

  // Restore persisted transpose offset BEFORE loading state so the first _updateUI call
  // uses the correct offset — prevents a visible slider flicker on popup open.
  // chrome.storage.local.get returns a Promise in Chrome 88+ (our min is 116).
  try {
    const local = await chrome.storage.local.get('transposeOffset');
    if (typeof local.transposeOffset === 'number') {
      // Clamp in case the stored value is outside the current allowed range
      // (e.g., saved with a previous version that had a wider range)
      _transposeOffset = Math.max(-3, Math.min(3, local.transposeOffset));
      const slider = document.getElementById('transpose-slider');
      slider.value = _transposeOffset;
      const label = _transposeOffset === 0 ? '0'
        : (_transposeOffset > 0 ? `+${_transposeOffset}` : `${_transposeOffset}`);
      document.getElementById('transpose-value').textContent = label;
      const valueText = _transposeOffset === 0 ? '0 半音'
        : (_transposeOffset > 0 ? `+${_transposeOffset} 半音` : `${_transposeOffset} 半音`);
      slider.setAttribute('aria-valuenow', _transposeOffset);
      slider.setAttribute('aria-valuetext', valueText);
    }
  } catch (_) {}

  // Load latest state from background
  let state = null;
  try { state = await chrome.runtime.sendMessage({ action: 'getState' }); } catch (_) {}
  if (state) { _lastState = state; _updateUI(state); }

  // Button: start / stop — update button text immediately for snappy UX
  document.getElementById('start-btn').addEventListener('click', () => {
    const btn = document.getElementById('start-btn');
    // Use the button's own visual state as source of truth — prevents double-send
    // if the user clicks before _isAnalyzing has been updated by storage.onChanged.
    const willStop = btn.classList.contains('stop');
    const action = willStop ? 'stopAnalysis' : 'startAnalysis';
    // Optimistic UI: flip button before the async round-trip
    btn.textContent = willStop ? '▶ 開始分析' : '⏹ 停止分析';
    btn.setAttribute('aria-label', willStop ? '開始分析' : '停止分析');
    btn.classList.toggle('stop', !willStop);
    chrome.runtime.sendMessage({ action }).catch(() => {
      // Revert optimistic UI change and tell the user something went wrong.
      // This path is hit when the background service worker is unavailable
      // (e.g. crashed or evicted by Chrome between popup open and click).
      btn.textContent = willStop ? '⏹ 停止分析' : '▶ 開始分析';
      btn.setAttribute('aria-label', willStop ? '停止分析' : '開始分析');
      btn.classList.toggle('stop', willStop);
      _showMsg('操作失敗，請重新開啟擴充功能');
    });
  });

  // Button: detail toggle
  document.getElementById('detail-btn').addEventListener('click', () => {
    _showDetail = !_showDetail;
    const detailSection = document.getElementById('detail-section');
    detailSection.classList.toggle('hidden', !_showDetail);
    detailSection.setAttribute('aria-hidden', String(!_showDetail));
    // inert prevents keyboard focus from reaching hidden content even if CSS is overridden
    detailSection.toggleAttribute('inert', !_showDetail);
    const detailBtn = document.getElementById('detail-btn');
    detailBtn.textContent = _showDetail ? '簡略 ▲' : '詳細 ▼';
    detailBtn.setAttribute('aria-expanded', String(_showDetail));
  });

  // Live updates via storage
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.getPitchState) {
      const next = changes.getPitchState.newValue;
      if (!next) return;
      // Detect SPA navigation (new song) via navTimestamp change — refresh song title.
      // navTimestamp is set by background on every yt-navigate-finish, so this fires
      // even when both old and new states are fully empty (stop-with-no-results case).
      const wasReset = _lastState
        && next.navTimestamp
        && next.navTimestamp !== (_lastState.navTimestamp || 0);
      if (wasReset) {
        _lastKeyAcc = undefined; _lastRecAcc = undefined; // invalidate SVG caches
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, ([tab]) => {
          if (tab && tab.url &&
              (tab.url.includes('youtube.com/watch') || tab.url.includes('youtube.com/shorts/'))) {
            const raw = (tab.title || '').replace(/\s*[-–]\s*YouTube\s*$/, '').trim();
            const t = raw.length > 60 ? raw.slice(0, 57) + '…' : raw;
            if (t) {
              const el = document.getElementById('song-title');
              el.textContent = t;
              el.title = raw;
            }
          }
        });
      }
      _lastState = next;
      _updateUI(next);
    }
  });

  // Transpose slider
  document.getElementById('transpose-slider').addEventListener('input', (e) => {
    const parsed = parseInt(e.target.value, 10);
    // Guard: clamp to the slider's allowed range in case of corrupted value
    _transposeOffset = isNaN(parsed) ? 0 : Math.max(-3, Math.min(3, parsed));
    const label = _transposeOffset === 0 ? '0'
      : (_transposeOffset > 0 ? `+${_transposeOffset}` : `${_transposeOffset}`);
    document.getElementById('transpose-value').textContent = label;
    const valueText = _transposeOffset === 0 ? '0 半音'
      : (_transposeOffset > 0 ? `+${_transposeOffset} 半音` : `${_transposeOffset} 半音`);
    e.target.setAttribute('aria-valuenow', _transposeOffset);
    e.target.setAttribute('aria-valuetext', valueText);
    // Persist across popup closes so the user's preference survives re-opens
    chrome.storage.local.set({ transposeOffset: _transposeOffset });
    if (_lastState) _updateUI(_lastState);
  });
});

// ── Transpose adjustment ───────────────────────────────────────────────────
// Applies _transposeOffset semitones to a recommended key, staying within allowed list.
function _getAdjustedKey(baseKey) {
  if (!baseKey) return null;
  if (baseKey.mode !== 'major' && baseKey.mode !== 'minor') return null;
  if (_transposeOffset === 0) return baseKey;
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

// ── Key signature helpers ──────────────────────────────────────────────────
// Returns a human-readable aria-label for a key signature staff (e.g. "1 升記號").
// null means no key detected yet — distinct from acc=0 (C major, no accidentals).
function _keySigAriaLabel(acc) {
  if (acc === null || acc === undefined) return '—';
  if (acc === 0) return '無升降記號';
  const n = Math.abs(acc);
  return acc > 0 ? `${n} 個升記號` : `${n} 個降記號`;
}

// ── Key signature staff SVG ────────────────────────────────────────────────
// Staff: 5 lines, spacing 8px, top line y=8. Positions use treble clef layout.
// Sharp order: F C G D A E B  (each position = note's staff y-coordinate)
// Flat order:  B E A D G C F
const _SHARP_Y = [8, 20, 4, 16, 28, 12, 24];
const _FLAT_Y  = [24, 12, 28, 16, 32, 20, 36];

function _renderKeySigSVG(acc) {
  // Clamp to valid range — standard key signatures have at most 7 accidentals.
  // Guards against corrupted state writing an out-of-range value.
  const count   = Math.min(7, Math.abs(acc));
  const isSharp = acc > 0;
  const yArr    = isSharp ? _SHARP_Y.slice(0, count) : _FLAT_Y.slice(0, count);
  // Explicit whitelist: only these two Unicode characters are valid accidentals.
  // Prevents XSS if acc-derived logic ever changes or state is unexpectedly corrupted.
  const sym     = isSharp ? '\u266F' : '\u266D'; // ♯ or ♭

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

// Cache last rendered staff accidentals to avoid unnecessary innerHTML writes
let _lastKeyAcc = undefined;
let _lastRecAcc = undefined;

function _updateUI(state) {
  if (!state) return;
  _isAnalyzing = !!state.isAnalyzing;

  const btn = document.getElementById('start-btn');
  btn.textContent = _isAnalyzing ? '⏹ 停止分析' : '▶ 開始分析';
  btn.setAttribute('aria-label', _isAnalyzing ? '停止分析' : '開始分析');
  btn.classList.toggle('stop', _isAnalyzing);

  // Detected key + staff SVG + progress bar + confidence badge
  const keyEl      = document.getElementById('detected-key');
  const staffEl    = document.getElementById('key-sig-staff');
  const progBar    = document.getElementById('key-progress-bar');
  const progInner  = document.getElementById('key-progress-inner');
  const lockLabel  = document.getElementById('key-locked-label');
  const confWarn   = document.getElementById('key-conf-warn');
  if (state.keyLocked && state.detectedKey) {
    keyEl.textContent = state.detectedKey.name || '—';
    // Defensive: guard against null/undefined detectedKey.acc (e.g. schema mismatch after update)
    const ka = (state.detectedKey && typeof state.detectedKey.acc === 'number') ? state.detectedKey.acc : null;
    if (ka !== _lastKeyAcc) {
      staffEl.setAttribute('aria-label', _keySigAriaLabel(ka));
      staffEl.innerHTML = ka !== null ? _renderKeySigSVG(ka) : '';
      _lastKeyAcc = ka;
    }
    progBar.classList.add('hidden');
    lockLabel.classList.remove('hidden');
    // Show low-confidence warning inline in the key card
    const c = state.detectedKey.confidence;
    if (confWarn) {
      if (typeof c === 'number' && c < 40) {
        confWarn.classList.remove('hidden');
        confWarn.setAttribute('title', `偵測信心 ${c}%，結果可能不準確`);
      } else {
        confWarn.classList.add('hidden');
      }
    }
  } else if (_isAnalyzing) {
    keyEl.textContent = '偵測中...';
    if (_lastKeyAcc !== 0) { staffEl.innerHTML = _renderKeySigSVG(0); _lastKeyAcc = 0; }
    const pct = Math.min(100, Math.round(((state.elapsedMs || 0) / KEY_LOCK_MS) * 100));
    progInner.style.width = pct + '%'; // update width only — no DOM reconstruction
    progBar.setAttribute('aria-valuenow', pct);
    progBar.setAttribute('aria-label', `調號鎖定進度 ${pct}%`);
    progBar.classList.remove('hidden');
    lockLabel.classList.add('hidden');
  } else {
    keyEl.textContent = state.detectedKey ? state.detectedKey.name : '—';
    const ka = state.detectedKey ? state.detectedKey.acc : null;
    if (ka !== _lastKeyAcc) {
      staffEl.setAttribute('aria-label', _keySigAriaLabel(ka));
      staffEl.innerHTML = ka !== null ? _renderKeySigSVG(ka) : '';
      _lastKeyAcc = ka;
    }
    progBar.classList.add('hidden');
    lockLabel.classList.add('hidden');
    if (confWarn) confWarn.classList.add('hidden');
  }

  // Max note
  document.getElementById('max-note').textContent = state.maxNote || '—';
  document.getElementById('max-note-solfege').textContent = state.maxNoteSolfege || '';
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
  // adjKey is computed once and reused for both the card and the detail section
  const adjKey = _getAdjustedKey(state.recommendedKey);
  if (adjKey) {
    const recEl = document.getElementById('recommended-key');
    recEl.textContent = adjKey.name;
    recEl.style.color = ''; // let .card.highlight .value CSS take over (blue)
    if (adjKey.acc !== _lastRecAcc) {
      const recStaff = document.getElementById('rec-sig-staff');
      recStaff.setAttribute('aria-label', _keySigAriaLabel(adjKey.acc));
      recStaff.innerHTML = _renderKeySigSVG(adjKey.acc);
      _lastRecAcc = adjKey.acc;
    }
    const s = adjKey.semitoneShift;
    document.getElementById('shift-info').textContent = s === 0
      ? '無需調整'
      : (s > 0 ? `升 ${s} 個半音` : `降 ${Math.abs(s)} 個半音`);
  } else {
    // Show contextual hints during analysis so the user knows what to wait for.
    // Override inline color to grey — .card.highlight .value would force blue,
    // making status strings look like results.
    const recKeyEl = document.getElementById('recommended-key');
    if (_isAnalyzing && !state.keyLocked) {
      recKeyEl.textContent = '分析中...';
      recKeyEl.style.color = '#888';
      document.getElementById('shift-info').textContent = '等待調號鎖定（約 15 秒）';
    } else if (_isAnalyzing && state.keyLocked) {
      // Key locked but maxNote not yet confirmed — still collecting note data
      recKeyEl.textContent = '偵測最高音...';
      recKeyEl.style.color = '#888';
      document.getElementById('shift-info').textContent = '繼續播放以確認最高音';
    } else {
      recKeyEl.textContent = '—';
      recKeyEl.style.color = '';
      document.getElementById('shift-info').textContent = '';
    }
    if (_lastRecAcc !== null) {
      document.getElementById('rec-sig-staff').innerHTML = '';
      _lastRecAcc = null;
    }
  }

  // Highlight matching chip in allowed-keys list
  const activeKeyName = adjKey ? adjKey.name : null;
  document.querySelectorAll('#d-allowed .chip').forEach(el => {
    const isActive = el.dataset.key === activeKeyName;
    el.classList.toggle('active', isActive);
    if (isActive) { el.setAttribute('aria-current', 'true'); }
    else { el.removeAttribute('aria-current'); }
  });

  // Detail section
  document.getElementById('d-status').textContent = state.keyLocked
    ? '已鎖定 (15s)'
    : (_isAnalyzing ? '偵測中...' : '—');

  // Key confidence (0–100%)
  const confEl = document.getElementById('d-confidence');
  if (state.detectedKey && state.detectedKey.confidence != null) {
    const c = state.detectedKey.confidence;
    confEl.textContent = `${c}%${c < 40 ? ' ⚠ 不確定' : ''}`;
    confEl.style.color = c < 40 ? '#e28a4a' : '#aaa';
  } else {
    confEl.textContent = '—';
    confEl.style.color = '';
  }

  // Adjusted shift (reuses adjKey already computed above)
  if (adjKey) {
    const s = adjKey.semitoneShift;
    document.getElementById('d-shift').textContent = s === 0
      ? '0（原調）'
      : `${s > 0 ? '+' : ''}${s} 個半音`;
  } else {
    document.getElementById('d-shift').textContent = '—';
  }

  // Error bar: show on error, clear when resolved
  const msgBar = document.getElementById('msg-bar');
  if (state.error) {
    msgBar.textContent = state.error;
    msgBar.classList.remove('hidden');
  } else {
    msgBar.classList.add('hidden');
  }
}
