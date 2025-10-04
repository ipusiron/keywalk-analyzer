# KeyWalk Analyzer - アーキテクチャ・技術解説

本ドキュメントでは、KeyWalk Analyzer の技術的な実装詳細、コアアルゴリズム、設計思想について解説します。

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

KeyWalk Analyzer は以下の設計原則に基づいて開発されています：

1. **クライアントサイド完結**: すべての処理をブラウザー内で完結させ、データを外部に送信しない
2. **レイアウト非依存**: QWERTY、JIS、Dvorak など異なるキーボードレイアウトに対応
3. **リアルタイム可視化**: Canvas API を使用した高速な描画とインタラクティブな分析
4. **モジュラー設計**: 各機能を独立した関数として実装し、保守性を向上

### データフロー

```
入力パスワード
    ↓
座標変換 (textToPoints)
    ↓
幾何計算 (距離、角度、エントロピー等)
    ↓
パターン検出 (歩き検出、反復検出等)
    ↓
KDSスコア算出
    ↓
Canvas描画 + UI更新
```

---

## コアアルゴリズム

### 1. 座標マップ生成 (`buildCoordMap`)

キーボードレイアウトから各キーの物理座標を生成します。

```javascript
function buildCoordMap(layoutKey){
  const layout = KEY_LAYOUTS[layoutKey] || KEY_LAYOUTS.qwerty;
  const map = new Map();
  const rowY = 70, rowGap = 78, keyW = 70, keyGap = 8;

  layout.forEach((row, rIdx) => {
    // 行オフセット: QWERTY風の段差を再現
    const rowOffset = (rIdx===1? 24 : (rIdx===2? 48 : (rIdx===3? 24: 0)));

    row.forEach((k, cIdx) => {
      const x = 16 + rowOffset + cIdx*(keyW+keyGap);
      const y = rowY + rIdx*rowGap;
      map.set(String(k).toLowerCase(), {x, y, key: k});
    });
  });

  return map;
}
```

**ポイント**:
- 各行に物理的なオフセットを適用し、実際のキーボード配置を模倣
- `Map` データ構造で O(1) のキー検索を実現
- レイアウト切り替え時に座標マップを再生成

---

### 2. Shift記号の逆写像 (`shiftUnmap`)

Shift + キーで入力される記号を元のキーに逆変換します。

