(function(root, factory) {
  const messages = factory();
  if (typeof module === 'object' && module.exports) module.exports = messages;
  else root.KeyWalkMessages = messages;
})(globalThis, function() {
  return {ja: {
    empty: '入力がありません。学習用サンプルを選んでください。',
    dirty: '入力または配列が変わりました。もう一度分析してください。',
    insufficient: '算出対象外（4キー以上かつ移動3回以上が必要）',
    incomplete: '算出対象外（未対応文字を含む）',
    reference: '独自の参考値。安全性や解読時間を表しません。',
    unknown: '未対応文字 {count} 個。ここで経路を区切ります。位置は1始まり：{items}',
    mapped: '文字 {characters} 個／対応 {mapped} 個／有効なキー対 {transitions} 組',
    known: '登録語との一致：{items}', walk: '連続する隣接キー：{items}',
    repeat: '反復（2〜4文字、重なりを含む）：{items}',
    straight: '方向転換の少ない経路', lowH: '移動方向の偏り（H < 1.50）',
    lowCV: '移動距離のばらつきが小さい（CV < 0.25）',
    same: '同じキーの繰り返し：{count} 回（歩きには含めません）',
    none: 'この検出規則に当てはまる特徴はありません。安全性は判断できません。',
    plotLimit: '描画は先頭500キーまで。数値は入力全体を計算しています。',
    listLimit: '各一覧は先頭20件まで表示します。',
    topKeys: '使用キー（上位8）：{items}', bigrams: '2文字の並び（上位5）：{items}',
    prefixes: '先頭の形：{items}', suffixes: '末尾の形：{items}',
    title: '大文字1字＋小文字2字以上', upper: '大文字2字以上', lower: '小文字2字以上',
    template: '英字＋数字＋!?.', year: '年号に見える1900〜2099（末尾の!?.を許容）',
    digits: '数字2字以上', exclamation: '!で終わる', question: '?で終わる', symbols: '-_.が2字以上',
    zones: '固定領域：左 {left}%／右 {right}%、上 {top}%／中 {mid}%／下 {bottom}%',
    profileSummary: '{lines} 行／対応 {mapped} 文字／未対応 {unknown} 文字。空行だけを除外し、空白は保持します。',
    denominators: '平均の対象行数：隣接 {adj}、方向転換 {turns}、距離 {distance}。算出できない行は除外します。',
    noMapped: '対応するキーがありません。',
    singleLimit: '1件は10,000文字までです。切り詰めず、分析を止めました。',
    profileLimit: 'プロファイル全体は50,000文字までです。分析を止めました。',
    lineLimit: '空行を除く500行までです。分析を止めました。',
    error: '分析できませんでした。入力と配列を確認してください。'
  }};
});
