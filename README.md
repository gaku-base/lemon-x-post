# Airリザーブ ブラウザ取得 V2

前の版を置き換える修正版です。

## 修正点

- `cache: npm` を削除
- `package-lock.json` がなくても実行可能
- `npm install --no-audit --no-fund` を使用
- GitHub Actionsの入力値を安全に処理
- 診断ファイルがない場合でもワークフロー自体を止めない
- `actions/checkout@v4` と `actions/setup-node@v4` を使用

## 入れ替えるもの

`lemon-x-post` フォルダー内の次を、このZIPの内容で上書きしてください。

```text
package.json
README.md
.github/
data/
scripts/
```

`index.html` と `.git` は変更しません。

## GitHub Desktop

1. 上書き後、GitHub Desktopへ戻る
2. Summaryに `Rebuild Airリザーブ browser fetch`
3. Commit to main
4. Push origin

## 実行

GitHubのActionsから、

- start_date：2026-07-16
- days：4

で実行します。

成功すると、実行画面下部に
`airreserve-browser-debug`
が表示されます。
