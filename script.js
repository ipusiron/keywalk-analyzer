/* KeyWalk Analyzer: DOM rendering over the independent KeyWalkCore model. */
const Core = KeyWalkCore;
const Samples = KeyWalkSamples;
const sampleState = {notice: '', args: {}};
const state = {single: null, comparison: null, profile: null, singleNotice: '', profileNotice: ''};
const stepState = {steps: [], index: 0};
const composing = {single: false, profile: false};
function t(key, args = {}) {
  const language = document.documentElement.lang === 'en' ? 'en' : 'ja';
  const messages = KeyWalkMessages[language] || KeyWalkMessages.ja;
  return (messages[key] || key).replace(/\{(\w+)\}/g, (_, name) => String(args[name] ?? ''));
}

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
function buildCoordMap(layoutKey) {
  return new Map(Core.keys(layoutKey).map(p => [p.key, {...p, x: 16 + 78 * p.x, y: 70 + 78 * p.y}]));
}

// キーボード描画（両キャンバス）
function drawKeyboards(){
  const targets = [
    {c:ctx,w:1100,h:420,layout:document.getElementById('layout').value},
    {c:pctx,w:1100,h:420,layout:document.getElementById('profile-layout').value}
  ];
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const keyBg = isLight ? 'rgba(0,102,204,0.1)' : 'rgba(0,240,255,0.08)';
  const keyStroke = isLight ? 'rgba(0,102,204,0.5)' : 'rgba(0,240,255,0.4)';
  const keyText = isLight ? '#0066cc' : '#00f0ff';
  const shadowColor = isLight ? 'rgba(0,102,204,0.4)' : 'rgba(0,240,255,0.8)';

  for(const t of targets){
    t.c.clearRect(0,0,t.w,t.h);
    t.c.font = 'bold 18px monospace';
    for(const [k,p] of buildCoordMap(t.layout).entries()){
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



// ---- 描画：単体経路 ----
function plotPath(points,mode){
  if(!points.length) return;
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const pathColor = isLight ? '#0066cc' : '#00f0ff';
  const startColor = isLight ? '#00aa33' : '#39ff14';
  const pointColor = isLight ? '#cc0099' : '#ff00e5';
  const coreColor = isLight ? '#ffffff' : '#ffffff';
  // The point core is white in both themes, so its index needs dark ink.
  const numBg = '#0a0e27';

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
    ctx.font = 'bold 16px monospace';
    const text = String(p.index + 1);
    const metrics = ctx.measureText(text);
    ctx.fillText(text, p.x+27-metrics.width/2, p.y+4);
  }
  ctx.shadowBlur = 0;
}

// ---- Analysis state and localized rendering ----
const number = (value, digits = 0) => value === null ? '—' : value.toFixed(digits);
const percent = value => value === null ? '—' : (value * 100).toFixed(0) + '%';
const items = values => values.slice(0, 20).join(', ');
function setText(id, value) { document.getElementById(id).textContent = value; }
function addLi(ul, text) {
  const li = document.createElement('li');
  li.textContent = text;
  ul.appendChild(li);
}
function resetSingle() {
  state.single = null;
  state.comparison = null;
  stepState.steps = [];
  stepState.index = 0;
  ['m-unique','m-length','m-turns','m-adj','m-dirh','m-cv','m-knight','m-kds'].forEach(id => setText(id, '—'));
  document.getElementById('d-list').replaceChildren();
}
function resetProfileMetrics() {
  state.profile = null;
  ['pm-adj','pm-turns','pm-length','pm-uniq'].forEach(id => setText(id, '—'));
  document.getElementById('traits-list').replaceChildren();
}
function analyzeSingle() {
  if (composing.single) return;
  resetSingle();
  state.singleNotice = '';
  try {
    const raw = document.getElementById('pwd').value;
    if (!raw) state.singleNotice = 'empty';
    else {
      state.comparison = Core.compareLayouts(raw);
      state.single = state.comparison.find(r => r.layout === document.getElementById('layout').value);
      stepState.steps = Core.pathSteps(state.single);
    }
  } catch (error) {
    state.singleNotice = Object.hasOwn(KeyWalkMessages.ja, error.message) ? error.message : 'error';
  }
  renderAll();
}
function analyzeProfile() {
  if (composing.profile) return;
  resetProfileMetrics();
  state.profileNotice = '';
  try {
    const result = Core.profile(document.getElementById('pwds').value, document.getElementById('profile-layout').value);
    if (!result.lines) state.profileNotice = 'empty';
    else state.profile = result;
  } catch (error) {
    state.profileNotice = Object.hasOwn(KeyWalkMessages.ja, error.message) ? error.message : 'error';
  }
  renderAll();
}
function renderSingle() {
  const ul = document.getElementById('d-list');
  ul.replaceChildren();
  if (state.singleNotice) addLi(ul, t(state.singleNotice));
  const r = state.single;
  if (!r) return;
  setText('m-unique', r.unique);
  setText('m-length', number(r.distance, 2));
  setText('m-turns', number(r.turns));
  setText('m-adj', percent(r.adjacent));
  setText('m-dirh', number(r.entropy, 2));
  setText('m-cv', number(r.cv, 2));
  setText('m-knight', percent(r.knight));
  setText('m-kds', r.kds === null ? '—' : r.kds);
  addLi(ul, t('mapped', {characters:r.characters, mapped:r.points.length, transitions:r.transitions}));
  addLi(ul, t(r.kds === null ? r.kdsReason : 'reference'));
  if (r.unknown.length) addLi(ul, t('unknown', {
    count:r.unknown.length, items:items(r.unknown.map(p => (p.index + 1) + ': ' + Core.visible(p.char)))
  }));
  if (r.known.length) addLi(ul, t('known', {items:items(r.known)}));
  if (r.walks.length) addLi(ul, t('walk', {items:items(r.walks.map(w => Core.visible(w.text)))}));
  if (r.repeated.length) addLi(ul, t('repeat', {items:items(r.repeated.map(p => Core.visible(p.text) + ' × ' + p.count))}));
  if (r.repeats) addLi(ul, t('same', {count:r.repeats}));
  for (const key of ['straight','lowH','lowCV']) if (r[key]) addLi(ul, t(key));
  if (!r.known.length && !r.walks.length && !r.repeated.length && !r.straight && !r.lowH && !r.lowCV && !r.repeats) {
    addLi(ul, t('none'));
  }
  if (r.points.length > Core.LIMITS.plot) addLi(ul, t('plotLimit'));
  if (Math.max(r.unknown.length, r.walks.length, r.repeated.length) > 20) addLi(ul, t('listLimit'));
}
function renderProfile() {
  const ul = document.getElementById('traits-list');
  ul.replaceChildren();
  if (state.profileNotice) addLi(ul, t(state.profileNotice));
  const r = state.profile;
  if (!r) return;
  setText('pm-uniq', r.unique);
  setText('pm-adj', percent(r.adjacent.value));
  setText('pm-turns', number(r.turns.value, 1));
  setText('pm-length', number(r.distance.value, 2));
  addLi(ul, t('profileSummary', {lines:r.lines, mapped:r.points.length, unknown:r.unknown}));
  addLi(ul, t('denominators', {adj:r.adjacent.count, turns:r.turns.count, distance:r.distance.count}));
  const counts = list => list.map(([key, count]) => Core.visible(key) + ' × ' + count).join(', ');
  if (r.topKeys.length) addLi(ul, t('topKeys', {items:counts(r.topKeys)}));
  if (r.bigrams.length) addLi(ul, t('bigrams', {items:counts(r.bigrams)}));
  for (const key of ['prefixes','suffixes']) if (r[key].length) {
    addLi(ul, t(key, {items:r[key].map(p => t(p.id) + ' × ' + p.count).join(', ')}));
  }
  if (r.zones) addLi(ul, t('zones', Object.fromEntries(Object.entries(r.zones).map(([k,v]) => [k, (v*100).toFixed(0)]))));
  else addLi(ul, t('noMapped'));
}
function drawResults() {
  drawKeyboards();
  if (state.single && document.getElementById('path-inspector').open) {
    drawStep();
  } else if (state.single) {
    let remaining = Core.LIMITS.plot;
    for (const segment of state.single.segments) {
      const points = segment.slice(0, remaining).map(p => ({...p, x:16 + 78*p.x, y:70 + 78*p.y}));
      plotPath(points, document.getElementById('mode').value);
      remaining -= points.length;
      if (!remaining) break;
    }
  }
  if (state.profile) {
    const map = buildCoordMap(state.profile.layout);
    const maximum = Math.max(1, ...state.profile.keyCounts.map(([,n]) => n));
    for (const [key, count] of state.profile.keyCounts) {
      const p = map.get(key);
      pctx.fillStyle = document.documentElement.dataset.theme === 'light' ? '#0055bb' : '#00f0ff';
      pctx.globalAlpha = 0.15 + 0.55 * count / maximum;
      pctx.beginPath();
      pctx.arc(p.x+27, p.y, 20, 0, Math.PI*2);
      pctx.fill();
    }
    pctx.globalAlpha = 1;
  }
}
function drawStep() {
  const s = stepState.steps[stepState.index];
  if (!s?.point) return;
  const pair = s.previous && s.distance > 0 ? [s.previous, s.point] : [s.point];
  plotPath(pair.map(p => ({...p, x:16 + 78*p.x, y:70 + 78*p.y})), document.getElementById('mode').value);
  const p = s.point;
  ctx.save();
  ctx.strokeStyle = document.documentElement.dataset.theme === 'light' ? '#10152f' : '#ffffff';
  ctx.lineWidth = 3;
  ctx.shadowBlur = 0;
  ctx.strokeRect(16 + 78*p.x - 8, 70 + 78*p.y - 32, 70, 64);
  ctx.restore();
}
function scrollStepKey() {
  const s = stepState.steps[stepState.index];
  if (!document.getElementById('path-inspector').open || !s?.point) return;
  const region = canvas.parentElement;
  const center = (43 + 78*s.point.x) * canvas.getBoundingClientRect().width / 1100;
  region.scrollLeft = Math.max(0, center - region.clientWidth / 2);
}
function textElement(tag, text) {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}
function renderSteps() {
  const panel = document.getElementById('path-inspector');
  panel.hidden = !state.single;
  setText('step-title', t('stepTitle'));
  setText('step-note', t('stepNote'));
  for (const name of ['first', 'prev', 'next', 'last']) {
    const button = document.getElementById('step-' + name);
    button.textContent = t('step_' + name);
    button.disabled = !stepState.steps.length || (['first', 'prev'].includes(name)
      ? stepState.index === 0 : stepState.index === stepState.steps.length - 1);
  }
  if (!state.single) { panel.open = false; setText('step-status', ''); return; }
  const s = stepState.steps[stepState.index];
  setText('step-status', t('stepPosition', {
    position: s.index + 1, total: stepState.steps.length, char: Core.visible(s.char),
    key: s.point ? Core.visible(s.point.key) : '—',
    previous: s.previous ? (s.previous.index + 1) + ': ' + Core.visible(s.previous.char) : '—',
    distance: number(s.distance, 3)
  }) + ' ' + t('step_kind_' + s.kind));
}
function renderComparison() {
  const section = document.getElementById('layout-comparison');
  section.replaceChildren();
  section.hidden = !state.comparison;
  if (!state.comparison) return;
  const heading = textElement('h2', t('comparisonTitle'));
  heading.id = 'comparison-title';
  section.append(heading, textElement('p', t('comparisonNote')));
  const grid = document.createElement('div');
  grid.className = 'comparison-grid';
  for (const r of state.comparison) {
    const card = document.createElement('article');
    card.className = 'comparison-layout';
    card.dataset.layout = r.layout;
    card.append(textElement('h3', t('layout_' + r.layout)));
    const selected = r.layout === state.single.layout;
    card.append(textElement('p', t(selected ? 'selectedLayout' : 'comparisonLayout')));
    const list = document.createElement('dl');
    for (const [label, value] of [
      ['adjacencyLabel', percent(r.adjacent)], ['distanceLabel', number(r.distance, 2)],
      ['entropyLabel', number(r.entropy, 2)], ['cvLabel', number(r.cv, 2)], ['kdsLabel', number(r.kds)],
      ['mappedLabel', r.points.length + ' / ' + r.characters], ['unknownLabel', r.unknown.length]
    ]) {
      const row = document.createElement('div');
      row.append(textElement('dt', t(label)), textElement('dd', value));
      list.append(row);
    }
    card.append(list);
    if (r.kds === null) card.append(textElement('p', t(r.kdsReason)));
    grid.append(card);
  }
  section.append(grid);
}
function renderCalculation() {
  const details = document.getElementById('calculation-details');
  const body = document.getElementById('calculation-body');
  const r = state.single;
  details.hidden = !r;
  body.replaceChildren();
  setText('calculation-summary', t('calculationTitle'));
  if (!r) { details.open = false; return; }
  body.append(textElement('h2', t('calculationFor', {layout:t('layout_' + r.layout)})));
  const counts = document.createElement('ul');
  counts.id = 'calculation-counts';
  addLi(counts, t('adjacencyMath', {count:r.adjacentCount, total:r.transitions, value:percent(r.adjacent)}));
  addLi(counts, t('movementMath', {total:r.transitions, repeats:r.repeats, moving:r.moving, distance:number(r.distance, 3)}));
  addLi(counts, t('turnMath', {turns:number(r.turns), pairs:r.turnPairs}));
  addLi(counts, t('cvMath', {value:number(r.cv, 3)}));
  if (!r.transitions) addLi(counts, t('noPairs'));
  if (r.cv === null) addLi(counts, t('noCV'));
  body.append(counts, textElement('h3', t('directionsTitle')), textElement('p', t('directionsNote')));
  const directions = document.createElement('ul');
  directions.id = 'direction-counts';
  directions.className = 'direction-counts';
  r.bins.forEach((count, index) => addLi(directions, t('directionCount', {
    direction:t('direction_' + index), count, total:r.moving,
    share:r.moving ? (100 * count / r.moving).toFixed(1) + '%' : '—'
  })));
  body.append(directions, textElement('p', t('entropyMath', {value:number(r.entropy, 3)})));
  if (!r.moving) body.append(textElement('p', t('noDirection')));
  body.append(textElement('h3', t('kdsPartsTitle')), textElement('p', t('kdsPartsNote')));
  body.append(textElement('p', t('kdsInputs', {
    adjacent:number(r.adjacent, 3), entropy:number(r.entropy, 3), turns:number(r.turns), cv:number(r.cv, 3),
    known:r.known.length, walks:r.walks.length, repeated:r.repeated.length
  })));
  if (r.kds === null) body.append(textElement('p', t(r.kdsReason)));
  const parts = document.createElement('ol');
  parts.id = 'kds-parts';
  for (const part of r.kdsBreakdown) {
    const li = document.createElement('li');
    li.append(textElement('h4', t('part_' + part.id)), textElement('p', t('formula_' + part.id)),
      textElement('p', t('partValue', {maximum:part.maximum, factor:number(part.factor, 3), value:number(part.contribution, 3)})));
    parts.append(li);
  }
  body.append(parts);
  if (r.kds !== null) {
    const total = textElement('p', t('kdsTotal', {raw:number(r.kdsRaw, 3), value:r.kds}));
    total.id = 'kds-total';
    body.append(total);
  }
  body.append(textElement('p', t('reference')));
}
function renderAll() {
  renderSingle(); renderProfile(); renderComparison(); renderCalculation(); renderSteps(); renderSamples(); drawResults();
}
function invalidate(tab) {
  if (tab === 'single') sampleState.notice = '';
  if (tab === 'single') resetSingle(); else resetProfileMetrics();
  state[tab + 'Notice'] = 'dirty';
  renderAll();
}

function renderSamples() {
  const selector = document.getElementById('sample-select'), selected = selector.value || 'walk1';
  selector.replaceChildren();
  for (const group of Samples.groups) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = t('sample_group_' + group.id);
    for (const id of group.items) {
      const option = textElement('option', t('sample_' + id));
      option.value = id;
      optgroup.append(option);
    }
    selector.append(optgroup);
  }
  selector.value = selected;
  for (const [id, entries, fallback] of [
    ['random-kind', Object.keys(Samples.alphabets).map(key => [key, t('random_' + key)]), 'alphanumeric'],
    ['random-length', Samples.lengths.map(n => [String(n), t('sampleLength', {count:n})]), '12']
  ]) {
    const select = document.getElementById(id), value = select.value || fallback;
    select.replaceChildren();
    for (const [key, label] of entries) {
      const option = textElement('option', label);
      option.value = key;
      select.append(option);
    }
    select.value = value;
  }
  for (const [id, key] of [['sample-heading','sampleHeading'], ['sample-label','sampleLabel'], ['load-sample','sampleLoad'],
    ['sample-note','sampleNote'], ['random-heading','randomHeading'], ['random-kind-label','randomKind'],
    ['random-length-label','randomLength'], ['generate-sample','randomGenerate'], ['random-note','randomNote']]) setText(id, t(key));
  const value = Samples.single(document.getElementById('layout').value, selected);
  setText('sample-preview', t('samplePreview', {text:Core.visible(value), description:t('sample_' + selected)}));
  setText('sample-feedback', sampleState.notice ? t(sampleState.notice, sampleState.args) : '');
  for (const id of ['load-sample', 'generate-sample']) document.getElementById(id).disabled = composing.single;
}
function replaceWithSample(text, notice, args = {}) {
  document.getElementById('pwd').value = text;
  sampleState.notice = notice;
  sampleState.args = args;
  analyzeSingle();
}

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
  document.getElementById('path-inspector').addEventListener('toggle', () => { drawResults(); scrollStepKey(); });
  for (const name of ['first', 'prev', 'next', 'last']) {
    document.getElementById('step-' + name).addEventListener('click', () => {
      if (!stepState.steps.length) return;
      const last = stepState.steps.length - 1;
      const next = name === 'first' ? 0 : name === 'last' ? last : stepState.index + (name === 'next' ? 1 : -1);
      stepState.index = Math.max(0, Math.min(last, next));
      renderSteps();
      drawResults();
      scrollStepKey();
    });
  }
  // タブ
  const btnSingle = document.getElementById('tabbtn-single');
  const btnProfile= document.getElementById('tabbtn-profile');
  const paneSingle= document.getElementById('tab-single');
  const paneProfile=document.getElementById('tab-profile');
  function activate(tab) {
    for (const [name, button, pane] of [['single',btnSingle,paneSingle], ['profile',btnProfile,paneProfile]]) {
      const active = name === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      pane.classList.toggle('active', active);
      pane.hidden = !active;
    }
  }
  btnSingle.addEventListener('click', () => activate('single'));
  btnProfile.addEventListener('click', () => activate('profile'));
  document.querySelector('.tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const single = event.key === 'Home' || (event.key !== 'End' && event.target === btnProfile);
    activate(single ? 'single' : 'profile');
    (single ? btnSingle : btnProfile).focus();
  });

  // レイアウト切替
  document.getElementById('layout').addEventListener('change', () => invalidate('single'));
  document.getElementById('profile-layout').addEventListener('change', () => invalidate('profile'));

  document.getElementById('mode').addEventListener('change', drawResults);
  for (const [tab, inputId, buttonId] of [['single','pwd','analyze'], ['profile','pwds','analyze-profile']]) {
    const input = document.getElementById(inputId), button = document.getElementById(buttonId);
    input.addEventListener('input', () => invalidate(tab));
    input.addEventListener('compositionstart', () => { composing[tab] = true; button.disabled = true; invalidate(tab); });
    input.addEventListener('compositionend', () => { composing[tab] = false; button.disabled = false; invalidate(tab); });
  }

  // 単体
  document.getElementById('analyze').addEventListener('click', analyzeSingle);
  document.getElementById('clear').addEventListener('click', ()=>{
    document.getElementById('pwd').value=''; resetSingle();
    sampleState.notice = '';
    state.singleNotice = ''; renderAll();
  });

  document.getElementById('sample-select').addEventListener('change', renderSamples);
  document.getElementById('load-sample').addEventListener('click', () => {
    if (composing.single) return;
    const text = Samples.single(document.getElementById('layout').value, document.getElementById('sample-select').value);
    replaceWithSample(text, 'sampleLoaded');
  });
  document.getElementById('generate-sample').addEventListener('click', () => {
    if (composing.single) return;
    let text;
    try {
      text = Samples.random(document.getElementById('random-kind').value, Number(document.getElementById('random-length').value));
    } catch {
      sampleState.notice = 'randomUnavailable';
      sampleState.args = {};
      renderSamples();
      return;
    }
    replaceWithSample(text, 'randomGenerated', {count:text.length});
  });

  // プロファイル
  document.getElementById('analyze-profile').addEventListener('click', analyzeProfile);
  document.getElementById('clear-profile').addEventListener('click', ()=>{
    document.getElementById('pwds').value=''; resetProfileMetrics();
    state.profileNotice = ''; renderAll();
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
function initTheme() {
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const value = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = value;
    try { localStorage.setItem('theme', value); } catch {}
    renderAll();
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
      content.hidden = !content.classList.contains('active');
      toggle.setAttribute('aria-expanded', String(!content.hidden));
    });
  });
}

