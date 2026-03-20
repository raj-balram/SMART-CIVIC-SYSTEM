const express = require("express");
const { register, login } = require("../controllers/authController");
const authMiddleware = require("../middlewares/authMiddleware");
const User = require("../models/User");
const router = express.Router();

router.post("/register", register);
router.post("/login", login);

// Get logged-in user info
router.get("/me", authMiddleware, (req, res) => {
  res.json(req.user);
});

// ✅ New: update profile name (used by Profile page in Step 3)
router.put("/me", authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ message: "Name must be at least 2 characters" });
    }
    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { name: name.trim() },
      { new: true }
    ).select("-password");
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;