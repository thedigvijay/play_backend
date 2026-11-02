
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();

const REQUIRED_BUFFER = 0.15; // YouTube loaded fraction (15%)
const COUNTDOWN_SECONDS = 3;
const PLAY_DELAY = 1500;

// Send updated room state
function sendRoomState(code) {
  const room = rooms.get(code);
  if (!room) return;

  const users = [...room.users.values()].map(user => ({
    id: user.id,
    ready: user.ready,
    bufferReady: user.bufferReady,
    bufferedFraction: user.bufferedFraction
  }));

  const allReady =
    users.length > 0 &&
    users.every(user => user.ready && user.bufferReady);

  io.to(code).emit("room-state", {
    videoUrl: room.videoUrl,
    users,
    started: room.started,
    allReady
  });
}

// Generate unique room code
function generateRoomCode() {
  let code;

  do {
    code = Math.random()
      .toString(36)
      .substring(2, 7)
      .toUpperCase();
  } while (rooms.has(code));

  return code;
}

// Clear room timers
function clearRoomTimers(room) {
  room.timers.forEach(timer => clearTimeout(timer));
  room.timers = [];
}

io.on("connection", (socket) => {

  console.log("User connected:", socket.id);

  // CREATE ROOM
  socket.on("create-room", (videoUrl, callback) => {

    if (typeof callback !== "function") return;

    if (
      typeof videoUrl !== "string" ||
      !videoUrl.trim() ||
      !/(youtube\.com|youtu\.be)/i.test(videoUrl)
    ) {
      return callback({
        success: false,
        message: "Valid YouTube URL required"
      });
    }

    const code = generateRoomCode();

    const room = {
      host: socket.id,
      videoUrl: videoUrl.trim(),
      users: new Map(),
      started: false,
      timers: []
    };

    rooms.set(code, room);

    room.users.set(socket.id, {
      id: socket.id,
      ready: false,
      bufferReady: false,
      bufferedFraction: 0
    });

    socket.join(code);

    callback({
      success: true,
      code
    });

    sendRoomState(code);

    console.log("Room created:", code);
  });

  // JOIN ROOM
  socket.on("join-room", (code, callback) => {

    if (typeof callback !== "function") return;

    if (typeof code !== "string") {
      return callback({
        success: false,
        message: "Invalid room code"
      });
    }

    code = code.trim().toUpperCase();

    const room = rooms.get(code);

    if (!room) {
      return callback({
        success: false,
        message: "Room not found"
      });
    }

    if (room.started) {
      return callback({
        success: false,
        message: "Video has already started"
      });
    }

    socket.join(code);

    room.users.set(socket.id, {
      id: socket.id,
      ready: false,
      bufferReady: false,
      bufferedFraction: 0
    });

    callback({
      success: true,
      videoUrl: room.videoUrl
    });

    sendRoomState(code);

    console.log("User joined:", code, socket.id);
  });

  // DEVICE READY
  socket.on("device-ready", (code) => {

    const room = rooms.get(code);

    if (!room || room.started) return;
    if (!room.users.has(socket.id)) return;

    const user = room.users.get(socket.id);

    user.ready = true;

    sendRoomState(code);

    console.log("Device ready:", socket.id);
  });

  // BUFFERING PROGRESS
  socket.on("buffer-progress", (data) => {

    if (!data || typeof data !== "object") return;

    const { code, bufferedFraction } = data;

    const room = rooms.get(code);

    if (!room || room.started) return;
    if (!room.users.has(socket.id)) return;

    const user = room.users.get(socket.id);

    const fraction = Number(bufferedFraction);

    if (!Number.isFinite(fraction)) return;

    user.bufferedFraction = Math.max(
      0,
      Math.min(1, fraction)
    );

    if (user.bufferedFraction >= REQUIRED_BUFFER) {
      user.bufferReady = true;
    }

    sendRoomState(code);
  });

  // BUFFERING COMPLETE
  socket.on("buffer-ready", (code) => {

    const room = rooms.get(code);

    if (!room || room.started) return;
    if (!room.users.has(socket.id)) return;

    const user = room.users.get(socket.id);

    user.bufferReady = true;

    sendRoomState(code);

    console.log("Buffer ready:", socket.id);
  });

  // START VIDEO (HOST ONLY)
  socket.on("start-video", (code) => {

    const room = rooms.get(code);

    if (!room) return;

    if (room.host !== socket.id) return;

    if (room.started) return;

    const users = [...room.users.values()];

    const allReady =
      users.length > 0 &&
      users.every(user =>
        user.ready && user.bufferReady
      );

    if (!allReady) {
      socket.emit(
        "error-message",
        "All devices must be ready and buffered!"
      );

      return;
    }

    room.started = true;

    sendRoomState(code);

    console.log("Starting countdown:", code);

    // Countdown: 3, 2, 1
    [3, 2, 1].forEach((number, index) => {

      const timer = setTimeout(() => {

        io.to(code).emit("countdown", number);

      }, index * 1000);

      room.timers.push(timer);
    });

    // Start synchronized playback
    const playTimer = setTimeout(() => {

      const playAt = Date.now() + PLAY_DELAY;

      io.to(code).emit("play-video", {
        playAt
      });

      console.log("Video playback scheduled:", playAt);

    }, COUNTDOWN_SECONDS * 1000);

    room.timers.push(playTimer);
  });

  // DISCONNECT
  socket.on("disconnect", () => {

    console.log("User disconnected:", socket.id);

    for (const [code, room] of rooms) {

      if (!room.users.has(socket.id)) continue;

      room.users.delete(socket.id);

      // Host disconnected
      if (room.host === socket.id) {

        clearRoomTimers(room);

        io.to(code).emit("room-closed");

        rooms.delete(code);

        console.log("Room closed:", code);

      } else {

        sendRoomState(code);

      }
    }
  });

});

// HOME ROUTE
app.get("/", (req, res) => {
  res.send("Sync Video Server Running");
});

// START SERVER
server.listen(5000, () => {
  console.log("Server running on port 5000");
});
