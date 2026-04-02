# Changelog

All notable changes to getPitch are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
