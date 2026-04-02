# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Chrome Extension (Manifest V3) — analyses audio from a playing YouTube video and displays:
1. **Key signature** — locked after 15 s using Bellman-Budge (1962) Pearson correlation
2. **Highest note** — continuously tracked, confirmed across ≥ 2/3 frames to filter transients
3. **BPM** — spectral-flux onset autocorrelation; median-smoothed over 5 estimates
4. **Recommended singing key** — highest note ≤ D5, ≤ 3 accidentals; transpose slider ±3 semitones
5. **Key confidence** — 0–100 score based on Pearson margin between top-1 and top-2 key

No build step. Load the folder directly in `chrome://extensions/` (Developer Mode → "Load unpacked").

## Running Tests

```bash
node tests/test-chromagram.js
node tests/test-key-detector.js
```

Tests use Node.js directly — no test runner needed.

## Architecture

```
content scripts (YouTube page)               background.js        popup.js
  chromagram.js                              ─────────────        ────────
    buildChromagram()  ──┐                   onMessage:           DOMContentLoaded:
    accumulateChroma() ──┤   content.js        startAnalysis  →     getState (session)
  key-detector.js        │   ──────────        stopAnalysis   →     storage.onChanged →
    detectKey()       ───┤   startAnalysis()   updateResults  →       _updateUI()
    recommendKey()    ───┤   _tick() 200ms     resetState     →       _getAdjustedKey()
    midiToName()         │   _onsetTick() 50ms getState       ←       _renderKeySigSVG()
    midiToSolfege()   ───┘   yt-navigate-finish              stores in chrome.storage.session
```

**Key design decisions:**

- `chromagram.js` and `key-detector.js` are globals loaded before `content.js` — no imports.
- `createMediaElementSource()` can only be called once per `<video>` element. `audioSource` is never re-created unless YouTube replaces the element (detected via `audioSource.mediaElement !== video` in `yt-navigate-finish` handler). If `audioCtx.state === 'closed'` (browser memory pressure), both `audioCtx` and `audioSource` are nulled so they are cleanly recreated on next start.
- YouTube SPA navigation fires `yt-navigate-finish` on `document`. The handler stops timers, optionally resets `audioSource`, clears all detection state, and sends `resetState` to background.
- `chrome.storage.session` (not `local`) — clears when browser closes.
- **MV3 service worker eviction**: Chrome kills the background worker after ~30 s idle. On restart, the in-memory `state` resets to `DEFAULT_STATE`. Fix: on module load, background reads `getPitchState` from session storage to restore state. `getState` always reads from session storage rather than the in-memory variable. Stored state is always merged with `DEFAULT_STATE` to guard against schema changes on update.
- **Key lock silence guard**: key only locks when `frameCount >= 10` AND `chromaEnergy > 0.01`. Prevents garbage key output on muted/silent videos.
- Popup SVG caches (`_lastKeyAcc`, `_lastRecAcc`) prevent re-rendering staff SVGs every tick. Progress bar uses a persistent `<div>` — only `style.width` is updated.
- Popup `storage.onChanged` detects a full reset (all null + `isAnalyzing: false`) and refreshes the song title from the active tab.
- **Permissions**: `activeTab`, `storage`, `tabs`. No `scripting` — content scripts are injected declaratively via `content_scripts` in manifest, not via the scripting API. `minimum_chrome_version` is `"116"`.
- **Multi-tab isolation**: `activeTabId` in background.js tracks which tab is currently being analysed. `startAnalysis` stops the previous tab before starting the new one. `updateResults` from non-active tabs is ignored. `resetState` (yt-navigate-finish) clears `activeTabId`.

## Constants to Tune

In `content/content.js`:

| Constant | Default | Effect |
|---|---|---|
| `KEY_LOCK_MS` | 15000 | ms of audio before key locks |
| `NOISE_FLOOR_DB` | -55 | dB threshold for note detection |
| `FREQ_MIN_HZ` | 130 | Lower bound for note tracking (~C3) |
| `FREQ_MAX_HZ` | 1175 | Upper bound for note tracking (~D6) |
| `ONSET_TICK_MS` | 50 | BPM onset sampling interval (ms) |
| `ONSET_HISTORY_MAX` | 400 | Max onset samples (~20 s) |
| `NOTE_WINDOW` | 3 | Rolling frame window for note confirmation |
| `NOTE_MIN_HITS` | 2 | Frames in window that must agree on a note |

## Music Theory

- **Profiles**: Bellman-Budge (1962), not K-S (1990). Higher contrast between scale/non-scale tones reduces relative major/minor confusion (e.g. G major vs F# minor).
- **Chromagram range**: C3–C6 (130–1047 Hz). Avoids bass-register ambiguity and high-harmonic noise.
- **BPM onset range**: 50–500 Hz (kick + bass). Autocorrelation over 60–180 BPM range.
- **`recommendKey` normalization**: shift is reduced modulo 12 to ±6 semitones — prevents showing "−12 semitones" when the recommended key name doesn't change.
- **Allowed keys**: `|acc| ≤ 3` (14 keys: 7 major + 7 minor). D5 = MIDI 74 is the hard upper limit.
- **Confidence**: `Math.min(100, (bestCorr − secondCorr) × 500)`. > 75 = clear winner; < 40 = ambiguous, shown with ⚠.

## Generating Icons

```bash
node scripts/generate-icons.js
```

Pure Node.js (no dependencies). Writes `icons/icon16.png`, `icon48.png`, `icon128.png`.

## Chrome Web Store

- ZIP for submission: `getPitch-1.0.0.zip` (run the PowerShell command in store-listing.md)
- Privacy policy: host `privacy-policy.html` publicly (e.g. GitHub Pages) and enter the URL in the Developer Dashboard
- See `store-listing.md` for full copy and submission checklist
