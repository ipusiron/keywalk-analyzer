const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../keywalk-core.js');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const ja = read('README.md'), en = read('README.en.md');
const headingPairs = [
  ['KeyWalk Analyzer — キーボード依存パスワード分析ツール', 'KeyWalk Analyzer — Keyboard-Dependent Password Analysis Tool'],
  ['🌐 デモページ', '🌐 Demo'], ['クイックスタート', 'Quick start'], ['📸 スクリーンショット', '📸 Screenshots'],
  ['👥 対象ユーザー', '👥 Intended users'], ['⌨️ キーマップウォーキングとは', '⌨️ What is keyboard walking?'],
  ['学術的背景と評価の範囲', 'Research context and scope of evaluation'],
  ['🖥️ 入力デバイスとキーボードレイアウトによる変化', '🖥️ Input devices and keyboard layouts'],
  ['対応する簡略配列', 'Supported simplified layouts'], ['対象外の入力方式', 'Input methods outside the model'],
  ['🔧 本ツールの機能', '🔧 Features'], ['1. 単体分析モード', '1. Single analysis'],
  ['配列比較と計算根拠', 'Layout comparison and calculation details'],
  ['経路を1文字ずつ確認', 'Inspecting the path one character at a time'], ['2. 癖プロファイルモード', '2. Pattern profile'],
  ['📖 使用方法', '📖 Usage'], ['単体分析タブ', 'Single analysis tab'], ['癖プロファイルタブ', 'Pattern profile tab'],
  ['言語・テーマとローカル実行', 'Language, theme, and local use'], ['💡 サンプル入力例', '💡 Sample inputs'],
  ['単体分析', 'Single analysis'], ['典型例とランダム生成', 'Typical examples and random generation'],
  ['癖プロファイル', 'Pattern profile'], ['🎯 ユースケース', '🎯 Use cases'],
  ['⚙️ 制限事項', '⚙️ Limitations'], ['💻 技術仕様', '💻 Technical specifications'], ['フロントエンド', 'Front end'],
  ['セキュリティ', 'Security'], ['対応ブラウザー', 'Browser support'], ['🧪 テスト', '🧪 Tests'],
  ['📁 ディレクトリー構成', '📁 Directory structure'], ['⚠️ セキュリティ上の重要な注意事項', '⚠️ Important security notes'],
  ['✅ 推奨される使用例', '✅ Suggested examples'], ['📚 関連資料', '📚 Related resources'],
  ['開発者向けドキュメント', 'Developer documentation'], ['書籍', 'Book'], ['📄 ライセンス', '📄 License'],
  ['🛠 このツールについて', '🛠 About this tool']
];
test('full README translation preserves heading order and hierarchy', () => {
  const heads = text => [...text.matchAll(/^(#{1,6}) (.+)$/gm)].map(m => [m[1], m[2]]);
  const j = heads(ja), e = heads(en);
  assert.equal(j.length, 38);
  assert.deepEqual(j.map(h => h[1]), headingPairs.map(h => h[0]));
  assert.deepEqual(e.map(h => h[1]), headingPairs.map(h => h[1]));
  assert.deepEqual(j.map(h => h[0]), e.map(h => h[0]));
  assert.ok(en.startsWith('English · [日本語](README.md)'));
  assert.ok(ja.includes('[English](README.en.md) · 日本語'));
});
test('README metadata keeps identity and block-list structure', () => {
  const yaml = ja.match(/^<!--\r?\n---\r?\n([\s\S]*?)\r?\n---\r?\n-->/)[1];
  for (const line of ['id: day089', 'slug: keywalk-analyzer', 'hub: true',
    'repo_url: "https://github.com/ipusiron/keywalk-analyzer"',
    'demo_url: "https://ipusiron.github.io/keywalk-analyzer/"']) assert.ok(yaml.includes(line));
  assert.deepEqual([...yaml.matchAll(/^(\w+):/gm)].map(m => m[1]), [
    'id', 'slug', 'title', 'subtitle_ja', 'subtitle_en', 'description_ja', 'description_en',
    'category_ja', 'category_en', 'difficulty', 'tags', 'repo_url', 'demo_url', 'hub'
  ]);
  for (const key of ['category_ja', 'category_en', 'tags']) assert.match(yaml, new RegExp(key + ':\\r?\\n  - '));
  assert.doesNotMatch(en, /^<!--\s*---/);
});
for (const [file, text] of [['README.md', ja], ['README.en.md', en]]) {
  test(file + ': eight typical-example rows match the sample module; generation limits are documented', () => {
    const samples = require('../keywalk-samples.js');
    const rows = [...text.matchAll(/^\| [^|`]+ \| `([^`]+)` \| [^|]+ \|$/gm)];
    assert.deepEqual(rows.map(m => m[1]), Object.values(samples.typical));
    for (const layout of ['jis', 'qwerty', 'dvorak']) {
      assert.deepEqual(Object.keys(samples.typical).map(id => samples.single(layout, id)), rows.map(m => m[1]));
    }
    for (const value of ['`0–9`', '`A–Z`', '`a–z`', '`crypto.getRandomValues`']) assert.ok(text.includes(value));
    assert.match(text, file === 'README.md' ? /長さは8・12・16文字/ : /lengths of 8, 12, or 16 characters/);
    assert.match(text, file === 'README.md' ? /英数字の両方を含む保証もありません/ : /A mix of letters and digits is not guaranteed/);
    assert.match(text, file === 'README.md' ? /認証用パスワードに転用せず/ : /Do not reuse them as authentication passwords/);
  });
  test(file + ': all seven step-inspection rows match original characters, mapping and distances', () => {
    const rows = [...text.matchAll(/^\| ([1-7]) \| (`[^`]+`|—) \| (`[^`]+`|—) \| ([\d.]+|—) \| .+ \|$/gm)];
    const steps = core.pathSteps(core.analyze('Aa!😀 sd', 'jis'));
    assert.equal(rows.length, 7);
    assert.deepEqual(rows.map(m => m.slice(1)), steps.map(s => [String(s.index + 1), '`' + core.visible(s.char) + '`',
      s.point ? '`' + s.point.key + '`' : '—', s.distance === null ? '—' : s.distance.toFixed(3)]));
  });
  test(file + ': all five KDS contributions and their total match the model', () => {
    const rows = [...text.matchAll(/^\| (adjacency|direction|turns|pattern|variation) \| (\d+) \| ([\d.]+) \| ([\d.]+) \|$/gm)];
    assert.equal(rows.length, 5);
    const r = core.analyze('qwerty123!', 'jis');
    assert.deepEqual(rows.map(m => m.slice(1)), r.kdsBreakdown.map(p =>
      [p.id, String(p.maximum), p.factor.toFixed(3), p.contribution.toFixed(3)]));
    assert.ok(text.includes(r.kdsRaw.toFixed(3)));
    assert.ok(text.includes(file === 'README.md' ? 'KDSは57です' : 'KDS rounded to an integer is 57'));
  });
  test(file + ': all eight numeric examples match the pure implementation', () => {
    const rows = [...text.matchAll(/^\| `([^`]+)` \| (jis|dvorak) \| (.+) \|$/gm)];
    assert.equal(rows.length, 8);
    const fixed = value => value === null ? '—' : value.toFixed(2);
    for (const [, input, layout, values] of rows) {
      const r = core.analyze(input, layout);
      assert.deepEqual(values.split(' | '), [String(r.unique), fixed(r.distance),
        r.adjacent === null ? '—' : (r.adjacent * 100).toFixed(0) + '%', fixed(r.entropy), String(r.kds ?? '—')]);
    }
  });
  test(file + ': profile example and three distinctive use cases are reproducible', () => {
    const sample = text.match(/```text\r?\n(asd\r?\np)\r?\n```/);
    assert.ok(sample);
    const r = core.profile(sample[1], 'jis');
    assert.equal(r.unique, 4);
    assert.equal(r.adjacent.value, 1);
    assert.equal(r.adjacent.count, 1);
    assert.equal(r.distance.value, 2);
    const use = text.split(file === 'README.md' ? 'このツールならではの使い方' : 'Ways of using this tool in particular')[1];
    assert.ok(use);
    const items = use.trim().split(/\r?\n\r?\n/)[0].split(/\r?\n/);
    assert.equal(items.length, 3);
    for (const input of ['asdfgh', 'hgfdsa']) {
      const model = core.analyze(input, 'jis');
      assert.ok(items[0].includes('`' + input + '`'));
      assert.ok(items[0].includes(model.distance.toFixed(2)));
      assert.ok(items[0].includes('H=' + model.entropy.toFixed(2)));
    }
    for (const layout of ['jis', 'dvorak']) {
      assert.ok(items[1].includes((core.analyze('aoeuid', layout).adjacent * 100).toFixed(0) + '%'));
    }
    for (const input of ['asd\np', 'asd\nasd\np']) {
      assert.ok(items[2].includes((core.profile(input, 'jis').zones.left * 100).toFixed(0) + '%'));
    }
  });
  test(file + ': images and relative links exist; screenshots are bounded PNGs', () => {
    const images = [...text.matchAll(/!\[[^\]]*\]\((assets\/[^)]+)\)/g)];
    assert.equal(images.length, 6);
    for (const [, name] of images) {
      const data = fs.readFileSync(path.join(root, name));
      assert.equal(data.subarray(1, 4).toString(), 'PNG');
      assert.equal(data.readUInt32BE(16), 1280);
      assert.ok(data.readUInt32BE(20) >= 800 && data.readUInt32BE(20) <= 1600);
      assert.ok(data.length <= 300000);
    }
    for (const [, link] of text.matchAll(/\]\(([^)]+)\)/g)) {
      if (!/^(?:https?:|#)/.test(link)) assert.ok(fs.existsSync(path.join(root, link)), link);
    }
  });
  test(file + ': directory tree uses real paths, aligned comments and visible hierarchy', () => {
    const block = text.match(/```text\r?\n(keywalk-analyzer\/[\s\S]*?)\r?\n```/)[1];
    const lines = block.split(/\r?\n/), stack = [], found = [];
    assert.equal(lines.length, 45);
    assert.equal(new Set(lines.map(line => line.indexOf('#'))).size, 1);
    for (const line of lines.slice(1)) {
      const m = line.match(/^([│ ]*)(?:├── |└── )([^#]+?)\s+# .+$/);
      assert.ok(m, line);
      const depth = m[1].length / 4, name = m[2].trim();
      stack.length = depth;
      const relative = [...stack, name].join('/');
      assert.ok(fs.existsSync(path.join(root, relative)), relative);
      if (name.endsWith('/')) stack.push(name.slice(0, -1));
      else found.push(relative);
    }
    assert.equal(found.length, 39);
    const actual = [];
    // Ignored personal directories are not distributed project files.
    const ignoredDirs = new Set(read('.gitignore').split(/\r?\n/)
      .filter(line => line.endsWith('/')).map(line => line.slice(0, -1)));
    function collect(dir = '') {
      for (const entry of fs.readdirSync(path.join(root, dir), {withFileTypes:true})) {
        if (entry.name === '.git' || (entry.isDirectory() && ignoredDirs.has(entry.name))) continue;
        const file = dir ? dir + '/' + entry.name : entry.name;
        if (entry.isDirectory()) collect(file); else actual.push(file);
      }
    }
    collect();
    assert.deepEqual(found.sort(), actual.sort());
  });
}
test('docs describe current behavior without unsupported score grades or historical comparisons', () => {
  for (const file of ['README.md', 'README.en.md', 'ARCHITECTURE.md', 'SECURITY.md']) {
    const text = read(file);
    assert.doesNotMatch(text, /previously|used to|earlier version|formerly|分かる|全て|既に/);
    for (const section of text.split(/^#{1,6} /m)) {
      assert.ok((section.match(/\*\*[^*]+\*\*/g) || []).length <= 2, file);
    }
  }
  assert.doesNotMatch(ja, /弱いパスワード例|強いパスワード例|Google Fontsのみ許可/);
  assert.match(en, /does not assess password strength, safety, or cracking time/);
});
test('architecture calculation excerpts match the actual pure functions', () => {
  const normalize = value => value.split(/\r?\n/).map(line => line.trim()).join('\n');
  const blocks = [...read('ARCHITECTURE.md').matchAll(/```javascript\r?\n([\s\S]*?)\r?\n```/g)].map(m => m[1]);
  for (const name of ['analyze', 'geometry']) {
    const block = blocks.find(text => text.startsWith('function ' + name + '('));
    assert.ok(block, name);
    assert.ok(normalize(read('keywalk-core.js')).includes(normalize(block)), name);
  }
});
