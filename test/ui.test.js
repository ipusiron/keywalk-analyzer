const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname,'..',name),'utf8');
test('profile samples use an initially open native disclosure with preview and explicit load', () => {
  const html = read('index.html');
  const panel = html.match(/<details class="sample-panel learning-section" id="profile-learning-samples" open>([\s\S]*?)<\/details>/);
  assert.ok(panel);
  assert.match(panel[1], /^\s*<summary id="profile-sample-heading"><\/summary>/);
  assert.match(panel[1], /for="profile-sample-select"/);
  assert.match(panel[1], /<pre id="profile-sample-preview" class="sample-preview-lines"><\/pre>/);
  assert.match(panel[1], /<button type="button" id="load-profile-sample"/);
  assert.match(panel[1], /id="profile-sample-feedback" role="status" aria-live="polite" aria-atomic="true"/);
  assert.doesNotMatch(panel[1], /id="(?:analyze-profile|clear-profile|generate-sample)"/);
  assert.doesNotMatch(html, /preset-btn-profile/);
  assert.match(read('style.css'), /\.sample-preview-lines\{white-space:pre-wrap;overflow-wrap:anywhere/);
});
test('all four profile sets preserve the exact five lines in every layout', () => {
  const source = read('script.js').match(/const PRESETS_PROFILE = (\{[\s\S]*?\n\});/)[1];
  const actual = require('node:vm').runInNewContext('(' + source + ')');
  const shared = {
    basic: 'Password123\nWelcome2024\nAdmin123\nLogin2024\nAccess123',
    year: 'Tokyo2023!\nOsaka2024!\nKyoto2022!\nNagoya2025!\nSapporo2021!',
    random: 'xK9#mQ2$vL\nR7@bN4!jX3\nM5&pW8*dF1\nT2#vK6@hL9\nY4$nC8!qZ7'
  };
  const walks = {qwerty:'qwerty12\nasdfgh34\nzxcvbn56\nqazwsx78\nwsxedc90',
    jis:'qwertyui\nasdfghjk\nzxcvbnm\n1qaz2wsx\n3edc4rfv', dvorak:'aoeu\nhtns\n123456\npyfgcr\nqjkxbm'};
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(walks).sort());
  for (const layout of Object.keys(walks)) {
    assert.deepEqual(JSON.parse(JSON.stringify(actual[layout])), {...shared, keyboard:walks[layout]});
    for (const value of Object.values(actual[layout])) assert.equal(value.split('\n').length, 5);
  }
});
test('profile sample labels and limitations are present in both languages', () => {
  const messages = require('../keywalk-messages.js');
  for (const lang of ['ja', 'en']) {
    for (const key of ['profileSampleLabel', 'profileSamplePreview', 'profileSampleNote', 'profileSampleLoaded',
      'profileSample_basic', 'profileSample_year', 'profileSample_keyboard', 'profileSample_random']) {
      assert.ok(messages[lang][key], lang + ': ' + key);
    }
  }
  assert.equal(messages.ja.profileSample_random, '固定の混在例');
  assert.equal(messages.en.profileSample_random, 'Fixed mixed example');
  assert.match(messages.ja.profileSampleNote, /ランダム生成ではありません/);
  assert.match(messages.en.profileSampleNote, /not randomly generated/);
});
test('learning samples use a native accordion that starts open and contains both sample controls', () => {
  const html = read('index.html');
  const panel = html.match(/<details class="sample-panel learning-section" id="learning-samples" open>([\s\S]*?)<\/details>/);
  assert.ok(panel);
  assert.match(panel[1], /^\s*<summary id="sample-heading"><\/summary>/);
  for (const id of ['sample-select', 'load-sample', 'random-kind', 'random-length', 'generate-sample', 'sample-feedback']) {
    assert.ok(panel[1].includes('id="' + id + '"'));
  }
  assert.doesNotMatch(panel[1], /id="(?:analyze|clear)"/);
});
test('samples use labelled selects and separate explicit load and generate buttons', () => {
  const html = read('index.html'), css = read('style.css');
  for (const id of ['sample-select','random-kind','random-length']) {
    assert.match(html, new RegExp('for="' + id + '"'));
    assert.match(html, new RegExp('<select id="' + id + '"'));
  }
  for (const id of ['load-sample','generate-sample']) assert.match(html, new RegExp('<button type="button" id="' + id + '"'));
  assert.match(html, /id="sample-feedback" role="status" aria-live="polite"/);
  assert.match(css, /\.sample-picker,\.random-controls\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
  assert.ok(html.indexOf('./keywalk-samples.js') < html.indexOf('./script.js'));
});
test('step inspector uses native disclosure, live text and four bounded touch controls', () => {
  const html = read('index.html'), css = read('style.css');
  assert.match(html, /<details[^>]*id="path-inspector"[^>]*hidden/);
  assert.match(html, /id="step-status" role="status" aria-live="polite" aria-atomic="true"/);
  for (const name of ['first', 'prev', 'next', 'last']) {
    assert.match(html, new RegExp('<button type="button"[^>]*id="step-' + name + '"'));
  }
  assert.match(css, /\.step-controls\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.step-controls button\{min-height:44px;min-width:44px/);
});
test('step drawing never bridges unknowns and only plots the selected pair or current repeat', () => {
  const vm = require('node:vm'), C = require('../keywalk-core.js');
  const source = read('script.js').match(/function drawStep\(\) \{[\s\S]*?\n\}/)[0];
  const steps = C.pathSteps(C.analyze('Aa!😀 sd'));
  for (const [index, positions] of [[0, [0]], [1, [1]], [2, [1, 2]], [3, []], [4, []], [5, [5]], [6, [5, 6]]]) {
    for (const mode of ['path', 'dots']) {
      let plotted = [], rect = null, actualMode;
      vm.runInNewContext(source + '\ndrawStep();', {
        stepState: {steps, index}, document: {documentElement: {dataset: {theme: 'light'}}, getElementById: () => ({value: mode})},
        plotPath: (points, display) => { plotted = points; actualMode = display; },
        ctx: {save() {}, restore() {}, strokeRect(...args) { rect = args; }}
      });
      assert.deepEqual(Array.from(plotted, p => p.index), positions);
      if (!positions.length) { assert.equal(rect, null); continue; }
      const point = steps[index].point;
      assert.deepEqual(rect, [8 + 78*point.x, 38 + 78*point.y, 70, 64]);
      assert.equal(actualMode, mode);
    }
  }
});
test('learning sections are hidden initially and use native keyboard-operable details', () => {
  const html = read('index.html'), css = read('style.css');
  assert.match(html, /<section[^>]*id="layout-comparison"[^>]*hidden/);
  assert.match(html, /<details[^>]*id="calculation-details"[^>]*hidden/);
  assert.match(html, /<summary id="calculation-summary"><\/summary>/);
  assert.match(css, /\.comparison-grid\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.learning-section summary:focus-visible/);
  const definitions = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
  const learning = css.slice(css.indexOf('.learning-section{'));
  for (const [, name] of learning.matchAll(/var\((--[\w-]+)\)/g)) assert.ok(definitions.has(name), name);
});
test('canvas keeps aspect ratio and scrolls inside its own region', () => {
  const css = read('style.css');
  assert.match(css, /aspect-ratio:1100\/420/);
  assert.doesNotMatch(css, /aspect-ratio:1\/1/);
  assert.match(css, /\.keyboard-scroll\{overflow-x:auto/);
  assert.equal((read('index.html').match(/class="keyboard-scroll"/g) || []).length, 2);
});
test('basic touch targets, input font and reduced motion', () => {
  const css = read('style.css');
  assert.match(css, /min-height:44px/);
  assert.match(css, /line-height:1.6;font-size:16px/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(css, /@import/);
});
test('primary, muted and button colors meet 4.5 contrast in both themes', () => {
  const css = read('style.css');
  const luminance = hex => {
    const c = hex.match(/[a-f0-9]{2}/gi).map(v => parseInt(v,16)/255)
      .map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
    return c[0]*.2126+c[1]*.7152+c[2]*.0722;
  };
  const contrast = (a,b) => (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  const base = css.match(/:root\{([\s\S]*?)\}/)[1];
  const light = css.match(/\[data-theme="light"\]\{([\s\S]*?)\}/)[1];
  for(const source of [base,light]) {
    const vars = Object.fromEntries([...source.matchAll(/--([\w-]+):(#\w{6});/g)].map(m=>[m[1],luminance(m[2])]));
    for (const [fg,bg] of [['text-primary','cyber-card'],['text-muted','cyber-card'],['text-muted','cyber-bg'],
      ['text-on-primary','neon-cyan'],['btn-hover-text','btn-hover-solid']]) {
      assert.ok(contrast(vars[fg],vars[bg])>=4.5,`${fg}/${bg}`);
    }
  }
});
