# Croquis Timer — 開発・保守メモ

クロッキー練習用タイマー（PWA）です。スマホ・PCのブラウザで動き、オフラインでも使えます。
このファイルは「あとから自分や誰かが直すとき」に読む案内です。プログラミングに詳しくない前提で書いています。

---

## ファイル構成（どれが何を担当しているか）

```
index.html          画面の骨組み（ボタンやパネルの配置）
style.css           見た目（色・大きさ・配置）
js/
  app-core.js       SW登録・保存係(CroquisStore)・キー定義(CROQUIS_KEYS)・TIMING
  app-state.js      状態変数・ui要素マップ・IndexedDB・設定保存/読込・起動処理
  app-images.js     画像読み込み・シャッフル・プリロード・お気に入り・スキップ
  app-manage.js     複数選択・画像ナビ(次へ/前へ)・履歴パネル
  app-timer.js      タイマー本体・音・背景色・ハードモード・MediaSession・PiP・スワイプ
                    （↑元は1本の app.js。行順を変えず5分割したもの）
  stats.js          統計
  sketch.js         描画モード（模写・記憶練習）。分割しない方針。先頭に目次コメント
  features.js       巡回シャッフル・ズーム&パン・クラスモード
  bindings.js       ボタン配線表（「このボタン何やってる?」はまずここ）
sw.js               Service Worker（オフライン用キャッシュ管理）
manifest.json       PWA情報（アプリ名・アイコン・起動URL）
vercel.json         配信時のキャッシュ設定
icon.png            アプリアイコン（変更不要）
```

> 読み込み順は `index.html` 内で **app-core → app-state → app-images → app-manage → app-timer → stats → sketch → features → bindings** の順。
> この順番を変えないでください。

---

## よくある修正の手引き

- **色を変えたい** → `style.css` の先頭 `:root { }` にある `--accent` などの色変数を変更。PiPの小窓にも自動で反映されます。
- **タイマーの秒数の選択肢を増やしたい** → `index.html` の時間選択 `<select>` と `js/app-timer.js` のタイマー処理を確認。
- **アニメの速さ・待ち時間を変えたい** → `js/app-core.js` の `TIMING = { ... }` を変更。
- **「このボタン何をしているか」を調べたい** → `js/bindings.js` を見る。ボタンのid名で検索。

---

## ファイルを追加・変更したときの必須手順（重要）

新しい `.css` / `.js` を追加したとき、または既存ファイルを変更してデプロイするときは、**毎回必ず以下の4つをやってください**。

1. `index.html` に読み込みタグを追加（`<link>` か `<script src>`）
2. `sw.js` の `STATIC_CACHE` 配列に追記
3. **`sw.js` の `CACHE_NAME` の数字を1つ上げる**（例: `v20` → `v21`）← これを忘れると更新が届かない
4. 必要なら `vercel.json` にキャッシュヘッダーを追加

---

## 修正したのに画面に反映されないとき

PWAはキャッシュが強力なため、順に試してください：

1. `sw.js` の `CACHE_NAME` の数字を上げてデプロイしたか確認
2. ページを **2回** 再読み込み
3. それでもダメ → 開発者ツール → Application → Service Workers →「Unregister」→ 再読み込み
4. スマホなら → アプリを完全に閉じて開き直す、またはブラウザのサイトデータを削除

---

## データ保存の仕組み

- **IndexedDB** → お気に入り画像の実データ（`js/app-state.js` が管理）
- **localStorage** → 設定・状態。キーは `js/app-core.js` の `CROQUIS_KEYS` で一元管理（すべて `croquis_〇〇_v1` 形式）。
  - 読み書きは必ず `CroquisStore`（app-core.js の「保存係」）経由で行う。直接 `localStorage` を触らない。

---

## リファクタリング完了ログ

計画書（全5フェーズ）に基づき実施。完了した項目の一覧：

| 項目 | 内容 |
|---|---|
| ✅ ファイル分割 | 4871行→433行。CSS・JS3本を外部ファイルへ分離 |
| ✅ PWAキャッシュ安全化 | sw.js を修正。新ファイルをキャッシュ対象に追加 |
| ✅ エラー記録（計画3-3） | 空の `catch {}` 21箇所を整理。無害なものはコメント付きで明示、保存系は `console.warn` で記録 |
| ✅ localStorageキー統一（計画4-1） | `CROQUIS_KEYS` 一覧表と `CroquisStore` 保存係を導入。旧キーからの自動引き継ぎ付き |
| ✅ ボタン配線の集約（計画3-1） | HTMLの `onclick=` 85箇所を `js/bindings.js` に移行 |
| ✅ 識別子リネーム（計画3-5） | `v2-*`/`v3-*` → `panel-*`/`showToast`/`isOverlayOpen` 等へ（80件） |
| ✅ PiP色の一本化（計画4-4） | PiP埋め込みCSSの色を `style.css` の `--accent` から取得するよう変更 |

未実施: **長い関数の分割（計画3-2）**。最長70行程度で実用上問題なし。将来の改善候補として残す。