/**
 * KeyWalk Analyzer - ABCE Spec v1.1
 *
 * パスワードのキーボード依存パターンを分析するツール
 *
 * 機能:
 * - レイアウト非依存の歩き検出（グラフ駆動）
 * - 方向エントロピー（Direction Entropy）
 * - ステップ変動係数（Step CV）
 * - n-gram反復検出
 * - ナイトムーブ比率（不規則移動）
 * - キーボード依存スコア（KDS: 0-100）
 * - プロファイル癖抽出（複数パスワード分析）
 *
 * アーキテクチャ:
 * - クライアントサイド完結（データ送信なし）
 * - Canvas API による可視化
 * - ローカルストレージ（テーマ設定のみ）
 */

// ============================================================
// 定数定義
// ============================================================

/**
 * キーボードレイアウト定義
 * QWERTY、JIS（簡易版）、Dvorak に対応
 */
const KEY_LAYOUTS = {
  qwerty: [
    ['`','1','2','3','4','5','6','7','8','9','0','-','='],
    ['q','w','e','r','t','y','u','i','o','p','[',']','\\'],
    ['a','s','d','f','g','h','j','k','l',';','\''],
    ['z','x','c','v','b','n','m',',','.','/']
  ],
  // 主要キー中心の簡易JIS
  jis: [
    ['`','1','2','3','4','5','6','7','8','9','0','-','^','\\'],
    ['q','w','e','r','t','y','u','i','o','p','@','['],
    ['a','s','d','f','g','h','j','k','l',';',':',']'],
    ['z','x','c','v','b','n','m',',','.','/','_']
  ],
  dvorak: [
    ['`','1','2','3','4','5','6','7','8','9','0','[',']'],
    ["'",',','.','p','y','f','g','c','r','l','/','='],
    ['a','o','e','u','i','d','h','t','n','s','-'],
    [';','q','j','k','x','b','m','w','v','z']
  ]
};

/**
 * 分析しきい値（ABCE仕様準拠）
 */
const THRESH = {
  adj_dx: 60,                   // 隣接判定: x方向の距離しきい値（ピクセル）
  adj_dy: 36,                   // 隣接判定: y方向の距離しきい値（ピクセル）
  entropy_bad: 1.50,            // 方向エントロピー低判定しきい値（0-3、低いほど単調）
  stepcv_bad: 0.25,             // ステップCV低判定しきい値（低いほど移動距離が均一）
  high_adj_ratio: 0.70          // 高隣接比率しきい値（70%以上でキーボード歩き）
};

// ============================================================
// DOM要素の取得
// ============================================================

const canvas = document.getElementById('keyboard-canvas');   // 単体分析用キャンバス
const pcanvas = document.getElementById('profile-canvas');   // プロファイル分析用キャンバス
const ctx = canvas.getContext('2d');                         // 単体分析用コンテキスト
const pctx = pcanvas.getContext('2d');                       // プロファイル用コンテキスト

// ============================================================
// Canvas 設定・描画関数
// ============================================================

/**
 * Canvas を Device Pixel Ratio に対応させる
 * Retina ディスプレイなどの高解像度画面でもクリアに表示
 *
 * @param {HTMLCanvasElement} cvs - 対象のキャンバス要素
 * @returns {CanvasRenderingContext2D} スケール調整済みのコンテキスト
 */
function setupCanvas(cvs){
  const rect = cvs.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cvs.width = 1100 * dpr;
  cvs.height = 420 * dpr;
  cvs.style.width = '100%';
  cvs.style.height = 'auto';
  const context = cvs.getContext('2d');
  context.scale(dpr, dpr);
  return context;
}

/**
 * キーボードレイアウトから座標マップを生成
 * 各キーの物理的な位置（x, y座標）を計算
 *
 * @param {string} layoutKey - レイアウト名（'qwerty', 'jis', 'dvorak'）
 * @returns {Map<string, {x: number, y: number, key: string}>} キー→座標のマップ
 */
