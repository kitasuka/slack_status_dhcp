#!/usr/bin/ruby
# coding: utf-8
# tested on Ruby 2.6

require 'net/http'
require 'uri'
require 'json'

@botToken = ENV['SLACK_BOT_TOKEN']
# @userToken = ENV['SLACK_USER_TOKEN']
@settingFn = ENV['SLACK_SETTING_FILENAME']
@user_status_emoji = ENV['SLACK_USER_STATUS_EMOJI']
@slack_uri = URI.parse("https://slack.com/api/")
@slack_http = Net::HTTP.new(@slack_uri.host, @slack_uri.port)
@slack_http.use_ssl = true
@loggingFilename
@loggingFile

StatusEmoji = ':school:'
StatusTextArrive = '滞在（DHCP）'
StatusTextWillArrive = 'もうすぐ着く'
ExpirationText = '1 hour'
@setting = JSON.parse(File.open(@settingFn).read()) # SLACK_SETTING_FILENAME を読み込んだハッシュ
@manually_changed = {} # ユーザステータスを更新していいか？user_id => true or false

DHCPServerPort = 67

@debug = false # true

if @debug
  puts @botToken
  puts @settingFn
  puts @user_status_emoji
  puts @settinFn
  puts 'host: ' + @slack_http.address
  puts 'port: ' + @slack_http.port.to_s
  puts 'path: ' + @slack_uri.path
end

def logging(str)
  t = Time.now
  Thread.new do
    Thread.pass # 後で
    fn = "log-#{t.year}-#{"%02d" % t.month}.txt"
    if @loggingFilename != fn
      @loggingFile.close if @loggingFile != nil
      @loggingFile = File.open(fn, "a")
      @loggingFilename = fn
    end
    @loggingFile.puts(t.strftime("%Y-%m-%d %H:%M:%S") + ' ' + str)
    @loggingFile.flush
  end
end

def slack_api_get(api_method, token)
  # api_method: 'users.list'
  # token: xoxb-... or xoxp-...
  response = @slack_http.get(@slack_uri.path + api_method,
    {'Authorization' => 'Bearer ' + token,
     'Content-type' => 'application/x-www-form-urlencoded'})
  body = JSON.parse(response.body)
  if @debug
    puts [api_method, 'token:', token[0..4], 'HTTP-response:', response.code].join(' ')
    puts body
  end
  body
end

def slack_api_post(api_method, arguments, token)
  # profile = {'status_emoji' => ':school:'}.to_json
  # arguments = {'profile' => profile}.to_json
  response = @slack_http.post(@slack_uri.path + api_method,
    arguments.to_json,
    {'Authorization' => 'Bearer ' + token,
     'Content-type' => 'application/json; charset=UTF-8'})
  body = JSON.parse(response.body)
  if @debug
    puts [api_method, 'token:', token[0..4], 'HTTP-response:', response.code, arguments.to_json].join(' ')
    puts body
  end
  body
end

def omitted_profile(profile)
  {'real_name' => profile['real_name'],
   'display_name' => profile['display_name'],
   'status_text' => profile['status_text'],
   'status_emoji' => profile['status_emoji'],
   'status_expiration' => profile['status_expiration']
  }
end

def team_paid?
  @setting['team_paid']
end

def admin_token(user_id)
  admins = []
  case @setting[user_id]["admin"]
  when "primary_owner"
    admins = []
  when "owner"
    admins = [@setting['primary_owner']]
  when "admin"
    admins = @setting['owners']
  when nil
    admins = @setting['admins']
  end
  admins.each { |admin_id|
    if @setting[admin_id].key?('user_token')
      return @setting[admin_id]['user_token']
    end
  }
  puts "[ERROR] no admin-user OAuth token for user #{user_id}"
  nil
end

def get_status_setting(user_id)
  user = @setting[user_id]

  # stauts_text: "滞在（DHCP）"など
  status_text = user['status_text']
  status_text = StatusTextArrive if status_text == nil

  # expire_when: "1 hour"など
  expire_when = user['status_expiration']
  expire_when = ExpirationText if expire_when == nil
  expiration = time_expiration(expire_when).tv_sec

  [status_text, expiration]
