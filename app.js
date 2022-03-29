const express = require('express');
const app = express();
const https = require('https');
const { Server } = require("socket.io");
const fs = require('fs');
const cors = require('cors');

const PORT_HTTPS = 7681;
const PORT_HTTP = 7682;

const options = {
  key: fs.readFileSync('./rootca.key'),
  cert: fs.readFileSync('./rootca.crt')
};

const server = https.createServer(options, app);

const io = new Server(server, {
  cors: {
    origin: "*",
    method: ["GET", "POST"]
  }
});

//
// Save offer & candidate lists
//
let offers = {};
let icecandidates = {};

//
// Serve static html page
//
app.use(cors());
app.use('/static', express.static('public'));

app.set('view engine', 'ejs');
app.engine('html', require('ejs').renderFile);

app.get('/', (req, res) => {
  res.render('index.html');
});

app.get('/local', (req, res) => {
  res.render('local.html');
});

app.get('/remote', (req, res) => {
  res.render('remote.html');
});

//
// Signalling channel logic
//
io.on('connection', socket => {
  let id = socket.id;

  console.log(`a user connected ${id}`);

  // Join remote if local exist
  socket.on('join', roomName => {
    let rooms = io.sockets.adapter.rooms;
    let room = rooms.get(roomName);

    if(room == undefined){
      socket.emit('state', 'no room');
    }else if(room.size == 1){
      let host = [...room][0];
      socket.join(roomName);
      socket.emit('state', 'entered');
      socket.emit('offer', offers[host]);
      icecandidates[host].forEach(candidate => {
        socket.emit('icecandidate', candidate);
      });
    }else{
      socket.emit('state', 'full');
    }

  });

  // Create room, save local offer
  socket.on('create', create => {
    offers[id] = create.offer;
    icecandidates[id] = [];
    socket.join(create.room);
      socket.emit('state', 'created');
  });

  // Send answer to local
  socket.on('answer', answer => {
    let rooms = new Set(socket.rooms);
    rooms.delete(id);
    if(rooms.size != 0){
      socket.to([...rooms][0]).emit('answer', answer);
    }
  });

  socket.on('icecandidate', candidate => {
    if(icecandidates.hasOwnProperty(id)){
      icecandidates[id].push(candidate);
    }

    // Send ice-candidate to opponent
    let rooms = new Set(socket.rooms);
    rooms.delete(id);
    if(rooms.size != 0){
      socket.to([...rooms][0]).emit('icecandidate', candidate);
    }
  });

  socket.on('disconnect', () =>{
    console.log(`user disconnected ${id}`);
  });

});

//
// Start server
//
server.listen(PORT_HTTPS, () => {
  console.log(`listening on *:${PORT_HTTPS}`);
});