function buildCoordMap(layoutKey){
  const layout = KEY_LAYOUTS[layoutKey] || KEY_LAYOUTS.qwerty;
  const map = new Map();
  const rowY = 70, rowGap = 78, keyW = 70, keyGap = 8;
  layout.forEach((row,rIdx)=>{
    const rowOffset = (rIdx===1? 24 : (rIdx===2? 48 : (rIdx===3? 24: 0))); // 中段右寄せ風
    row.forEach((k,cIdx)=>{
      const x = 16 + rowOffset + cIdx*(keyW+keyGap);
      const y = rowY + rIdx*rowGap;
      map.set(String(k).toLowerCase(), {x,y,key:k});
    });
  });
  // 数字列フォールバック（未定義を補う）
  '1234567890'.split('').forEach((d,i)=>{ if(!map.has(d)) map.set(d,{x:16+i*(keyW+keyGap),y:16,key:d}); });
  return map;
}

// 初期レイアウト
let coordMap = buildCoordMap('jis');

// キーボード描画（両キャンバス）
function drawKeyboards(){
  const targets = [
    {c:ctx,w:canvas.width,h:canvas.height},
    {c:pctx,w:pcanvas.width,h:pcanvas.height}
  ];
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const keyBg = isLight ? 'rgba(0,102,204,0.1)' : 'rgba(0,240,255,0.08)';
  const keyStroke = isLight ? 'rgba(0,102,204,0.5)' : 'rgba(0,240,255,0.4)';
  const keyText = isLight ? '#0066cc' : '#00f0ff';
  const shadowColor = isLight ? 'rgba(0,102,204,0.4)' : 'rgba(0,240,255,0.8)';

  for(const t of targets){
    t.c.clearRect(0,0,t.w,t.h);
    t.c.font = 'bold 13px "Orbitron", monospace';
    for(const [k,p] of coordMap.entries()){
      // キー背景（ネオングロー）- 正方形
      t.c.shadowBlur = 10;
      t.c.shadowColor = shadowColor;
      t.c.fillStyle = keyBg;
      t.c.fillRect(p.x-8,p.y-32,70,64);

      // キー枠
      t.c.strokeStyle = keyStroke;
      t.c.lineWidth = 1;
      t.c.strokeRect(p.x-8,p.y-32,70,64);

      // キーテキスト
      t.c.shadowBlur = 5;
      t.c.shadowColor = shadowColor;
      t.c.fillStyle = keyText;
      t.c.fillText(k.toUpperCase(), p.x+14, p.y+6);

      t.c.shadowBlur = 0;
    }
  }
}

// ---- Shift 記号の逆写像（E2） ----
function shiftUnmap(ch){
  const map = {
    '!':'1','@':'2','#':'3','$':'4','%':'5','^':'6','&':'7','*':'8','(':'9',')':'0',
    '~':'`','_':'-','+':'=','{':'[','}':']','|':'\\',':':';','"':'\'','<':',','>':'.','?':'/'
  };
  return map[ch] || null;
}

