const jwt = require("jsonwebtoken");
const env = require("../config/env");
const User = require("../models/User");
const AppError = require("../utils/AppError");

const protect = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new AppError(401, "No token provided");

  let decoded;
  try {
    decoded = jwt.verify(header.slice(7), env.JWT_SECRET);
  } catch {
    throw new AppError(401, "Not authorized, token failed");
  }

  // load the user on every request, so the role always comes from the database
  const user = await User.findById(decoded.id).select("-password");
  if (!user) throw new AppError(401, "User not found");

  req.user = user;
  next();
};

module.exports = protect;