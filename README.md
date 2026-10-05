# Formation Board

監督・コーチが、選手を登録して、試合/練習ごとの配置と作戦をホワイトボード感覚で作れる Web ツール。

- HTML / CSS / JavaScript のみ (ビルドなし)
- データはブラウザ内 (localStorage) に保存
- 企画資料: https://github.com/dill3102/sport_positions_docs

## ローカルで動かす

ES Modules と JSON の読み込みを使うため、簡易サーバーで開く。

```bash
python3 -m http.server 8000
```

- サイト: http://localhost:8000/
- テスト: http://localhost:8000/tests/
