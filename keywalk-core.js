/* Simplified keyboard geometry. No DOM, storage, network, or strength estimation. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KeyWalkCore = api;
})(globalThis, function() {
  'use strict';
  const LIMITS = Object.freeze({single: 10000, profile: 50000, lines: 500, plot: 500});
  const ROWS = {
    qwerty: ['`1234567890-=', 'qwertyuiop[]\\', "asdfghjkl;'", 'zxcvbnm,./'],
    jis: ['1234567890-^\\', 'qwertyuiop@[', 'asdfghjkl;:]', 'zxcvbnm,./_'],
    dvorak: ['`1234567890[]', "',.pyfgcrl/=", 'aoeuidhtns-', ';qjkxbmwvz']
  };
  const US = Object.fromEntries(Array.from('~!@#$%^&*()_+{}|:"<>?')
    .map((ch, i) => [ch, Array.from('`1234567890-=[]\\;\',./')[i]]));
  const JIS = Object.fromEntries(Array.from('!"#$%&\'()=~|`{+*}<>?')
    .map((ch, i) => [ch, Array.from('123456789-^\\@[;:],./')[i]]));
  const OFFSETS = [0, 0.25, 0.5, 0.25];
  const lowerASCII = s => s.replace(/[A-Z]/g, c => c.toLowerCase());

  function keys(layout = 'jis') {
    if (!Object.hasOwn(ROWS, layout)) throw new RangeError('layout');
    return ROWS[layout].flatMap((row, r) => Array.from(row, (key, col) => ({
      key, row: r, col, x: col + OFFSETS[r] + (layout === 'jis' && r === 0 ? 1 : 0), y: r
    })));
  }

  function mapText(text, layout = 'jis') {
    const map = new Map(keys(layout).map(p => [p.key, p]));
    const shift = layout === 'jis' ? JIS : US;
    const unknown = [], points = [], segments = [];
    let segment = [];
    Array.from(text).forEach((char, index) => {
      const lower = lowerASCII(char);
      const key = map.has(lower) ? lower : shift[lower];
      if (key && map.has(key)) {
        const point = {...map.get(key), char, index};
        points.push(point);
        segment.push(point);
      } else {
        unknown.push({char, index});
        if (segment.length) segments.push(segment);
        segment = [];
      }
    });
    if (segment.length) segments.push(segment);
    return {points, segments, unknown};
  }

  function adjacent(a, b) {
    return a.key !== b.key && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
  }
  function knight(a, b) {
    const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
    return (dy === 1 && Math.abs(dx - 2) <= 0.25) || (dy === 2 && Math.abs(dx - 1) <= 0.25);
  }
  function walks(segments) {
    const out = [];
    for (const segment of segments) {
      let run = [];
      const flush = () => {
        if (run.length >= 3) out.push({text: run.map(p => p.char).join(''), start: run[0].index, length: run.length});
      };
      for (const point of segment) {
        if (run.length && !adjacent(run[run.length - 1], point)) { flush(); run = []; }
        run.push(point);
      }
      flush();
    }
    return out;
  }
  function geometry(segments) {
    const steps = [], bins = Array(8).fill(0);
    let adjacentCount = 0, knightCount = 0, turns = 0, repeats = 0, turnPairs = 0;
    for (const segment of segments) {
      let previous = null;
      for (let i = 1; i < segment.length; i++) {
        const a = segment[i - 1], b = segment[i];
        const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
        steps.push(distance);
        adjacentCount += Number(adjacent(a, b));
        knightCount += Number(knight(a, b));
        if (!distance) { repeats++; previous = null; continue; }
        const bin = (Math.round(Math.atan2(-dy, dx) / (Math.PI / 4)) + 8) % 8;
        bins[bin]++;
        if (previous) {
          turnPairs++;
          const cosine = (dx * previous.dx + dy * previous.dy) / (distance * previous.distance);
          if (Math.acos(Math.max(-1, Math.min(1, cosine))) > 0.6) turns++;
        }
        previous = {dx, dy, distance};
      }
    }
    const transitions = steps.length, moving = transitions - repeats;
    const distance = steps.reduce((a, b) => a + b, 0);
    const mean = transitions ? distance / transitions : 0;
    const entropy = moving ? bins.reduce((sum, n) => n ? sum - n / moving * Math.log2(n / moving) : sum, 0) : null;
    const cv = transitions >= 2 && mean > 0
      ? Math.sqrt(steps.reduce((sum, n) => sum + (n - mean) ** 2, 0) / transitions) / mean : null;
    return {
      distance, turns: turnPairs ? turns : null, transitions, moving, repeats, bins, entropy, cv,
      adjacentCount, knightCount, turnPairs,
      adjacent: transitions ? adjacentCount / transitions : null,
      knight: transitions ? knightCount / transitions : null
    };
  }
  function ngrams(text, min = 2, max = 4) {
    const chars = Array.from(lowerASCII(text)), found = [];
    for (let n = min; n <= max; n++) {
      const counts = new Map();
      for (let i = 0; i <= chars.length - n; i++) {
        const word = chars.slice(i, i + n).join('');
        if (/\s/u.test(word)) continue;
        counts.set(word, (counts.get(word) || 0) + 1);
      }
      for (const [text, count] of counts) if (count >= 3) found.push({text, count});
    }
    return found;
  }
  function analyze(text, layout = 'jis') {
    if (typeof text !== 'string') throw new TypeError('text');
    // UTF-16 preflight bounds allocation; the stated limit counts code points.
    if (text.length > LIMITS.single * 2 || Array.from(text).length > LIMITS.single) throw new RangeError('singleLimit');
    const mapped = mapText(text, layout), metrics = geometry(mapped.segments);
    const known = ['qwerty', 'asdf', 'zxcv', '1234', 'password', 'pass', 'admin']
      .filter(word => lowerASCII(text).includes(word));
    const foundWalks = walks(mapped.segments), repeated = ngrams(text);
    const eligible = !mapped.unknown.length && mapped.points.length >= 4 && metrics.moving >= 3;
    const straight = eligible && metrics.turns !== null && metrics.turns <= 1;
    const lowH = eligible && metrics.entropy < 1.5, lowCV = eligible && metrics.cv < 0.25;
    const pattern = known.length > 0 || foundWalks.length > 0 || repeated.length > 0;
    const kdsBreakdown = [
      ['adjacency', 0.30, Math.min(1, metrics.adjacent / 0.7)],
      ['direction', 0.25, Math.max(0, (1.5 - metrics.entropy) / 1.5)],
      ['turns', 0.20, Number(straight)], ['pattern', 0.15, Number(pattern)],
      ['variation', 0.10, Math.max(0, (0.25 - metrics.cv) / 0.25)]
    ].map(([id, weight, factor]) => ({
      id, maximum: weight * 100, factor: eligible ? factor : null,
      contribution: eligible ? 100 * weight * factor : null
    }));
    // Preserve the order and precision of the reference formula; round only the final score.
    const kdsRaw = eligible ? 100 * kdsBreakdown.reduce((sum, part) => sum + part.maximum / 100 * part.factor, 0) : null;
    const kds = kdsRaw === null ? null : Math.round(kdsRaw);
    return {
      layout, characters: Array.from(text).length, ...mapped, ...metrics,
      unique: new Set(mapped.points.map(p => p.key)).size,
      known, walks: foundWalks, repeated, straight, lowH, lowCV, kds, kdsRaw, kdsBreakdown,
      kdsReason: mapped.unknown.length ? 'incomplete' : 'insufficient'
    };
  }
  function compareLayouts(text) {
    // Fixed presentation order, not a ranking. Each layout maps the unchanged input independently.
    return ['jis', 'qwerty', 'dvorak'].map(layout => analyze(text, layout));
  }
  function tallyRules(lines, rules) {
    return rules.map(([id, regex]) => ({id, count: lines.filter(line => regex.test(line)).length})).filter(x => x.count);
  }
  function prefixes(lines) {
    return tallyRules(lines, [
      ['title', /^[A-Z][a-z]{2,}/], ['upper', /^[A-Z]{2,}/], ['lower', /^[a-z]{2,}/],
      ['template', /^[A-Za-z]+[0-9]+[!?.]+$/]
    ]);
  }
  function suffixes(lines) {
    return tallyRules(lines, [
      ['year', /(?:^|[^0-9])(?:19|20)[0-9]{2}[!?.]*$/], ['digits', /[0-9]{2,}$/],
      ['exclamation', /!+$/], ['question', /\?+$/], ['symbols', /[-_.]{2,}$/]
    ]);
  }
  function zones(points, layout) {
    if (!points.length) return null;
    const all = keys(layout), midX = (Math.min(...all.map(p => p.x)) + Math.max(...all.map(p => p.x))) / 2;
    const count = {left: 0, right: 0, top: 0, mid: 0, bottom: 0};
    for (const point of points) {
      count[point.x <= midX ? 'left' : 'right']++;
      count[point.row < 2 ? 'top' : point.row === 2 ? 'mid' : 'bottom']++;
    }
    return Object.fromEntries(Object.entries(count).map(([key, value]) => [key, value / points.length]));
  }
  const top = (map, count) => [...map.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, count);
  function profile(text, layout = 'jis') {
    if (typeof text !== 'string') throw new TypeError('text');
    if (text.length > LIMITS.profile * 2 || Array.from(text).length > LIMITS.profile) throw new RangeError('profileLimit');
    const lines = text.split(/\r\n|\r|\n/).filter(line => line.length > 0);
    if (lines.length > LIMITS.lines) throw new RangeError('lineLimit');
    const results = lines.map(line => analyze(line, layout));
    const points = [], keyCounts = new Map(), bigramCounts = new Map();
    for (const result of results) {
      for (const p of result.points) {
        points.push(p);
        keyCounts.set(p.key, (keyCounts.get(p.key) || 0) + 1);
      }
      for (const segment of result.segments) for (let i = 1; i < segment.length; i++) {
        const pair = lowerASCII(segment[i - 1].char + segment[i].char);
        bigramCounts.set(pair, (bigramCounts.get(pair) || 0) + 1);
      }
    }
    const average = key => {
      const valid = results.filter(r => r[key] !== null && (key !== 'distance' || r.transitions > 0));
      return {value: valid.length ? valid.reduce((sum, r) => sum + r[key], 0) / valid.length : null, count: valid.length};
    };
    return {
      layout, lines: lines.length, points, keyCounts: [...keyCounts], unique: keyCounts.size,
      unknown: results.reduce((sum, r) => sum + r.unknown.length, 0),
      adjacent: average('adjacent'), turns: average('turns'), distance: average('distance'),
      topKeys: top(keyCounts, 8), bigrams: top(bigramCounts, 5),
      prefixes: prefixes(lines), suffixes: suffixes(lines), zones: zones(points, layout)
    };
  }
  function visible(text) {
    return Array.from(text, ch => {
      const cp = ch.codePointAt(0);
      return /\s/u.test(ch) || /\p{C}/u.test(ch) || /\p{M}/u.test(ch)
        ? `[U+${cp.toString(16).toUpperCase().padStart(4, '0')}]` : ch;
    }).join('');
  }
  return {LIMITS, keys, mapText, adjacent, knight, walks, geometry, analyze, compareLayouts, profile, prefixes, suffixes, zones, visible};
});
