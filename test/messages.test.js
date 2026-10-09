const test = require('node:test');
const assert = require('node:assert/strict');
const messages = require('../keywalk-messages.js');
test('analysis messages are nonempty text and contain no markup', () => {
  for (const values of Object.values(messages)) for (const value of Object.values(values)) {
    assert.equal(typeof value, 'string');
    assert.ok(value.trim());
    assert.doesNotMatch(value, /<\/?[a-z][^>]*>/i);
  }
});
