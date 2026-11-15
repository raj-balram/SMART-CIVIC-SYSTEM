const express = require("express");
const { register, login, getMe, updateMe } = require("../controllers/authController");
const protect = require("../middlewares/authMiddleware");
const { validateBody } = require("../middlewares/validate");
const { loginLimiter, registerLimiter } = require("../middlewares/rateLimit");
const { registerSchema, loginSchema, updateProfileSchema } = require("../validators/schemas");

const router = express.Router();

router.post("/register", registerLimiter, validateBody(registerSchema), register);
router.post("/login", loginLimiter, validateBody(loginSchema), login);
router.get("/me", protect, getMe);
router.put("/me", protect, validateBody(updateProfileSchema), updateMe);

module.exports = router;