const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../keywalk-core.js');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);

for (const [layout, word] of [['qwerty', 'asdfgh'], ['jis', 'asdfgh'], ['dvorak', 'aoeuid']]) {
  test(`${layout}: complete horizontal walk`, () => {
    const r = C.analyze(word, layout);
    assert.equal(r.adjacent, 1);
    assert.equal(r.distance, 5);
    assert.equal(r.turns, 0);
    assert.equal(r.entropy, 0);
    assert.equal(r.cv, 0);
    assert.equal(r.walks[0].text, word);
    assert.equal(r.kds, 100);
  });
  test(`${layout}: all keys and shift mappings stay in layout`, () => {
    const keys = C.keys(layout);
    assert.equal(new Set(keys.map(p => p.key)).size, keys.length);
    for (const p of keys) assert.equal(C.mapText(p.key, layout).points[0].key, p.key);
    for (const a of keys) for (const b of keys) {
      assert.equal(C.adjacent(a, b), C.adjacent(b, a));
      if (a.key === b.key) assert.equal(C.adjacent(a, b), false);
    }
  });
}
test('JIS shifted punctuation uses JIS keys', () => {
  const pairs = {'!':'1', '"':'2', '&':'6', "'":'7', '(':'8', ')':'9', '=':'-', '~':'^', '+':';', '*':':', '`':'@'};
  for (const [char, key] of Object.entries(pairs)) assert.equal(C.mapText(char, 'jis').points[0].key, key);
});
test('US shifted punctuation and Dvorak punctuation', () => {
  assert.equal(C.mapText('@', 'qwerty').points[0].key, '2');
  assert.equal(C.mapText('_', 'dvorak').points[0].key, '-');
  assert.equal(C.mapText('+', 'dvorak').points[0].key, '=');
});
for (const input of ['', 'a', 'aa', 'aaa', 'あ', '😀', 'ab']) {
  test(`insufficient data: ${JSON.stringify(input)}`, () => assert.equal(C.analyze(input).kds, null));
}
test('unknown characters break paths, retain code-point indices and original case', () => {
  const r = C.analyze('😀ASD あfgh', 'qwerty');
  assert.deepEqual(r.walks.map(w => [w.text, w.start]), [['ASD', 1], ['fgh', 6]]);
  assert.equal(r.distance, 4);
  assert.equal(r.unknown.length, 3);
  assert.equal(r.kds, null);
});
test('same-key repeats are not walks, turns, entropy or meaningful CV', () => {
  const r = C.analyze('aaaaaa');
  assert.equal(r.adjacent, 0);
  assert.equal(r.repeats, 5);
  assert.equal(r.turns, null);
  assert.equal(r.entropy, null);
  assert.equal(r.cv, null);
  assert.deepEqual(r.walks, []);
  assert.deepEqual(r.repeated[0], {text: 'aa', count: 5});
});
test('two opposing directions have H=1; turn at reversal is counted', () => {
  const r = C.analyze('asa', 'qwerty');
  assert.equal(r.entropy, 1);
  assert.equal(r.turns, 1);
});
test('eight equal movement bins have H=3', () => {
  const vectors = [[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1],[0,1],[1,1]];
  const r = C.geometry(vectors.map(([x,y]) => [{x:0,y:0,key:'a'},{x,y,key:'b'}]));
  near(r.entropy, 3);
});
test('profile retains whitespace and does not bridge unknown characters', () => {
  const r = C.profile(' asd \r\n\r\nas d\n😀');
  assert.equal(r.lines, 3);
  assert.equal(r.unknown, 4);
  assert.ok(!r.bigrams.some(([key]) => key === 'sd' && r.bigrams.find(([k]) => k === key)[1] > 1));
});
test('profile no-data means are null, not zero', () => {
  const r = C.profile('a\n😀\nasd');
  assert.deepEqual(r.adjacent, {value:1,count:1});
  assert.deepEqual(r.distance, {value:2,count:1});
  assert.equal(C.profile('').zones, null);
});
test('prefix rules run without exceptions', () => {
  assert.deepEqual(C.prefixes(['Password123', 'ABC', 'abc', 'Abc123!']), [
    {id:'title',count:2}, {id:'upper',count:1}, {id:'lower',count:1}, {id:'template',count:1}
  ]);
});
test('year-like endings cover 1900-2099 with optional !?. but not longer digit runs', () => {
  assert.deepEqual(C.suffixes(['A1900', 'A2099!', 'A1899', 'A2100', 'A12025']).find(r => r.id === 'year'),
    {id:'year',count:2});
});
test('zones use whole keyboard not sample bounds', () => {
  const z = C.zones(C.mapText('p','qwerty').points, 'qwerty');
  assert.equal(z.right, 1);
  assert.equal(z.left, 0);
  assert.equal(z.top, 1);
});
test('unknown Unicode case equivalents do not become ASCII keys', () => {
  assert.equal(C.mapText('\u212A').points.length, 0);
});
test('single input bounds are code points and reject without truncation', () => {
  assert.equal(C.analyze('a'.repeat(C.LIMITS.single)).characters, C.LIMITS.single);
  assert.throws(() => C.analyze('a'.repeat(C.LIMITS.single + 1)), /singleLimit/);
  assert.equal(C.analyze('😀'.repeat(C.LIMITS.single)).unknown.length, C.LIMITS.single);
});
test('profile bounds and invalid API input', () => {
  assert.throws(() => C.profile('a\n'.repeat(501)), /lineLimit/);
  assert.throws(() => C.profile('a'.repeat(50001)), /profileLimit/);
  assert.throws(() => C.analyze(null), TypeError);
  assert.throws(() => C.analyze('abc','unknown'), /layout/);
});
test('control characters are visible and cannot reorder output', () => {
  assert.equal(C.visible('a\u202Eb\n'), 'a[U+202E]b[U+000A]');
});

