const { App, LogLevel } = require('@slack/bolt');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  logLevel: process.env.SLACK_BOLT_LOG_LEVEL
});

const { JsonDB, Config } = require('node-json-db');
const setting_db_fn = process.env.SLACK_SETTING_FILENAME;
const setting_db = new JsonDB(new Config(setting_db_fn, true, true, '/'));
let setting = {}; // setting_dbを読み込んだもの

/*
  CollaboratorsのURL
  https://app.slack.com/app-settings/Team ID/App ID/collaborators
  Team ID: T01U8TTMP0X
  App ID: A04GMTFSBLZ

  Install AppのURL
  https://api.slack.com/apps/App ID/install-on-team
  App ID: A04GMTFSBLZ
  Install to Workspaceをクリックして，User OAuth TokenをCopyして設定画面に入力．
*/
let app_id;
let team_id;
let collaborators_url = 'https://app.slack.com/app-settings/Team ID/App ID/collaborators';
let install_app_url = 'https://api.slack.com/apps/App ID/install-on-team';

let standalone; // trueならステータス変更をslack_app.js単独で行う．falseならslack_app.jsからslack_app.rbに依頼する

// ユーザステータスを手動で切り替えたら上書きしないように検出する．
app.event('user_change', async ({event}) => {
  let user = event.user;
  let user_id = user.id;
  let profile = omitted_profile(user.profile);
  let event_ts = event.event_ts; // '1671750577.041900'
  console.log('user_change ' + user.id + ', event_ts ' + event_ts);

  /*
    変更を検出したいフィールド
    user.profile.status_text: ':school:'
    user.profile.status_emoji: '在室（DHCP）'
    user.profile.status_expiration: 1671751827
    その他関心のあるフィールド
    user.updated: 1671748227
  */
  user.profile = omitted_profile(user.profile);
  console.log('[PIPE] user_change ' + user_id + ' ' + JSON.stringify(profile));
});

// 設定画面
app.event('app_home_opened', async ({ event }) => {
  let user_id = event.user;
  let tab = event.tab;
  let event_ts = event.event_ts;
  console.log(`app_home_opened ${user_id} ${tab} at ${event_ts}`);

  // view_publishでteam_idとapp_idを使うので準備．
  if (app_id == undefined) {
    team_id = event.view.team_id;
    app_id = event.view.app_id;
    collaborators_url = collaborators_url
      .replace('Team ID', team_id)
      .replace('App ID', app_id);
    install_app_url = install_app_url
      .replace('Team ID', team_id)
      .replace('App ID', app_id);
    console.log('collaborators_url: ' + collaborators_url);
    console.log('install_app_url: ' + install_app_url);
  }

  // このユーザの現在のステータス（情報提供とテスト用）
  // このユーザの自動ステータス絵文字（:school:から変更不可）
  // このユーザの自動ステータステキスト（設定）
  // このユーザの自動ステータスの有効時間（規定値の1時間から変更できるように）
  // このユーザのユーザトークン登録（オーナーのトークンでやるときは不要）
  // このユーザがオーナーなら，オーナーのトークン登録（有料ワークスペースのみ）
  if (tab == 'home') {
    views_publish(user_id);
  }
});

app.action('arrive', async ({ ack, body }) => {
  // console.log('body'); console.log(body);
  let user_id = body.user.id;
  let action_ts = body.actions[0].action_ts;
  console.log(`arrive ${user_id} at ${action_ts}`);
  ack();

  console.log('[PIPE] arrive ' + user_id);
});

app.action('departure', async ({ ack, body }) => {
  let user_id = body.user.id;
  let action_ts = body.actions[0].action_ts;
  console.log(`departure ${user_id} at ${action_ts}`);
  ack();

  console.log('[PIPE] departure ' + user_id);
});
	   
app.action('will_arrive', async ({ ack, body }) => {
  let user_id = body.user.id;
  let action_ts = body.actions[0].action_ts;
  console.log(`will_arrive ${user_id} at ${action_ts}`);
  ack();

  console.log('[PIPE] will_arrive ' + user_id);
});
	   
app.action('team_paid', async ({ ack, body }) => {
  let user_id = body.user.id;
  let action = body.actions[0];
  let team_paid = (action.selected_option.value == 'paid_team' ? true : false);
  let action_ts = action.action_ts;
  console.log(`team_paid ${team_paid} at ${action_ts}`)
  ack();

  console.log('[PIPE] setting_file_open ' + setting_db_fn);
  await setting_db.push('/team_paid', team_paid);
  console.log('[PIPE] setting_file_close ' + setting_db_fn);
});

