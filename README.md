# Phrase Studio

フレーズ練習用Playerと楽曲Editor。ブラウザの端末内に楽曲・音源を保存する静的Webアプリです。

- 公開: https://mochikita72.github.io/phrase-player-web/
- 曲一覧: https://mochikita72.github.io/phrase-player-web/player/?view=library
- 開発の正本: このリポジトリ
- [スマホ・Codex Cloudの準備](docs/CLOUD.md)
- [現在の仕様と次の作業](docs/HANDOFF.md)
- [検証範囲](docs/TESTING.md)

## 開発

Node.js 22を使用。Windows・Linuxに対応。

1. npm ci --ignore-scripts
2. npm run verify
3. npm start

開発用URL: http://127.0.0.1:4173/editor/ 、 http://127.0.0.1:4173/player/

npm run verifyは構文確認・テスト・公開ファイル生成を実行。npm testで回帰テスト、npm run buildでdistを生成します。OCR配布アセットはeditor/vendorに含まれるため、通常のセットアップで追加取得は不要。再取得が必要な場合だけnode setup-ocr.cjsを使います。

## 構成

- player/: 曲一覧・Player・共有再生／保存／音源処理
- editor/: Editor・編集モデル・OCR・専用レイアウト
- tests/: Nodeテスト（DOM／音声は代替実装、IndexedDBはfake-indexeddb）
- samples/: 架空の互換性検証用JSON
- scripts/: 構文確認、許可リスト方式の公開ファイル生成
- docs/: 引き継ぎ・Cloud設定・検証記録

## 公開

main更新時にGitHub ActionsのVerify and publishがWindowsとLinuxで検証し、成功した場合だけdistをGitHub Pagesへ公開します。PRでは検証のみ。URLは従来と同じです。

公開HTMLのJS/CSS参照には内容に基づくバージョンを付与し、古いキャッシュとの混在を防ぎます。distには開発資料、テスト、依存パッケージ、個人ファイルを含めません。アプリ本体にnpmの実行時依存はありません。

## データ

曲・音源は利用ブラウザのIndexedDBに保存され、GitHubやCodexには同期されません。端末間ではJSONと元音源を別途移します。保存は端末内保存とJSON書き出し、JSONのみ書き出しは端末内データを更新しません。
