const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Complaint = require("../models/Complaint");

const chain = (stage) => (stage ? [stage.stage, ...chain(stage.inputStage)] : []);

async function show(label, query) {
  const e = await query.explain("executionStats");
  const s = e.executionStats;
  console.log(label);
  console.log(`  plan: ${chain(e.queryPlanner.winningPlan).join(" -> ")}`);
  console.log(`  examined ${s.totalDocsExamined} documents, ${s.totalKeysExamined} index keys, returned ${s.nReturned}\n`);
}

async function main() {
  await connectDB();
  await Complaint.init(); // make sure the indexes exist
  const sample = await Complaint.findOne().select("user").lean();

  await show("Admin list, Pending, newest first", Complaint.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(20));
  await show("My complaints, newest first", Complaint.find({ user: sample.user }).sort({ createdAt: -1 }));
  await show("Category + status", Complaint.find({ category: "Road", status: "Resolved" }));
  await show("For contrast: search by title text (no index)", Complaint.find({ title: /pothole/i }));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});