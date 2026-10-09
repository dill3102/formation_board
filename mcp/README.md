# Formation Board MCP サーバー

AI (Claude Desktop / Claude Code など MCP に対応したアプリ) に配置を作らせるためのサーバー。
AI に「4-4-2 で、右コーナーキックの守備の配置を作って」のように頼むと、Formation Board で開ける **共有 URL** が返ってくる。
URL を開いて確認し、「自分の配置として保存」で自分のボードに取り込む。

- サーバーは自分の PC で動く (stdio)。ネットには何も送らない
- サイトのデータ (ブラウザに保存した選手・配置) には触らない。やり取りは共有 URL だけ
- 名簿に同じ名前の選手がいれば、取り込む時にその選手につながる

## ツール

| ツール | 内容 |
| --- | --- |
| `list_sports` | 対応スポーツ、ポジション、フォーメーション (枠の座標)、コートの寸法、ペンの色 |
| `create_board` | 配置を組み立てて共有 URL を返す。自チーム (フォーメーションの枠へ自動で入れる / 座標で置く)、ベンチ、敵 (フォーメーション / 個別)、ボール、書き込み (矢印・点線矢印・直線・円・ペン・テキスト)、コマ送り、案 (ルート) と説明、目線 (ライト。度 or "ball") |
| `read_board` | 共有 URL を読んで中身を JSON で返す (説明する・直して作り直す時に使う) |

座標はコートを 0〜1 で表す。x = 自チームのゴールライン 0 → 相手のゴールライン 1、y = 相手ゴールを向いて左 0 → 右 1。

## 準備

Node.js 20 以上。

```bash
cd mcp
npm install
npm test
```

## 登録

パスは自分の環境に合わせる (下の例は WSL の `/home/yugootake/myProject/site/formation_board`)。

### Claude Code

```bash
claude mcp add formation-board -- node /home/yugootake/myProject/site/formation_board/mcp/server.js
```

Windows の Claude Code から WSL の Node を使う時:

```bash
claude mcp add formation-board -- wsl -e node /home/yugootake/myProject/site/formation_board/mcp/server.js
```

### Claude Desktop

設定 → 開発者 → 設定を編集 で `claude_desktop_config.json` を開き、`mcpServers` に足して Claude Desktop を再起動する。

Windows (Node は WSL に入っている場合):

```json
{
  "mcpServers": {
    "formation-board": {
      "command": "wsl",
      "args": ["-e", "node", "/home/yugootake/myProject/site/formation_board/mcp/server.js"]
    }
  }
}
```

Mac / Linux / Windows に Node を入れている場合:

```json
{
  "mcpServers": {
    "formation-board": {
      "command": "node",
      "args": ["/path/to/formation_board/mcp/server.js"]
    }
  }
}
```

### その他の MCP クライアント

stdio のサーバーとして `node <パス>/mcp/server.js` を登録する (多くのアプリは上の `mcpServers` と同じ形)。

## 共有 URL のサイト

既定は `https://dill3102.github.io/formation_board/`。
ローカルのサイトで試す時は、環境変数 `FORMATION_BOARD_URL` で変える。

```json
"formation-board": {
  "command": "node",
  "args": ["/path/to/formation_board/mcp/server.js"],
  "env": { "FORMATION_BOARD_URL": "http://localhost:8000/" }
}
```

(WSL 経由の時は `env` が WSL に渡らないので、`"args": ["-e", "env", "FORMATION_BOARD_URL=http://localhost:8000/", "node", "…/server.js"]` のようにする)

## 頼み方の例

- 「サッカー 4-3-3 で、うちの選手 (山田 GK 1、佐藤 FW 10、…) を並べて。相手は 4-4-2」
- 「右コーナーキックの攻撃。案1 はニアに速いボール、案2 はファーへ。コマ送りで動きも付けて」
- 「バスケの 1-3-1 で、PG からウイングへのパスとカットの動きを矢印で」
- 「守備の時の目線を付けて。DF はボール、ボランチは相手 FW を見る感じで」
- 「この URL の配置を説明して」「この配置の DF ラインをもう少し上げた版を作って」

## しくみ

`builder.js` がサイトの `js/` (共有 URL の形式 `share.js`、テンプレートへの割り当て `board/formation.js`、コマ送り `board/frames.js`) をそのまま読んで使う。
そのため共有 URL の形はサイトと必ず同じになる。サイト直下の `package.json` (`"type": "module"`) は、Node から `js/` を ES Modules として読むためのもの。
