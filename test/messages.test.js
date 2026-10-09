const test = require('node:test');
const assert = require('node:assert/strict');
const messages = require('../keywalk-messages.js');
const ui = require('../keywalk-ui-messages.js');
test('step navigation, positions and every classification are translated', () => {
  const keys = ['stepTitle', 'stepNote', 'stepPosition', ...['first', 'prev', 'next', 'last'].map(k => 'step_' + k),
    ...['start', 'restart', 'unknown', 'repeat', 'adjacent', 'jump'].map(k => 'step_kind_' + k)];
  for (const key of keys) {
    assert.ok(messages.ja[key], key);
    assert.ok(messages.en[key], key);
    assert.doesNotMatch(messages.en[key], /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u);
  }
});
test('every comparison, direction and KDS formula has Japanese and English text', () => {
  const keys = ['comparisonTitle', 'comparisonNote', 'calculationTitle', 'calculationFor', 'adjacencyMath', 'movementMath',
    'turnMath', 'cvMath', 'noPairs', 'noCV', 'noDirection', 'entropyMath', 'kdsPartsNote', 'kdsInputs', 'partValue', 'kdsTotal'];
  keys.push(...Array.from({length:8}, (_, i) => 'direction_' + i));
  for (const r of require('../keywalk-core.js').compareLayouts('aoeuid')) keys.push('layout_' + r.layout);
  for (const p of require('../keywalk-core.js').analyze('asdfgh').kdsBreakdown) keys.push('part_' + p.id, 'formula_' + p.id);
  for (const key of keys) {
    assert.ok(messages.ja[key], key);
    assert.ok(messages.en[key], key);
    assert.doesNotMatch(messages.en[key], /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u);
  }
});
test('Japanese and English dictionaries have identical keys and placeholders', () => {
  for (const dictionary of [messages, ui]) {
    assert.deepEqual(Object.keys(dictionary.ja).sort(), Object.keys(dictionary.en).sort());
    for (const key of Object.keys(dictionary.ja)) {
      assert.ok(dictionary.en[key].trim(), key);
      const placeholders = value => (value.match(/\{\w+\}/g) || []).sort();
      assert.deepEqual(placeholders(dictionary.ja[key]), placeholders(dictionary.en[key]), key);
    }
  }
});
test('analysis messages are nonempty text and contain no markup', () => {
  for (const values of Object.values(messages)) for (const value of Object.values(values)) {
    assert.equal(typeof value, 'string');
    assert.ok(value.trim());
    assert.doesNotMatch(value, /<\/?[a-z][^>]*>/i);
  }
});
