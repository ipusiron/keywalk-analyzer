/* Learning samples only. No DOM, storage, network or security assessment. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KeyWalkSamples = api;
})(globalThis, function() {
  'use strict';
  const layouts = Object.freeze({
    qwerty: Object.freeze({walk1:'qwerty123', walk2:'asdfgh', common:'P@ssw0rd!', dict:'Tr0ub4dor&3', strong:'xK9#mQ2$vL'}),
    jis: Object.freeze({walk1:'qwerty123', walk2:'asdfghjkl', common:'P@ssw0rd!', dict:'Sakura2024!', strong:'xK9#mQ2$vL'}),
    dvorak: Object.freeze({walk1:'123456', walk2:'aoeu', common:'P@ssw0rd!', dict:'Tr0ub4dor&3', strong:'xK9#mQ2$vL'})
  });
  const typical = Object.freeze({
    digitsUp:'1234567890', digitsDown:'0987654321', sameDigit:'111111', alternating:'12121212',
    digitCycle:'123123123', vertical:'1qaz', roundTrip:'asdfdsa', gap:'asd fgh'
  });
  const groups = Object.freeze([
    Object.freeze({id:'walk', items:Object.freeze(['walk1', 'walk2', 'vertical', 'roundTrip'])}),
    Object.freeze({id:'digits', items:Object.freeze(['digitsUp', 'digitsDown', 'sameDigit', 'alternating', 'digitCycle'])}),
    Object.freeze({id:'mixed', items:Object.freeze(['common', 'dict', 'strong'])}),
    Object.freeze({id:'gap', items:Object.freeze(['gap'])})
  ]);
  function single(layout, id) {
    if (!Object.hasOwn(layouts, layout)) throw new RangeError('layout');
    if (Object.hasOwn(typical, id)) return typical[id];
    if (Object.hasOwn(layouts[layout], id)) return layouts[layout][id];
    throw new RangeError('sample');
  }
  const alphabets = Object.freeze({digits:'0123456789', alphanumeric:'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'});
  const lengths = Object.freeze([8, 12, 16]);
  function random(kind, length, fill = bytes => globalThis.crypto.getRandomValues(bytes)) {
    if (!Object.hasOwn(alphabets, kind)) throw new RangeError('randomKind');
    if (!lengths.includes(length)) throw new RangeError('randomLength');
    const alphabet = alphabets[kind], ceiling = Math.floor(256 / alphabet.length) * alphabet.length;
    let output = '';
    // Rejection sampling avoids modulo bias. Bound retries if the random source fails abnormally.
    for (let batch = 0; batch < 32 && output.length < length; batch++) {
      const bytes = new Uint8Array(32);
      try { fill(bytes); } catch { throw new Error('randomUnavailable'); }
      for (const byte of bytes) {
        if (byte >= ceiling) continue;
        output += alphabet[byte % alphabet.length];
        if (output.length === length) return output;
      }
    }
    throw new Error('randomUnavailable');
  }
  return {groups, typical, single, alphabets, lengths, random};
});
