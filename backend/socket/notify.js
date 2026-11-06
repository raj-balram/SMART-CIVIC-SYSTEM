const Complaint = require("../models/Complaint");
const { rooms } = require("./events");

// Sends a complaint event ONLY to admins and to the complaint's owner.
async function notifyComplaint(io, event, complaintId, ownerId) {
  if (!io) return;
  const payload = await Complaint.findById(complaintId).populate("user", "name email").lean();
  if (!payload) return;
  io.to(rooms.admin).to(rooms.user(ownerId)).emit(event, payload);
}

module.exports = { notifyComplaint };