```javascript
function shiftUnmap(ch){
  const map = {
    '!':'1', '@':'2', '#':'3', '$':'4', '%':'5',
    '^':'6', '&':'7', '*':'8', '(':'9', ')':'0',
    '~':'`', '_':'-', '+':'=', '{':'[', '}':']',
    '|':'\\', ':':';', '"':'\'', '<':',', '>':'.',
    '?':'/'
  };
  return map[ch] || null;
}
```

**用途**:
- `P@ssw0rd!` のような記号を含むパスワードでも、`@` を `2` の位置として扱う
- レイアウト非依存の分析を可能にする

---

## KDS（キーボード依存スコア）の算出ロジック

KDS（Keyboard Dependency Score）は、パスワードがキーボード配置にどの程度依存しているかを 0-100 で評価します。

### 計算式

```javascript
function kdsScore({adj, H, turns, len, cv, patterns}){
  const normAdj = Math.min(1, adj/THRESH.high_adj_ratio);          // 正規化隣接比率
  const lowH = Math.max(0, (THRESH.entropy_bad - H)/THRESH.entropy_bad); // 低エントロピー
  const straightFlag = (len>=4 && turns<=1) ? 1 : 0;               // 直線フラグ
  const patternFlag = (patterns.length>0) ? 1 : 0;                 // パターン検出フラグ
  const lowCV = Math.max(0, (THRESH.stepcv_bad - cv)/THRESH.stepcv_bad); // 低変動係数

  const score =
    0.30 * normAdj +      // 30%: 隣接キー比率
    0.25 * lowH +         // 25%: 方向エントロピーの低さ
    0.20 * straightFlag + // 20%: 直線的な移動
    0.15 * patternFlag +  // 15%: 既知パターンの有無
    0.10 * lowCV;         // 10%: 移動距離の単調性

  return Math.round(100 * score);
}
```

### 各要素の解説

#### 1. 隣接キー比率 (30%)

連続するキーが隣接している割合。高いほどキーボード歩きの可能性が高い。

```javascript
function adjRatio(pts){
  if(pts.length<=1) return 0;
  let a=0;
  for(let i=1; i<pts.length; i++){
    const dx = Math.abs(pts[i].x - pts[i-1].x);
    const dy = Math.abs(pts[i].y - pts[i-1].y);
    if(dx <= THRESH.adj_dx && dy <= THRESH.adj_dy) a++;
  }
  return a / (pts.length-1);
}
```

- しきい値: `adj_dx=60px`, `adj_dy=36px`
- 隣接判定は物理的な距離に基づく（レイアウト非依存）

#### 2. 方向エントロピー (25%)

キー移動の方向の多様性を示す。低いほど単調なパターン。

詳細は [方向エントロピー計算](#方向エントロピー計算) セクションを参照。

#### 3. 直線フラグ (20%)

4文字以上で方向転換が1回以下の場合に設定。`asdfgh` のような直線的な歩きを検出。

#### 4. パターンフラグ (15%)

既知パターン（`qwerty`, `password` 等）が検出された場合に設定。

#### 5. 移動距離の変動係数 (10%)

移動距離のばらつきを示す。低いと単調な移動パターン。

```javascript
function stepCV(pts){
  const arr = [];
  for(let i=1; i<pts.length; i++) {
    arr.push(dist(pts[i], pts[i-1]));
  }

  const mean = arr.reduce((s,v) => s+v, 0) / arr.length;
  if(mean === 0) return 0;

  const variance = arr.reduce((s,v) => s + (v-mean)*(v-mean), 0) / arr.length;
  return Math.sqrt(variance) / mean; // 変動係数 (CV)
}
```

---

## レイアウト非依存の歩き検出

従来の辞書ベース検出（`qwerty`, `asdf` などの文字列マッチ）ではなく、**グラフ理論に基づく隣接性検出**を採用。

### アルゴリズム

```javascript
function detectAdjacentWalks(chars, points){
  const res = [];
  let run = [];

  for(let i=1; i<points.length; i++){
    const dx = Math.abs(points[i].x - points[i-1].x);
    const dy = Math.abs(points[i].y - points[i-1].y);
    const isAdj = (dx <= THRESH.adj_dx && dy <= THRESH.adj_dy);

    if(isAdj){
      if(!run.length) run.push(i-1);
      run.push(i);
    } else {
      if(run.length >= 3){ // 3文字以上の連続を検出
        const s = run[0], e = run[run.length-1];
        res.push(chars.slice(s, e+1));
      }
      run = [];
    }
  }

  if(run.length >= 3) res.push(chars.slice(run[0], run[run.length-1]+1));
  return res;
}
```

### 特徴

1. **レイアウト非依存**: 座標ベースの判定により、どのレイアウトでも動作
2. **動的検出**: 未知のパターンも検出可能（`1qaz2wsx` など）
3. **連続性**: 3文字以上の連続した隣接キーを抽出

### 隣接グラフ構築

```javascript
function buildAdjGraph(points){
  const adj = Array.from({length: points.length}, () => []);

  for(let i=0; i<points.length; i++){
    for(let j=i+1; j<points.length; j++){
      const dx = Math.abs(points[j].x - points[i].x);
      const dy = Math.abs(points[j].y - points[i].y);
      if(dx <= THRESH.adj_dx && dy <= THRESH.adj_dy){
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }
  return adj;
}
```

このグラフ構造により、パスワード内のキー間の隣接関係を効率的に表現できます。

---

## 方向エントロピー計算

キー移動の方向を 8 方位に量子化し、シャノンエントロピーを計算します。

### アルゴリズム

```javascript
function directionEntropy(pts){
  if(pts.length <= 1) return 0;

  const bins = new Array(8).fill(0); // 8方位のビン

  for(let i=1; i<pts.length; i++){
    const dx = pts[i].x - pts[i-1].x;
    const dy = pts[i].y - pts[i-1].y;
    if(dx === 0 && dy === 0) continue;

    const ang = Math.atan2(dy, dx); // -π ~ π

    // 8方位に量子化 (E=0, NE=1, N=2, ..., SE=7)
    const dir = Math.round(((ang + Math.PI) / (2*Math.PI)) * 8) % 8;
    bins[dir]++;
  }

  const n = bins.reduce((s,v) => s+v, 0);
  if(!n) return 0;

  // シャノンエントロピー計算
  let H = 0;
  for(const v of bins){
    if(v > 0){
      const p = v / n;
      H -= p * Math.log2(p);
    }
  }

  return H; // 最大値: log2(8) = 3
}
```

### 解釈

- **H = 0**: すべて同一方向（完全に単調）
- **H = 1.5**: 2-3方向に偏っている（要注意）
- **H = 3.0**: 8方向に均等分散（理想的）

### 8方位の定義

```
     N (2)
   NW  |  NE
(3) ←  +  → (1)
   SW  |  SE
     S (6)

E(0), NE(1), N(2), NW(3), W(4), SW(5), S(6), SE(7)
```

---

## ナイトムーブ検出

チェスのナイト（桂馬）のような不規則な移動を検出し、ランダム性の指標とします。

### アルゴリズム

```javascript
function knightRatio(pts){
  if(pts.length <= 1) return 0;

  let k = 0;
  for(let i=1; i<pts.length; i++){
    const dx = Math.abs(pts[i].x - pts[i-1].x);
    const dy = Math.abs(pts[i].y - pts[i-1].y);

    // キー間隔: keyW+gap ≈ 68px, rowGap ≈ 78px
    const near = (a, b) => Math.abs(a - b) <= 12; // 許容誤差

    // 2:1 または 1:2 の移動パターン
    if((near(dx, 2*68) && near(dy, 1*78)) ||
       (near(dx, 1*68) && near(dy, 2*78))){
      k++;
    }
  }

  return k / (pts.length - 1);
}
```

### 意義

- **高いナイトムーブ比率 (>20%)**: ランダムなキー選択の可能性が高い
- **低いナイトムーブ比率 (<5%)**: 隣接キーや直線移動に依存

---

## Canvas 描画最適化

### Device Pixel Ratio (DPR) 対応

Retina ディスプレイなどの高解像度画面でも鮮明に表示するための実装。

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

**レイヤー構成**:
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

```javascript
function initTheme(){
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  themeBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const newTheme = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);

    // Canvas再描画
    drawKeyboards();
    // 分析結果の再描画
    if(activeTab === 'tab-single') analyzeSingle();
  });
}
```

**ポイント**:
- `localStorage` でテーマ設定を永続化
- テーマ切り替え時に Canvas を再描画し、色を即座に反映

---

## セキュリティ設計

### Content Security Policy (CSP)

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self';
               script-src 'self';
               style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
               font-src 'self' https://fonts.gstatic.com;
               img-src 'self' data:;
               connect-src 'none';
               frame-ancestors 'none';
               base-uri 'self';
               form-action 'none';">
```

