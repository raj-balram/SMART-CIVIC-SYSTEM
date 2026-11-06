const bcrypt = require("bcryptjs");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");
const AppError = require("../utils/AppError");

const BCRYPT_ROUNDS = 10;
// compared against when the email is unknown, so login takes the same time either way
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

exports.register = async (req, res) => {
  const { name, email, password } = req.body;

  if (await User.exists({ email })) {
    throw new AppError(409, "An account with this email already exists");
  }

  const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
  // the role is never taken from the request: everyone registers as "user"
  const user = await User.create({ name, email, password: hashed });

  res.status(201).json({ _id: user._id, name: user.name, role: user.role, token: generateToken(user) });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  const ok = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
  if (!user || !ok) throw new AppError(401, "Invalid credentials");

  res.json({ _id: user._id, name: user.name, role: user.role, token: generateToken(user) });
};

exports.getMe = (req, res) => res.json(req.user);

exports.updateMe = async (req, res) => {
  const updated = await User.findByIdAndUpdate(
    req.user._id,
    { name: req.body.name },
    { returnDocument: "after" }
  ).select("-password");
  res.json(updated);
};