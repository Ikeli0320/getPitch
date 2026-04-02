# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Chrome Extension (Manifest V3) that analyzes audio from a playing YouTube video to detect:
1. The song's key signature (locked after 15 seconds)
2. The highest note sung (tracked continuously)
3. A recommended singing key (highest note ≤ D5, ≤ 3 sharps/flats)

No build step. Load the folder directly in `chrome://extensions/` with Developer Mode → "Load unpacked".

## Running Tests

```bash
node tests/test-chromagram.js
node tests/test-key-detector.js
```

Tests use Node.js directly — no test runner needed.

## Architecture

```
content scripts (YouTube page)          background       popup
  chromagram.js                          background.js    popup.js
    buildChromagram()  ──┐
    accumulateChroma() ──┤  content.js                   reads chrome.storage.session
  key-detector.js        │  - startAnalysis()            via onChanged listener
    detectKey()       ───┤  - _tick() every 200ms
    recommendKey()    ───┘  - sends updateResults msg ──► stores in getPitchState
    midiToName()                                         ◄── popup reads on open
```

**Key design decisions:**

- `content/chromagram.js` and `content/key-detector.js` are pure functions loaded as globals before `content/content.js` in the `content_scripts` array — no imports needed.
- `createMediaElementSource()` can only be called once per `<video>` element. The `audioSource` variable is checked before connecting to avoid re-connecting on analysis restart. Navigating to a new video requires a page refresh.
- `chrome.storage.session` is used (not `local`) so state clears when the browser closes.

## Constants to Tune

In `content/content.js`:

| Constant | Default | Effect |
|----------|---------|--------|
| `KEY_LOCK_MS` | 15000 | ms before key is locked |
| `NOISE_FLOOR_DB` | -55 | dB threshold for note detection |
| `FREQ_MIN_HZ` | 130 | Lower bound for note tracking (~C3) |
| `FREQ_MAX_HZ` | 1175 | Upper bound for note tracking (~D6) |

## Music Theory

- Key detection uses Krumhansl-Schmuckler (1990) Pearson correlation over 24 keys
- Allowed keys for recommendation: those with `|acc| ≤ 3` in `ALL_KEYS` array in `key-detector.js`
- D5 = MIDI 74 is the hard-coded upper limit for recommended singing range
