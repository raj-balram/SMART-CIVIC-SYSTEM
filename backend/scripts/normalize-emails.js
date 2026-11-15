const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User");

async function main() {
  await connectDB();
  // safe by default: nothing is written unless --apply is present (it is set in package.json)
  const apply = process.argv.includes("--apply");

  const users = await User.find({}).select("email");
  let toFix = 0;
  let conflicts = 0;

  for (const u of users) {
    const normalized = u.email.trim().toLowerCase();
    if (normalized === u.email) continue;

    const clash = await User.exists({ email: normalized, _id: { $ne: u._id } });
    if (clash) {
      console.log(`CONFLICT ${u._id}: another account already uses the lowercase address (not changed)`);
      conflicts += 1;
      continue;
    }
    if (apply) await User.updateOne({ _id: u._id }, { $set: { email: normalized } });
    toFix += 1;
  }

  console.log(apply ? "APPLIED:" : "DRY RUN, nothing was written:", { total: users.length, toFix, conflicts });
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});