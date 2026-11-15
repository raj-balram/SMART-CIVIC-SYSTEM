const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Complaint = require("../models/Complaint");
const { OPEN_STATUSES } = require("../utils/workflow");

async function main() {
  await connectDB();
  const c = await Complaint.findOneAndUpdate(
    { status: { $in: OPEN_STATUSES }, dueAt: { $gt: new Date() }, escalatedAt: null },
    { $set: { dueAt: new Date(Date.now() - 60 * 60 * 1000) } },
    { returnDocument: "after" }
  );
  console.log(c ? `Backdated the deadline of: "${c.title}"` : "No open complaint with a future deadline. Submit a new one first.");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});