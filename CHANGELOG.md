# Changelog

All notable changes to getPitch are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.0.22] — 2026-04-03

### Fixed
- `content/content.js` line 268: `onsetHistory.length > ONSET_HISTORY_MAX` corrected
  to `>= ONSET_HISTORY_MAX` — prevents the onset buffer growing to 401 elements
  (one frame over cap) before the first eviction, keeping it strictly bounded at 400

### Changed
- `popup/popup.css`: add `.chip:hover` and `.chip:focus-visible` — chips in the
  allowed-keys list now show pointer feedback and a visible keyboard-focus ring
  (WCAG 2.4.7 Focus Visible compliance for the detail panel)
- `README.md`: remove "*(coming soon)*" marker from Chrome Web Store install section
- `package.json`: add `"build:zip"` script (`node scripts/build-zip.js`)
- `scripts/build-zip.js`: new Node.js script that builds a spec-compliant submission
  ZIP with deflate compression — no PowerShell or external tools required

### Tests
- `tests/test-key-detector.js`: 6 new tests (110 total) — `recommendKey` with very
  low `maxMidi` values (MIDI 40 = E2, MIDI 36 = C2) verifies that the half-octave
  shift normalization keeps `semitoneShift` within `[-6, +6]` and `acc` within `≤ 3`

---

## [1.0.21] — 2026-04-03

### Changed
- `popup/popup.js`: extract `SLIDER_DEBOUNCE_MS = 300` and `_SVG_FONT_SIZE = 15`
  as named constants — removes the last two magic numbers from the popup;
  debounce delay and SVG text size are now tunable without hunting for bare literals
- `background/background.js`: extract `STARTUP_STORAGE_TIMEOUT_MS = 500`
  as a named constant — documents the startup storage-restore race timeout
- `content/key-detector.js`: add inline comment explaining the half-octave
  normalization (`if (shift > 6) shift -= 12` — `6 = 12 / 2`)
- `CLAUDE.md`: add constants-reference tables for `chromagram.js`, `popup.js`,
  and `background.js` so all tunables are documented in one place

---

## [1.0.20] — 2026-04-03

### Changed
- `content/chromagram.js`: extract `A4_MIDI = 69`, `A4_HZ = 440`, and
  `CHROMA_NOISE_FLOOR_DB = -80` as named constants — removes the last
  magic numbers from the MIDI frequency formula and noise floor check;
  all three exported for testing
- `content/content.js`: add `BPM_ONSET_MIN_SAMPLES` derived constant
  (`Math.round(1000 / ONSET_TICK_MS * 5)` = 100 at default settings) to
  replace the bare `100` in `_estimateBPM()`; use `A4_MIDI` / `A4_HZ`
  globals (from chromagram.js, loaded first) in `_findMaxNote()`

### Tests
- `tests/test-chromagram.js`: 6 new tests (24 total):
  - `A4_MIDI = 69`, `A4_HZ = 440`, `CHROMA_NOISE_FLOOR_DB = -80`
  - MIDI formula identity check: `A4_MIDI + 12·log₂(A4_HZ/A4_HZ) = 69`
  - Bin at exactly `CHROMA_NOISE_FLOOR_DB` is excluded
  - Bin 1 dB above `CHROMA_NOISE_FLOOR_DB` is included

---

## [1.0.19] — 2026-04-03

### Fixed
- `content/content.js`: `_estimateBPM()` now returns `null` when `bestCorr ≤ 0`
  — prevents reporting a spurious BPM (e.g. 171) on sustained chords or
  audio with no detectable periodic beats, where all autocorrelation values
  are exactly zero

### Changed
- `content/content.js`: extract `_setupAudioGraph(video)` helper from
  `startAnalysis()` — brings `startAnalysis` from ~56 lines to ~26 lines;
  audio context lifecycle (close/recreate/resume) and source wiring are now
  clearly isolated in one place
