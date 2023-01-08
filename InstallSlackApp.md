# Slackにオリジナルのアプリを追加する．

[Bolt入門ガイド](https://slack.dev/bolt-js/ja-jp/tutorial/getting-started)を参考にした．

## アプリの作成

1. ブラウザで[Slack](https://slack.com/)を開いて，自分のアプリを追加したいワークスペースが表示されていることを確認する．
1. [Slack APIのページ](https://api.slack.com/lang/ja-jp)を開いて，右上の「Your Apps」を選ぶ．
1. 「Create New App」を選ぶ．「Create an app」ダイアログが表示される．
1. 「From scratch」を選ぶ．
1. 「App Name」に適当な名前を入れ，アプリをインストールしたいワークスペースを選び，右下の「Create App」ボタンを押す．App Nameの例：DHCPでステータス変更

## アプリの設定
1. Basin Informationのページに表示された「Signing Secret」をenv.shに書き写す．
1. Socket ModeのページでEnable Socket Modeをオンにする．「Generage an app-level token to enable Socket Mode」ダイアログが開く．
1. ダイアログの「Token Name」に適当な名前を入れ，右下のGenerateボタンを押す．Token Nameの例：for_socket_mode．このtokenはBasic InformationページのApp Level Tokensでも確認できる．
1. 「for_socket_mode」ダイアログにxapp-で始まるTokenが表示されるので，env.shに書き写す．
1. 「OAuth & Permissions」ページに移り，Scopesを探す．
1. ScopesのBot Token Scopesにある「Add an OAuth Scope」を押し，次の2つのスコープを一つずつ追加する．
   - chat:write
   - users:read
1. ScopesのUser Token Scopesに次のスコープを追加する．
   - users.profile:write
1. 「Event Subscriptions」ページに移り，Enable Eventsをオンにする．
1. このページの「Subscribe to bot events」を開き，「Add Bot Uesr Event」を押して，次の3つのイベントを追加する．
   - app_home_opened
   - user_change
1. 画面右下の「Save Changes」を選ぶ．
1. 「App Home」ページに移り，「Show Tabs」を探す．
1. このページの「Home Tab」をオンにする．
1. このページの「Messages Tab」の下の「Direct messages your app sends will show in this tab.」にチェックをつける．

## アプリのインストール
1. 「Basic Information」ページに戻り，「Install Workspace」ボタンを押す．「アプリがSlack ワークスペースにアクセスする権限をリクエストしています」という画面が表示される．
1. ワークスペースの名前やアクセス可能な情報，実行できる内容を確認して「許可する」ボタンを押す．

## アプリの実行
DHCPが動作しているネットワークに接続されたPCで ruby slack_app.rb を動かす．

## アプリを使ってみる
スマホやPCでSlackを起動し，ワークスペースを開き，Appや最近使ったAppにこのアプリが表示されるのでそれを選ぶ．

## アプリの削除
1. 「Basic Information」ページを開き，「Delete App」を探す．
1. 「Delete App」ボタンを押す．
1. 確認のダイアログが表示されるので「Yes, I'm sure」を選ぶ．ダイアログの見出しは「Your application is not installed on any workspaces」
