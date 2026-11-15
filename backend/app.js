const env = require("./config/env"); // must be first: loads and validates .env
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const mongoose = require("mongoose");
const { globalLimiter } = require("./middlewares/rateLimit");
const { notFound, errorHandler } = require("./middlewares/errorHandler");

const app = express();

// Behind a proxy (Render) set TRUST_PROXY=1, otherwise every user looks like the proxy's IP
if (env.TRUST_PROXY) app.set("trust proxy", env.TRUST_PROXY);

app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "10kb" }));

// before the rate limiter, so uptime monitors never use up the budget
app.get("/", (req, res) => res.send("API Running"));
app.get("/health", (req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;
  res.status(mongoOk ? 200 : 503).json({ mongo: mongoOk });
});

app.use(globalLimiter);

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/complaints", require("./routes/complaintRoutes"));

app.use(notFound);
app.use(errorHandler); // must be last

module.exports = app;