- `content/content.js`: extract `_updateMaxNote(freqData)` helper from
  `_tick()` — brings `_tick` from ~63 lines to 25 lines; note confirmation
  window logic (rolling NOTE_WINDOW, NOTE_MIN_HITS) lives in its own function
- `content/content.js`: `_resetDetectionState()` uses `chromaSum.fill(0)`
  instead of `new Float32Array(12)` — avoids per-reset heap allocation
- `store-listing.md`: update version references to 1.0.19

---

## [1.0.18] — 2026-04-03

### Fixed
- `content/content.js`: **crash guard** — `_tick()` now checks `!_freqBuf` before
  calling `analyserNode.getFloatFrequencyData(_freqBuf)`. Without this guard, a
  timer firing between `analyserNode` creation and buffer allocation (e.g. if
  `startAnalysis` throws mid-way) would pass `null` to the Web Audio API and
  throw a `TypeError`, silently stopping all analysis with no user-visible error.

### Changed
- `popup/popup.css`: slider track lightens to `#3a3a54` on `:focus-visible` —
  provides a secondary focus cue for low-vision users beyond the thumb outline

---

## [1.0.17] — 2026-04-03

### Fixed
- `content/key-detector.js`: Pearson correlation result now clamped to `[-1, 1]`
  — floating-point rounding can produce values like 1.0000000002 when chroma
  is perfectly aligned with a profile; clamp prevents confidence scores > 100
  in that edge case

### Changed
- `content/content.js`: reuse pre-allocated `_freqBuf` / `_onsetBuf` typed
  arrays instead of `new Float32Array(...)` on every tick — eliminates ~7 800
  short-lived allocations per minute during active analysis; buffers are
  allocated once when the AnalyserNode is created and freed when the
  AudioContext is closed
- `content/content.js`: `_onsetTick` copies previous frame with
  `prevOnsetData.set(_onsetBuf)` (in-place) instead of reassigning the
  reference — same GC benefit as above
- `popup/popup.js`: extract SVG layout constants `_SVG_H`, `_SVG_ACC_W`,
  `_SVG_GAP`, `_SVG_PAD`, `_SVG_MIN_W` — all staff sizing in one place
- `store-listing.md`: update stale version references `1.0.14` → `1.0.17`

### Tests
- `tests/test-key-detector.js`: 4 new tests (104 total):
  - `detectKey(uniform chroma)` → confidence 0, valid object
  - `detectKey(extreme amplitude 1e8)` → correct key, confidence in [0, 100]
  - Guards the Pearson clamp added in this version

---

## [1.0.16] — 2026-04-03

### Fixed
- `popup.js`: transpose slider storage writes now debounced (300 ms) — prevents
  flooding `chrome.storage.local` on rapid drag; slider element value is re-synced
  to the clamped `_transposeOffset` to prevent visual desync on corrupted input

### Changed
- `popup.js`: add comment on `KEY_LOCK_MS` duplication explaining MV3 isolation
  (no shared imports between content script and popup)
- `popup.js`: `_sliderSaveTimer` module-level variable added for debounce
- `content/chromagram.js`, `content/key-detector.js`: add `// Node.js CommonJS
  exports` comment to `module.exports` block — clarifies test-only role in browser
- `CLAUDE.md`: expand constants table with `FFT_SIZE`, `SMOOTHING_CONSTANT`,
  `CHROMA_ENERGY_THRESHOLD`, `MIN_FRAMES_FOR_KEY_LOCK`; correct BPM onset
  description to reference named constants instead of hardcoded numbers
- `README.md`: add Troubleshooting table — 8 common symptoms with causes and fixes

---

## [1.0.15] — 2026-04-03

