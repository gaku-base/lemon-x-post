# ポストコンシェルジュ v4.10.4

## 画像を簡単に交換できる構成
今後はコードを変更せず、次の画像を同じファイル名で置き換えます。

- `assets/branding/app-logo.png`：アプリ上部の横長ロゴ
- `assets/branding/app-icon.png`：アイコンの元画像
- `assets/branding/app-icon-180.png`：iPhone用
- `assets/branding/app-icon-192.png`：PWA用
- `assets/branding/app-icon-512.png`：高解像度PWA用

画像を変更したら、`assets/branding/branding.json` の `assetVersion` を変更するとキャッシュを更新できます。

今回の変更：新しいホーム画面アイコンを採用し、v4.10.4へ更新。
推奨コミット：`ポストコンシェルジュ v4.10.4 ブランド画像差し替え対応`
