const Complaint = require("../models/Complaint");
const streamUpload = require("../utils/cloudinaryUpload");
const AppError = require("../utils/AppError");
const complaintService = require("../services/complaintService");
const { toCitizenView } = complaintService;
const { notifyComplaint } = require("../socket/notify");
const { EVENTS } = require("../socket/events");

const notify = (req, event, complaint) =>
  notifyComplaint(req.app.get("io"), event, complaint._id, complaint.user).catch((err) =>
    console.error("Socket notify failed:", err)
  );

exports.createComplaint = async (req, res) => {
  const { title, description, category, lat, lng } = req.body;

  let image = "";
  if (req.file) {
    try {
      image = (await streamUpload(req.file.buffer)).secure_url;
    } catch (err) {
      console.error("Image upload failed:", err);
      throw new AppError(502, "Image upload failed, please try again");
    }
  }

  const complaint = await complaintService.create({
    user: req.user._id, // always the logged-in user, never a value from the request
    title, description, category, image, lat, lng,
  });

  notify(req, EVENTS.COMPLAINT_CREATED, complaint);
  res.status(201).json(complaint);
};

exports.getComplaints = async (req, res) => {
  const complaints = await Complaint.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();
  res.json(complaints.map(toCitizenView));
};

exports.getAllComplaintAdmin = async (req, res) => {
  res.json(await Complaint.find().populate("user", "name email").sort({ createdAt: -1 }));
};

exports.updateStatus = async (req, res) => {
  const complaint = await complaintService.changeStatus({
    id: req.params.id,
    to: req.body.status,
    adminId: req.user._id,
    note: req.body.note,
  });

  notify(req, EVENTS.COMPLAINT_UPDATED, complaint);
  res.json({ message: "Status updated", complaint });
};

exports.getNearby = async (req, res) => {
  res.json(await complaintService.findNearby(req.validatedQuery));
};

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