# Airリザーブ ブラウザ取得 第1版

## 目的

GitHub Actions上でPlaywrightのChromiumを起動し、Airリザーブを実際のブラウザとして開きます。

対象日は次の最大4日です。

- メニュー対象日
- 翌日
- 翌々日
- 3日後

実行結果は次に保存します。

- `data/availability.json`
- 実行時の各日スクリーンショット
- 画面上の操作候補
- 予約枠候補
- 関連する通信URL

## 重要

これはブラウザ操作方式へ移行するための第1版です。

Airリザーブ固有の日付ボタンや予約メニューの構造がまだ確定していないため、最初の実行では診断結果を取得します。スクリーンショットとJSONを確認して、正しいクリック対象を確定した後に予約枠抽出を固定します。

## 追加するファイル

このZIPの内容を `lemon-x-post` リポジトリ直下へコピーします。

```text
lemon-x-post/
├─ index.html
├─ package.json
├─ scripts/
│  └─ airreserve-browser-fetch.mjs
├─ data/
│  └─ availability.json
└─ .github/
   └─ workflows/
      └─ airreserve-browser-fetch.yml
```

## GitHub Desktop

1. ZIPを展開
2. 展開した中身を `lemon-x-post` フォルダーへコピー
3. GitHub Desktopに戻る
4. Summaryに `Add Airリザーブ browser fetch`
5. `Commit to main`
6. `Push origin`

## 手動実行

1. GitHubで `lemon-x-post` を開く
2. `Actions`
3. `Airリザーブ ブラウザ取得`
4. `Run workflow`
5. 開始日を入力
6. 日数は4
7. 実行

例：

```text
start_date: 2026-07-16
days: 4
```

## 実行後

Actionsの実行結果にある `airreserve-browser-debug` をダウンロードします。

確認対象：

- `availability.json`
- `00-initial.png`
- 各日付のPNG

この結果から、予約メニュー、日付ボタン、空き枠の正しい選択方法を固定します。

## 定期実行

ワークフローは毎日日本時間7時頃に実行する設定です。GitHub ActionsのcronはUTCで記述されています。

## 投稿アプリとの接続

最終版ではGitHub Pages側から次を読みます。

```text
data/availability.json
```

予約枠なしの日は選択欄をグレーアウトし、赤文字で「予約枠なし」と表示します。当日の予約枠は、時間表示ありを初期値にして、表示なしをラジオスイッチで選べるようにします。