### Changed
- `content.js`: substitute four new named constants into actual usage — `FFT_SIZE`,
  `SMOOTHING_CONSTANT`, `CHROMA_ENERGY_THRESHOLD`, `MIN_FRAMES_FOR_KEY_LOCK` — no
  more magic numbers `4096`, `0.3`, `0.01`, `10` in the code body; add explanatory
  comment on `MIN_FRAMES_FOR_KEY_LOCK` lock guard
- `popup.html`: add `aria-label="現正播放"` to `#song-title-bar` container — screen
  readers now announce the region label before announcing the song title
- `background.js`: log tab ID and action name in `_sendToTab()` catch — makes
  DevTools debugging easier when a content script is not yet injected
- `.github/workflows/ci.yml`: add icon-file verification step — CI fails fast
  if `icons/icon{16,48,128}.png` are missing from the repo
- `CLAUDE.md`: note that `yt-navigate-finish` is not guaranteed to fire (e.g.
  direct URL entry, back/forward), and document the stale-source guard in
  `startAnalysis()` that handles the missed-event case; update key-lock guard
  comment to reference constant names `MIN_FRAMES_FOR_KEY_LOCK` / `CHROMA_ENERGY_THRESHOLD`

---

## [1.0.14] — 2026-04-03

### Fixed
- `popup.html` / `popup.js`: `aria-label` on recommended key staff was not reset to `'—'`
  when the staff was cleared; screen readers could announce a stale key name

### Changed
- `popup.js`: cache chip `NodeList` after creation (`_chips`) — avoids
  `querySelectorAll('#d-allowed .chip')` on every storage update (~2×/sec during analysis)
- `popup.js`: Unicode-safe song title truncation — use `[...str]` spread so emoji and
  multi-codepoint characters are never split mid-glyph
- `popup.js`: add comment clarifying `_ALLOWED_KEYS` is the |acc| ≤ 3 subset of all 24 keys
- `background.js`: coerce `isAnalyzing`, `keyLocked`, `elapsedMs` to correct types after
  whitelist filtering — guards against content-script type-mismatch messages corrupting UI state
- `background.js`: improve `activeTabId = -1` sentinel comment to clarify -1 vs null semantics

### Tests
- `tests/test-key-detector.js`: 55 new tests (100 total):
  - `detectKey` confidence always in [0, 100] across all 24 key profiles
  - `D5_MIDI` exported constant correctness
  - `recommendKey` returns non-null with |acc| ≤ 3 for all 14 allowed keys at maxMidi = D5

---

## [1.0.13] — 2026-04-03

### Changed
- `chromagram.js`: replace magic numbers 130/1047 with named constants
  `CHROMA_FREQ_MIN_HZ` / `CHROMA_FREQ_MAX_HZ`; export them for tests
- `content.js`: add `BPM_MIN = 60` / `BPM_MAX = 180` constants; replace
  magic numbers in `_estimateBPM()`; rename local `_noteCounts` → `noteCounts`
- `key-detector.js`: extract module-level `D5_MIDI = 74` constant; export it
- `popup.js`: add `CONFIDENCE_WARN_THRESHOLD = 40`, `TRANSPOSE_MIN = -3`,
  `TRANSPOSE_MAX = 3`; derive `ALLOWED_KEY_NAMES` from `_ALLOWED_KEYS.map(k => k.name)`
  — eliminates duplicate key-name list
- `popup.html`: correct initial `aria-label` on staff SVG divs from
  `'無升降記號'` to `'—'` (key is unknown until detected, not C major)
- `popup.css`: replace deprecated `clip: rect(0,0,0,0)` in `.sr-only` with
  `clip-path: inset(50%)` per current accessibility best practice
- `package.json`: bump `engines.node` from `>=16` (EOL) to `>=18`
- `README.md`: expand constants table with all 14 constants; fix dev command
  (`npm test` instead of manual node invocations)

### Tests
- `tests/test-chromagram.js`: add 6 new tests (18 total):
  - FFT size 8192
  - dB → linear magnitude conversion (−20 dB → 0.1)
  - `CHROMA_FREQ_MIN/MAX_HZ` exported values and boundary exclusion

