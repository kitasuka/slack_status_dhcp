# 目的と手段

Slackアプリです．
このアプリは，Slackワークスペースのユーザが研究室にスマホを持ち込んだときに，そのスマホユーザのSlackアカウントのステータスを変更します．
このために，研究室のネットワーク上にRaspberry PiなどのPCを設置し，このPC上でこのアプリのスクリプトを常時動作させておきます．
アプリのスクリプトはユーザのスマホがWi-Fiで接続したのをDHCPパケットを見て検出します．
スマホのMACアドレス登録やステータスの自動変更などの設定は，Slackアプリのホーム画面で行います．

研究室じゃなくて自宅で家族のSlackワークスペースがある場合も同様に動くと思います．
ただし，DHCPパケットがアプリが動作するPCに届かない場合は動きません．
家庭用のWi-Fiルータではテストしていません．

以下のドキュメントはSlackアプリやRaspberry Pi初心者に対して丁寧な説明でありません．

# slack_status_dhcp

Update slack status when receiving DHCP request message.

スマホなどからのDHCPリクエストメッセージを受信したときに，そのスマホユーザのSlackステータスを自動更新する．
MACアドレス（Wi-Fiアドレス）とSlackユーザの対応をアプリで設定することで実現する．
研究室に来たときにSlackのユーザステータスの変更を自動化しようと作った．

RubyスクリプトとSlackアプリで役割分担する．
設定とステータス監視はアプリで，ステータス変更はスクリプトでする．

在室ステータス
- emoji :school:
- text 在室（DHCP）
- expire 1 hour (default)

<img src="AppHome.png" alt="Screen shot of App Home" width="200">

## アプリを動かす
Slackワークスペースに新しいアプリを追加し，signing_secret, bot_token, slack_app_tokenをslack_app_token.shに書き写す．アプリ追加の詳しい手順は InstallSlackApp.md にある．

DHCPリクエストが受信でき，常時動作しているPCを用意し以下の準備をする．

PCのターミナルを開き，signing_secretなどを環境変数にセットする．
```
$ . ./env.sh
```

初回のみ，動作確認と設定ファイルslack_setting.json生成のため，javaScript だけ動かす．
Slackのアプリホームが表示できるようになる．
javaScriptだけでは，「研究室に着いた」などのボタンは押してもステータスは変更されない．
Slackプリのホーム画表示できたらCtrl+Cなどでnodeを止める．
```
$ node slack_app.js
（しばらく待って Ctrl+C で停止）
```

Rubyスクリプトを実行する．
Slackのアプリホームで User OAuth Token を保存すると「研究室に着いた」などのボタンが正常に動作する．
MACアドレスを保存して，自動更新するのチェックをつけると，DHCPリクエストメッセージを受信したときにSlackステータスを変更するようになる．
自動更新するのチェックを外すとSlackステータスは変更されない．
バックグランド実行のような工夫はしていないのでターミナルを一つ占有する．
```
$ . ./env.sh # やってないときだけ必要．2度実行しても問題ない．
$ ruby slack_app.rb
```

## アプリのユーザの使い方
ワークスペースがプロプラン（有料プラン）かフリープランかを選択する．
アプリのホーム画面を開き，スマホのMACアドレス，User OAuth Tokenを入力して，保存する．
自動設定するステータスのテキストと自動設定したステータスを削除するまでの時間は好みで変更する．

動作確認：スマホのWi-FiをOFF -> ONにするとDHCPリクエストが出るので，そのタイミングでSlackユーザステータスが切り替われば，正常に動作している．

普段の使い方：スマホのWi-FiをONにしたまま研究室にくる．
1時間以上いる予定があればSlackアプリで自身のステータスの有効時間を変更する．有効時間は「次の時間経過後にステータスを削除」の項目で変更できる．

プロプラン（有料プラン）の場合は，ワークスペースのプライマリオーナーのみがUser OAuth Tokenを登録すれば，
他のユーザはこのトークン（Token）を登録する必要はない．

## Raspberry Pi 400
Raspberry Pi OS Debian version 11 (bullseye) で動かしたいとき．
- nodejs を v.12からv.18に更新．
  ```
  $ curl -fsSL https://deb.nodesource.com/setup_18.x | bash - 
  $ apt-get install -y nodejs
  ```
- rubyでDHCPリクエストのポート67を受信するためにruby2.7に権限を与える
  ```
  $ ls -l `which ruby`
  $ sudo setcap cap_net_raw,cap_net_bind_service+eip /usr/bin/ruby2.7
  ```

