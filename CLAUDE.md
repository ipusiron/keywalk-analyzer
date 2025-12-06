# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**KeyWalk Analyzer** is an educational security tool that visualizes passwords on keyboard layouts and detects keyboard walking patterns (adjacent key sequences). It profiles typing habits and password patterns to help users understand weak password characteristics.

- **Tech Stack**: Pure vanilla JavaScript (no build system), HTML5 Canvas, CSS
- **Run locally**: Open `index.html` directly in a browser (no server needed)
- **Demo**: https://ipusiron.github.io/keywalk-analyzer/

## Development Commands

```bash
# No build system - open directly in browser
start index.html              # Windows
open index.html               # macOS
xdg-open index.html           # Linux

# Deploy: commit and push to main (GitHub Pages auto-deploys)
git add . && git commit -m "message" && git push
```

## File Structure

```
keywalk-analyzer/
├── index.html       # Main HTML with CSP headers and UI structure
├── script.js        # All analysis logic, algorithms, and UI binding
├── style.css        # Dark/light theme with CSS custom properties
├── assets/          # favicon.svg, screenshots
└── .nojekyll        # GitHub Pages config
```

## Core Architecture

### 1. Keyboard Layout System (`script.js:29-116`)
- **Layouts**: `KEY_LAYOUTS` object defines QWERTY (US), JIS (simplified Japanese), Dvorak
- **Coordinate mapping**: `buildCoordMap()` generates (x,y) positions for each key on canvas
- **Global state**: `coordMap` variable holds current layout; rebuilt on layout change

### 2. Two Analysis Modes

#### Single Password Analysis (`script.js:368-447`)
Entry point: `analyzeSingle()` - called on "分析する" button click
- Visualizes password path on keyboard canvas (polyline or dots)
- Calculates 8 metrics: unique keys, distance, turns, adjacent ratio, direction entropy (H), step CV, knight ratio, KDS
- Pattern detection: known patterns, adjacent walks, straight lines, repeated n-grams

#### Profile Analysis (`script.js:449-528`)
Entry point: `analyzeProfile()` - called on "癖を分析" button click
- Processes multiple passwords (one per line)
- Generates heatmap showing frequently used keys
- Extracts typing habits: top keys, bigrams, prefix/suffix patterns, zone bias

### 3. Key Detection Algorithms

| Algorithm | Function | Purpose |
|-----------|----------|---------|
| Adjacent Walk | `detectAdjacentWalks()` | Graph-based detection of 3+ adjacent key sequences |
| Direction Entropy | `directionEntropy()` | Shannon entropy of 8-direction quantized movements |
| Step CV | `stepCV()` | Coefficient of variation for step distances |
| Knight Move | `knightRatio()` | Chess knight-like jumps (2:1 ratio movements) |
| KDS Score | `kdsScore()` | Composite 0-100 keyboard dependency score |

### 4. Important Constants (`script.js:54-60`)

```javascript
const THRESH = {
  adj_dx: 60, adj_dy: 36,      // Adjacent key detection thresholds (pixels)
  entropy_bad: 1.50,            // Low entropy = repetitive pattern
  stepcv_bad: 0.25,             // Low CV = monotonous movement
  high_adj_ratio: 0.70          // 70%+ adjacent = keyboard walking
};
```

### 5. Character Mapping

- `shiftUnmap()` (`script.js:160-166`): Maps shifted symbols (!@#$) back to base keys (1234)
- `textToPoints()` (`script.js:169-179`): Converts input text to coordinate array, tracks unknown chars

## Canvas Rendering

- **Two canvases**: `keyboard-canvas` (single analysis), `profile-canvas` (heatmap)
- **DPR support**: `setupCanvas()` handles Retina/high-DPI displays
- **Theme-aware**: Colors adjust based on `data-theme` attribute

## UI Event Binding (`script.js:636-693`)

- `bind()`: Sets up all event listeners (tabs, buttons, presets, layout changes)
- `initTheme()`: Theme toggle with localStorage persistence
- `initTooltips()`: Help icon hover tooltips
- `initAccordions()`: Collapsible hint sections

## Security Design

- **CSP enforced**: `connect-src 'none'` blocks all network requests
- **No data persistence**: Passwords never stored (only theme in localStorage)
- **Client-side only**: All processing in browser, no backend

## Extending the Tool

### Adding a new keyboard layout:
1. Add layout array to `KEY_LAYOUTS` in script.js:29-48
2. Add option to both `<select id="layout">` and `<select id="profile-layout">` in index.html
3. Add preset samples to `PRESETS_SINGLE` and `PRESETS_PROFILE` objects

### Adding a new metric:
1. Implement calculation function (see `stepCV()`, `knightRatio()` as examples)
2. Call in `analyzeSingle()` and display via `setText()`
3. Add UI element in index.html results section

## Key Implementation Notes

- **No dependencies**: All algorithms implemented from scratch
- **ABCE Spec v1.1**: Code follows specific specification for walk detection metrics
- **Educational focus**: Designed to demonstrate password weakness patterns
- **JIS layout**: Simplified version with primary keys only, falls back to QWERTY for unmapped keys