---

## [1.0.12] — 2026-04-03

### Changed
- `popup.js`: split `_updateUI()` (164 lines) into 6 focused helpers
  (`_updateButton`, `_updateDetectedKey`, `_updateNoteAndBPM`,
  `_updateRecommendedKey`, `_updateDetailSection`, `_updateErrorBar`)
- `popup.js`: extract `_extractSongTitle()` helper — eliminates duplicated
  title-strip-and-truncate logic in `DOMContentLoaded` and `storage.onChanged`
- `popup.js`: extract `_updateTransposeLabel()` helper — eliminates duplicated
  slider label/ARIA update logic
- `popup.js`: add `MAX_SONG_TITLE_LENGTH = 60` constant; move `_lastKeyAcc` /
  `_lastRecAcc` declarations to module-level variable block (was hoisted from line 266)
- `content.js`: extract `_resetDetectionState()` — eliminates duplicated 10-field
  reset in `startAnalysis()` and the `yt-navigate-finish` handler
- `content.js`: use optional chaining `audioSource?.mediaElement` for defensive null guard

---

## [1.0.10] — 2026-04-04

### Changed
- `content.js`: extract hardcoded `50`/`500` Hz BPM onset band into named constants
  `ONSET_FREQ_MIN_HZ` and `ONSET_FREQ_MAX_HZ` for consistency with all other tunables
- `package.json`: bump version to 1.0.10 and add `npm run version-check` script
  that fails CI if `manifest.json` and `package.json` versions drift
- `.github/workflows/ci.yml`: run `version-check` before tests on every push

---

## [1.0.9] — 2026-04-04

### Fixed
- `popup.js`: `await chrome.storage.local.get()` before `getState` — eliminates
  transpose-slider flicker on popup open when a saved offset exists
- `popup.html`: add `aria-live="polite" aria-atomic="true"` to song-title-bar so
  screen readers announce the new title on YouTube SPA navigation

### Added
- `.editorconfig`: enforce UTF-8, 2-space indent, LF, final newline

### Changed
- `.github/workflows/ci.yml`: test on Node 18 **and** 20 (matrix); run `npm test`
  instead of bare `node` calls
- `CLAUDE.md`: update Running Tests section to show `npm test`

---

## [1.0.8] — 2026-04-04

### Fixed
- `privacy-policy.html`: disclose `chrome.storage.local` usage (transpose offset);
  previously stated "nothing written to storage.local" — incorrect since v1.0.6
- `content.js`: `stopAnalysis(error?)` — silence-timeout guard now passes error
  to `stopAnalysis` directly, eliminating a redundant second `_send` call
- `popup.js`: `_keySigAriaLabel(null)` now returns `'—'` instead of `'無升降記號'`
  (C major label) when no key has been detected yet

### Added
- `.github/workflows/ci.yml`: GitHub Actions CI runs `npm test` on every push/PR
- `package.json`: `npm test` and `npm run icons` scripts

### Changed
- `content.js`: silence error message mentions system volume (`系統音量已開啟`)

---

## [1.0.7] — 2026-04-04

### Fixed
- `popup.js`: `parseInt` on transpose slider now validates for NaN; stored offset
  clamped to `[-3, 3]` on restore
- `popup.js`: `_renderKeySigSVG` uses explicit Unicode escapes `\u266F` / `\u266D`
  (XSS guard on accidental symbols)
- `popup.js`: progress bar `aria-label` updates each tick to show real percentage

### Changed
- `manifest.json`: add `img-src 'self' data:` to CSP; command description → English
- `CLAUDE.md`: clarify `FREQ_MAX_HZ` difference between note-tracking and chromagram;
  document BPM onset frequency range

### Tests
- Added `倍低音` octave-2 branch test and `mixolydian` mode-guard test (45 total)

---

## [1.0.6] — 2026-04-04

