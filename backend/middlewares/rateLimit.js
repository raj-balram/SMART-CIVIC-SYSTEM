const rateLimit = require("express-rate-limit");
const env = require("../config/env");

const build = (windowMs, limit, extra = {}) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: "Too many requests, please try again later" },
    // limiters are off under test, except in the test file that checks them
    skip: () => env.NODE_ENV === "test" && !process.env.TEST_RATE_LIMIT,
    ...extra,
  });

module.exports = {
  globalLimiter: build(15 * 60 * 1000, 1000), // per IP
  loginLimiter: build(15 * 60 * 1000, 20), // per IP
  registerLimiter: build(60 * 60 * 1000, 10), // per IP
  // per logged-in user, so a spammer is limited but everyone else is not
  createComplaintLimiter: build(60 * 60 * 1000, 10, { keyGenerator: (req) => req.user._id.toString() }),
  supportLimiter: build(60 * 60 * 1000, 60, { keyGenerator: (req) => req.user._id.toString() }),
};