// 'input_enable' save_setting（保存ボタン）しなくても保存する．
app.action('enable', async ({ ack, body }) => {
  let user_id = body.user.id;
  let action = body.actions[0];
  let enable = action.selected_options.length == 1 ? true : false;
  let action_ts = action.action_ts;
  console.log(`enable ${user_id} ${enable} at ${action_ts}`);
  ack();

  console.log('[PIPE] setting_file_open ' + setting_db_fn);
  // とりあえずチェックを外したときは，削除ではなくてfalse．
  await setting_db.push('/' + user_id + '/enable', enable);
  console.log('[PIPE] setting_file_close ' + setting_db_fn);
  console.log('[PIPE] enable ' + user_id + ' ' + enable);
});

// 'select-status_expiration' save_settingまで何もしない
app.action('option', async ({ ack, action }) => {
  console.log('select-status_expiration');
  ack();
});

app.action('save_setting', async ({ ack, body }) => {
  let user_id = body.user.id;
  let action_ts = body.actions[0].action_ts;
  console.log(`save_setting ${user_id} at ${action_ts}`);

  let values = body.view.state.values;
  // console.log('body.view.state.values'); console.log(values);

  let mac_address = values.input_mac_address.text.value; // 空欄ならnull
  let status_text = values.input_status_text.text.value; // 空欄ならnull
  let status_expiration_selected = values.select_status_expiration.option.selected_option;
  let status_expiration; // 空欄ならnull
  if (status_expiration_selected != null) {
    status_expiration = status_expiration_selected.value;
    // value: "30 minutes", "1 hour", "4 hours", "midnight", "tra_mitsu_doki"
  }

  let user_token_exist = (values.input_user_token != undefined ? true : false); // user_tokenの入力フィールドは有料プランの場合，非adminユーザには非表示．create_app_home_user_setting_blocks() 参照のこと．
  let user_token; // 空欄や項目なしならnull
  if (user_token_exist)
    user_token = values.input_user_token.text.value; // 空欄ならnull

  ack();

  console.log('[PIPE] setting_file_open ' + setting_db_fn)
  await setting_db.reload();
  setting[user_id] = await setting_db.getData('/' + user_id);
  let user_setting = setting[user_id];
  user_setting.mac_address = mac_address;
  user_setting.status_text = status_text;
  user_setting.status_expiration = status_expiration;
  if (user_token_exist)
    user_setting.user_token = user_token;

  // 値がnullのキーを削除
  for (const key of Object.keys(user_setting)) { 
    if (user_setting[key] == null)
      delete user_setting[key];
  }
  await setting_db.push('/' + user_id, user_setting);
  console.log('[PIPE] setting_file_close ' + setting_db_fn);
  console.log('[PIPE] save_setting ' + user_id + ' ' + JSON.stringify(user_setting));

  views_publish(user_id);
});

app.action('delete_setting', async ({ ack, body }) => {
  let user_id = body.user.id;
  let action_ts = body.actions[0].action_ts;
  console.log(`delete_setting ${user_id} at ${action_ts}`);
  ack();

  console.log('[PIPE] setting_file_open ' + setting_db_fn)
  setting[user_id] = await setting_db.getData('/' + user_id);
  let user_setting = setting[user_id]
  user_setting = { real_name: user_setting.real_name };
  console.log(JSON.stringify(user_setting));
  await setting_db.push('/' + user_id, user_setting);
  console.log('[PIPE] setting_file_close ' + setting_db_fn);
  console.log('[PIPE] save_setting ' + user_id);
  console.log('[PIPE] delete_setting ' + user_id + ' ' + JSON.stringify(user_setting));

  views_publish(user_id);
});

async function views_publish(user_id) {
  try {
    let blocks = [];
    let db_data = await setting_db.getData('/');
    let user_setting = db_data[user_id];
    let app_user_blocks = [];
    if (user_setting.admin != undefined)
      // 管理者にはUIを追加（（プライマリ）オーナーも管理者）
      app_user_blocks = await create_app_home_admin_setting_blocks(db_data.team_paid);
    let user_setting_blocks = create_app_home_user_setting_blocks(user_setting, db_data);

    blocks = blocks.concat(app_home_view_header_blocks,
			   app_user_blocks,
			   user_setting_blocks);
    app_home_view.blocks = blocks;
    const result = await app.client.views.publish({
      token: app.token,
      user_id: user_id,
      view: app_home_view
    });
    if (result.ok) {
      console.log('views_publish ' + user_id);
      // console.log(result.view);
    }
  } catch (error) {
    console.log('views_publish error');
    app.logger.error('error'); app.logger.error(error);
    app.logger.error('error.data.response_metadata'); app.logger.error(error.data.response_metadata);
  }
}

