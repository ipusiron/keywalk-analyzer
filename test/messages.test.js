const test = require('node:test');
const assert = require('node:assert/strict');
const messages = require('../keywalk-messages.js');
const ui = require('../keywalk-ui-messages.js');
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
