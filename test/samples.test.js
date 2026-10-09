const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../keywalk-samples.js');
const C = require('../keywalk-core.js');
test('eight approved typical examples preserve exact text on all three layouts', () => {
  const expected = {digitsUp:'1234567890', digitsDown:'0987654321', sameDigit:'111111', alternating:'12121212',
    digitCycle:'123123123', vertical:'1qaz', roundTrip:'asdfdsa', gap:'asd fgh'};
  assert.deepEqual(S.typical, expected);
  const ids = S.groups.flatMap(group => group.items);
  assert.equal(ids.length, 13);
  assert.equal(new Set(ids).size, 13);
  for (const layout of ['jis', 'qwerty', 'dvorak']) for (const [id, value] of Object.entries(expected)) {
    assert.equal(S.single(layout, id), value);
    const r = C.analyze(value, layout);
    assert.equal(r.characters, value.length);
    assert.equal(r.unknown.length, id === 'gap' ? 1 : 0);
    if (id === 'gap') assert.equal(r.segments.length, 2);
  }
  assert.equal(C.analyze(S.single('jis', 'sameDigit')).distance, 0);
  assert.equal(C.analyze(S.single('jis', 'alternating')).turns, 6);
});
test('five original samples retain their layout-specific strings', () => {
  const rows = [
    ['qwerty', 'qwerty123', 'asdfgh', 'P@ssw0rd!', 'Tr0ub4dor&3', 'xK9#mQ2$vL'],
    ['jis', 'qwerty123', 'asdfghjkl', 'P@ssw0rd!', 'Sakura2024!', 'xK9#mQ2$vL'],
    ['dvorak', '123456', 'aoeu', 'P@ssw0rd!', 'Tr0ub4dor&3', 'xK9#mQ2$vL']
  ];
  for (const [layout, ...values] of rows) {
    assert.deepEqual(['walk1','walk2','common','dict','strong'].map(id => S.single(layout, id)), values);
  }
  for (const id of ['constructor', '__proto__', 'absent']) assert.throws(() => S.single('jis', id), /sample/);
  assert.throws(() => S.single('__proto__', 'walk1'), /layout/);
});
test('random generation supports only the two alphabets and three numeric lengths', () => {
  assert.deepEqual(S.lengths, [8, 12, 16]);
  assert.equal(S.alphabets.digits, '0123456789');
  assert.equal(S.alphabets.alphanumeric, '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz');
  for (const kind of Object.keys(S.alphabets)) for (const length of S.lengths) {
    const actual = S.random(kind, length, bytes => bytes.forEach((_, i) => { bytes[i] = i; }));
    assert.equal(actual, S.alphabets[kind].repeat(2).slice(0, length));
    for (const layout of ['jis', 'qwerty', 'dvorak']) assert.equal(C.analyze(actual, layout).unknown.length, 0);
  }
  for (const length of [0, -1, 9, 10000, 8.5, '8', NaN, Infinity]) {
    assert.throws(() => S.random('digits', length), /randomLength/);
  }
  assert.throws(() => S.random('__proto__', 8), /randomKind/);
});
test('rejection boundaries do not wrap excess bytes back to the first characters', () => {
  for (const [kind, boundary, last] of [['digits', 250, '9'], ['alphanumeric', 248, 'z']]) {
    const result = S.random(kind, 8, bytes => {
      bytes.fill(255);
      bytes[0] = boundary;
      bytes[1] = boundary - 1;
      bytes[2] = 0;
    });
    assert.equal(result, (last + '0').repeat(4));
  }
});
test('all accepted byte values give each alphabet character the same number of representatives', () => {
  for (const kind of Object.keys(S.alphabets)) {
    const alphabet = S.alphabets[kind], counts = new Map(Array.from(alphabet, c => [c, 0]));
    const ceiling = Math.floor(256 / alphabet.length) * alphabet.length;
    for (let value = 0; value < ceiling; value++) {
      const output = S.random(kind, 8, bytes => bytes.fill(value));
      assert.equal(output, alphabet[value % alphabet.length].repeat(8));
      counts.set(output[0], counts.get(output[0]) + 1);
    }
    assert.deepEqual([...new Set(counts.values())], [Math.floor(256 / alphabet.length)]);
  }
});
test('random source failure never returns partial output and retry count is bounded', () => {
  let calls = 0;
  assert.throws(() => S.random('digits', 8, bytes => { calls++; bytes.fill(255); }), /randomUnavailable/);
  assert.equal(calls, 32);
  assert.throws(() => S.random('digits', 8, () => { throw Error('failure'); }), /randomUnavailable/);
  const source = fs.readFileSync(path.join(__dirname, '../keywalk-samples.js'), 'utf8');
  assert.match(source, /crypto\.getRandomValues/);
  assert.doesNotMatch(source, /Math\.random/);
});
