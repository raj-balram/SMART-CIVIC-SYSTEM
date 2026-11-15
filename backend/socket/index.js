const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const User = require("../models/User");
const { rooms } = require("./events");

function initSocket(httpServer) {
  const origins = env.FRONTEND_URL.split(",").map((s) => s.trim());
  const io = new Server(httpServer, { cors: { origin: origins, credentials: true } });

  // Runs once per connection attempt: no valid token, no connection.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Authentication required"));

      const decoded = jwt.verify(token, env.JWT_SECRET);
      // role comes from the database, not from the token
      const user = await User.findById(decoded.id).select("_id role");
      if (!user) return next(new Error("Authentication required"));

      socket.user = { id: user._id.toString(), role: user.role };
      next();
    } catch {
      // one generic message for every failure, so nothing leaks about why
      next(new Error("Authentication required"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(rooms.user(socket.user.id));
    if (socket.user.role === "admin") socket.join(rooms.admin);
  });

  return io;
}

module.exports = { initSocket };