async function users_list() {
  try {
    const result = await app.client.users.list({
      // アプリの初期化に用いたトークンを `context` オブジェクトに保存
      token: app.token
    });
    if (result.ok) {
      let members = result.members;
      // console.log('users.list'); console.log(members);

      console.log('[PIPE] setting_file_open ' + setting_db_fn)
      setting = await setting_db.getData('/');
      setting.primary_owner = null;
      setting.owners = [];
      setting.admins = [];

      members.forEach(user => {
	if (user.deleted || user.is_bot || user.id == 'USLACKBOT')
	  return;
	// console.log('user full ' + user.id); console.log(user);
	user.profile = omitted_profile(user.profile);
	if (setting[user.id] == undefined)
	  setting[user.id] = {};
	let user_setting = setting[user.id];
	user_setting.real_name = user.profile.real_name;
	// user_setting.is_app_user = user.is_app_user // ユーザがインストールしたかどうかだと思ったけど違いそう．
	delete user_setting.admin;
	if (user.is_admin) {
	  setting.admins.push(user.id);
	  user_setting.admin = 'admin';
	}
	if (user.is_owner) {
	  setting.owners.push(user.id);
	  user_setting.admin = 'owner';
	}
	if (user.is_primary_owner) {
	  setting.primary_owner = user.id;
	  user_setting.admin = 'primary_owner';
	}
	console.log('[PIPE] user_list ' + user.id + ' ' + JSON.stringify(user.profile));      });

      await setting_db.push('/', setting)
      console.log('[PIPE] setting_file_close ' + setting_db_fn)
      console.log('users.list db_data');
      console.log(setting);
    }
  } catch (error) {
    app.logger.error(error);
  }
}

function omitted_profile(profile) {
  return {
    real_name: profile.real_name,
    display_name: profile.display_name,
    status_text: profile.status_text,
    status_emoji: profile.status_emoji,
    status_expiration: profile.status_expiration
  };
}

(async () => {
  // アプリを起動します
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Bolt app is running!');
  console.log('Slack Bolt logLevel: ' + app.logLevel);
  standalone = (process.env.SLACK_JS_STANDALONE == 'true' ? true : false);
  console.log('JavaSript standalone: ' + standalone);
  users_list();
})();

let app_home_view = {
  "type": "home",
  "blocks": []
};

let app_home_view_header_blocks = [
  {
    "type": "section",
    "text": {
      "type": "mrkdwn",
      "text": "*スマホなどが研究室のWi-Fiに接続するとあなたのSlackステータスを:school:滞在（DHCP）に自動更新する．* ステータスの削除は一定時間後．接続時に送信するDHCP DISCOVERメッセージで検出する．"
    }
  },
  {
    "type": "divider"
  },
  {
    "type": "section",
    "text": {
      "type": "mrkdwn",
      "text": "*手動更新*"
    }
  },
  {
    "type": "actions",
    "elements": [
      {
	"type": "button",
	"text": {
	  "type": "plain_text",
	  "emoji": true,
	  "text": "研究室に着いた"
	},
	"style": "primary",
	"action_id": "arrive"
      },
      {
	"type": "button",
	"text": {
	  "type": "plain_text",
	  "emoji": true,
	  "text": "研究室を離れる"
	},
	"action_id": "departure"
      },
      {
	"type": "button",
	"text": {
	  "type": "plain_text",
	  "emoji": true,
	  "text": "もうすぐ着く"
	},
	"action_id": "will_arrive"
      }
    ]
  }
];