test('layout comparison has a fixed order and equals independent single analyses', () => {
  for (const input of ['aoeuid', 'a@_\\', 'ASD 😀fgh', '', 'aaaa', 'a'.repeat(10000)]) {
    const results = C.compareLayouts(input);
    assert.deepEqual(results.map(r => r.layout), ['jis', 'qwerty', 'dvorak']);
    results.forEach(r => assert.deepEqual(r, C.analyze(input, r.layout)));
  }
  assert.deepEqual(C.compareLayouts('aoeuid').map(r => r.adjacent), [0.2, 0.2, 1]);
  assert.throws(() => C.compareLayouts('a'.repeat(10001)), /singleLimit/);
  assert.throws(() => C.compareLayouts(null), TypeError);
});
test('geometry exposes exact denominators and counts, including repeats and segment breaks', () => {
  const r = C.analyze('aas dsa', 'jis');
  assert.equal(r.transitions, 4);
  assert.equal(r.adjacentCount, 3);
  assert.equal(r.repeats, 1);
  assert.equal(r.moving, 3);
  assert.equal(r.turnPairs, 1);
  assert.deepEqual(r.bins, [1, 0, 0, 0, 2, 0, 0, 0]);
  assert.equal(r.knightCount, 0);
});
test('KDS contributions expose five weights and preserve the unrounded total', () => {
  const r = C.analyze('aoeuid', 'dvorak');
  assert.deepEqual(r.kdsBreakdown.map(p => p.id), ['adjacency', 'direction', 'turns', 'pattern', 'variation']);
  assert.deepEqual(r.kdsBreakdown.map(p => p.maximum), [30, 25, 20, 15, 10]);
  assert.deepEqual(r.kdsBreakdown.map(p => p.factor), [1, 1, 1, 1, 1]);
  assert.deepEqual(r.kdsBreakdown.map(p => p.contribution), [30, 25, 20, 15, 10]);
  assert.equal(r.kdsRaw, 100);
  assert.equal(r.kds, 100);
  for (const input of ['qwerty123!', 'aoeuid', 'asdfgh', 'asasasas', 'xK9#mQ2$vL']) {
    for (const r of C.compareLayouts(input)) {
      near(r.kdsRaw, r.kdsBreakdown.reduce((sum, p) => sum + p.contribution, 0));
      assert.equal(r.kds, Math.round(r.kdsRaw));
      for (const p of r.kdsBreakdown) assert.ok(p.factor >= 0 && p.factor <= 1);
    }
  }
});
test('unavailable KDS does not expose fabricated zero contributions', () => {
  for (const input of ['', 'aaa', 'aaaa', 'asd fgh', '😀']) {
    const r = C.analyze(input);
    assert.equal(r.kdsRaw, null);
    for (const part of r.kdsBreakdown) {
      assert.equal(part.factor, null);
      assert.equal(part.contribution, null);
    }
  }
});
test('direction counts, ratios and contributions agree for all supported key pairs', () => {
  for (const layout of ['jis', 'qwerty', 'dvorak']) {
    for (const a of C.keys(layout)) for (const b of C.keys(layout)) {
      const r = C.analyze(a.key + b.key, layout);
      assert.equal(r.bins.reduce((sum, n) => sum + n, 0), r.moving);
      assert.equal(r.adjacentCount / r.transitions, r.adjacent);
      assert.equal(r.knightCount / r.transitions, r.knight);
      assert.equal(r.transitions, r.moving + r.repeats);
      assert.ok(r.kdsBreakdown.every(p => p.factor === null));
    }
  }
});
test('unsupported coverage is layout-specific; comparison never trims or substitutes input', () => {
  const rows = C.compareLayouts('asdf\\');
  assert.deepEqual(rows.map(r => r.unknown.length), [0, 0, 1]);
  assert.deepEqual(rows.map(r => r.characters), [5, 5, 5]);
  assert.equal(rows[2].kdsReason, 'incomplete');
  for (const r of C.compareLayouts(' asdf ')) {
    assert.equal(r.unknown.length, 2);
    assert.equal(r.characters, 6);
    assert.equal(r.kds, null);
  }
});
