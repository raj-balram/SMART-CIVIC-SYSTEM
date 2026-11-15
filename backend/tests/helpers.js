const http = require("http");
const mongoose = require("mongoose");
const { io: connectClient } = require("socket.io-client");
const { MongoMemoryServer } = require("mongodb-memory-server");
const os = require("os");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let counter = 0;

async function startTestServer() {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri("civic_test"), {
    runtimeAdapters: {
      os,
    },
  });

  const app = require("../app");
  const { initSocket } = require("../socket");
  const server = http.createServer(app);
  const io = initSocket(server);
  app.set("io", io);
  await new Promise((resolve) => server.listen(0, resolve));

  return {
    app,
    url: `http://localhost:${server.address().port}`,
    stop: async () => {
      await sleep(300); // let background socket notifications finish before the database closes
      await new Promise((resolve) => io.close(resolve)); // also closes the HTTP server
      await mongoose.disconnect();
      await mongod.stop();
    },
  };
}

async function makeUser(name, role = "user") {
  const User = require("../models/User");
  const generateToken = require("../utils/generateToken");
  counter += 1;
  const user = await User.create({
    name,
    email: `user${counter}-${Date.now()}@test.local`,
    password: "not-a-real-hash",
    role,
  });
  return { user, token: generateToken(user) };
}

// Connects a socket and records every event it receives.
function connectSocket(url, token) {
  return new Promise((resolve, reject) => {
    const socket = connectClient(url, {
      auth: token ? { token } : {},
      transports: ["websocket"],
      reconnection: false,
    });
    const received = [];
    socket.onAny((event, payload) => received.push({ event, payload }));
    socket.on("connect", () => resolve({ socket, received }));
    socket.on("connect_error", (err) => {
      socket.close();
      reject(err);
    });
  });
}

module.exports = { sleep, startTestServer, makeUser, connectSocket };