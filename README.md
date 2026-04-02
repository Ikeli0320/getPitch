# getPitch — YouTube Key Detector

[![CI](https://github.com/Ikeli0320/getPitch/actions/workflows/ci.yml/badge.svg)](https://github.com/Ikeli0320/getPitch/actions/workflows/ci.yml)
[![Changelog](https://img.shields.io/badge/changelog-CHANGELOG.md-blue)](CHANGELOG.md)

A Chrome extension that listens to any YouTube song and tells you its **key signature**, **highest note**, **BPM**, and **recommended singing key** — all in real time, entirely in your browser.

## Features

- **Key signature** — locks after ~15 s using Bellman-Budge (1962) chromagram + Pearson correlation. Displayed with staff accidentals (sharps/flats) so it reads like sheet music.
- **Highest note** — continuously tracked with note name (e.g. `D5`) and solfège label (e.g. `高音Re`). Confirms across ≥ 2 of last 3 frames to suppress transients.
- **BPM** — spectral-flux onset autocorrelation; stabilises after ~5 s.
- **Recommended singing key** — picks the key where the highest note lands at or below **D5** with ≤ 3 sharps/flats (14 practical karaoke keys). Includes a **±3-semitone transpose slider** for fine-tuning.
- **Key confidence** — 0–100 score; ⚠ badge shown when ambiguous (< 40).
- **Silent-audio guard** — stops after 20 s of silence with a helpful error message.
- **Privacy** — zero data leaves your browser. No network requests, no telemetry.

## Screenshots

| Main view | Detail panel | Transpose slider |
|-----------|-------------|-----------------|
| ![Main](screenshots/screenshot1.png) | ![Detail](screenshots/screenshot2.png) | ![Slider](screenshots/screenshot3.png) |

## Install

### From Chrome Web Store *(coming soon)*

Search for **getPitch - YouTube Key Detector** or use the direct link once published.

### Manual (Developer Mode)

1. Clone or download this repo.
2. Open `chrome://extensions/` and enable **Developer mode**.
3. Click **Load unpacked** and select the `getPitch/` folder.
4. Open any YouTube music video and click the getPitch toolbar icon (or press **Alt+P** / **⌘⇧P** on Mac).

## Usage

1. Open a YouTube music video.
2. Click the **getPitch** toolbar icon.
3. Press **▶ 開始分析** (Start Analysis).
4. Watch the key, highest note, BPM, and recommended key populate as the song plays.

## Development

No build step required.

```bash
# Run unit tests
node tests/test-chromagram.js
node tests/test-key-detector.js

# Generate icons
node scripts/generate-icons.js

# Rebuild release ZIP (PowerShell)
$ver = (Get-Content manifest.json | ConvertFrom-Json).version
Compress-Archive -Path manifest.json,background,content,popup,icons,privacy-policy.html `
  -DestinationPath "getPitch-$ver.zip" -Force
```

### Architecture

```
content scripts (YouTube page)          background.js        popup.js
  chromagram.js                         ─────────────        ────────
    buildChromagram()                   startAnalysis    →   getState (session)
    accumulateChroma()    content.js    stopAnalysis     →   storage.onChanged →
  key-detector.js         ──────────   updateResults    →     _updateUI()
    detectKey()           _tick()      resetState       →     _renderKeySigSVG()
    recommendKey()        200 ms       getState         ←     _getAdjustedKey()
```

Content scripts are injected declaratively (no `scripting` permission). State lives in `chrome.storage.session` and is restored on MV3 service-worker eviction.

### Key constants (`content/content.js`)

| Constant | Default | Effect |
|---|---|---|
| `KEY_LOCK_MS` | 15 000 | ms of audio before key locks |
| `SILENT_TIMEOUT_MS` | 20 000 | ms of silence before giving up |
| `NOISE_FLOOR_DB` | −55 | dB threshold for note detection |
| `NOTE_WINDOW` | 3 | rolling frames for note confirmation |
| `NOTE_MIN_HITS` | 2 | min agreeing frames to confirm a note |

## Privacy Policy

All audio analysis runs locally in your browser. No audio or personal data is collected or transmitted. See [`privacy-policy.html`](privacy-policy.html) for the full policy.

## License

[MIT](LICENSE)
