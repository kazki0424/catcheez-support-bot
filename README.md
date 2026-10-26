# CATCHEEZ サポートBot（Telegram）

CATCHEEZ DEX のログイン・入金・取引と、FLOW（コピートレード）の使い方を案内する Telegram Bot です。
ボタン式の案内（動画つき）、よくある質問、キーワードで自動回答、答えられないものは担当者へ転送します。

## できること

| 機能 | 内容 |
|---|---|
| ログイン案内 | メールでの口座開設〜ログインを動画つきで説明（紹介コード付きリンク） |
| 入金・出金 | Arbitrum USDC の送金手順、反映までの目安、注意点 |
| 取引のやり方 | 銘柄の選び方、指値・レバレッジ・決済（動画2本） |
| FLOW | コピートレードの始め方、BOTの違い、止め方 |
| よくある質問 | 11項目。自由入力のキーワードでも自動回答 |
| 人に聞く | 次の1通を担当者のチャットに転送。担当者は `/reply <chatId> 本文` で返事 |
| AI回答（任意） | `ANTHROPIC_API_KEY` を入れると、FAQに無い質問に Claude が答える（1人1日30回まで） |

写真・ファイルが送られてきたときは、そのまま担当者へ転送します（送金のスクショなど）。
グループに入れた場合は `/start` などのコマンドにだけ反応します。

## 作り方（10分）

### 1. Telegram で Bot を作る
1. Telegram で **@BotFather** を開いて `/newbot`
2. 名前（例: `CATCHEEZ サポート`）→ ユーザー名（例: `catcheez_support_bot`、末尾は `bot` 必須）
3. 表示される **トークン**（`123456789:AAH…` の形）を控える。人に見せない

おすすめ設定（BotFather で）:
- `/setdescription` … 「CATCHEEZ DEX / FLOW の使い方をご案内します」
- `/setuserpic` … CATCHEEZ のロゴ
- `/setcommands` は不要（起動時に Bot が自分で登録します）

### 2. 自分のチャットIDを調べる（「人に聞く」の転送先）
Telegram で **@userinfobot** を開いて `/start` → 表示される `Id` の数字が `ADMIN_CHAT_ID` です。
サポート用のグループに転送したい場合は、グループに Bot を入れてから、そのグループで `/start` を送り、Render のログに出る `chat -100…` の数字を使います。

### 3. GitHub に置く
新しいリポジトリ（例: `catcheez-support-bot`）を作り、このフォルダの中身をそのままアップロードします。
`node_modules` と `dist` は不要です（Render が作ります）。

### 4. Render で動かす
1. Render → **New → Background Worker**（Web Service ではなく Worker）
2. リポジトリを選ぶ。Build: `npm install && npm run build` / Start: `npm start`
3. **Environment** に追加
   - `TELEGRAM_BOT_TOKEN` = BotFather のトークン（必須）
   - `ADMIN_CHAT_ID` = 2 で調べた数字
   - `ANTHROPIC_API_KEY` = 入れれば AI 回答が有効（任意）
4. Deploy。ログに `polling as @catcheez_support_bot` と出れば動いています

Bot を Telegram で開いて `/start` を送ると、メニューが出ます。

## 環境変数

| 名前 | 必須 | 説明 |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ○ | BotFather のトークン |
| `ADMIN_CHAT_ID` | | 「人に聞く」の転送先。無いとログに出るだけ |
| `ANTHROPIC_API_KEY` | | 入れると自由入力に Claude が回答 |
| `CLAUDE_MODEL` | | 既定 `claude-haiku-5-5` |
| `AI_DAILY_LIMIT` | | 1人1日の AI 回答回数。既定 30 |
| `APP_URL` | | 既定 `https://app.catcheez.com` |
| `FLOW_URL` | | 既定 `https://catcheez-flow-collector.onrender.com` |
| `REF_CODE` | | ログイン案内のリンクに付ける紹介コード。既定 `HX692A39` |

## 文言・動画を変える

- 文言はすべて `src/content.ts` にあります（メニュー、案内ページ、FAQ、AI に渡す事実）。
- 動画は `assets/` の mp4。案内ページの `video: 'login.mp4'` のようにファイル名で指定。ファイルが無ければ文章だけ送ります。
- 変更したら GitHub にアップロード → Render が自動で再デプロイします。

## 手元で試す

```
npm install
npm test            # Telegram に繋がずに応答を確認
TELEGRAM_BOT_TOKEN=xxx npm run dev
```

## 仕組み

- `grammy` の長時間ポーリング。Webhook や公開URLは要りません（Background Worker で OK）。
- 動画は最初の1回だけアップロードし、2回目からは Telegram 側の file_id を使い回します。
- 「人に聞く」の待ち状態と AI の会話履歴はメモリ上にあり、再起動で消えます（サポートBotなので問題ありません）。
