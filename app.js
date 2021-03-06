const express = require('express');
const app = express();
const http = require('http').createServer(app);
const logger = require('morgan');
const favicon = require('serve-favicon');
const io = require('socket.io')(http);

// WEB 세팅
app.use(logger('dev')); // 로깅처리
app.set('view engine', 'ejs');  //템플릿 엔진 세팅
app.set('views', './views');    //ejs 파일이 저장된 디렉토리
app.use(express.static(__dirname + '/public')); // 정적 파일 처리
app.use(favicon(__dirname + '/public/image/favicon.ico')); // 파비콘 세팅

// DB 세팅
const admin = require('firebase-admin');
const serviceAccount = require('./HeyStop.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://trafficjamjam-3e477.firebaseio.com"
});
var db = admin.database();
var onceref = db.ref("staticData/GwangJu");
var onref = db.ref('Status/GwangJu');

// 데이터 검색
var static_data;
onceref.once("value", function (snapshot) {
    static_data = snapshot.val();
}, function (errorObject) {
    console.log("The read failed: " + errorObject.code);
    res.send('error');
});
var status;
onref.on("value", function (snapshot) {
    status = snapshot.val();
}, function (errorObject) {
    console.log("The read failed: " + errorObject.code);
    res.send('error');
});

// 라우팅 처리
app.get('/', (req, res) => {
    res.render('./test', { title: 'test' });
});

app.get('/index', (req, res) => {
    res.render('./index');
});

app.get('/main', (req, res) => {
    res.render('./main');
});

app.get('/hud', (req, res) => {
    res.render('./hud');
});

// 소켓 통신
var gps = require('./package/gps');
var user = require('./package/user');
var utils = require('./package/utils');

var room_num = 0;
var room_list = [];
var user_list = [];
var check_list = [];

io.on('connection', (socket) => {

    room_list.push = [`${room_num}`];
    user_list.push(new user(room_num));
    socket.emit('give_room_num', room_num);
    socket.join(room_list[room_num]);

    console.log(room_num);

    check_list.push(setInterval((room_num) => {
        if (Date.now() - user_list[room_num].last_update >= 60 * 1000) {
            user_list[room_num] = undefined;
            room_list[room_num] = undefined;

            clearInterval(check_list[room_num]);

        }
    }, 70 * 1000, room_num));

    room_num++;

    console.log('user connected');
    socket.on('now coordinate', (room_num, data) => {
        console.log('room_num : ', room_num);

        user_list[room_num].update_position([String(data[0]) + '°', String(data[1]) + '°']);
        console.log(user_list[room_num].coordinate[1]);

        var distance = gps.calculate_distance(user_list[room_num].coordinate[0], user_list[room_num].coordinate[1]);
        var speed = parseInt(gps.calculate_speed(user_list[room_num].coordinate[0], user_list[room_num].coordinate[1]));
        var direction = gps.calculate_direction(user_list[room_num].coordinate[0], user_list[room_num].coordinate[1])
        var lat = gps.m_to_lat(distance*10), lon = gps.m_to_lon(distance*10); // 반경 구하기
        // console.log(distance, lat, lon);
        var now_lat = parseFloat(user_list[room_num].coordinate[1][0].substring(0, user_list[room_num].coordinate[1][0].length)),
            now_lon = parseFloat(user_list[room_num].coordinate[1][1].substring(0, user_list[room_num].coordinate[1][1].length)); // 현재 위경도

        var temp = gps.search(direction, lat, lon, now_lat, now_lon);
        var x = temp[0], y = temp[1];
        // console.log(direction);
        // console.log(x);
        // console.log(y);
        if(user_list[room_num].near_traffic_light == null) {
            console.log('비어있음');
            for(var i in static_data){
                if(static_data[i].direction == direction &&
                static_data[i].location.latitude >= y[0] && static_data[i].location.latitude <= y[1] &&
                static_data[i].location.longitude >= x[0] && static_data[i].location.latitude <= x[1]){
                    t = static_data[i];
                    t['key'] = i;
                    user_list[room_num].set_traffic_light(t);
                }
            }
        } else { // 마킹중임!
            key = user_list[room_num].near_traffic_light.key;
            sendobj = {
                status_code: status[key].status_code
            }
            if(sendobj.status_code === 1) {
                sendobj['remainingTime'] = 10;
            } else if(sendobj.status_code === 2){
                // sendobj['remainingTime'] = 5+(parseInt(status[key].releasedTime)-parseInt(utils.getdate()))
                sendobj['remainingTime'] = 3;
            } else {
                // sendobj['remainingTime'] = 10+(parseInt(status[key].releasedTime)-parseInt(utils.getdate()))
                sendobj['remainingTime'] = Math.floor(Math.random()*10)+1;
            }
            console.log(sendobj);
            io.emit('trafficLightStatus', sendobj);

            coor = user_list[room_num].near_traffic_light.location;
            coor = gps.get_Radius(coor);
            if(user_list[room_num].coordinate[1][0] < coor[0][0] || user_list[room_num].coordinate[1][0] > coor[0][1]||
            user_list[room_num].coordinate[1][1] < coor[1][0] || user_list[room_num].coordinate[1][1] > coor[0][1]){
                console.log('제거');
                user_list[room_num].near_traffic_light = null;
            }
        }

        io.emit('speed', speed);
    });
});

http.listen(8080, () => {
    console.log('8080 서버에서 대기중');
});