let app_home_admin_setting_blocks = [
  {
    "type": "divider"
  },
  {
    "type": "section",
    "text": {
      "type": "mrkdwn",
      "text": "*ワークスペースの設定* （管理者のみに表示）\n\
プランによってUser OAuth Tokenが必要なユーザが変わります．"
    }
  },
  {
    "type": "section",
    "text": {
      "type": "mrkdwn",
      "text": "*ワークスペースのプラン*"
    }
  },
  {
    "type": "actions",
    "elements": [
      {
	"type": "radio_buttons",
	"options": [
	  {
	    "text": {
	      "type": "plain_text",
	      "text": "プロプラン",
	      "emoji": true
	    },
	    "value": "paid_team"
	  },
	  {
	    "text": {
	      "type": "plain_text",
	      "text": "フリープラン",
	      "emoji": true
	    },
	    "value": "non_paid_team"
	  }
	],
	"action_id": "team_paid"
      }
    ]
  }
];

async function create_app_home_admin_setting_blocks(team_paid) {
  // team_paid: boolean, trueならプロプラン

  blocks = JSON.parse(JSON.stringify(app_home_admin_setting_blocks));
  // radio_buttonsのデフォルト値を引数（今の設定内容）に合わせる．
  let radio_buttons = blocks.at(-1).elements[0];
  if (team_paid)
    // paid_team 有料プラン
    radio_buttons.initial_option = radio_buttons.options[0];
  else
    // non_paid_team 無料プラン
    radio_buttons.initial_option = radio_buttons.options[1];
  return blocks;
}

let app_home_user_setting_blocks = [
  { "type": "divider" },
  { "type": "section",
    "text": {
      "type": "mrkdwn",
      "text": "*あなたの設定*"
    }},
  { "type": "actions",
    "elements": [
      { "type": "checkboxes",
	// initial_options: [{ "text": { "type": "plain_text", "text": "自動更新する", "emoji": true }}], // チェックをつけた状態にするとき必要
	"action_id": "enable",
	"options": [
	  { "text": {
	      "type": "mrkdwn",
	      "text": "*自動更新する*" },
	    "value": "test" }
	]}]},
  { "type": "input", // 3
    block_id: "input_mac_address",
    "element": {
      "type": "plain_text_input",
      "action_id": "text",
      // "initial_value": "00:00:00:00:00:00", // 以前保存した値がある場合
      placeholder: {
	type: "plain_text",
	text: "00:00:00:00:00:00" }},
    "label": {
      "type": "plain_text",
      "text": "MACアドレス（Wi-Fiアドレス）",
      "emoji": true }},
  { "type": "input",
    block_id: "input_user_token",
    "element": {
      "type": "plain_text_input",
      "action_id": "text",
      // "initial_value": "xoxp-...", // 以前保存した値がある場合
      placeholder: {
	type: "plain_text",
	text: "xoxp-" }},
    "label": {
      "type": "plain_text",
      "text": "User OAuth Token (xoxp-)",
      "emoji": true }},
  { "type": "input",
    block_id: "input_status_text",
    "element": {
      "type": "plain_text_input",
      action_id: "text",
      // "initial_value": "xoxp-...", // 以前保存した値がある場合
      placeholder: {
	type: "plain_text",
	text: "滞在（DHCP）" }
      // initial_value: "在学（DHCP）"
      /*,
	'dispatch_action_config': {
	'trigger_actions_on': ['on_enter_pressed', 'on_character_entered']
	}*/
    },
    "label": {
      "type": "plain_text",
      "text": "自動設定するステータスのテキスト",
      "emoji": true }},
  { "type": "section",
    "text": {
      "type": "mrkdwn",
      "text": "*自動設定したステータスを削除するまでの時間*" }},
  { "type": "actions",
    block_id: "select_status_expiration",
    "elements": [{
      "type": "static_select",
      "placeholder": {
	"type": "plain_text",
	"text": "1時間後（既定）",
	"emoji": true },
      "action_id": "option",
      // initial_option: optionsの配列のうちどれか一つの要素
      "options": [
	{ "text": {
	    "type": "plain_text",
	    "text": "30分後",
	    "emoji": true },
	  "value": "30 minutes" },
	{ "text": {
	    "type": "plain_text",
	    "text": "1時間後",
	    "emoji": true },
	  "value": "1 hour" },
	{ "text": {
	    "type": "plain_text",
	    "text": "4時間後",
	    "emoji": true },
	  "value": "4 hours" },
	{ "text": {
	    "type": "plain_text",
	    "text": "今日中",
	    "emoji": true },
	  "value": "midnight" },
	{ "text": {
	    "type": "plain_text",
	    "text": "未明まで（午前4時．寅三つ時）",
	    "emoji": true },
	  "value": "tra_mitsu_doki" }]}]},
  { "type": "actions",
    "elements": [
      { "type": "button",
	"text": {
	  "type": "plain_text",
	  "text": "保存",
	  "emoji": true },
	"action_id": "save_setting" },
      { "type": "button",
	"text": {
	  "type": "plain_text",
	  "text": "削除",
	  "emoji": true },
	"style": "danger",
	"action_id": "delete_setting" }]},
  { "type": "section",
    "text": {
      "type": "mrkdwn",
      "text": "\
自動更新を使うには，「自動更新する」のチェックと研究室のWi-Fiに接続するあなたのスマホのMACアドレス，User OAuth Tokenを「保存」してください．User OAuth Tokenの要否は次のようにワークスペースによって異なります．\n\
ワークスペースが有料プランの場合には，ワークスペースのプライマリオーナーだけがUser OAuth Token (xoxp-)を保存すれば十分です．このToken使って，他のメンバのステータスを更新することができます．\n\
ワークスペースが無料プランの場合には，あなたのステータスを変更するためにあなた自身のUser OAuth Token (xoxp-)を保存してください．\n\
User OAuth Tokenを保存するには，まず，このアプリをインストールした人があなたをこのアプリのCollaboratorに追加してもらいましょう．Collaboratorになったら，あなた自身がこのアプリをワークスペースにインストールできます．インストールするとUser OAuth Tokenが生成されるので上にコピーして保存してください．\n\
*注意*: このTokenはあなたに代わってワークスペースにアクセスできるので公開してはいけません．\n\
「削除」を押すと，あなたのMACアドレスとUser OAuth Tokenをこのアプリの設定ファイルから削除します．削除する際は，これに加えて，ワークスペースに対するあなたの許可を無効にする必要があります．無効にするには，この画面の「概要」（または「ワークスペース情報」）から「設定」とたどって，ブラウザでslack app directoryを開き，あなたの許可を「無効にする」を押してください．無効にするとUser OAuth Tokenが無効になります．\n\
"
    }}
];