## まだできてないこと
- nodejsからrubyへのパイプの異常でnodejsが終了することがある．
  ```
  node:events:491
        throw er; // Unhandled 'error' event
        ^
  
  Error: write EPIPE
      at afterWriteDispatched (node:internal/stream_base_commons:160:15)
      at writeGeneric (node:internal/stream_base_commons:151:3)
      at Socket._writeGeneric (node:net:917:11)
      at Socket._write (node:net:929:8)
      at writeOrBuffer (node:internal/streams/writable:392:12)
      at _write (node:internal/streams/writable:333:10)
      at Writable.write (node:internal/streams/writable:337:10)
      at console.value (node:internal/console/constructor:300:16)
      at console.log (node:internal/console/constructor:377:26)
      at /home/fcs/slack_status_dhcp/slack_app.js:62:11
  ```
- 自動更新を使っている人のリストをホームに表示する．
- 古い自動更新メッセージを消す．メッセージがある日のうち，直近1週間分を残す．（プライバシ）
- ユーザ自信が振り返れるように，日毎に入室をまとめたメッセージを送る．
- 有料プランでUser OAuth Tokenが不要な人のホーム画面にUser OAuth Tokenの入力フィールドを表示しない．
- 有料プランでUser OAuth Tokenを削除するときに警告する．
- IPアドレスを調べてping応答で在室状況を確認し続ける．
- Slackワークスペースにメンバーが増えたときの処理．

## 役割分担
- Rubyスクリプト:
  - ブロードキャストされるDHCPリクエストメッセージを捕まえて，
	リクエスト端末に対応するSlackユーザのステータスを在室に変更する．
	在室ステータスの有効期限はユーザがSlackアプリで設定した時間にする．
	規定値は1時間にする．
  - ステータス変更をSlackのアプリメッセージに残す．
  - メッセージにログを残す．有効・無効の切り替え．設定の保存．ステータス
    自動更新，アプリの起動・終了．
  - (未実装) IPアドレスがわかった場合は定期的にpingを送り，ping応答が一定時間な
    ければSlackユーザのステータスを空に変更する．
  - ユーザが自分で変更している場合は変更しない．ユーザが:school:「在室
    （DHCP）」Rubyで指定した時間のいずれかを変更したら，変更しない．ユー
    ザが変更したかはSlackアプリでuser_changeを監視しないと分からない．
- Slack Boltアプリ:
  - 端末のMACアドレス（Wi-Fi アドレス）とユーザIDの対応を保存する．
  - 在室ステータスの有効時間を設定する．規定値は1時間
  - user_changeを監視してRubyスクリプトにステータス変更を伝える．
- アプリからスクリプトへの通知方法
  - ファイル名: slack_.json
  - アプリは読み書き．
  - スクリプトは実行開始時に読み取りのみ．その後のステータス変更はアプリからスクリプトにパイプで伝える．
  - node-json-db
	https://www.npmjs.com/package/node-json-db

## Slackワークスペースの設定
### Socket Mode
- on
### App Home
- Show Tabs: Home Tab on
- check: Allow users to send Slash commands and messages from the messages tab

### OAuth & Permissions
- Bot Token Scopes
  - users:read (Slackアプリ users.list, user_change)
  - chat:write (Rubyスクリプト chat.postMessage)
  - (未使用) users.profile:read (Rubyスクリプト users.profile.get, User token でも可なAPI)
  - (未使用) im:read (Rubyスクリプト conversations.list)
  - (未使用) channels:read (Rubyスクリプト conversations.list)
- User Token Scopes
  - users.profile:write (Rubyスクリプト users.profile.set)
### Event Subscriptions
- bot events
  - app_home_opened
  - user_change (scope users:read)
- user events
  no events
### 使う人全員
Installed App Settings
https://api.slack.com/apps/app_id/install-on-team?
app_idの部分はアプリケーションのID（A0.........．Your AppsのApp Credentialsで確認できる）

# 個人的なメモ．インストール作業の記録
## macOSにnodejsをインストールする
```ターミナル
% brew install node
% brew info node
==> node: stable 19.3.0 (bottled), HEAD
Platform built on V8 to build network applications
https://nodejs.org/
/opt/homebrew/Cellar/node/19.3.0 (2,157 files, 53.3MB) *
```

## Slack appの作成
https://slack.dev/bolt-js/ja-jp/tutorial/getting-started に沿って

