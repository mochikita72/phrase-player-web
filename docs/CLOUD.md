# スマホからCodexで改修する

## 初回Cloud環境

PCまたはWebのCodexでCloud環境を作成します。

- 環境名: Phrase Studio
- リポジトリ: mochikita72/phrase-player-web
- 基準ブランチ: main
- セットアップ: Node.js 22、リポジトリルートで npm ci --ignore-scripts
- 準備後の確認: npm run verify
- GitHub接続: このリポジトリを読み書きできる本人のアカウント
- ネットワーク: GitHubとnpm取得に必要な接続。アプリ用APIキー不要
- 環境の共有: 本人のみを基本とする

環境を作成・公開後、スマホのCodex CloudでPhrase Studioを選択します。表示されない場合は同じアカウント・ワークスペースか確認。RemoteはPC上の作業を操作する別方式です。

## 依頼例

「AGENTS.mdとdocs/HANDOFF.mdを読み、最新mainを基準に（変更内容）を実装してください。既存機能を維持しnpm run verifyを実行してください。GitHubのmainへの反映とPages公開完了まで確認し、変更点とURLを報告してください。」

PRを作っただけではサイトは変わりません。mainへマージすると、検証後に公開されます。

## 続き・PCへの復帰

同じCloudタスクで続きを依頼できます。別タスクは別の作業場所です。重要な変更はGitHubへコミット・pushし、引き継ぎを残してください。

PCでもGitHubの最新mainを取得してから変更。旧PC原本を丸ごとコピーして上書きしないでください。未コミット変更を保持して差分を統合します。以前の公開用コピーも現在は開発に必要なファイルを含む正本のチェックアウトです。

公式手順: https://help.openai.com/en/articles/20001545-using-codex-cloud 、 https://learn.chatgpt.com/docs/environments/cloud-environments