end

def user_status_set(user_id, status_emoji, status_text, expiration, force = false)
  # StatusEmoji なら設定 @setting から status_tex setting
  user = @setting[user_id]
  if user == nil
    puts "[ERROR] user_status_set no user '#{user_id}'"
    return
  end

  puts "[INFO] user_status_set user '#{user_id}' force = true" if force
  if ! force
    # enable
    if ! user['enable']
      puts "[INFO] user_status_set user '#{user_id}' disable auto update"
      return
    end

    # ユーザが手動で設定したステータスは上書きしない
    if @manually_changed[user_id]
      puts "[INFO] user_status_set user '#{user_id}' set status manually"
      return
    end
  end

  # user_token: xoxp-...
  user_token = user['user_token']
  if team_paid? && user_token == nil
    user_token = admin_token(user_id)
  end

  arguments = {
    'profile' => {
      'status_text' => status_text,
      'status_emoji' => status_emoji,
      'status_expiration' => expiration
    }
  }
  if team_paid? && user
    arguments['user'] = user_id
  end
  slack_api_post('users.profile.set', arguments, user_token)
  @manually_changed[user_id] = true
  logging(['users.profile.set', arguments].join(' '))
end

def time_expiration(expire_when)
  # expire_when: "30 minutes" など．該当するものがなければ10秒
  t = Time.now
  day = 24 * 60 * 60 # 秒
  hour = 60 * 60 # 秒
  if (false) # test
    t = t - t.hour * 60 * 60 - t.min * 60 - t.sec + 1
    p [t, t.tv_sec]
  end
  case expire_when
  when "30 minutes"
    t += hour / 2
  when "1 hour"
    t += hour
  when "4 hours"
    t += 4 * hour
  when "midnight" # 翌午前0時（当日24時）
    t = t + day - t.hour * 60 * 60 - t.min * 60 - t.sec # 秒
  when "tra_mitsu_doki" # 翌午前4時（当日28時）
    t = t + day - (t.hour - 4) * 60 * 60 - t.min * 60 - t.sec # 秒
  else
    t += 10 # 分からないときは10秒
    puts "[ERROR] time_expiration unknown when_str: ${when_str}"
  end
  puts t if @debug
  t
end

def parse_DHCP_request_message(msg, print = false)
  msgbytes = msg.bytes
  # Figure 1:  Format of a DHCP message, RFC 2131 (March 1997)
  i = 0
  op = msgbytes[i]; i += 1 # op: 1 byte
  # 1 "DHCPDISCOVER" message.
  htype = msgbytes[i]; i += 1 # htype: 1
  hlen = msgbytes[i]; i += 1 # hlen: 1
  hops = msgbytes[i]; i += 1 # hops: 1
  xid = msgbytes[i...i+4]; i+= 4 # xid: 4 bytes
  secs = msgbytes[i...i+2]; i += 2 # secs: 2
  flags = msgbytes[i...i+2]; i += 2 # flags: 2
  ciaddr = msgbytes[i...i+4]; i += 4 # ciaddr: 4
  # Client IP address; only filled in if client is in BOUND, RENEW or REBINDING state
  yiaddr = msgbytes[i...i+4]; i += 4 # yiaddr: 4
  # an available network address in the 'yiaddr' field
  siaddr = msgbytes[i...i+4]; i += 4 # siaddr: 4
  giaddr = msgbytes[i...i+4]; i += 4 # giaddr: 4
  chaddr = msgbytes[i...i+[hlen, 16].min]; i += 16 # chaddr: 16; MACアドレス
  sname = msg[i...i+64]; i += 64 # sname: 64
  file = msg[i...i+128]; i += 128 # file: 128
  options = msg[i..-1] # options (variable) (236バイト目から)
  # optionsの先頭4バイトは99, 130, 83 and 99と決まっている．magic number.

  if print
    puts "op htype hlen hops: " + [op, htype, hlen, hops].join(' ')
    puts "xid: " + xid.map { |i| sprintf("%02x", i)}.join(' ')
    puts "sec (2) flags (2): " + [secs, flags].join(' ')
    puts "ciaddr: " + ciaddr.map{ |i| i.to_s(16) }.join('.')
    puts "yiaddr: " + yiaddr.map{ |i| i.to_s(16) }.join('.')
    puts "siaddr: " + siaddr.map{ |i| i.to_s(16) }.join('.')
    puts "giaddr: " + giaddr.map{ |i| i.to_s(16) }.join('.')
    puts "MAC address: " + chaddr.map{ |i| i.to_s(16) }.join(':')
    puts "sname: " + sname
    puts "file: " + file
    options = msg[236..-1]
    puts "options (#{options.length}): #{options}"
    k = 16
    (0..(options.length - 1) / k).each { |i|
      (0...k).each { |j|
        if k * i + j < options.length
          x = options[k * i + j].bytes[0]
          print sprintf("%02x ", x)
          options[k * i + j] = ' ' if x < 0x20 || x >= 0x80
        else
          print "   "
        end
      }
      puts " "+options[k * i...k * i + k].dump.sub(/^"/,'').sub(/"$/,'')
    }
    puts
  end

  [op, htype, hlen, hops, xid, secs, flags, ciaddr, yiaddr, siaddr,
   giaddr, chaddr, sname, file, options]
