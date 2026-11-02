
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

const rooms = new Map();

function sendRoomState(code) {
  const room = rooms.get(code);
  if (!room) return;

  io.to(code).emit("room-state", {
    videoUrl: room.videoUrl,
    users: [...room.users.values()].map(u => ({
      id: u.id,
      ready: u.ready
    })),
    started: room.started
  });
}

io.on("connection", (socket) => {

  // Create room
  socket.on("create-room", (videoUrl, callback) => {
    const code = Math.random().toString(36)
      .substring(2, 7).toUpperCase();

    rooms.set(code, {
      host: socket.id,
      videoUrl,
      users: new Map(),
      started: false
    });

    const room = rooms.get(code);
    room.users.set(socket.id, {
      id: socket.id,
      ready: false
    });

    socket.join(code);
    callback({ success: true, code });
    sendRoomState(code);
  });

  // Join room
  socket.on("join-room", (code, callback) => {
    code = code.toUpperCase();

    const room = rooms.get(code);

    if (!room) {
      return callback({
        success: false,
        message: "Room not found"
      });
    }

    socket.join(code);
    room.users.set(socket.id, {
      id: socket.id,
      ready: false
    });

    callback({
      success: true,
      videoUrl: room.videoUrl
    });

    sendRoomState(code);
  });

  // Device ready
  socket.on("device-ready", (code) => {
    const room = rooms.get(code);
    if (!room || !room.users.has(socket.id)) return;

    room.users.get(socket.id).ready = true;
    sendRoomState(code);
  });

  // Start synchronized playback
  socket.on("start-video", (code) => {
    const room = rooms.get(code);
    if (!room || room.host !== socket.id) return;
    if (room.started || room.users.size === 0) return;

    const allReady = [...room.users.values()]
      .every(user => user.ready);

    if (!allReady) {
      socket.emit("error-message", "All devices are not ready!");
      return;
    }

    room.started = true;

    [3, 2, 1].forEach((number, index) => {
      setTimeout(() => {
        io.to(code).emit("countdown", number);
      }, index * 1000);
    });

    setTimeout(() => {
      io.to(code).emit("play-video", {
        playAt: Date.now() + 1500
      });
    }, 3000);
  });

  // Disconnect
  socket.on("disconnect", () => {
    for (const [code, room] of rooms) {
      room.users.delete(socket.id);

      if (room.host === socket.id) {
        io.to(code).emit("room-closed");
        rooms.delete(code);
      } else {
        sendRoomState(code);
      }
    }
  });

});

app.get("/", (req, res) => {
  res.send("Sync Video Server Running");
});

server.listen(5000, () => {
  console.log("Server running on port 5000");
});
