const Complaint = require("../models/Complaint");
const streamUpload = require("../utils/cloudinaryUpload");
const AppError = require("../utils/AppError");
const { notifyComplaint } = require("../socket/notify");
const { EVENTS } = require("../socket/events");

// CREATE COMPLAINT (input already validated by the route)
exports.createComplaint = async (req, res) => {
  const { title, description, category, lat, lng } = req.body;

  let imageUrl = "";
  if (req.file) {
    try {
      imageUrl = (await streamUpload(req.file.buffer)).secure_url;
    } catch (err) {
      console.error("Image upload failed:", err);
      throw new AppError(502, "Image upload failed, please try again");
    }
  }

  const complaint = await Complaint.create({
    user: req.user._id, // always the logged-in user, never a value from the request
    title,
    description,
    category,
    image: imageUrl,
    location: { lat, lng },
    status: "Pending",
  });

  notifyComplaint(req.app.get("io"), EVENTS.COMPLAINT_CREATED, complaint._id, req.user._id).catch(
    (err) => console.error("Socket notify failed:", err)
  );

  res.status(201).json(complaint);
};

// GET MY COMPLAINTS
exports.getComplaints = async (req, res) => {
  res.json(await Complaint.find({ user: req.user._id }).sort({ createdAt: -1 }));
};

// GET ALL COMPLAINTS (admin only, enforced by the route)
exports.getAllComplaintAdmin = async (req, res) => {
  res.json(await Complaint.find().populate("user", "name email").sort({ createdAt: -1 }));
};

// UPDATE STATUS (admin only, enforced by the route)
exports.updateStatus = async (req, res) => {
  const complaint = await Complaint.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status },
    { returnDocument: "after" }
  );
  if (!complaint) throw new AppError(404, "Complaint not found");

  notifyComplaint(req.app.get("io"), EVENTS.COMPLAINT_UPDATED, complaint._id, complaint.user).catch(
    (err) => console.error("Socket notify failed:", err)
  );

  res.json({ message: "Status updated", complaint });
};

// ADMIN STATS (admin only, enforced by the route)
exports.getStats = async (req, res) => {
  const [total, pending, inProgress, resolved, categoryCounts] = await Promise.all([
    Complaint.countDocuments(),
    Complaint.countDocuments({ status: "Pending" }),
    Complaint.countDocuments({ status: "In Progress" }),
    Complaint.countDocuments({ status: "Resolved" }),
    Complaint.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
  ]);

  res.json({ total, pending, inProgress, resolved, categoryCounts });
};