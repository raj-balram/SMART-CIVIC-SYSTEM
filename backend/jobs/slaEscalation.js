const Complaint = require("../models/Complaint");
const { EVENTS, rooms } = require("../socket/events");
const { OPEN_STATUSES } = require("../utils/workflow");

const BATCH = 500;

// Flags complaints that are past their target date, exactly once each.
async function escalateOverdue({ io, now = new Date() } = {}) {
  const candidates = await Complaint.find({
    status: { $in: OPEN_STATUSES },
    dueAt: { $lt: now },
    escalatedAt: null,
  })
    .sort({ dueAt: 1 }) // the most overdue first
    .limit(BATCH)
    .select("title category dueAt")
    .lean();

  const flagged = [];
  for (const c of candidates) {
    // The conditions are repeated in the write itself. If another server instance flagged this
    // complaint a moment ago, this matches nothing, so each complaint is flagged exactly once.
    const res = await Complaint.updateOne(
      { _id: c._id, status: { $in: OPEN_STATUSES }, escalatedAt: null },
      { $set: { escalatedAt: now } },
      { timestamps: false } // an escalation is not an edit, so leave updatedAt alone
    );
    if (res.modifiedCount === 1) flagged.push(c);
  }

  if (io && flagged.length > 0) {
    io.to(rooms.admin).emit(EVENTS.COMPLAINT_OVERDUE, {
      count: flagged.length,
      items: flagged.slice(0, 5).map(({ _id, title, category, dueAt }) => ({ _id, title, category, dueAt })),
    });
  }
  return flagged;
}

function startSlaJob(io, intervalMs = 5 * 60 * 1000) {
  let running = false; // never let two runs overlap on one server
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const flagged = await escalateOverdue({ io });
      if (flagged.length > 0) console.log(`SLA: escalated ${flagged.length} complaint(s)`);
    } catch (err) {
      console.error("SLA job failed:", err);
    } finally {
      running = false;
    }
  };

  run(); // once at startup, then on a timer
  const timer = setInterval(run, intervalMs);
  timer.unref(); // never keep the process alive just for this timer
  return () => clearInterval(timer);
}

module.exports = { escalateOverdue, startSlaJob };