**重要なポリシー**:
- `connect-src 'none'`: ネットワーク通信を完全に禁止
- `form-action 'none'`: フォーム送信を禁止
- `frame-ancestors 'none'`: クリックジャッキング対策

### データ処理方針

1. **入力データ**: メモリ上でのみ処理、DOM から離れた時点で破棄
2. **永続化**: テーマ設定のみを `localStorage` に保存
3. **ネットワーク**: 一切の外部通信を行わない（CSP で強制）

### セキュリティヘッダー

```html
<meta http-equiv="X-Content-Type-Options" content="nosniff">
<meta http-equiv="X-Frame-Options" content="DENY">
<meta name="referrer" content="no-referrer">
```

---

## パフォーマンス最適化

### 1. イベントデバウンス

ウィンドウリサイズ時の Canvas 再描画を最適化。

```javascript
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    setupCanvas(canvas);
    setupCanvas(pcanvas);
    drawKeyboards();
    // 分析結果を再描画
  }, 150); // 150ms のデバウンス
});
```

### 2. Map データ構造の使用

キー検索を O(1) で実行。

```javascript
const coordMap = new Map(); // Object より高速
coordMap.set('a', {x: 100, y: 200, key: 'a'});
const pos = coordMap.get('a'); // O(1)
```

### 3. キャンバスの部分描画

不要な再描画を避け、必要な部分のみを更新。

```javascript
// 全体をクリアせず、特定の領域のみ更新
ctx.clearRect(x, y, width, height);
```

---

## 拡張ポイント

### 新しいキーボードレイアウトの追加

`KEY_LAYOUTS` に新しいレイアウトを追加するだけ。

```javascript
const KEY_LAYOUTS = {
  qwerty: [...],
  jis: [...],
  dvorak: [...],
  // 新しいレイアウト
  azerty: [
    ['a','z','e','r','t','y','u','i','o','p'],
    ['q','s','d','f','g','h','j','k','l','m'],
    // ...
  ]
};
```

### 新しいメトリクスの追加

1. 計算関数を実装
2. `analyzeSingle` で計算
3. UI に表示

```javascript
// 新しいメトリクス: 対角線移動比率
function diagonalRatio(pts){
  let d = 0;
  for(let i=1; i<pts.length; i++){
    const dx = Math.abs(pts[i].x - pts[i-1].x);
    const dy = Math.abs(pts[i].y - pts[i-1].y);
    if(dx > 0 && dy > 0) d++; // 対角移動
  }
  return d / (pts.length - 1);
}
```

---

## まとめ

KeyWalk Analyzer は、以下の技術的特徴を持つツールです：

1. **レイアウト非依存の分析**: グラフ理論ベースの隣接性検出
2. **多次元評価**: 6つの独立した指標による総合スコアリング
3. **リアルタイム可視化**: Canvas API + DPR 対応による高品質な描画
4. **セキュリティ第一**: CSP + クライアントサイド完結の設計
5. **拡張性**: モジュラー設計による容易な機能追加

これらの実装により、教育・研究・実務の各シーンで活用可能な、実用的なパスワード分析ツールを実現しています。

---

## 参考文献・関連リンク

- [README.md](./README.md) - 基本的な使用方法
- [SECURITY.md](./SECURITY.md) - セキュリティポリシー
- [Canvas API - MDN Web Docs](https://developer.mozilla.org/ja/docs/Web/API/Canvas_API)
- [Content Security Policy - MDN Web Docs](https://developer.mozilla.org/ja/docs/Web/HTTP/CSP)