end

def slack_app_command(params)
  cmd = params.first
  user_id = params[1] # U01UPTBMTH9
  case cmd
  when 'arrive'
    # [PIPE] arrive U01UPTBMTH9
    status_text, expiration = get_status_setting(user_id)
    logging('user_status_set arrive ' + user_id)
    user_status_set(user_id, StatusEmoji, status_text, expiration, true)
  when 'will_arrive'
    # [PIPE] will_arrive U01UPTBMTH9
    expiration = get_status_setting(user_id).last
    logging('user_status_set will_arrive ' + user_id)
    user_status_set(user_id, StatusEmoji, StatusTextWillArrive, expiration, true)
  when 'departure'
    logging('user_status_set departure ' + user_id)
    user_status_set(user_id, '', '', 0, true)
  when 'user_change', 'user_list'
    h = JSON.parse(params[2])
    status_text = h['status_text']
    status_emoji = h['status_emoji']
    auto_text, tmp = get_status_setting(user_id)
    status_expiration = h['status_expiration']
    if status_emoji == StatusEmoji && (status_text == auto_text || status_text == StatusTextWillArrive) # 自動設定
      @manually_changed[user_id] = false
    elsif status_expiration == 0 && status_emoji == '' && status_text == '' # 空
      @manually_changed[user_id] = false
    else # それ以外，ユーザ設定
      @manually_changed[user_id] = true
    end
    puts "[INFO] #{cmd} #{user_id} #{@manually_changed[user_id] ? 'manual' : 'auto'}. " +
         ['(status)', status_emoji, status_text, '(status_expiration)', status_expiration].join(' ')
    logging(['user_change', user_id, @manually_changed[user_id] ? 'manual' : 'auto'].join(' '))
  when 'enable'
    user = @setting[user_id]
    b = params[2]
    if b == 'true'
      user['enable'] = true
    else
      user['enable'] = false
    end
    logging(['enable', user_id, b].join(' '))
  when 'save_setting', 'delete_setting'
    # [PIPE] save_setting U01UPTBMTH9 {"real_name":"kitasuka",...}
    json_str = params[2]
    hash = JSON.parse(json_str)
    @setting[user_id] = JSON::Parser.new(json_str).parse
    logging([cmd, user_id].join(' '))
  when 'setting_file_open', 'setting_file_close'
    puts "[INFO] skip [PIPE] #{cmd} #{params[2]}"
  else
    puts "[ERROR] unknown slack_app_command [PIPE] #{params.join(' ')}"
  end
end

def slack_app_thread
  t = Thread.new do
    node = IO.popen("node slack_app.js", "r+")
    node.each_line { |line|
      w = line.chop.split($;, 4)
      if w.first[0] == '[' && w != '[PIPE]'
        puts line
      elsif @debug
        puts line
      end
      if w.first == '[PIPE]'
        w.shift
        slack_app_command(w)
      end
    }
  end
