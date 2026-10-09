# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**KeyWalk Analyzer** is an educational security tool that visualizes passwords on keyboard layouts and detects keyboard walking patterns (adjacent key sequences). It summarizes geometric string features, not a person's identity or actual typing behavior. KDS is a custom reference value, never a strength, safety, randomness, or cracking-time estimate.

- **Tech Stack**: Pure vanilla JavaScript (no build system), HTML5 Canvas, CSS
- **Run locally**: Open `index.html` directly in a browser (no server needed)
- **Demo**: https://ipusiron.github.io/keywalk-analyzer/

## Development Commands

```bash
# No build system - open directly in browser
start index.html              # Windows
open index.html               # macOS
xdg-open index.html           # Linux

# Dependency-free tests (Node.js 22+)
npm test

# Optional local HTTP server
python -m http.server 8000 --bind 127.0.0.1
```

## File Structure

```text
keywalk-analyzer/
├── index.html                 # Structure, meta CSP and accessible controls
├── settings.js                # Validated theme/language before CSS
├── keywalk-core.js            # Pure geometry and aggregation; CommonJS/browser
├── keywalk-messages.js        # Dynamic JA/EN messages
├── keywalk-ui-messages.js     # Static JA/EN text and attribute dictionary
├── script.js                  # Per-tab state, rendering and event binding
├── style.css                  # Responsive light/dark themes
├── test/                      # node:test, documentation and security checks
├── .github/workflows/test.yml # Node 22 on push and pull_request
├── assets/                    # Favicon and JA/EN screenshots
└── .nojekyll                  # GitHub Pages configuration
```

---

## Core Architecture

### 1. Keyboard Layout System

`keywalk-core.js` owns simplified QWERTY, JIS and Dvorak unit coordinates and shifted-symbol maps. Analysis never uses Canvas pixels. Unknown characters break segments and retain original code-point indices. JIS has no QWERTY fallback.

### 2. Two Analysis Modes

`analyze(text, layout)` computes geometry and reference KDS. `profile(text, layout)` keeps whitespace and duplicates, excludes only empty lines, and returns means with per-metric contributing-line counts. No mapped pair means the row is excluded from mean path length.

`state.single` and `state.profile` are independent. Input/layout changes invalidate the affected result. Language/theme/display changes redraw retained models without recalculation.

### 3. Key Detection Algorithms

- Adjacency: different keys with absolute dx and dy at most 1
- Walk: at least 3 consecutive adjacent keys, without crossing unknown input or same-key repeats
- H: eight direction bins for nonzero moves, not password entropy
- Turns: angles greater than 0.6 radians; null when no two nonzero moves can be compared
- CV: population standard deviation divided by mean, including zero steps; null for fewer than 2 steps or mean 0
- Knight: dy=1 and dx=2±0.25, or dy=2 and dx=1±0.25
- KDS: 30/25/20/15/10 weights, only with no unknown input, at least 4 mapped characters and 3 nonzero moves

### 4. Important Constants

`LIMITS`: single 10,000 code points; profile 50,000 total, 500 nonempty lines, 10,000 per line; plotted path 500 points. Finding lists show 20 items per kind with an omission notice. Exceeding analysis bounds is an error, not truncation.

### 5. Character Mapping

Only ASCII uppercase is folded. Shift symbols use the selected layout's key. JIS maps backslash to the number row and underscore to the bottom row; actual physical key identity cannot be recovered from text. U+00A5 is unsupported. Unknown whitespace/controls/marks use visible code-point notation in findings.

---

## Canvas Rendering

- **Two canvases**: `keyboard-canvas` (single analysis), `profile-canvas` (heatmap)
- **DPR support**: `setupCanvas()` handles Retina/high-DPI displays
- **Theme-aware**: Colors adjust based on `data-theme` attribute

## UI Event Binding

- `bind()`: inputs, presets, clear, per-tab layout, composition state, and keyboard tabs
- `initTheme()`: theme switch and redraw; initial theme is set by settings.js
- `initLocale()`: static text/attributes, dynamic results, html lang and language persistence
- `initTooltips()`: hover/focus/click, aria-describedby, Escape and scroll positioning
- `initAccordions()`: visibility and aria-expanded

Initial language: URL lang=ja|en, then saved preference, then browser language. Initial theme: saved valid preference, then OS preference. Storage denial must not break startup.

---

## Security Design

- Input is neither sent nor persisted by the app; only theme/language preferences use localStorage
- Meta CSP restricts resources to self, allows data images, and denies connections, fonts, objects and form submission
- Do not claim connect-src blocks all resource loading/navigation, or that meta can set HTTP-only headers
- Use textContent/Canvas, never HTML sinks for input
- Do not use real secrets in tests/screenshots; clear is not secure erasure of browser/OS records

---

## Extending the Tool

### Adding a new keyboard layout

1. Add the unit coordinates and symbol mappings to keywalk-core.js
2. Add selectors, presets and both language dictionaries
3. Test all key pairs, Shift mappings, unknown boundaries and tab independence
4. Verify README examples and explain model limitations

### Adding a new metric

1. Define the pure calculation, denominator, and undefined cases
2. Add fixed expected-value tests without changing them to fit implementation
3. Render the model and translate all labels/help/alerts
4. Verify HTTP and file:// in both languages/themes at 320, 390 and 1280px

---

## Key Implementation Notes

- No dependency installation, external fonts, API calls, build system or minification
- Preserve classic scripts plus CommonJS to support file://
- Keep JA/EN UI and full README translations aligned, including hidden panels and tooltips
- Do not label any sample strong/safe or use score thresholds as policy decisions
- Keep README metadata identity and block-list structure intact
- Commit each verified stage. Do not proceed after two failed repairs at the same gate
- Publish only via a work-branch PR when authorized. Wait for both push and pull_request Test success, then ordinary merge
- Never push directly to main, force push, use admin merge, rewrite expected values, or bypass an HTTP 401
- Verify main CI, Pages and public bytes before deleting a merged branch