function create_app_home_user_setting_blocks(user_setting, setting) {
  // team_paid, is_admin, enable, mac_address, user_token, status_text, status_expiration
  blocks = JSON.parse(JSON.stringify(app_home_user_setting_blocks));
  if (user_setting.enable) { // blocks[2] input_enable
    let checkboxes = blocks[2].elements[0];
    checkboxes.initial_options = checkboxes.options;
    // console.log(checkboxes);
  }
  if (user_setting.mac_address != undefined) { // blocks[3] input_mac_address
    let input_mac_address = blocks[3].element;
    input_mac_address.initial_value = user_setting.mac_address;
    // console.log(input_mac_address);
  }
  if (user_setting.user_token != undefined) { // blocks[4] input_user_token
    let input_user_token = blocks[4].element;
    input_user_token.initial_value = user_setting.user_token;
    // console.log(input_user_token);
  }
  if (user_setting.status_text != undefined) { // blocks[5] input_status_text
    let input_status_text = blocks[5].element;
    input_status_text.initial_value = user_setting.status_text;
    // console.log(input_status_text);
  }
  if (user_setting.status_expiration != undefined) { // blocks[7] select_status_expiration.  value: "30 minutes", "1 hour", "4 hours", "midnight", "tra_mitsu_doki"
    let static_select = blocks[7].elements[0];
    let options = static_select.options;
    for (let i = 0; i < options.length; i++) {
      if (options[i].value == user_setting.status_expiration) {
	static_select.initial_option = options[i];
	// console.log(static_select);
	break;
      }
    }
  }
  if (setting.team_paid && user_setting.admin == undefined &&
      user_setting.user_token == undefined) { // blocks[4] user_token の削除（後ろの順番が変わるので削除は最後にする）
    /* blocks[4] input_user_token を表示するのは次の3種類のユーザ
       - 有料プランではadminユーザ
       - 無料プランではすべてのユーザ
       - Tokenを保存しているユーザ（プランに関わらず削除できるように表示）
       これら以外のユーザには非表示
    */
    let removed = blocks.splice(4, 1); // 4つ目だけ削除
    // console.log('removed'); console.log(removed);
  }

  let text = blocks.at(-1).text.text;
  text = text
    .replace('Collaboratorに追加', `<${collaborators_url}|Collaboratorに追加>`)
    .replace('ワークスペースにインストール', `<${install_app_url}|ワークスペースにインストール>`);
  blocks.at(-1).text.text = text;
  return blocks;
}
