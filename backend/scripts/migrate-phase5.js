const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Complaint = require("../models/Complaint");
const { SLA_HOURS, OPEN_STATUSES } = require("../utils/workflow");

async function migrate({ dryRun = false, log = console.warn, now = new Date() } = {}) {
  const collection = Complaint.collection;
  const docs = await collection
    .find({ dueAt: { $exists: false } }, { projection: { category: 1, status: 1, createdAt: 1 } })
    .toArray();

  const ops = [];
  let skipped = 0;
  for (const doc of docs) {
    const hours = SLA_HOURS[doc.category];
    if (!hours || !doc.createdAt) {
      log(`Skipped ${doc._id}: unknown category or missing createdAt`);
      skipped += 1;
      continue;
    }
    const dueAt = new Date(doc.createdAt.getTime() + hours * 60 * 60 * 1000);
    const escalatedAt = OPEN_STATUSES.includes(doc.status) && dueAt < now ? now : null;
    ops.push({
      updateOne: { filter: { _id: doc._id, dueAt: { $exists: false } }, update: { $set: { dueAt, escalatedAt } } },
    });
  }

  if (!dryRun) {
    for (let i = 0; i < ops.length; i += 500) await collection.bulkWrite(ops.slice(i, i + 500));
  }
  return { scanned: docs.length, updated: ops.length, skipped };
}

if (require.main === module) {
  (async () => {
    await connectDB();
    // safe by default: nothing is written unless --apply is present (it is set in package.json)
    const dryRun = !process.argv.includes("--apply");
    const result = await migrate({ dryRun });
    console.log(dryRun ? "DRY RUN, nothing was written:" : "APPLIED:", result);
    await mongoose.disconnect();
  })().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}

module.exports = { migrate };