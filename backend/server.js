const env = require("./config/env"); // must be first: loads and validates .env
const http = require("http");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const connectDB = require("./config/db");

const app = express();
const server = http.createServer(app);

// Socket.IO is rewritten in Phase 1 (authentication and rooms). Unchanged for now.
const io = new Server(server, { cors: { origin: "*" } });
io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);
  socket.on("disconnect", () => console.log("Socket disconnected:", socket.id));
});
app.set("io", io);

app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json());

app.get("/", (req, res) => res.send("API Running"));
app.get("/health", (req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;
  res.status(mongoOk ? 200 : 503).json({ mongo: mongoOk });
});

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/complaints", require("./routes/complaintRoutes"));

async function start() {
  await connectDB();
  server.listen(env.PORT, () => console.log(`Server running on port ${env.PORT}`));

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received: shutting down`);
    setTimeout(() => process.exit(1), 10_000).unref(); // never hang a deploy
    io.close(async () => {
      // io.close also closes the HTTP server
      await mongoose.disconnect();
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});