// ---- 入力 → 座標列変換 ----
function textToPoints(text){
  const pts = [], unknown=[];
  const lower = (text||'').toLowerCase();
  for(const ch of lower){
    if(ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'){ unknown.push(ch); continue; }
    let k = coordMap.has(ch) ? ch : shiftUnmap(ch);
    if(k && coordMap.has(k)){ pts.push(coordMap.get(k)); }
    else { unknown.push(ch); }
  }
  return {points:pts, unknown};
}

// ---- 描画：単体経路 ----
function plotPath(points,mode){
  if(!points.length) return;
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const pathColor = isLight ? '#0066cc' : '#00f0ff';
  const startColor = isLight ? '#00aa33' : '#39ff14';
  const pointColor = isLight ? '#cc0099' : '#ff00e5';
  const coreColor = isLight ? '#ffffff' : '#ffffff';
  const numBg = isLight ? '#f0f4ff' : '#0a0e27';

  ctx.lineWidth = 5; ctx.lineJoin='round'; ctx.lineCap='round';
  if(mode==='path'){
    // ネオングロー経路
    ctx.shadowBlur = 20;
    ctx.shadowColor = pathColor;
    ctx.strokeStyle = pathColor;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(points[0].x+27, points[0].y);
    for(let i=1;i<points.length;i++) ctx.lineTo(points[i].x+27, points[i].y);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 内側の明るいライン
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.strokeStyle = isLight ? '#0066cc' : '#ffffff';
    ctx.beginPath();
    ctx.moveTo(points[0].x+27, points[0].y);
    for(let i=1;i<points.length;i++) ctx.lineTo(points[i].x+27, points[i].y);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  // キーポイント
  for(let i=0;i<points.length;i++){
    const p = points[i];
    const isStart = i===0;

    // 外側グロー
    ctx.shadowBlur = 15;
    ctx.shadowColor = isStart? startColor : pointColor;
    ctx.beginPath();
    ctx.fillStyle = isStart? startColor : pointColor;
    ctx.arc(p.x+27,p.y,10,0,Math.PI*2);
    ctx.fill();

    // 内側コア
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.fillStyle = coreColor;
    ctx.arc(p.x+27,p.y,6,0,Math.PI*2);
    ctx.fill();

    // 番号
    ctx.shadowBlur = 0;
    ctx.fillStyle=numBg;
    ctx.font = 'bold 11px "Orbitron", monospace';
    const text = String(i+1);
    const metrics = ctx.measureText(text);
    ctx.fillText(text, p.x+27-metrics.width/2, p.y+4);
  }
  ctx.shadowBlur = 0;
}

// ---- 幾何ヘルパ ----
const dist = (a,b)=> Math.hypot(a.x-b.x, a.y-b.y);
function totalLength(pts){ let s=0; for(let i=1;i<pts.length;i++) s+=dist(pts[i],pts[i-1]); return s; }
function turns(pts){
  let t=0; for(let i=2;i<pts.length;i++){
    const v1={x:pts[i-1].x-pts[i-2].x,y:pts[i-1].y-pts[i-2].y};
    const v2={x:pts[i].x-pts[i-1].x,y:pts[i].y-pts[i-1].y};
    const den=(Math.hypot(v1.x,v1.y)*Math.hypot(v2.x,v2.y)||1);
    const ang=Math.acos(((v1.x*v2.x+v1.y*v2.y)/den));
    if(isFinite(ang) && Math.abs(ang)>0.6) t++;
  } return t;
}
function adjRatio(pts){
  if(pts.length<=1) return 0;
  let a=0; for(let i=1;i<pts.length;i++){
    const dx=Math.abs(pts[i].x-pts[i-1].x), dy=Math.abs(pts[i].y-pts[i-1].y);
    if(dx<=THRESH.adj_dx && dy<=THRESH.adj_dy) a++;
  }
  return a/(pts.length-1);
}
function directionEntropy(pts){
  if(pts.length<=1) return 0;
  const bins=new Array(8).fill(0);
  for(let i=1;i<pts.length;i++){
    const dx=pts[i].x-pts[i-1].x, dy=pts[i].y-pts[i-1].y;
    if(dx===0 && dy===0) continue;
    const ang=Math.atan2(dy,dx); // -pi..pi
    // 8方位に量子化（E=0,NE=1,...）
    const dir = Math.round(((ang+Math.PI)/(2*Math.PI))*8)%8;
    bins[dir]++;
  }
  const n=bins.reduce((s,v)=>s+v,0); if(!n) return 0;
  let H=0; for(const v of bins){ if(v>0){ const p=v/n; H -= p*Math.log2(p); } }
  return H; // 最大 ~3
}
function stepCV(pts){
  const arr=[]; for(let i=1;i<pts.length;i++) arr.push(dist(pts[i],pts[i-1]));
  if(arr.length===0) return 0;
  const mean = arr.reduce((s,v)=>s+v,0)/arr.length;
  if(mean===0) return 0;
  const varc = arr.reduce((s,v)=>s+(v-mean)*(v-mean),0)/arr.length;
  return Math.sqrt(varc)/mean;
}
function knightRatio(pts){
  if(pts.length<=1) return 0;
  let k=0; for(let i=1;i<pts.length;i++){
    const dx=Math.abs(pts[i].x-pts[i-1].x), dy=Math.abs(pts[i].y-pts[i-1].y);
    // 格子間隔を概ね keyW+gap=~68px, rowGap=~78px と想定、近似で2:1/1:2を判定
    const near=(a,b,eps)=>Math.abs(a-b)<=12; // 許容
    if( (near(dx, 2*68) && near(dy, 1*78)) || (near(dx, 1*68) && near(dy, 2*78)) ) k++;
  }
  return k/(pts.length-1);
}

// ---- グラフ駆動の歩き検出（レイアウト非依存 A1） ----
function buildAdjGraph(points){
  // 頂点はインデックス、隣接は閾値内
  const adj=Array.from({length:points.length},()=>[]);
  for(let i=0;i<points.length;i++){
    for(let j=i+1;j<points.length;j++){
      const dx=Math.abs(points[j].x-points[i].x), dy=Math.abs(points[j].y-points[i].y);
      if(dx<=THRESH.adj_dx && dy<=THRESH.adj_dy){ adj[i].push(j); adj[j].push(i); }
    }
  }
  return adj;
}
function detectAdjacentWalks(chars, points){
  // 連続的な入力において、隣接辺が3〜5個以上つながる部分列を抽出
  const res=[];
  let run=[];
  for(let i=1;i<points.length;i++){
    const dx=Math.abs(points[i].x-points[i-1].x), dy=Math.abs(points[i].y-points[i-1].y);
    const isAdj = (dx<=THRESH.adj_dx && dy<=THRESH.adj_dy);
    if(isAdj){
      if(!run.length) run.push(i-1);
      run.push(i);
    }else{
      if(run.length>=3){ // 長さ3以上
        const s=run[0], e=run[run.length-1];
        res.push(chars.slice(s,e+1));
      }
      run=[];
    }
  }
  if(run.length>=3) res.push(chars.slice(run[0], run[run.length-1]+1));
  return res;
}

// ---- 既知/反復パターン（A4） ----
function repeatedNgrams(str, minN=2, maxN=4){
  const s=str.toLowerCase(); const out=new Set();
  for(let n=minN;n<=maxN;n++){
    const freq=new Map();
    for(let i=0;i<=s.length-n;i++){
      const g=s.slice(i,i+n);
      if(/\s/.test(g)) continue;
      freq.set(g,(freq.get(g)||0)+1);
    }
    for(const [g,c] of freq.entries()) if(c>=3) out.add(`${g}×${c}`);
  }
  return Array.from(out);
}

// ---- KDS（B1） ----
function kdsScore({adj, H, turns, len, cv, patterns}){
  const normAdj = Math.min(1, adj/THRESH.high_adj_ratio);          // 0..1
  const lowH = Math.max(0, (THRESH.entropy_bad - H)/THRESH.entropy_bad);
  const straightFlag = (len>=4 && turns<=1) ? 1 : 0;
  const patternFlag = (patterns.length>0) ? 1 : 0;
  const lowCV = Math.max(0, (THRESH.stepcv_bad - cv)/THRESH.stepcv_bad);

  const score =
    0.30*normAdj +
    0.25*lowH +
    0.20*straightFlag +
    0.15*patternFlag +
    0.10*lowCV;

  return Math.round(100*score);
}
const kdsLabel = v => (v>=60?'要改善': (v>=40?'注意':'良好'));

// ---- 単体分析 ----
function analyzeSingle(){
  const layout = document.getElementById('layout').value;
  const mode   = document.getElementById('mode').value;
  const raw    = document.getElementById('pwd').value || '';

  coordMap = buildCoordMap(layout);
  drawKeyboards();

  const chars = raw.split('');
  const {points, unknown} = textToPoints(raw);
  plotPath(points, mode);

  const uniq = new Set(chars.map(c=> (shiftUnmap(c.toLowerCase())||c.toLowerCase()))).size;
  const len  = totalLength(points);
  const trn  = turns(points);
  const adjR = adjRatio(points);
  const H    = directionEntropy(points);
  const cv   = stepCV(points);
  const kRat = knightRatio(points);

  setText('m-unique', uniq);
  setText('m-length', Math.round(len));
  setText('m-turns', trn);
  setText('m-adj', (adjR*100).toFixed(0)+'%');
  setText('m-dirh', H.toFixed(2));
  setText('m-cv', cv.toFixed(2));
  setText('m-knight', (kRat*100).toFixed(0)+'%');

  // パターン検出
  const dlist = document.getElementById('d-list'); dlist.innerHTML='';
  let hasPattern = false;

  if(unknown.length){
    addLi(dlist, `非対象/未マップ：${unknown.map(s=>JSON.stringify(s)).join(' ')}`, 'bad');
    hasPattern = true;
  }

  // 既知キーワード
  const sLower = raw.toLowerCase();
  ['qwerty','asdf','zxcv','1234','password','pass','admin'].forEach(k=>{
    if(sLower.includes(k)){ addLi(dlist, `定番パターン: "${k}"`, 'bad'); hasPattern = true; }
  });

  // 連続隣接（レイアウト非依存）
  const walks = detectAdjacentWalks(chars, points);
  if(walks.length){ addLi(dlist, `連続隣接（歩き）: ${walks.map(w=>`"${w.join('')}"`).join(', ')}`, 'bad'); hasPattern = true; }

  // 直線優勢
  if(chars.length>=4 && trn<=1){ addLi(dlist, '長い直線的な移動（方向転換が少ない）', 'bad'); hasPattern = true; }

  // 高隣接
  if(chars.length>=6 && adjR>THRESH.high_adj_ratio){ addLi(dlist, '高い隣接比率（キーボード歩き）', 'bad'); hasPattern = true; }

  // 反復 n-gram
  const reps = repeatedNgrams(raw,2,4);
  if(reps.length){ addLi(dlist, `反復n-gram: ${reps.join(', ')}`, 'bad'); hasPattern = true; }

  // 方向エントロピー低
  if(H<THRESH.entropy_bad){ addLi(dlist, `方向エントロピー低 (H=${H.toFixed(2)})`, 'bad'); hasPattern = true; }

  // ステップ単調
  if(cv<THRESH.stepcv_bad){ addLi(dlist, `ステップ長が単調 (CV=${cv.toFixed(2)})`, 'bad'); hasPattern = true; }

  // ナイトムーブ（特徴）
  if(kRat>=0.20){ addLi(dlist, `ナイトムーブ比率が高い (${(kRat*100).toFixed(0)}%)`, 'good'); hasPattern = true; }

  // パターンなしの場合
  if(!hasPattern && chars.length>0){
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'パターンなし（良好）';
    dlist.appendChild(li);
  }

  // KDS
  const patternsForKDS = Array.from(dlist.querySelectorAll('li.bad')).map(li=>li.textContent);
  const kds = kdsScore({adj:adjR, H, turns:trn, len:chars.length, cv, patterns:patternsForKDS});
  const label = kdsLabel(kds);
  setText('m-kds', `${kds}（${label}）`);
}

// ---- プロファイル ----
function analyzeProfile(){
  const layout = document.getElementById('profile-layout').value;
  coordMap = buildCoordMap(layout);
  drawKeyboards();

  const lines = (document.getElementById('pwds').value || '')
    .split(/\n+/).map(s=>s.trim()).filter(Boolean);

  const traitsUL = document.getElementById('traits-list'); traitsUL.innerHTML='';
  if(!lines.length){ addLi(traitsUL, '入力がありません','bad'); resetProfileMetrics(); return; }

  const used = new Set(); const keyFreq=new Map(); const bigram=new Map();
  let totalAdj=0,totalTurns=0,totalLen=0;
  const heatPts=[];

  for(const line of lines){
    const {points} = textToPoints(line);
    points.forEach(p=>{ heatPts.push(p); });
    // metrics per line
    totalLen += totalLength(points);
    totalTurns += turns(points);
    totalAdj += adjRatio(points);
    // used keys & freq
    for(const ch of line.toLowerCase()){
      const k = coordMap.has(ch) ? ch : shiftUnmap(ch);
      if(k && coordMap.has(k)){
        used.add(k);
        keyFreq.set(k,(keyFreq.get(k)||0)+1);
      }
    }
    // bigrams
    for(let i=0;i<line.length-1;i++){
      const g=line.slice(i,i+2).toLowerCase();
      if(/\s/.test(g)) continue;
      bigram.set(g,(bigram.get(g)||0)+1);
    }
  }

  // heatmap（ネオングロー）
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const heatColor = isLight ? '#0066cc' : '#00f0ff';
  const heatFill = isLight ? 'rgba(0,102,204,0.3)' : 'rgba(0,240,255,0.3)';

  for(const p of heatPts){
    pctx.shadowBlur = 25;
    pctx.shadowColor = heatColor;
    pctx.fillStyle = heatFill;
    pctx.beginPath();
    pctx.arc(p.x+27,p.y,18,0,Math.PI*2);
    pctx.fill();
  }
  pctx.shadowBlur = 0;

  const n=lines.length;
  const avgAdj = (totalAdj/n)||0, avgTurns=(totalTurns/n)||0, avgLen=(totalLen/n)||0;
  setText('pm-adj', (avgAdj*100).toFixed(0)+'%');
  setText('pm-turns', avgTurns.toFixed(1));
  setText('pm-length', Math.round(avgLen));
  setText('pm-uniq', used.size);

  // Traits
  const topKeys = topN(keyFreq,8).map(([k,v])=>`${k.toUpperCase()}×${v}`);
  if(topKeys.length) addHtml(traitsUL, `よく使うキー: ${topKeys.map(s=>`<span class="kpill">${s}</span>`).join(' ')}`);

  const topBi = topN(bigram,5).map(([g,v])=>`${g}×${v}`);
  if(topBi.length) addLi(traitsUL, `頻出バイグラム: ${topBi.join(', ')}`);

  // 接尾（年号・数字連続・記号連続）
  const suf = summarizeSuffixes(lines);
  if(suf.length) addLi(traitsUL, `接尾パターン: ${suf.join(', ')}`);

  // 接頭（先頭大→小/大連続/小連続）＋テンプレ
  const pre = summarizePrefixes(lines);
  if(pre.length) addLi(traitsUL, `接頭パターン: ${pre.join(', ')}`);

  // ゾーン偏り
  const zones = summarizeZones(heatPts);
  addLi(traitsUL, `ゾーン偏り: 左${(zones.left*100).toFixed(0)}% / 右${(zones.right*100).toFixed(0)}%, 上${(zones.top*100).toFixed(0)}% / 中${(zones.mid*100).toFixed(0)}% / 下${(zones.bottom*100).toFixed(0)}%`);
}

// ---- Traits helpers ----
function topN(m, n){ return Array.from(m.entries()).sort((a,b)=>b[1]-a[1]).slice(0,n); }
function summarizeSuffixes(lines){
  const pat = [
    [/20(?:[1-2]\d)$|202[0-5]$/,'年号'], // 2010-2025程度
    [/\d{2,}$/,'数字連続'],
    [/!+$/,'!連続'],
    [/\?+$/,'?連続'],
    [/[-_.]{2,}$/,'記号(-_.)連続']
  ];
  const out=[]; for(const [re,name] of pat){
    const c=lines.filter(s=>re.test(s)).length; if(c>0) out.push(`${name}×${c}`);
  }
  return out;
}
function summarizePrefixes(lines){
  const pat = [
    [/^[A-Z][a-z]{2,}/,'先頭: 大→小連続'],
    [/^[A-Z]{2,}/,'先頭: 大文字連続'],
    (/^[a-z]{2,}/,'先頭: 小文字連続')
  ];
  const out=[];
  for(const p of pat){
    const re = Array.isArray(p)? p[0]:p; const name = Array.isArray(p)? p[1]:'';
    const c=lines.filter(s=>re.test(s)).length; if(c>0) out.push(`${name}×${c}`);
  }
  // テンプレ例: Letters+Digits+Punct
  const tmpl = /^[A-Za-z]+[0-9]+[!?.]+$/;
  const tc = lines.filter(s=>tmpl.test(s)).length;
  if(tc>0) out.push(`テンプレ(英+数+記号)×${tc}`);
  return out;
}
function summarizeZones(points){
  if(!points.length) return {left:0,right:0,top:0,mid:0,bottom:0};
  const xs=points.map(p=>p.x), ys=points.map(p=>p.y);
  const midx=(Math.min(...xs)+Math.max(...xs))/2;
  const yMin=Math.min(...ys), yMax=Math.max(...ys);
  const yT=yMin+(yMax-yMin)/3, yB=yMin+2*(yMax-yMin)/3;
  let L=0,R=0,T=0,M=0,B=0;
  for(const p of points){
    if(p.x<=midx) L++; else R++;
    if(p.y<=yT) T++; else if(p.y<=yB) M++; else B++;
  }
  const n=points.length; return {left:L/n,right:R/n,top:T/n,mid:M/n,bottom:B/n};
}

// ---- UI wiring ----
function setText(id, val){ const el=document.getElementById(id); if(el) el.textContent=val; }
function addLi(ul, text, cls){ const li=document.createElement('li'); li.textContent=text; if(cls) li.className=cls; ul.appendChild(li); }
function addHtml(ul, html){ const li=document.createElement('li'); li.innerHTML=html; ul.appendChild(li); }

function resetSingle(){
  setText('m-unique','-'); setText('m-length','-'); setText('m-turns','-'); setText('m-adj','-');
  setText('m-dirh','-'); setText('m-cv','-'); setText('m-knight','-'); setText('m-kds','-');
  document.getElementById('d-list').innerHTML='';
}
function resetProfileMetrics(){
  ['pm-adj','pm-turns','pm-length','pm-uniq'].forEach(id=> setText(id,'-'));
}

// プリセットデータ（レイアウト別）
const PRESETS_SINGLE = {
  'qwerty': {
    'walk1': 'qwerty123',        // QWERTY上段歩き
    'walk2': 'asdfgh',           // QWERTY中段直線
    'common': 'P@ssw0rd!',       // 一般的パターン
    'dict': 'Tr0ub4dor&3',       // 辞書+置換
    'strong': 'xK9#mQ2$vL'       // ランダム風
  },
  'jis': {
    'walk1': 'qwerty123',        // JIS上段歩き
    'walk2': 'asdfghjkl',        // JIS中段歩き
    'common': 'P@ssw0rd!',       // 一般的パターン
    'dict': 'Sakura2024!',       // 日本語由来
    'strong': 'xK9#mQ2$vL'       // ランダム風
  },
  'dvorak': {
    'walk1': '123456',           // 数字列
    'walk2': 'aoeu',             // Dvorakホームポジション
    'common': 'P@ssw0rd!',       // 一般的パターン
    'dict': 'Tr0ub4dor&3',       // 辞書+置換
    'strong': 'xK9#mQ2$vL'       // ランダム風
  }
};

const PRESETS_PROFILE = {
  'qwerty': {
    'basic': 'Password123\nWelcome2024\nAdmin123\nLogin2024\nAccess123',
    'year': 'Tokyo2023!\nOsaka2024!\nKyoto2022!\nNagoya2025!\nSapporo2021!',
    'keyboard': 'qwerty12\nasdfgh34\nzxcvbn56\nqazwsx78\nwsxedc90',
    'random': 'xK9#mQ2$vL\nR7@bN4!jX3\nM5&pW8*dF1\nT2#vK6@hL9\nY4$nC8!qZ7'
  },
  'jis': {
    'basic': 'Password123\nWelcome2024\nAdmin123\nLogin2024\nAccess123',
    'year': 'Tokyo2023!\nOsaka2024!\nKyoto2022!\nNagoya2025!\nSapporo2021!',
    'keyboard': 'qwertyui\nasdfghjk\nzxcvbnm\n1qaz2wsx\n3edc4rfv',
    'random': 'xK9#mQ2$vL\nR7@bN4!jX3\nM5&pW8*dF1\nT2#vK6@hL9\nY4$nC8!qZ7'
  },
  'dvorak': {
    'basic': 'Password123\nWelcome2024\nAdmin123\nLogin2024\nAccess123',
    'year': 'Tokyo2023!\nOsaka2024!\nKyoto2022!\nNagoya2025!\nSapporo2021!',
    'keyboard': 'aoeu\nhtns\n123456\npyfgcr\nqjkxbm',
    'random': 'xK9#mQ2$vL\nR7@bN4!jX3\nM5&pW8*dF1\nT2#vK6@hL9\nY4$nC8!qZ7'
  }
};

function bind(){
  // タブ
  const btnSingle = document.getElementById('tabbtn-single');
  const btnProfile= document.getElementById('tabbtn-profile');
  const paneSingle= document.getElementById('tab-single');
  const paneProfile=document.getElementById('tab-profile');
  btnSingle.addEventListener('click',()=>{
    btnSingle.classList.add('active');btnSingle.setAttribute('aria-selected','true');
    btnProfile.classList.remove('active');btnProfile.setAttribute('aria-selected','false');
    paneSingle.classList.add('active');paneProfile.classList.remove('active');
  });
  btnProfile.addEventListener('click',()=>{
    btnProfile.classList.add('active');btnProfile.setAttribute('aria-selected','true');
    btnSingle.classList.remove('active');btnSingle.setAttribute('aria-selected','false');
    paneProfile.classList.add('active');paneSingle.classList.remove('active');
  });

  // レイアウト切替
  document.getElementById('layout').addEventListener('change', e=>{ coordMap=buildCoordMap(e.target.value); drawKeyboards(); });
  document.getElementById('profile-layout').addEventListener('change', e=>{ coordMap=buildCoordMap(e.target.value); drawKeyboards(); });

  // 単体
  document.getElementById('analyze').addEventListener('click', analyzeSingle);
  document.getElementById('clear').addEventListener('click', ()=>{
    document.getElementById('pwd').value=''; resetSingle();
    coordMap = buildCoordMap(document.getElementById('layout').value); drawKeyboards();
  });

  // 単体プリセット（レイアウト別）
  document.querySelectorAll('.preset-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const preset = btn.getAttribute('data-preset');
      const layout = document.getElementById('layout').value;
      const presetData = PRESETS_SINGLE[layout];
      document.getElementById('pwd').value = presetData ? (presetData[preset] || '') : '';
      analyzeSingle();
    });
  });

  // プロファイル
  document.getElementById('analyze-profile').addEventListener('click', analyzeProfile);
  document.getElementById('clear-profile').addEventListener('click', ()=>{
    document.getElementById('pwds').value=''; resetProfileMetrics();
    coordMap = buildCoordMap(document.getElementById('profile-layout').value); drawKeyboards();
    document.getElementById('traits-list').innerHTML='';
  });

  // プロファイルプリセット（レイアウト別）
  document.querySelectorAll('.preset-btn-profile').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const preset = btn.getAttribute('data-preset');
      const layout = document.getElementById('profile-layout').value;
      const presetData = PRESETS_PROFILE[layout];
      document.getElementById('pwds').value = presetData ? (presetData[preset] || '') : '';
      analyzeProfile();
    });
  });
}

