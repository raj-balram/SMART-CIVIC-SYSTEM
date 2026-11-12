const Complaint = require("../models/Complaint");
const streamUpload = require("../utils/cloudinaryUpload");
const AppError = require("../utils/AppError");
const complaintService = require("../services/complaintService");
const { toCitizenView } = complaintService;
const { notifyComplaint, notifySupport } = require("../socket/notify");
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
  res.status(201).json(toCitizenView(complaint));
};

// my complaints (capped so the response can never grow without limit)
exports.getComplaints = async (req, res) => {
  const complaints = await Complaint.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(500).lean();
  res.json(complaints.map(toCitizenView));
};


// the dashboard table: paginated, filtered, searched and sorted by the database
exports.listComplaints = async (req, res) => {
  res.json(await complaintService.listForAdmin(req.validatedQuery));
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
  res.json(await complaintService.findNearby(req.validatedQuery, req.user._id));
};

exports.supportComplaint = async (req, res) => {
  const result = await complaintService.addSupport({ id: req.params.id, userId: req.user._id });
  if (result.changed) notifySupport(req.app.get("io"), result.complaint);
  res.json({ supportCount: result.supportCount, supportedByMe: result.supportedByMe });
};

exports.unsupportComplaint = async (req, res) => {
  const result = await complaintService.removeSupport({ id: req.params.id, userId: req.user._id });
  if (result.changed) {
    const complaint = await Complaint.findById(req.params.id)
    .select("_id title user supportCount")
    .lean();

    if (complaint) {
      notifySupport(req.app.get("io"), complaint);
    }

}
  res.json({ supportCount: result.supportCount, supportedByMe: result.supportedByMe });
};

exports.getStats = async (req, res) => {
  res.json(await complaintService.getStats());
};

exports.getMap = async (req, res) => {
  res.json(await complaintService.mapComplaints(req.validatedQuery));
};

exports.getAnalytics = async (req, res) => {
  res.json(await complaintService.getAnalytics());
};