end

def dhcp_request_thread(chaddr)
  t = Thread.new do
    Thread.pass # 一旦スレッドの実行を戻す
    chaddrstr = chaddr.map { |i| "%02x" % i }.join(':')
    puts "Start the process for #{chaddrstr}"
    @setting.each { |user_id, user|
      next if ! user.instance_of?(Hash)
      next if ! user.key?('mac_address')
      if user['mac_address'].downcase == chaddrstr
        status_text, expiration = get_status_setting(user_id)        
        logging(['user_status_set DHCP request', user_id].join(' '))
        user_status_set(user_id, StatusEmoji, status_text, expiration)
      end
    }
    puts "Terminate the process for #{chaddrstr}"
  end
end

TIMEFORMAT = "%Y-%m-%d %H:%M:%S.%L"

slack_app_thread

dhcpd = UDPSocket.new                   # => #<UDPSocket:fd 3>
dhcpd.bind("0.0.0.0", DHCPServerPort)
while true do
  puts "Wait for a DHCPREQUEST message (#{Time.now.strftime(TIMEFORMAT)})"
  msg, addrinfo, flag, soc = dhcpd.recvmsg
  op, htype, hlen, hops, xid, secs, flags, ciaddr, yiaddr, siaddr,
  giaddr, chaddr, sname, file, options = parse_DHCP_request_message(msg) # (msg, true)
  chaddrstr = chaddr.map { |i| "%02x" % i }.join(':')
  puts "DHCPREQUEST message from #{chaddrstr}"
  dhcp_request_thread(chaddr)
end

(1..10).to_a.each {
  p 'fuga'
}
exit

# test
p user_status_set("U01UPTBMTH9")
p user_status_set('hoge')

user_id = "U01UPTBMTH9"
enable = @setting[user_id]['enable']
userToken = @setting[user_id]['user_token']
p [user_id, userToken]
# ok # user_status_set("30 minutes", userToken, nil, nil)

exit

# body = slack_api_get('users.list', @botToken)
user = {"id"=>"U01UPTBMTH9", "team_id"=>"T01U8TTMP0X", "name"=>"kitasuka", "deleted"=>false, "color"=>"9f69e7", "real_name"=>"kitasuka", "tz"=>"Asia/Tokyo", "tz_label"=>"Japan Standard Time", "tz_offset"=>32400};

if (false)
# def slack_chat_postMessage()
# channelの取得方法が分からない
  arguments = {'channel' => 'D04G6D6UB5K',
               'text' => 'hello world :school:'}
  slack_api_post('chat.postMessage', arguments, @botToken)
# end
end

# r = slack_api_post('conversations.list', {'types' => 'im'}, @botToken) # ボットメッセージウィンドウのIDが取れない
p r.keys
p r['channels'].map { |c| c['name'] }

exit

# テストコード
puts body['members'][0]
puts body['members'].map { |user| user['id'] }
body['members'].each { |user|
  user['profile'] = omitted_profile(user['profile'])
  puts user
}
exit

SlackAPISamples = <<EOS
https://slack.com/api/users.profile.get?pretty=1
Authorization: Bearer xoxb-略
{
    "ok": false,
    "error": "missing_scope",
    "needed": "users.profile:read",
    "provided": "users:read,chat:write"
}

https://slack.com/api/users.profile.set?profile=%7B'status_emoji'%3A%20'%3Aschool%3A'%7D&user=U01UPTBMTH9&pretty=1
Authorization: Bearer xoxp-略
{
    "ok": true,
    "profile": {
        略
        "status_emoji": ":school:"
        略
    },
    "username": "kitasuka"
}

https://slack.com/api/users.list?pretty=1
Authorization: Bearer xoxb-略
{
    "ok": true,
    "members": [
        {
          "id": "USLACKBOT",
        }
        略
   ],
    "cache_ts": 1671753074,
    "response_metadata": {
        "next_cursor": ""
    }
}
EOS
