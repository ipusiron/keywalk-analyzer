# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**KeyWalk Analyzer** is an educational security tool that visualizes passwords on keyboard layouts and detects keyboard walking patterns (adjacent key sequences). It profiles typing habits and password patterns to help users understand weak password characteristics.

- **Tech Stack**: Pure vanilla JavaScript (no build system), HTML5 Canvas, CSS
- **Run locally**: Open `index.html` directly in a browser (no server needed)
- **Demo**: https://ipusiron.github.io/keywalk-analyzer/

## Core Architecture

### 1. Keyboard Layout System (`script.js:6-59`)
- **Multiple layouts supported**: QWERTY (US), JIS (simplified Japanese), Dvorak
- **Coordinate mapping**: `buildCoordMap()` generates (x,y) positions for each key on canvas
- **Layout switching**: Both analysis modes share the same coordinate map that updates on layout change

### 2. Two Analysis Modes

#### Single Password Analysis (`script.js:248-317`)
- Visualizes password path on keyboard canvas (polyline or dots)
- Calculates 8 metrics:
  - Unique key count, total movement distance, direction turns
  - Adjacent key ratio, direction entropy (H), step coefficient of variation (CV)
  - Knight move ratio (chess knight-like jumps)
  - **KDS (Keyboard Dependency Score)**: Composite 0-100 score (≥60=bad, 40-59=warning, <40=good)
- Pattern detection: known patterns (qwerty, asdf, password), adjacent walks, straight lines, repeated n-grams

#### Profile Analysis (`script.js:320-388`)
- Processes multiple passwords (one per line)
- Generates heatmap showing frequently used keys
- Extracts typing habits:
  - Top 8 used keys, top 5 bigrams
  - Prefix patterns (capital starts, letter sequences)
  - Suffix patterns (year numbers 2010-2025, digit sequences, punctuation)
  - Zone bias (left/right hand, top/middle/bottom rows)

### 3. Key Detection Algorithms

**Adjacent Walk Detection** (`script.js:192-212`): Graph-based, layout-agnostic algorithm that finds sequences of 3+ adjacent key presses using distance thresholds (60px horizontal, 36px vertical).

**Direction Entropy** (`script.js:146-160`): Quantizes movement into 8 compass directions and calculates Shannon entropy. Low entropy (<1.50) indicates repetitive/linear patterns.

**Step CV** (`script.js:161-168`): Coefficient of variation for step distances. Low CV (<0.25) means monotonous movement.

**Knight Move Detection** (`script.js:169-178`): Detects chess knight-like jumps (2:1 or 1:2 distance ratios) which indicate non-linear typing.

### 4. Character Mapping (`script.js:82-101`)
- **Shift unmapping** (`shiftUnmap()`): Maps shifted symbols (!@#$) back to base keys (1234) for coordinate lookup
- **Unknown character handling**: Tracks unmapped characters and displays warnings
- Filters whitespace (space/tab/newline) from analysis

## Important Constants & Thresholds (`script.js:30-35`)

```javascript
THRESH = {
  adj_dx: 60, adj_dy: 36,      // Adjacent key detection distances
  entropy_bad: 1.50,            // Low direction entropy threshold
  stepcv_bad: 0.25,             // Monotonous step CV threshold
  high_adj_ratio: 0.70          // High adjacent ratio (walking pattern)
}
```

## Canvas Rendering

- **Two canvases**: `keyboard-canvas` (single analysis), `profile-canvas` (heatmap)
- **Drawing functions**:
  - `drawKeyboards()`: Renders keyboard layout on both canvases
  - `plotPath()`: Draws password path with numbered circles (green=start, white=rest)
  - Profile mode uses semi-transparent overlapping circles for heatmap effect (`pctx.globalAlpha=0.25`)

## UI Structure

- Tab switching between "単体分析" (Single) and "癖プロファイル" (Profile)
- Shared layout selector (QWERTY/JIS/Dvorak) per tab
- Single mode: path/dots display toggle
- All processing happens client-side (no data transmission)

## Deployment

- GitHub Pages via `.nojekyll` file
- Static site - just commit and push to `main` branch
- Assets in `assets/` folder (favicon.svg, screenshot.png)

## Key Implementation Notes

- **No dependencies**: All algorithms implemented from scratch
- **ABCE Spec v1.1**: Code follows specific specification for walk detection metrics
- **Educational focus**: Designed to demonstrate password weakness patterns, not for malicious use
- **JIS layout**: Simplified version with primary keys only, falls back to QWERTY for unmapped keys
