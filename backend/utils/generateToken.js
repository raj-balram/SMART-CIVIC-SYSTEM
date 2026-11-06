const jwt = require("jsonwebtoken");
const env = require("../config/env");

const generateToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, env.JWT_SECRET, { expiresIn: "7d" });

module.exports = generateToken;