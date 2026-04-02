// background/background.js

const DEFAULT_STATE = {
  isAnalyzing:    false,
  keyLocked:      false,
  detectedKey:    null,
  maxNote:        null,
  recommendedKey: null,
  elapsedMs:      0,
  error:          null,
};

let state = { ...DEFAULT_STATE };

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.action === 'startAnalysis') {
    _activeTab(tab => {
      if (!tab) return;
      chrome.tabs.sendMessage(tab.id, { action: 'start' });
    });
    return;
  }

  if (msg.action === 'stopAnalysis') {
    _activeTab(tab => {
      if (!tab) return;
      chrome.tabs.sendMessage(tab.id, { action: 'stop' });
    });
    state = { ...state, isAnalyzing: false };
    chrome.storage.session.set({ getPitchState: state });
    return;
  }

  if (msg.action === 'updateResults') {
    state = { ...state, ...msg.data };
    chrome.storage.session.set({ getPitchState: state });
    return;
  }

  if (msg.action === 'getState') {
    sendResponse(state);
    return true; // Keep channel open for async
  }
});

function _activeTab(cb) {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => cb(tab));
}
