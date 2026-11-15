const env = require("./config/env"); // must be first: loads and validates .env
const http = require("http");
const mongoose = require("mongoose");
const app = require("./app");
const connectDB = require("./config/db");
const { initSocket } = require("./socket");
const { startSlaJob } = require("./jobs/slaEscalation");

const server = http.createServer(app);
const io = initSocket(server);
app.set("io", io);

async function start() {
  await connectDB();
  server.listen(env.PORT, () => console.log(`Server running on port ${env.PORT}`));
  const stopSla = startSlaJob(io, env.SLA_INTERVAL_MS);

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received: shutting down`);
    setTimeout(() => process.exit(1), 10_000).unref(); // never hang a deploy
    stopSla();
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