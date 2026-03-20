const User = require("../models/User");
const bcrypt = require("bcryptjs");
const generateToken = require("../utils/generateToken");

exports.register = async (req, res) => {
  const { name, email, password, adminSecret } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        message: "User already exists with this email",
      });
    }

    // 🔥 Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 🔥 Default role
    let role = "user";

    // ✅ If admin secret matches → make admin
    if (adminSecret && adminSecret === process.env.ADMIN_SECRET) {
      role = "admin";
    }

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
    });

    const token = generateToken(user);

    res.status(201).json({
      _id: user._id,
      name: user.name,
      role: user.role,
      token,
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server error" });
  }
};
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    const token = generateToken(user);

    res.json({ _id: user._id, name: user.name, role: user.role, token });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};