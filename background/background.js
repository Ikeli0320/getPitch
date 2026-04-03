// background/background.js

const DEFAULT_STATE = {
  isAnalyzing:    false,
  keyLocked:      false,
  detectedKey:    null,
  maxNote:        null,
  maxNoteSolfege: null,
  bpm:            null,
  recommendedKey: null,
  elapsedMs:      0,
  error:          null,
  // navTimestamp increments on every yt-navigate-finish so the popup can detect
  // a new-song navigation even when both old and new states are fully empty
  // (e.g. user stopped analysis with no results, then navigated to next song).
  navTimestamp:   0,
};

let state = { ...DEFAULT_STATE };

// Whitelist of fields that content.js is allowed to write into state.
// Prevents a compromised or buggy content script from injecting arbitrary keys.
const _ALLOWED_UPDATE_KEYS = new Set([
  'isAnalyzing', 'keyLocked', 'detectedKey', 'maxNote', 'maxNoteSolfege',
  'bpm', 'recommendedKey', 'elapsedMs', 'error', 'navTimestamp',
]);

// Throttle session storage writes during active analysis.
// The popup only needs ~2 updates/sec for smooth UX; 5x/sec was wasteful.
let _lastStorageWrite = 0;
const STORAGE_THROTTLE_MS = 500;

// Timeout (ms) for the startup storage-restore race — prevents a stalled
// chrome.storage.session.get from blocking service worker initialization.
const STARTUP_STORAGE_TIMEOUT_MS = 500;

// Track which tab is currently being analysed.
// Prevents updateResults messages from a stale tab (user started analysis on Tab A,
// then switched to Tab B and started again) from corrupting the active tab's results.
let activeTabId = null;

// Restore last-known state after service worker restarts (MV3 workers are evicted after ~30s idle).
// Without this, a freshly-woken worker returns DEFAULT_STATE to the popup even though
// chrome.storage.session still holds the last analysis results.
// Race a 500ms timeout so a stalled storage read never blocks the service worker startup.
Promise.race([
  chrome.storage.session.get('getPitchState'),
  new Promise(resolve => setTimeout(() => resolve({}), STARTUP_STORAGE_TIMEOUT_MS)),
]).then(result => {
  if (result.getPitchState && typeof result.getPitchState === 'object') {
    // Merge with DEFAULT_STATE so missing keys from older versions are filled in
    state = { ...DEFAULT_STATE, ...result.getPitchState };
  }
}).catch(() => {});

