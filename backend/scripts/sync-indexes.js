const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Complaint = require("../models/Complaint");
const User = require("../models/User");

async function main() {
  await connectDB();
  for (const Model of [User, Complaint]) {
    const dropped = await Model.syncIndexes(); // creates missing indexes, drops ones the schema no longer has
    console.log(`${Model.modelName}: dropped ${dropped.length} old index(es)`, dropped);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});