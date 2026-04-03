# Contributing to getPitch

**Language:** [繁體中文](CONTRIBUTING.md) · English (this page)

Thanks for your interest in contributing!

## Setup

No build step required. The extension runs directly from source.

```bash
git clone https://github.com/Ikeli0320/getPitch.git
cd getPitch
```

Load the extension in Chrome:
1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `getPitch/` folder

## Running Tests

```bash
npm test
```

Both test suites (chromagram + key-detector) run via Node.js — no test runner needed.

Before committing, also verify versions are in sync:

```bash
npm run version-check
```

## Project Structure

| Path | Purpose |
|---|---|
| `content/` | Content scripts injected into YouTube pages |
| `background/` | MV3 service worker |
| `popup/` | Extension popup UI |
| `tests/` | Node.js unit tests |
| `scripts/` | Dev utilities (icon generator, release ZIP builder) |
| `screenshots/` | Store screenshots + generation tool |

See `CLAUDE.md` for the full architecture and constants reference.

## Making Changes

1. Make your change
2. Run `npm run version-check` — bump both `manifest.json` and `package.json` if needed
3. Run `npm test` — all tests must pass
4. Run `npm run build:zip` — verify the release ZIP builds without errors
5. Commit with a [Conventional Commits](https://www.conventionalcommits.org/) message:
   `fix: ...` / `feat: ...` / `chore: ...` / `docs: ...`
6. Open a pull request

## Regenerating Icons

```bash
node scripts/generate-icons.js
```

## Regenerating Store Screenshots

```bash
cd screenshots
npm install   # first time only — installs puppeteer
node take-screenshots.js
```

Outputs `screenshot1-3.png` at 1280×800 from the HTML mockups.

## Coding Style

- 2-space indent, LF line endings (enforced by `.editorconfig`)
- No mutation of shared state outside of the designated module-level variables
- Keep functions under 50 lines
- No build tooling — plain ES2017 JS that Chrome 116+ understands natively
