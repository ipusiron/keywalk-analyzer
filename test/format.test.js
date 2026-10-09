const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
test('source remains reviewable, unminified, and within line-length bounds', () => {
  const files = [...fs.readdirSync(root).filter(f => /\.(js|css|html)$/.test(f)),
    ...fs.readdirSync(__dirname).filter(f => f.endsWith('.js')).map(f => 'test/' + f)];
  assert.ok(files.length >= 14);
  for (const file of files) {
    const lines = fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/);
    const limit = file.endsWith('.html') ? 250 : 160;
    for (const [i, line] of lines.entries()) assert.ok(line.length <= limit, `${file}:${i+1} (${line.length})`);
  }
  for (const [file, minimum] of [['script.js', 400], ['keywalk-core.js', 190], ['style.css', 500], ['index.html', 230]]) {
    assert.ok(fs.readFileSync(path.join(root, file), 'utf8').split('\n').length >= minimum, file);
  }
});
test('path labels use dark ink on their white point cores in both themes', () => {
  const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
  assert.match(script, /const numBg = '#0a0e27'/);
  assert.match(script, /ctx\.fillStyle=numBg/);
});
