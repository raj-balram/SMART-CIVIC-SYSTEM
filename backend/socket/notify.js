const Complaint = require("../models/Complaint");
const { EVENTS, rooms } = require("./events");
const { toCitizenView } = require("../services/complaintService");

async function notifyComplaint(io, event, complaintId, ownerId) {
  if (!io) return;
  const full = await Complaint.findById(complaintId).populate("user", "name email").lean();
  if (!full) return;

  io.to(rooms.admin).emit(event, full);
  // .except(admin): an owner who is also an admin must not receive the event twice
  io.to(rooms.user(ownerId)).except(rooms.admin).emit(event, toCitizenView(full));
}

// only the count is sent, never who supports a complaint
function notifySupport(io, complaint) {
  if (!io) return;
  io.to(rooms.admin).to(rooms.user(complaint.user)).emit(EVENTS.COMPLAINT_SUPPORTED, {
    _id: complaint._id,
    title: complaint.title,
    supportCount: complaint.supportCount,
  });
}

module.exports = { notifyComplaint, notifySupport };