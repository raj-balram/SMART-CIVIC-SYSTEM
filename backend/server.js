require("dotenv").config();
const http = require("http");
const { Server } = require("socket.io");
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const app = express();
const server = http.createServer(app); // ✅ IMPORTANT

connectDB();

// ✅ SOCKET.IO
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

io.on("connection", (socket) => {
  console.log("✅ Socket connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("❌ Socket disconnected:", socket.id);
  });
});

// make io available
app.set("io", io);

// middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true
}));
app.use(express.json());

// routes
app.get("/", (req, res) => res.send("API Running ✅"));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/complaints", require("./routes/complaintRoutes"));

const authMiddleware = require("./middlewares/authMiddleware");

app.get("/api/test", authMiddleware, (req, res) => {
  res.json({ message: "Protected route working", user: req.user });
});

// ❗ IMPORTANT CHANGE
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));