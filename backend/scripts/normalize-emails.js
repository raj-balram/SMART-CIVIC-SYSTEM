const mongoose = require("mongoose");
require("../config/env");
const connectDB = require("../config/db");
const User = require("../models/User");

async function main() {
  await connectDB();
  const users = await User.find({}).select("email");
  let fixed = 0;
  let conflicts = 0;

  for (const u of users) {
    const normalized = u.email.trim().toLowerCase();
    if (normalized === u.email) continue;

    const clash = await User.exists({ email: normalized, _id: { $ne: u._id } });
    if (clash) {
      console.log(`CONFLICT (not changed): "${u.email}" collides with an existing account`);
      conflicts += 1;
      continue;
    }
    await User.updateOne({ _id: u._id }, { $set: { email: normalized } });
    console.log(`Fixed: "${u.email}" -> "${normalized}"`);
    fixed += 1;
  }

  console.log(`Done. Fixed ${fixed}, conflicts ${conflicts}, total users ${users.length}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});