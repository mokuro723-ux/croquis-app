# CLAUDE.md

このリポジトリで作業する Claude Code 向けの指示書。詳しい保守手順は [README.md](README.md) を参照。

## このアプリは何か
イラストレーター向けの**クロッキー練習タイマー（PWA）**。
ウォームアップから本練習まで、**PC・iPhone・Android のブラウザ1つで完結**することを最重要ゴールとする。
ビルド工程なし。素のHTML/CSS/JS。オフライン動作（Service Worker）。配信は Vercel。

## ファイルと読み込み順
```
index.html      画面の骨組み
style.css       見た目（:root の色変数が起点）
js/app-core.js    SW登録・CROQUIS_KEYS・CroquisStore・ショートカット定義・TIMING
js/app-state.js   状態変数・ui要素マップ・IndexedDB・設定保存/読込・window.onload
js/app-images.js  画像読み込み・シャッフル・プリロード・お気に入り・スキップ
js/app-manage.js  複数選択・画像ナビ（nextImage/prevImage）・履歴パネル
js/app-timer.js   タイマー本体・音・背景色・ハードモード・MediaSession・PiP・スワイプ
js/stats.js       統計・カスタムタイマー・タグ・オンライン素材
js/sketch.js      描画モード（模写・記憶練習）。分割しない方針。先頭の目次コメント参照
js/features.js    巡回シャッフル・ズーム&パン・クラスモード
js/bindings.js    ボタン配線（「このボタンの動作は?」はまずここをidで検索）
sw.js           オフライン用キャッシュ
```
読み込み順は **app-core → app-state → app-images → app-manage → app-timer → stats → sketch → features → bindings**（元は1本の app.js。行順を変えず5分割したもの）。この順序を変えない。

## 必ず守るルール
- **ファイルを追加/変更したら、`sw.js` の `CACHE_NAME` の数字を必ず +1**（現在の値は sw.js の12行目で確認）。忘れると更新がユーザーに届かない。
- 新規 `.css`/`.js` は ①`index.html` に読み込みタグ追加 ②`sw.js` の `STATIC_CACHE` に追記 ③`CACHE_NAME` +1、の3点セット。
- localStorage は直接触らず、必ず `CroquisStore`（app-core.js冒頭）経由。キーは `CROQUIS_KEYS` で一元管理。
- お気に入り画像の実データは IndexedDB（app-state.js が管理）。
- 色は `style.css` の `:root` 変数（`--accent` など）を変更。PiP小窓にも自動反映される。
- HTML に `onclick=` を増やさない。配線は `js/bindings.js` に追加する。

## 3媒体対応で特に注意（重要）
PC・iOS Safari・Android Chrome すべてで壊さないこと。差が出やすい箇所：
- **Picture-in-Picture / Wake Lock / フルスクリーン**：iOS Safari は対応が限定的。機能は必ず存在チェックして、非対応でも本体が動くようにする（graceful degradation）。
- **タッチ操作**：ズーム&パンやスワイプは pointer/touch イベントの差異に注意。マウスとタッチ両対応を崩さない。
- 既存機能を直すときは、少なくとも「PC + スマホ実機（iOS/Android どちらか）」での確認を促す。

## 動作確認
ビルド不要。ローカルで静的サーバーを立てて確認：`python -m http.server` など。
PWAキャッシュで更新が見えない時は README「修正したのに反映されないとき」を参照（SW Unregister → 再読み込み）。

## 変更の方針
- プログラミングに不慣れなユーザーが将来読む前提。**日本語コメント・分かりやすい命名**を維持する。
- 大規模リファクタは計画済み項目あり（README末尾）。未着手は「長い関数の分割」のみで、実用上は問題なし。むやみに大改修しない。
- ユーザーへの返答は日本語で簡潔に。
