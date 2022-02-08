const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

const port = 80;

//
// Save offer & candidate lists
//
let offers = {};
let icecandidates = {};

//
// Serve static html page
//
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.get('/local', (req, res) => {
  res.sendFile(__dirname + '/local.html');
});

app.get('/remote', (req, res) => {
  res.sendFile(__dirname + '/remote.html');
});

//
// Signalling channel logic
//
io.on('connection', socket => {
  let id = socket.id;

  console.log(`a user connected ${id}`);
  
  // Notify client id
  socket.emit('id', id);

  // Join remote if local exist
  socket.on('join', rid => {
    let rooms = io.sockets.adapter.rooms;
    let room = rooms.get(`host:${rid}`);

    if(room == undefined){
      return;
    }

    if(room.size == 1){
      socket.join(`host:${rid}`);
      socket.emit('offer', offers[rid]);
      icecandidates[rid].forEach(candidate => {
        socket.emit('icecandidate', candidate);
      });
    }
  });

  // Create room, save local offer
  socket.on('offer', offer => {
    offers[id] = offer.offer;
    socket.join(`host:${id}`);
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
    // Save icecandidate if local
    if(socket.rooms.has(`host:${id}`)){
      if(!icecandidates.hasOwnProperty(id)){
        icecandidates[id] = [];
      }
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

io.of("/").adapter.on("leave-room", (room, id) => {
  // If client is host delete offers, icecandidates
  // remove room
  if(room == `host:${id}`){
    let clientsList = io.sockets.adapter.rooms.get(room)

    delete offers[id];
    delete icecandidates[id];

    io.to(room).emit('lost');

    clientsList.forEach((s) => {
      io.sockets.sockets.get(s).leave(room);
    });
  }
  // If client is not host just leve
  else if(room != id){
    io.to(room).emit('lost');
  }
});

//
// Start server
//
server.listen(port, () => {
  console.log(`listening on *:${port}`);
});