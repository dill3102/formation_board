# Formation Board

監督・コーチが、選手を登録して、試合/練習ごとの配置と作戦をホワイトボード感覚で作れる Web ツール。

- 対応スポーツ: サッカー / フットサル / バスケ / バレー
- HTML / CSS / JavaScript のみ (ビルドなし・外部ライブラリなし)
- データはブラウザ内 (localStorage) に保存。サーバーには送らない
- PWA: ホーム画面に追加してアプリのように使える (オフラインでも起動)
- 企画資料: https://github.com/dill3102/formation_board_docs

## できること

| 画面 | 内容 |
|---|---|
| ホーム | スポーツを選んで配置を新規作成 / 保存済みの配置 (絞り込み・検索・複製・削除) |
| 選手 | 登録・編集・削除、まとめて追加 (貼り付け可)、写真の切り抜き、スポーツごとの背番号・可能ポジション、背番号重複の警告 |
| 出欠 | カレンダー、出欠のまとめて登録、当日の現着チェック |
| ボード | 選手の配置 (ドラッグ・入れ替え・ベンチ)、テンプレート (定番 + マイテンプレート)、敵マーカー、ボール、目線 (ライト)、ペン・図形・消しゴム、コマ送り・案、ズーム・パン、元に戻す、自動保存 |
| AI (MCP) | Claude Desktop / Claude Code などの AI に配置を作らせ、共有 URL で受け取る (`mcp/`、[mcp/README.md](mcp/README.md)) |
| 設定 | データの注意書き・使用容量、ホーム画面に追加、マイテンプレートの管理、全データ削除 |

## ローカルで動かす

ES Modules と JSON の読み込みを使うため、簡易サーバーで開く。

```bash
python3 -m http.server 8000
```

- サイト: http://localhost:8000/
- テスト: http://localhost:8000/tests/ (開くと計算処理の簡易テストが走る)

## 公開 (GitHub Pages)

リポジトリの Settings → Pages で「Deploy from a branch」「main / (root)」を選ぶ。
→ `https://dill3102.github.io/formation_board/`

## ファイル構成

```
index.html            画面の土台
manifest.json / sw.js PWA (ホーム画面に追加・オフライン)
css/                  base (色・余白) / layout / components / board
js/main.js            起動処理
js/router.js          #/〜 で画面切り替え
js/storage.js         localStorage の読み書き (ここだけが触る)
js/models/            データの操作 (選手・出欠・配置・テンプレート)
js/views/             画面ごとの処理
js/board/             配置ボードの中身 (座標変換・コート描画・駒・入力・書き込み・履歴 等)
js/ui/                共通部品 (モーダル・トースト・カレンダー・写真切り抜き 等)
data/sports/          スポーツ定義 (コート・ポジション・テンプレート)
assets/app-icon/      アプリのアイコン (tools/make_icons.py で作成)
tests/                簡易テスト
mcp/                  MCP サーバー (Node。AI に配置を作らせる。サイトの公開には不要)
package.json          Node から js/ を ES Modules として読むためだけのもの
```

## 更新する時の注意

- ファイルを追加したら `sw.js` の `PRECACHE` にも追加する (テストページで抜けを確認できる)
- 保存データの形を変える時は `js/storage.js` の `SCHEMA_VERSION` を上げて `migrate()` に変換を書く
- アイコンを作り直す: `python tools/make_icons.py` (Pillow が必要)
