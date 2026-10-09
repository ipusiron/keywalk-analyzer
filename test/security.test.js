const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
test('CSP restricts connections and executable resources; preferences run before CSS', () => {
  const html = read('index.html');
  for (const policy of ["connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) {
    assert.ok(html.includes(policy));
  }
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|http-equiv="(?:X-Frame|X-Content)/);
  assert.doesNotMatch(html, /<script[^>]+src="https?:|\son\w+\s*=/i);
  const settings = html.indexOf('src="./settings.js"'), css = html.indexOf('href="./style.css"');
  assert.ok(settings >= 0 && css > settings);
  assert.match(html, /<noscript>/);
});
test('runtime never sends or persists input and avoids HTML sinks', () => {
  for (const file of ['script.js', 'keywalk-core.js', 'keywalk-samples.js', 'settings.js']) {
    const source = read(file);
    assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|\beval\s*\(|\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/);
    for (const match of source.matchAll(/localStorage\.(?:getItem|setItem)\('([^']+)'/g)) {
      assert.ok(['theme', 'language'].includes(match[1]));
    }
  }
  assert.doesNotMatch(read('style.css'), /@import|https?:/);
});
test('tabs, accordions and help have keyboard-readable structure', () => {
  const html = read('index.html');
  assert.equal((html.match(/role="tab"/g) || []).length, 2);
  assert.equal((html.match(/aria-expanded="false"/g) || []).length, 2);
  assert.match(html, /<button[^>]+class="help-icon"/);
  assert.match(read('script.js'), /ArrowLeft.*ArrowRight.*Home.*End/);
  assert.match(read('style.css'), /\[hidden\]\{display:none !important\}/);
});
