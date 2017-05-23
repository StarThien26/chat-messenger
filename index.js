'use strict';
const
  bodyParser = require('body-parser'),
  crypto = require('crypto'),
  express = require('express'),
  https = require('https'),
  request = require('request'),
  PAGE_ACCESS_TOKEN = "",
  VALIDATION_TOKEN = ""
var fs = require('fs')
var app = express()
app.use(express.static('public'))
app.set("view engine", "ejs")
app.set("views", "./views")
var server = require("http").Server(app)
server.listen(3000)
var server_port = process.env.OPENSHIFT_NODEJS_PORT || 8080
var server_ip_address = process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1'

server.listen(server_port, server_ip_address, function(){
  console.log("Listening on " + server_ip_address + ", server_port " + server_port)
});

var mysql      = require('mysql')
var connection = mysql.createConnection({
  host     : process.env.OPENSHIFT_MYSQL_DB_HOST,
  user     : process.env.OPENSHIFT_MYSQL_DB_USERNAME,
  password : process.env.OPENSHIFT_MYSQL_DB_PASSWORD,
  database : process.env.OPENSHIFT_APP_NAME
})

connection.connect(function(err) {
  if (err) {
    console.error('error connecting: ' + err.stack)
    return
  }

  console.log('connected as id ' + connection.threadId)
});
app.get("/webhook", function(req, res){
	if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VALIDATION_TOKEN) {
		console.log("Validating webhook")
		res.status(200).send(req.query['hub.challenge'])
	} else {
		console.error("khong the ket noi.")
		res.sendStatus(403)
	}
})
app.post('/webhook', function (req, res) {
	var data = req.body;
	if (data.object == 'page') {
		if (data.entry[0].messaging[0].sender.id) {
			var sender = data.entry[0].messaging[0].sender.id
		}
		if (data.entry[0].messaging[0].message) {
			var message = data.entry[0].messaging[0].messages
			if (data.entry[0].messaging[0].message === "menu") {
				MessageHome($sender);
			} else {
				forwardMessage()
			}
		}
		if (data.entry[0].messaging[0].postback.payload) {
			var postback = data.entry[0].messaging[0].postback.payload
			if (postback === "start") {
				checkUser(sender, function(result){
					if (result > 0) {
						checkStatus(sender, function(status){
							if (status === 2) {
								MessageNoti(sender, "Bạn Chưa Ngắt Kết Nối", "Bạn cần ngắt kết nối với người lạ hiện tại mới có thể bắt đầu.")
							} else if (status === 1) {
								MessageNoti(sender, "Đang Tìm", "Vẫn đang tìm thính cho bạn đây. Bình tĩnh đợi nhé!");
							}
						})
					} else {
						addUser(sender)
						findRelationship(sender)
					}
				})
			}
			if (postback === 'stop') {
				checkUser(sender, function(result){
					if (result > 0) {
						checkStatus(sender, function(status){
							if (status === 0) {
								MessageNoti(sender, "Bạn Chưa Kết Nối", "Bạn chưa kết nối với người lạ nào cả nên làm sao mà kết thúc")
							} else {
								deleteRelationship(sender)
							}
						})
					} else {
						MessageNoti(sender, "Bạn Chưa Kết Nối", "Bạn chưa kết nối với người lạ nào cả nên làm sao mà kết thúc được.")
					}
				})
			}
		}
		res.sendStatus(200);
	}
})
function forwardMessage(userid, msg){
	var partner = getRelationship(userid)
	if (partner !== NULL) {
		sendMessageText(partner, msg.text)
	} else {
		switch(msg.attachments[0].type){
			case 'image':
					sendMessageImage(partner, msg.attachments[0].payload.url)
					break
				case 'audio':
					sendMessageAudio(partner, msg.attachments[0].payload.url)
					break
				case 'file':
					sendMessageFile(partner, msg.attachments[0].payload.url)
					break
				case 'video':
					sendMessageVideo(partner, msg.attachments[0].payload.url)
					break
				default :
				sendMessageText(partner, "system error")
					break
		}
	}
}
function checkUser(userid, callback) {
	var sql = "select * from users where id = " + userid + " limit 1"
	connection.query(sql,function(err, rows, fields){
		if (err) throw err
	  	callback(rows.length)
	})
}
function checkStatus(userid, callback){
	var sql = "select status from users where id = " + userid
	connection.query(sql,function(err, rows, fields){
		if (err) throw err
	  	callback(rows[0].status)
	})
}
function getRelationship(userid, callback){
	var sql = "select relationship from users where id = " + userid
	connection.query(sql,function(err, rows, fields){
		if (err) throw err
	  	callback(rows[0].relationship)
	})
}
function addRelationship(userid1, userid2){
	var sql1 = "update users set status = 2, relationship = " + userid2 + " where id = " + userid1
	var sql2 = "update users set status = 2, relationship = " + userid1 + " where id = " + userid2
	connection.query(sql1,function(err, rows, fields){
		if (err) throw err
	  	console.log("ghep cap thanh cong " + userid1 + " voi " + userid2)
	})
	connection.query(sql2,function(err, rows, fields){
		if (err) throw err
	  	console.log("ghep cap thanh cong " + userid2 + " voi " + userid1)
	})
}
function deleteRelationship(userid){
	getRelationship(userid, function(partner){
		var sql2 = "update users set status = 0, relationship = NULL where id = " + partner
		var sql1 = "update users set status = 0, relationship = NULL where id = " + userid
		connection.query(sql1,function(err, rows, fields){
			if (err) throw err
		  	console.log(userid + " da thoat ")
		})
		connection.query(sql2,function(err, rows, fields){
			if (err) throw err
		  	console.log(partner + " da thoat ")
		})
	})
}
function addUser(userid){
	var sql = "insert into users (id, status) values ( " + userid + ", 0 )"
	connection.query(sql, function(err, result){
		if (err) throw err
		console.log("da them " + userid )
	})
}
function findRelationship(userid){
	var sql = "select id from users where status = 1 and id != " + userid + "order by rand() limit 1"
	connection.query(sql, function(err, rows, fields){
		if (err) throw err
		var partner = rows[0].id
		var sql2 = "update users set status = 1 where id = " + userid
		connection.query(sql2, function(err, result){
			if(err) throw err
			console.log()
		})
		if(!partner){
			console.log("Dang tim doi tuong")
		} else {
			addRelationship(userid, partner)
			console.log("Da tim thay doi tuong")
		}
	})
}
function sendMessageText(receiver, content){
	var payload = {
		recipient: {
			id: receiver
		},
		message: {
			text: content
		}
	}
	callSendAPI(payload)
}
function sendMessageImage(receiver, url){
	var payload = {
		recipient: {
			id: receiver
		},
		message: {
			attachment: {
				type: 'image',
				payload: {
					url: url
				}
			}
		}
	}
	callSendAPI(payload)
}
function sendMessageAudio(receiver, url){
	var payload = {
		recipient: {
			id: receiver
		},
		message: {
			attachment: {
				type: 'audio',
				payload: {
					url: url
				}
			}
		}
	}
	callSendAPI(payload)
}
function sendMessageFile(receiver, url){
	var payload = {
		recipient: {
			id: receiver
		},
		message: {
			attachment: {
				type: 'file',
				payload: {
					url: url
				}
			}
		}
	}
	callSendAPI(payload)
}
function sendMessageVideo(receiver, url){
	var payload = {
		recipient: {
			id: receiver
		},
		message: {
			attachment: {
				type: 'video',
				payload: {
					url: url
				}
			}
		}
	}
	callSendAPI(payload)
}
function MessageNoti(receiver, content, sub){
	var payload = {
		recipient: {
			id: receiver
		},
		message: {
			attachment: {
				type: 'template',
				payload: {
					template_type: 'generic',
					elements: [{
						title: content,
						subtitle: sub
					}]
				}
			}
		}
	}
	callSendAPI(payload)
}
function MessageHome(receiver){
	var payload = {
		recipient: {
			id: receiver
		},
		message: {
			attachment: {
				type: 'template',
				payload: {
					template_type: 'generic',
					elements: [
						{
							title: "Rắc Thính",
							subtitle: "Thả thính cộng đồng",
							item_url: "http://google.com",
							image_url: "http://giaitri.danongonline.com.vn/wp-content/uploads/2016/11/1-1479377234390.jpg",
							buttons: [
								{
									type: "postback",
									title: "Bắt Đầu Thả Tính",
									payload: "start",
								},
								{
									type: "postback",
									titl: "Kết Thúc Trò Chuyện",
									payload: "stop",
								}
							]
						}
					]
				}
			}
		}
	}
	callSendAPI(payload)
}
function callSendAPI(messageData) {
	request({
		uri: 'https://graph.facebook.com/v2.6/me/messages',
		qs: { access_token: PAGE_ACCESS_TOKEN },
		method: 'POST',
		json: messageData

	}, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			var recipientId = body.recipient_id;
			var messageId = body.message_id;

			if (messageId) {
				console.log("ID %s vua gui thanh cong cho ID %s",messageId, recipientId)
			} else {
				console.log("Goi thanh cong api. ID nguoi nhan %s", recipientId)
			}
		} else {
			console.error("Khong the gui tin nhan. :" + response.error)
		}
	})
}