// テーマ切り替え
function initTheme(){
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  const themeBtn = document.getElementById('theme-toggle');
  themeBtn.addEventListener('click', ()=>{
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);

    // Canvas再描画
    drawKeyboards();
    const activeTab = document.querySelector('.tab-pane.active');
    if(activeTab && activeTab.id === 'tab-single' && document.getElementById('pwd').value){
      analyzeSingle();
    } else if(activeTab && activeTab.id === 'tab-profile' && document.getElementById('pwds').value){
      analyzeProfile();
    }
  });
}

// アコーディオン機能
function initAccordions(){
  const accordions = document.querySelectorAll('.accordion-toggle');
  accordions.forEach(toggle=>{
    toggle.addEventListener('click', ()=>{
      toggle.classList.toggle('active');
      const content = toggle.nextElementSibling;
      content.classList.toggle('active');
    });
  });
}

// ツールチップ機能
function initTooltips(){
  const helpIcons = document.querySelectorAll('.help-icon');

  // body直下にツールチップコンテナを作成
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip-content';
  document.body.appendChild(tooltip);

  helpIcons.forEach(icon => {
    icon.addEventListener('mouseenter', () => {
      const text = icon.getAttribute('data-tooltip');
      if (!text) return;

      tooltip.textContent = text;

      // アイコンの位置を取得
      const rect = icon.getBoundingClientRect();
      const tooltipWidth = 280;
      const gap = 10;

      // 画面の上半分か下半分かで表示位置を決定
      const isTopHalf = rect.top < window.innerHeight / 2;

      // 左右の位置調整（画面からはみ出さないように）
      let left = rect.left + rect.width / 2 - tooltipWidth / 2;
      if (left < 10) left = 10;
      if (left + tooltipWidth > window.innerWidth - 10) {
        left = window.innerWidth - tooltipWidth - 10;
      }

      if (isTopHalf) {
        // アイコンの下に表示
        tooltip.style.top = `${rect.bottom + gap}px`;
        tooltip.style.bottom = 'auto';
        tooltip.classList.remove('tooltip-top');
        tooltip.classList.add('tooltip-bottom');
      } else {
        // アイコンの上に表示
        tooltip.style.bottom = `${window.innerHeight - rect.top + gap}px`;
        tooltip.style.top = 'auto';
        tooltip.classList.remove('tooltip-bottom');
        tooltip.classList.add('tooltip-top');
      }

      tooltip.style.left = `${left}px`;
      tooltip.classList.add('show');
    });

    icon.addEventListener('mouseleave', () => {
      tooltip.classList.remove('show');
    });
  });
}

// 初期化
(function init(){
  initTheme();
  setupCanvas(canvas);
  setupCanvas(pcanvas);
  coordMap = buildCoordMap('jis');
  drawKeyboards();
  bind();
  initAccordions();
  initTooltips();

  // リサイズ対応
  let resizeTimer;
  window.addEventListener('resize', ()=>{
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(()=>{
      setupCanvas(canvas);
      setupCanvas(pcanvas);
      drawKeyboards();
      // 現在の分析結果を再描画
      const activeTab = document.querySelector('.tab-pane.active');
      if(activeTab && activeTab.id === 'tab-single' && document.getElementById('pwd').value){
        analyzeSingle();
      } else if(activeTab && activeTab.id === 'tab-profile' && document.getElementById('pwds').value){
        analyzeProfile();
      }
    }, 150);
  });
})();
