# KeyWalk Analyzer - アーキテクチャ・技術解説

本ドキュメントでは、KeyWalk Analyzerの技術的な実装詳細、コアアルゴリズム、設計思想について解説します。

---

## 📑 目次

1. [システムアーキテクチャ](#システムアーキテクチャ)
2. [コアアルゴリズム](#コアアルゴリズム)
3. [KDS（キーボード依存スコア）の算出ロジック](#kdsキーボード依存スコアの算出ロジック)
4. [レイアウト非依存の歩き検出](#レイアウト非依存の歩き検出)
5. [方向エントロピー計算](#方向エントロピー計算)
6. [ナイトムーブ検出](#ナイトムーブ検出)
7. [Canvas 描画最適化](#canvas-描画最適化)
8. [テーマシステムの実装](#テーマシステムの実装)
9. [セキュリティ設計](#セキュリティ設計)

---

## システムアーキテクチャ

### 設計方針

1. 入力文字列をアプリから送信・永続化しない
2. 配列の座標と計算をDOMから分離する
3. 入力・配列の変更時は結果を無効化し、表示の変更時は保持した結果を描く
4. 独自指標を強度・解読時間・人物同定に読み替えない

### データフロー

```text
入力欄 → compareLayouts / profile（keywalk-core.js）→ タブ別state
                  ↓
         配列への対応付け・区間分割
                  ↓
         距離・方向・歩き・反復・集計
                  ↓
         renderAll（script.js）→ 数値・説明・Canvas
```

計算部は通常のブラウザースクリプトとCommonJSの両方で使えます。file://での実行を保つため、ES moduleやビルド工程は使いません。

単体分析はcompareLayoutsから3配列のanalyzeを呼び、同じ入力をそれぞれの配列へ対応付けます。
state.comparisonに固定順（JIS、QWERTY、Dvorak）の結果を保持し、state.singleは選択中の配列の結果を参照します。
比較表は順位を付けず、対応文字数と未対応文字数も示します。
renderComparisonとrenderCalculationは保持した値を表示するだけで、言語変更時の再計算を行いません。

---

## コアアルゴリズム

### 1. 座標マップ生成（keys / buildCoordMap）

`keywalk-core.js`の`keys(layout)`が、キー、段、列、単位座標を返します。横の段オフセットは数字段から順に0、0.25、0.5、0.25です。JISの数字段にはさらに1を加えます。縦は段番号、同じ段のキー間隔は1です。

これは本ツールの簡略モデルで、実機の寸法を再現しません。画面側の`buildCoordMap`だけが、描画座標へ`x = 16 + 78*x`、`y = 70 + 78*y`で変換します。Canvasの拡大縮小は分析値に影響しません。

座標の生成処理

`keywalk-core.js`からの抜粋です。行定義・OFFSETSは同じモジュールの定数を参照します。入力に含まれるキーの範囲を基準にせず、常に配列全体の座標を作ります。

```javascript
function keys(layout = 'jis') {
  if (!Object.hasOwn(ROWS, layout)) throw new RangeError('layout');
  return ROWS[layout].flatMap((row, r) => Array.from(row, (key, col) => ({
    key, row: r, col, x: col + OFFSETS[r] + (layout === 'jis' && r === 0 ? 1 : 0), y: r
  })));
}
```

### 2. Shift記号の逆写像（mapText）

ASCII英大文字のみ小文字へ対応させます。JISとUS用のShift対応表を分離し、Dvorakの記号はその配列上の位置へ対応させます。`mapText`は元の文字とコードポイント位置を残します。

未対応文字は`unknown`に記録し、前後を別の`segments`に分割します。空白も例外ではありません。JISの円記号、かな、結合文字などをASCII文字へ暗黙変換しません。JISのバックスラッシュは数字段、アンダースコアは下段へ割り当てる簡略化であり、実際の物理キーは復元しません。

区間への分割処理

pointsは対応した文字の一覧、segmentsは連続した対応区間です。unknownを除いて1本の経路にまとめないことが重要です。

```javascript
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
```

### 3. 境界と平均（analyze / profile）

単体10,000コードポイント、プロファイル50,000コードポイント・500非空行・各行10,000コードポイントが上限です。超過時はRangeErrorで、黙って切り詰めません。

`profile`は改行を分割し、長さ0の行だけを除きます。前後の空白と重複行は残します。平均は行ごとの単純平均です。未定義の指標を除き、経路長では対応キー対がない行も除きます。各平均の分母を`count`で返します。

左右領域は配列全体の最小・最大xの中点で固定します。入力範囲から再計算しません。上段は最初の2段、中段はホーム段、下段は最下段です。

---

プロファイルの集計処理

analyzeは行ごとに呼び、平均値と対象行数を一緒に返します。top・prefixes・suffixes・zonesは同じモジュールの関数です。行ごとの値を足してから割るため、長い行だけに重みを置く計算ではありません。

```javascript
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
```

## KDS（キーボード依存スコア）の算出ロジック

KDSは独自の幾何学的な参考値です。統計的な強度推定、学術指標、攻撃成功率ではありません。

### 計算式

未対応文字0、対応文字4以上、非ゼロ移動3以上のときだけ、次を計算します。

```text
A = min(1, 隣接率 / 0.70)
E = max(0, (1.50 - H) / 1.50)
S = ターン数が定義され、1以下なら1、それ以外0
P = 登録語・隣接歩き・反復のいずれかがあれば1、それ以外0
C = max(0, (0.25 - CV) / 0.25)
KDS = round(100 * (0.30*A + 0.25*E + 0.20*S + 0.15*P + 0.10*C))
```

### 各要素の解説

- A：対応する連続キー対の隣接率。0.70以上で上限
- E：8方向の偏り。H=0で1、Hが1.50以上なら0
- S：角度が0.6ラジアンを超えたターンの回数による簡略フラグ
- P：登録語7件、3文字以上の隣接歩き、2〜4文字で3回以上の反復。反復は重複を数え、空白を含む候補を除く
- C：距離の母標準偏差÷平均であるCVの小ささ。CVが0.25以上なら0

重みと閾値は本ツールの仕様であり、データによる較正は行っていません。表示言語やDOMの説明文は計算に使いません。入力不足や未対応文字を0点に置き換えず、nullと理由を返します。

kdsBreakdownは5項目のID、最大寄与、係数、寄与を返します。
kdsRawは整数へ丸める前の合計で、kdsはその整数丸めです。
算出対象外ではkdsRaw、各係数、各寄与をnullにします。
計算内訳の表示は小数点以下3桁なので、表示された係数から再計算した値と内部の値は一致しない場合があります。
画面のAは生の隣接率を指し、この節の式のA（上限を適用した係数）とは区別します。

geometryのadjacentCount、knightCount、turnPairsはそれぞれ隣接移動、ナイトムーブ、方向転換を比較できた組の整数カウントです。
binsは右、右上、上、左上、左、左下、下、右下の順で、合計はmovingに一致します。
方向の割合の分母はmovingであり、同じキーを含むtransitionsではありません。

---

KDSと検出結果の組み立て

計算部のanalyzeからの抜粋です。戻り値のkdsReasonはkdsがnullの場合だけ表示側で使います。計算に表示文言やテーマは関与しません。

```javascript
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
```

## レイアウト非依存の歩き検出

### アルゴリズム

どの配列にも同じ`adjacent(a,b)`を使いますが、結果は配列に依存します。異なるキーで、横差・縦差がともに1以下なら隣接です。同じキーの連打を歩きとは扱いません。

区間内を順にたどり、隣接が途切れたところで区切ります。3文字以上の連続だけを返し、元の大文字・記号と開始位置を保持します。`asd fgh`は2つの歩きです。

### 特徴

- グラフライブラリーや配列固有の単語列に依存せず、単位座標で判定
- 未対応文字をまたがない
- 経路の番号は元のコードポイント位置を表示し、未対応文字を詰めない

---

隣接と歩きの実装

startは0始まりのコードポイント位置です。表示で1を足します。同じキーへ戻る移動は隣接になり得ますが、同じキーの連打はrunを区切ります。

```javascript
function adjacent(a, b) {
  return a.key !== b.key && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
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
```

## 方向エントロピー計算

### アルゴリズム

各区間の非ゼロ移動を`atan2(-dy, dx)`で8方向へ丸め、方向iの比率p_iから`H = -Σ p_i log2(p_i)`を求めます。上限はlog2(8)=3ビットです。移動がなければnullを返します。

### 解釈

Hは移動方向の分布だけを表します。JISの`asdfgh`と`hgfdsa`は向きが逆でもH=0です。パスワードの候補空間、生成過程、推測困難さを表しません。

### 8方位の定義

| bin | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| 方向 | 右 | 右上 | 上 | 左上 | 左 | 左下 | 下 | 右下 |

同じキーの連打は方向分布に入れず、ターン計算もそこで区切ります。ターンは比較できる2移動がなければnullです。CVには連打の距離0を含めますが、2移動未満または平均0ならnullです。

---

距離・方向・ターン・CVの共通計算

0距離のステップはstepsとrepeatsに残し、方向分布からは除きます。previousをnullにするため、同じキーの連打を挟んだ方向転換は数えません。

```javascript
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
```

## ナイトムーブ検出

### アルゴリズム

縦差1で横差が2±0.25、または縦差2で横差が1±0.25の移動を数えます。段の横ずれを許容する、本ツール固有の判定です。分母は区間内の対応キー対すべてで、同じキーの連打も含みます。

### 意義

チェスのナイトに似た移動を観察する分類です。比率が高いことは、ランダム性やパスワードの強度を意味しません。

---

ナイト判定の実装

dxとdyは単位座標で、描画ピクセルではありません。

```javascript
function knight(a, b) {
  const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
  return (dy === 1 && Math.abs(dx - 2) <= 0.25) || (dy === 2 && Math.abs(dx - 1) <= 0.25);
}
```

## Canvas 描画最適化

### Device Pixel Ratio (DPR) 対応

Retinaディスプレイなどの高解像度画面でも鮮明に表示するための実装。

```javascript
function setupCanvas(cvs){
  const dpr = window.devicePixelRatio || 1;

  // 物理ピクセルサイズを設定
  cvs.width = 1100 * dpr;
  cvs.height = 420 * dpr;

  // CSS表示サイズは維持
  cvs.style.width = '100%';
  cvs.style.height = 'auto';

  // コンテキストをスケール
  const context = cvs.getContext('2d');
  context.scale(dpr, dpr);

  return context;
}
```

### ネオングロー効果

サイバーパンク風のビジュアルを実現するための描画テクニック。

```javascript
// 外側のグロー
ctx.shadowBlur = 20;
ctx.shadowColor = pathColor;
ctx.strokeStyle = pathColor;
ctx.globalAlpha = 0.6;
ctx.stroke();

// 内側の明るいライン
ctx.shadowBlur = 10;
ctx.lineWidth = 2;
ctx.strokeStyle = '#ffffff';
ctx.globalAlpha = 1;
ctx.stroke();
```

レイヤー構成：

1. 外側グロー（太いライン、半透明）
2. 内側コア（細いライン、不透明）
3. ポイントマーカー（2重円）

---

## テーマシステムの実装

### CSS カスタムプロパティの活用

```css
:root {
  --cyber-bg: #0a0e27;
  --neon-cyan: #00f0ff;
  /* ... */
}

[data-theme="light"] {
  --cyber-bg: #f0f4ff;
  --neon-cyan: #0055bb;
  /* ... */
}
```

### JavaScript連携

`settings.js`をCSSより前に読み、保存値を検証してテーマと言語を設定します。テーマは保存値→OSの設定、言語はURLの`lang`→保存値→ブラウザー言語の順です。localStorageへのアクセス失敗は処理を止めません。

`initTheme`と`initLocale`は表示を切り替え、保存済みの分析結果を描き直します。入力を再分析しないため、無効化した結果が復活しません。

日英の動的文言は`keywalk-messages.js`、静的な本文・属性は`keywalk-ui-messages.js`にあります。初期の日本語文字列をキーとして記録し、非表示パネルも同時に翻訳します。

---

## セキュリティ設計

### Content Security Policy (CSP)

`index.html`のmeta CSPでスクリプト・スタイル・画像を同一オリジンに制限し、接続・フォント・埋め込み・フォーム送信を禁止しています。画像のみdata:も許可します。インラインスクリプトとインラインイベント属性は使いません。

### データ処理方針

入力はtextContentとCanvasで表示し、HTMLとして解釈しません。送信APIや入力の永続化処理はありません。不可視文字は検出リストでコードポイント表記へ変換します。保存する設定はテーマと言語だけです。

### セキュリティヘッダー

metaで有効にならないX-Frame-Options、X-Content-Type-Options、frame-ancestorsは設定済みと扱いません。HTTPヘッダーはホスティング側の責任範囲です。meta referrerはno-referrerです。

ブラウザー・拡張機能・端末側の記録や、クリップボードの消去を保証する設計ではありません。[SECURITY.md](SECURITY.md)を参照してください。

---

タブ別状態の無効化

script.jsからの抜粋です。2つの入力欄を共有せず、片方の操作で他方の分析モデルを消しません。renderAllは計算部を呼ばず、保持した状態の表示に専念します。

```javascript
function resetSingle() {
  state.single = null;
  state.comparison = null;
  ['m-unique','m-length','m-turns','m-adj','m-dirh','m-cv','m-knight','m-kds'].forEach(id => setText(id, '—'));
  document.getElementById('d-list').replaceChildren();
}
function resetProfileMetrics() {
  state.profile = null;
  ['pm-adj','pm-turns','pm-length','pm-uniq'].forEach(id => setText(id, '—'));
  document.getElementById('traits-list').replaceChildren();
}
```

## パフォーマンス最適化

### 1. イベントデバウンス

リサイズ描画は150msでまとめます。入力・配列変更は対象タブの結果を直ちに無効化し、再計算は分析ボタンかサンプル選択で行います。

### 2. Mapデータ構造の使用

キー頻度と2文字列頻度をMapで集計します。文字列はコードポイント単位で扱い、分析上限の前にUTF-16長でも過大入力を拒否します。

### 3. Canvasの描画量

経路の描画は先頭500対応点、検出表示は種類ごとに先頭20件へ制限し、省略を知らせます。指標は入力上限内の全文で計算します。ヒートマップはキーごとの頻度を描きます。Canvasは全体を再描画します。

---

## 拡張ポイント

### 新しいキーボードレイアウトの追加

1. `keywalk-core.js`に行・オフセット・Shift対応を追加
2. 両タブの配列選択、compareLayoutsの固定順、日英辞書、サンプルに追加
3. 座標・記号・境界・未対応文字のテストとREADMEの例を追加
4. 単体とプロファイルの独立性をブラウザーで確認

### 新しいメトリクスの追加

1. DOMに依存しない計算関数と、未定義になる条件を決める
2. 基準値・分母・上限のテストを追加
3. 表示値と限界を日英のUI・READMEへ反映
4. 入力変更で消え、言語変更で同じ値を保つことを確認

---

## まとめ

KeyWalk Analyzerは、文字列の幾何学的な特徴を観察する教材です。計算と表示、2つのタブの状態、配列モデルと描画ピクセルを分離しています。指標の値だけで、認証の安全性や人物の性質を判断しないでください。

---

## 参考文献・関連リンク

- [README.md](./README.md) - 基本的な使用方法
- [SECURITY.md](./SECURITY.md) - セキュリティポリシー
- [Canvas API - MDN Web Docs](https://developer.mozilla.org/ja/docs/Web/API/Canvas_API)
- [Content Security Policy - MDN Web Docs](https://developer.mozilla.org/ja/docs/Web/HTTP/CSP)
