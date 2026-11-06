const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
require("../config/env"); // loads and validates .env
const connectDB = require("../config/db");
const User = require("../models/User");

const input = z
  .object({
    ADMIN_EMAIL: z.string().trim().toLowerCase().email(),
    ADMIN_PASSWORD: z.string().min(12, "ADMIN_PASSWORD must be at least 12 characters").max(72),
    ADMIN_NAME: z.string().trim().min(2).max(60).default("Admin"),
  })
  .safeParse(process.env);

if (!input.success) {
  console.error(input.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"));
  process.exit(1);
}
const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = input.data;

async function main() {
  await connectDB();
  const existing = await User.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    existing.role = "admin";
    await existing.save();
    console.log("Existing user promoted to admin:", ADMIN_EMAIL);
  } else {
    const password = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await User.create({ name: ADMIN_NAME, email: ADMIN_EMAIL, password, role: "admin" });
    console.log("Admin created:", ADMIN_EMAIL);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});