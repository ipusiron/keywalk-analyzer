const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'settings.js'), 'utf8');
function run({search = '', stored = {}, language = 'en-US', dark = false, denied = false} = {}) {
  const document = {documentElement:{dataset:{}}};
  vm.runInNewContext(source, {
    document, URLSearchParams, location:{search}, navigator:{language},
    localStorage:{getItem(key) { if (denied) throw new Error('denied'); return stored[key]; }},
    matchMedia:() => ({matches:dark})
  });
  return [document.documentElement.lang, document.documentElement.dataset.theme];
}
test('initial preferences validate values and honor URL, storage and system priorities', () => {
  assert.deepEqual(run(), ['en', 'light']);
  assert.deepEqual(run({language:'ja-JP', dark:true}), ['ja', 'dark']);
  assert.deepEqual(run({stored:{language:'ja', theme:'dark'}}), ['ja', 'dark']);
  assert.deepEqual(run({search:'?lang=en', stored:{language:'ja', theme:'light'}, dark:true}), ['en', 'light']);
  assert.deepEqual(run({search:'?lang=de', stored:{language:'bad', theme:'bad'}, language:'ja'}), ['ja', 'light']);
});
test('storage denial does not stop initial theme and language selection', () => {
  assert.deepEqual(run({denied:true, language:'ja', dark:true}), ['ja', 'dark']);
  assert.deepEqual(run({denied:true, search:'?lang=en', language:'ja'}), ['en', 'light']);
});