// ツールチップ機能
function initTooltips() {
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip-content';
  tooltip.id = 'help-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.appendChild(tooltip);
  let owner = null;
  function hide() {
    tooltip.hidden = true;
    tooltip.classList.remove('show');
    if (owner) owner.removeAttribute('aria-describedby');
    owner = null;
  }
  function show(icon) {
    hide();
    owner = icon;
    tooltip.textContent = icon.dataset.tooltip;
    tooltip.hidden = false;
    tooltip.classList.add('show');
    icon.setAttribute('aria-describedby', tooltip.id);
    const rect = icon.getBoundingClientRect(), gap = 10;
    const width = tooltip.getBoundingClientRect().width;
    const height = tooltip.getBoundingClientRect().height;
    tooltip.style.left = Math.max(10, Math.min(innerWidth-width-10, rect.left)) + 'px';
    tooltip.style.top = Math.max(10, Math.min(innerHeight-height-10, rect.bottom+gap)) + 'px';
  }
  document.querySelectorAll('.help-icon').forEach(icon => {
    icon.addEventListener('mouseenter', () => show(icon));
    icon.addEventListener('mouseleave', () => { if (document.activeElement !== icon) hide(); });
    icon.addEventListener('focus', () => show(icon));
    icon.addEventListener('blur', hide);
    icon.addEventListener('click', () => show(icon));
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  document.addEventListener('click', event => { if (!event.target.closest('.help-icon')) hide(); });
  window.addEventListener('scroll', () => {
    if (owner && document.activeElement === owner) show(owner);
    else hide();
  }, true);
  window.addEventListener('resize', hide);
  document.addEventListener('languagechange', hide);
}
function initLocale() {
  const texts = [], attrs = [];
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement.closest('script,style')) continue;
    const source = node.textContent.trim();
    if (Object.hasOwn(KeyWalkUI.ja, source)) texts.push({node, source, original:node.textContent});
  }
  document.querySelectorAll('*').forEach(element => {
    for (const name of ['aria-label','placeholder','data-tooltip','content']) {
      const source = element.getAttribute(name);
      if (source && Object.hasOwn(KeyWalkUI.ja, source.trim())) attrs.push({element, name, source:source.trim()});
    }
  });
  function translate() {
    const language = document.documentElement.lang;
    for (const item of texts) item.node.textContent = item.original.replace(item.source, KeyWalkUI[language][item.source]);
    for (const item of attrs) item.element.setAttribute(item.name, KeyWalkUI[language][item.source]);
    document.querySelectorAll('.help-icon').forEach(icon => icon.setAttribute('aria-label', t('help')));
    const button = document.getElementById('language-toggle');
    button.textContent = language === 'ja' ? 'English' : '日本語';
    button.setAttribute('aria-label', t('toggleLanguage'));
  }
  translate();
  document.getElementById('language-toggle').addEventListener('click', () => {
    const language = document.documentElement.lang === 'ja' ? 'en' : 'ja';
    document.documentElement.lang = language;
    try { localStorage.setItem('language', language); } catch {}
    translate();
    document.dispatchEvent(new Event('languagechange'));
    renderAll();
  });
}

// 初期化
(function init(){
  initLocale();
  renderSamples();
  initTheme();
  setupCanvas(canvas);
  setupCanvas(pcanvas);
  drawResults();
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
      drawResults();

    }, 150);
  });
})();
