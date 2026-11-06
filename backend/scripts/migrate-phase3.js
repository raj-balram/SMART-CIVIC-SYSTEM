const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Complaint = require("../models/Complaint");
const { toGeoPoint } = require("../utils/workflow");

const isValidPoint = (loc) =>
  Number.isFinite(loc?.lat) && Number.isFinite(loc?.lng) && Math.abs(loc.lat) <= 90 && Math.abs(loc.lng) <= 180;

async function migrate({ dryRun = false, log = console.warn } = {}) {
  const collection = Complaint.collection; // raw collection: Mongoose must not interfere with old documents
  const needsWork = {
    $or: [{ geo: { $exists: false } }, { statusHistory: { $exists: false } }, { statusHistory: { $size: 0 } }],
  };

  const ids = (await collection.find(needsWork, { projection: { _id: 1 } }).toArray()).map((d) => d._id);
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < ids.length; i += 500) {
    const docs = await collection.find({ _id: { $in: ids.slice(i, i + 500) } }).toArray();
    const ops = [];

    for (const doc of docs) {
      if (!isValidPoint(doc.location)) {
        log(`Skipped ${doc._id}: invalid coordinates`);
        skipped += 1;
        continue;
      }

      const $set = {};
      if (!doc.geo) $set.geo = toGeoPoint(doc.location.lat, doc.location.lng);

      if (!Array.isArray(doc.statusHistory) || doc.statusHistory.length === 0) {
        const history = [{ status: "Pending", by: doc.user, at: doc.createdAt, note: "" }];
        if (doc.status !== "Pending") {
          // we do not know who changed it in the past, so `by` is null
          history.push({ status: doc.status, by: null, at: doc.updatedAt || doc.createdAt, note: "" });
        }
        $set.statusHistory = history;
      }
      if (doc.resolvedAt === undefined) {
        $set.resolvedAt = doc.status === "Resolved" ? doc.updatedAt || doc.createdAt : null;
      }

      ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set } } });
      updated += 1;
    }

    if (!dryRun && ops.length > 0) await collection.bulkWrite(ops);
  }

  return { scanned: ids.length, updated, skipped };
}

if (require.main === module) {
  (async () => {
    await connectDB();
    const dryRun = process.argv.includes("--dry-run");
    const result = await migrate({ dryRun });
    console.log(dryRun ? "DRY RUN (nothing was written):" : "Done:", result);
    await mongoose.disconnect();
  })().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}

module.exports = { migrate };