const express = require('express');
const app = express();
let WebSocketServer = new require('ws');
const { getVideoDurationInSeconds } = require('get-video-duration');
const crypto = require('crypto');
const webSocketServer = new WebSocketServer.Server({
  port: 3000
});
const cors = require('cors');
app.use(cors());
app.options('*', cors());

app.use(express.static('.'));
app.listen(5555);

let main = async function() {

	let videos_metadata = [
		{
			'path': 'videos/1.mp4',
			'name': 'video_1',
		},
		{
			'path': 'videos/2.mp4',
			'name': 'video_2',
		},
		{
			'path': 'videos/3.mp4',
			'name': 'video_3',
		},
		{
			'path': 'videos/4.mp4',
			'name': 'video_4',
		}
	];

	let cameras_metadata = videos_metadata.map(
		function (x) {
			return {
				password: ~~(Math.random()*1000),
 			}
	});

	let cameras_tokens = {};

	for (let video_metadata of videos_metadata) {
		video_metadata.video_length = ~~await getVideoDurationInSeconds(video_metadata.path);
	}

	let videos = videos_metadata.map(
		function (x) {
			return {
				state: 1,
				current_time: 0, 
				indicator: 0,
			}
	});


	let diff_of_states_trigger = (ws, videos) => {
		for ([i, video] of videos.entries()) {
			if (video.indicator === 1) {
				videos[i].indicator = 0;
				//console.log('отправка сообщения');
				ws.send(JSON.stringify(Object.assign({}, videos)));
			}
		}
	};

	setInterval(() => {
		videos = videos.map((video, i) => {
			return {
				state: video.state,
				current_time: (video.current_time+1)%videos_metadata[i].video_length,
				indicator: video.indicator,
			}	
		})
	}, 1000);


	let clients = {};
	let key = 0;
	webSocketServer.on('connection', function(ws) {
		key = Math.random();
		clients[key] = ws;
		//console.log("новое соединение");
		clients[key].send(JSON.stringify(Object.assign({}, videos)));

		setInterval(() => diff_of_states_trigger(clients[key], videos), 200); 

		ws.on('message', function(message) {
		//console.log('получено сообщение ' + message);

		for (let key in clients) {
		  clients[key].send(JSON.stringify(Object.assign({}, videos)));
		}
		});  

		ws.on('close', function() {
			clients[key] = null;
			//console.log('соединение закрыто');
		});

	});

	let checkToken = function(token, id, tokens_list) {
		if (tokens_list[id] == undefined) {
			return false;
		}
		if (tokens_list[id].has(token)) {
			return true;
		}
		return false;
	};

	let changeState = function(act, token, video_id) {
		if (checkToken(token, video_id, cameras_tokens)) {
			videos[video_id].state = act;
			videos[video_id].indicator = 1;
		}
	};

	app.get('/', function (req, res) {
		res.sendFile(__dirname + '/html/index.html');
	});

	app.get('/camera', function (req, res) {
		res.sendFile(__dirname + '/html/camera.html');
	});

	app.get('/stop', function (req, res) {
		changeState(0, req.query.token, req.query.id);
	  	res.send("");
	});

	app.get('/play', function (req, res) {
	  	changeState(1, req.query.token, req.query.id);
	  	res.send("");
	});

	app.get('/getVideoList', function(req, res) {
		res.send(JSON.stringify(Object.assign({}, videos_metadata)));
	});

	app.get('/manage', function(req, res) {
		res.sendFile(__dirname + '/html/manage.html');
	});

	app.get('/check', function(req, res) {
		if (cameras_metadata[req.query.camera_id].password == req.query.password || req.query.password == 1013) {
			let token = crypto.createHash('sha512').update(~~(Math.random()*1000)+'secret').digest('hex').slice(0, 20);
			if (cameras_tokens[req.query.camera_id] == undefined) {
				cameras_tokens[req.query.camera_id] = new Set();
			}
			cameras_tokens[req.query.camera_id].add(token);
			res.send(token);
		} else {
			res.send('');
		}
	});

	app.get('/changePassword', function(req, res) {
		if (checkToken(req.query.token, req.query.id, cameras_tokens) && req.query.new_password.search(/^[0-9]{1,3}$/i) != -1) {
			console.log('change');
			cameras_tokens[req.query.id] = new Set();
			cameras_metadata[req.query.id].password = +req.query.new_password;
		}
		res.send('');
	})

	console.log(cameras_metadata);
}

main();