## package.jsonの作成
```
% npm init # package.json を作成
% npm install @slack/bolt
export SLACK_SIGNING_SECRET=<your-signing-secret>
export SLACK_BOT_TOKEN=xoxb-<your-bot-token>
```
## Slackアプリの作成
https://slack.dev/bolt-js/ja-jp/tutorial/getting-started
- Socketモード．
- ボットトークンとアプリレベルトークンを使用する例．

## ソケットモード
https://slack.dev/bolt-js/ja-jp/tutorial/getting-started#setting-up-events
ソケットモードを有効にします。
- アプリの設定ページ「Socket Mode」を有効に切り替えます。
- Basic Information, Generate Token and Scopes, connections:write スコープを追加し、生成された xapp トークンをslack_app_token.shのSLACK_APP_TOKENに保存

## ホームタブの更新
https://slack.dev/bolt-js/ja-jp/concepts#publishing-views
- app_home_opened イベント
- views.publish API, Bot tokens

## ユーザステータス
ステータスを変更するのはRubyだけど，変更を監視するのはSlackアプリとややこしい．
- user_change イベント．Required scopes users:read. Works with Event API
- users.profile.set API．Required scopes User tokens, users.profile:write
  - user: ID of user to change. This argument may only be specified by
	admins on paid teams. (ワークスペースを有料プランにするか，使いたい人をAppのCollaboratorにしてUer tokenを一人ずつ発行する)
  - error: cannot_update_admin_user
  - error: not_admin
- users.list API. Required scopes Bot tokens or User token, users:read

## node-json-dbファイルをnodeとrubyの両方からアクセスする
nodejsをRubyのサブプロセスにしてnodejsの標準出力でRubyスクリプトにnode-json-dbの変更内容を通知することにした．
つまり，ファイルの内容はnodejsからRubyへの一方通行．
ファイルはnodejsが読み書きする．Rubyスクリプトは起動時に読み込み，変更内容はパイプで受け取る．そのため，排他制御は要らない．

以下も検討したけど，使わなかった．
- Nodejs Child Process
  https://nodejs.org/docs/latest-v17.x/api/child_process.html
- 名前付きパイプもいいかも?
- db.pushの前にロックファイルを作成して終わったら削除してその場しのぎするか．
  ```
  await db.push("/test2/my/test/",10,false);
  ```
- あるいは，どうせまれなので，スクリプト側でJSON構文のエラーを見つけたら再読み込みする．

## 二つのトークン
BoltはbotTokenだけでなんとかなる．

userTokenも必要になったら以下の対応が必要．
https://slack.dev/bolt-js/ja-jp/concepts#authorization
- botTokenとuserTokenはわかったけど．botIdとbotUserIdはよく分からない．
  botIdはbots.infoで取れそうだ．
  botUserIdは分からないからなしで．
- node_modules/@slack/bolt/dist/App.js
- Appの引数にtokenではなくauthorize関数を渡す．
  authorize関数（authorizeFn）ではteamIdも確認する．
  slack_app_token.sh SLACK_TEAM_ID
  auth.test API で team_id が返される．

## users.list
```
memebers: [{
  "is_admin": true
  "is_owner": false
  "is_primary_owner": false
  "is_app_user": false // appをインストールしたユーザかどうかだと思ったけど違いそう
}]
```
### user_change イベント
- ステータスの有効期限が来てもイベントが発生する．
  updatedフィールドもこの時刻．

### App ID と Team ID をどう取得するか
app_home_openedイベントの
evnet.view.team_id: "T0........."
evnet.api_app_id: "A0........."

## RaspberryPi（Debian）でソケットのパーミションを得る．
すぐに試すならsudoだけど，rootで動かすのは気持ち悪い．
```
slack_app.rb:xxx:in `bind': Permission denied - bind(2) for "0.0.0.0" port 67 (Errno::EACCES)
```
setcap でソケットの部分の権限を得る．rubyに権限を与える．
```
$ ls -l `which ruby`
..... /usr/bin/ruby -> ruby2.7
sudo setcap CAP_NET_BIND_SERVICE,CAP_NET_RAW+eip /usr/bin/ruby2.7
```

## nodejs
バージョン18以上で動作確認（19.3.0でも動作）
Raspberry Pi OS - Debian version 11 (bullseye) だとバージョン12．

バージョン12.22.12では require('node-json-db')するときに node-json-db/dist/lib/ArrayInfo.js:15 の ?? 演算子のところで文法エラー．