chrome.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
  if (reason === 'update' && previousVersion) {
    // Clear stale session state on extension update to avoid schema mismatches
    chrome.storage.session.remove('getPitchState').catch(() => {});
    state = { ...DEFAULT_STATE };
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.action === 'startAnalysis') {
    // Stop any previous analysis tab before starting a new one.
    // This handles the case where the user has two YouTube tabs and starts
    // analysis on each — without this, both tabs' data would intermingle.
    if (activeTabId !== null) {
      _sendToTab(activeTabId, { action: 'stop' });
    }
    // Sentinel: -1 means "start in progress — tabs.query not yet resolved".
    // Distinct from null ("not analyzing") and a real tab ID (>= 0).
    // A concurrent startAnalysis sees -1 and stops the pending "ghost" session
    // via _sendToTab(-1, stop) (which no-ops in Chrome) rather than skipping the stop.
    activeTabId = -1;
    // Reset all analysis fields immediately so the popup shows a clean slate
    // before the content script's first tick arrives.
    state = {
      ...state,
      isAnalyzing:    true,
      keyLocked:      false,
      detectedKey:    null,
      maxNote:        null,
      maxNoteSolfege: null,
      bpm:            null,
      recommendedKey: null,
      elapsedMs:      0,
      error:          null,
    };
    chrome.storage.session.set({ getPitchState: state }).catch(() => {});
    _activeTab(tab => {
      if (!tab) {
        // No active tab found (e.g. page navigated away between popup click and
        // tabs.query resolving). Revert to stopped state so the popup doesn't
        // get stuck showing "分析中..." with no content script running.
        activeTabId = null;
        state = { ...state, isAnalyzing: false, error: null };
        chrome.storage.session.set({ getPitchState: state }).catch(() => {});
        return;
      }
      activeTabId = tab.id;
      _sendToTab(tab.id, { action: 'start' });
    });
    return;
  }

  if (msg.action === 'stopAnalysis') {
    // Stop the tab that is actually running analysis (not necessarily the active tab).
    if (activeTabId !== null) {
      _sendToTab(activeTabId, { action: 'stop' });
      activeTabId = null;
    }
    // Keep detected key/note/BPM visible after stopping — user stopped because
    // they found what they needed, not because they want to lose the results.
    state = { ...state, isAnalyzing: false, error: null };
    chrome.storage.session.set({ getPitchState: state }).catch(() => {});
    return;
  }

  if (msg.action === 'updateResults') {
    // Only accept updates from the tab we started analysis on.
    // Reject everything when no analysis is active (activeTabId === null) to
    // prevent stale content scripts from writing results after stopAnalysis.
    if (!sender.tab || activeTabId === null || sender.tab.id !== activeTabId) return;
    // Validate: only merge whitelisted keys to guard against content script bugs.
    const clean = {};
    if (msg.data && typeof msg.data === 'object') {
      for (const k of _ALLOWED_UPDATE_KEYS) {
        if (Object.prototype.hasOwnProperty.call(msg.data, k)) clean[k] = msg.data[k];
      }
    }
    // Coerce critical boolean/numeric fields so a type-mismatch message
    // (e.g. isAnalyzing: "true") can't lock the UI into an inconsistent state.
    if ('isAnalyzing' in clean) clean.isAnalyzing = !!clean.isAnalyzing;
    if ('keyLocked'   in clean) clean.keyLocked   = !!clean.keyLocked;
    if ('elapsedMs'   in clean && clean.elapsedMs !== null)
      clean.elapsedMs = Number(clean.elapsedMs) || 0;
    state = { ...state, ...clean };
    // Throttle storage writes during active analysis to ~2×/sec.
    // Write immediately on non-analyzing updates (error, stop) so UI stays in sync.
    const now = Date.now();
    if (!state.isAnalyzing || now - _lastStorageWrite >= STORAGE_THROTTLE_MS) {
      chrome.storage.session.set({ getPitchState: state }).catch(() => {});
      _lastStorageWrite = now;
    }
    return;
  }

  if (msg.action === 'getState') {
    // Always read from session storage so a freshly-woken service worker
    // returns the actual last state, not the reset in-memory default.
    chrome.storage.session.get('getPitchState').then(result => {
      const stored = result.getPitchState;
      // Guard against corrupted storage: merge with defaults so all keys exist
      sendResponse(stored && typeof stored === 'object'
        ? { ...DEFAULT_STATE, ...stored }
        : state);
    }).catch(() => sendResponse(state));
    return true; // Keep channel open for async response
  }

  if (msg.action === 'resetState') {
    // Only honour reset from the tab that is currently being analysed.
    // Without this guard, navigating on any YouTube tab (not the one being
    // analysed) would wipe the active analysis state and null activeTabId,
    // causing the active tab's subsequent updateResults to be rejected.
    if (sender.tab && activeTabId !== null && activeTabId !== -1 &&
        sender.tab.id !== activeTabId) return;
    activeTabId = null;
    // Increment navTimestamp so popup always detects a navigation event even
    // when both old and new states are fully empty (stop-with-no-results case).
    state = { ...DEFAULT_STATE, navTimestamp: Date.now() };
    chrome.storage.session.set({ getPitchState: state }).catch(() => {});
    return;
  }
});

function _activeTab(cb) {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, ([tab]) => {
    // Always call cb — null means no tab found; callers must handle this case.
    cb(tab || null);
  });
}

function _sendToTab(tabId, msg) {
  chrome.tabs.sendMessage(tabId, msg).catch(e => {
    // Tab may have navigated away or content script not yet injected
    console.debug('[getPitch] sendToTab failed (tab', tabId, msg.action + '):', e?.message);
  });
}