### Fixed
- `popup.html`: `aria-description` (ARIA 1.3 draft) → `aria-describedby` + `.sr-only`
  span for Chrome 116 compatibility

### Added
- `popup.css`: `.sr-only` visually-hidden helper class
- `screenshots/screenshot1-3.png`: committed so README renders on GitHub
- Transpose offset persisted to `chrome.storage.local` across popup closes

### Changed
- `.gitignore`: exclude screenshots tooling (node_modules, HTML, scripts)

---

## [1.0.5] — 2026-04-03

### Added
- Keyboard shortcut: `Alt+P` (Win/Linux) / `⌘⇧P` (Mac) to open the popup
- `README.md` with features, install guide, architecture diagram, constants table
- `LICENSE` (MIT)

### Changed
- `popup.css`: WCAG 2.1 AA contrast fixes — label/status text `#777` → `#888`,
  disabled button `#555` → `#aaa`

---

## [1.0.4] — 2026-04-03

### Fixed
- Navigation detection: replaced fragile `wasReset` heuristic with `navTimestamp`
  (incremented on every `yt-navigate-finish`) — fixes stop-with-no-results → navigate
  edge case where both old and new state appear empty
- Storage write throttle reduced from 5 writes/sec to 2 writes/sec (500 ms)
- `_ALLOWED_UPDATE_KEYS` whitelist in background.js validates content-script messages
- Multi-tab isolation: `activeTabId = -1` sentinel prevents double-start race

---

## [1.0.3] — 2026-04-03

### Fixed
- `chromagram.js` / `content.js`: silence guard — key only locks when
  `chromaEnergy > 0.01`, preventing garbage output on muted videos
- `content.js`: pause guard in `_tick` and `_onsetTick` skips processing while
  video is paused
- `content.js`: `SILENT_TIMEOUT_MS = 20000` — stops analysis after 20 s of silence
- `popup.js`: ARIA attributes on progress bar, staff SVGs, transpose slider
- `popup.html`: `inert` attribute on hidden detail section prevents keyboard focus leak

---

## [1.0.2] — 2026-04-03

### Fixed
- `popup.js`: YouTube host list expanded to include `m.youtube.com` and
  `music.youtube.com`; `/shorts/` path supported
- `popup.js`: song title truncated to 60 chars with tooltip for full title
- `background.js`: `getState` always reads from session storage (not in-memory)
  so a freshly-woken MV3 service worker returns current state, not `DEFAULT_STATE`

### Tests
- Expanded from 7 + 28 tests to 12 + 42 tests covering boundary frequencies,
  48 kHz sample rate, MIDI boundaries, accidental boundary keys, D5 ceiling

---

## [1.0.1] — 2026-04-03

### Fixed
- `background.js`: `Promise.race` with 500 ms timeout on startup storage read;
  service worker eviction state restoration
- `background.js`: `onInstalled` clears stale session state on extension update
- `content.js`: helper function guard at top of `startAnalysis()` catches injection failures
- `content.js`: BPM `len <= 0` guard in autocorrelation loop
- `popup.js`: confidence badge shown in key card when confidence < 40
- `popup.js`: button error message on service worker crash

---

## [1.0.0] — 2026-04-02

### Added
- Initial production release
- Key signature detection using Bellman-Budge (1962) Pearson correlation
- Highest note tracking with solfège labels; note confirmation window (≥2/3 frames)
- BPM detection via spectral-flux onset autocorrelation, median-smoothed
- Recommended singing key: highest note ≤ D5, ≤ 3 accidentals; ±3-semitone slider
- Key confidence score (0–100); ⚠ badge below 40
- Staff SVG rendering with sharps/flats
- MV3 service worker with session storage state persistence
- YouTube SPA navigation auto-reset via `yt-navigate-finish`
- Multi-tab isolation via `activeTabId` tracking
- Privacy policy hosted on GitHub Pages
