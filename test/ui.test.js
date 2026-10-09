const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname,'..',name),'utf8');
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
