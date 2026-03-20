const Complaint = require("../models/Complaint");
const streamUpload = require("../utils/cloudinaryUpload");

const categories = ["Road", "Garbage", "Electricity", "Water", "Other"];
const statuses = ["Pending", "In Progress", "Resolved"];

// CREATE COMPLAINT
exports.createComplaint = async (req, res) => {
  try {
    const { title, description, category, lat, lng } = req.body;

    if (!title || !description || !category || !lat || !lng)
      return res.status(400).json({ message: "All fields are required" });

    if (!categories.includes(category))
      return res.status(400).json({ message: "Invalid category" });

    let imageUrl = "";
    if (req.file) {
      const result = await streamUpload(req.file.buffer);
      imageUrl = result.secure_url;
    }

    const complaint = await Complaint.create({
      user: req.user._id,
      title,
      description,
      category,
      image: imageUrl,
      location: { lat: Number(lat), lng: Number(lng) },
      status: "Pending",
    });

    const io = req.app.get("io");
    io.emit("newComplaint", complaint);

    res.status(201).json(complaint);
  } catch (err) {
    console.error("Error creating complaint:", err);
    res.status(500).json({ message: err.message });
  }
};

// GET USER COMPLAINTS
exports.getComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find({ user: req.user._id }).sort({
      createdAt: -1,
    });
    res.json(complaints);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET ALL COMPLAINTS (ADMIN)
exports.getAllComplaintAdmin = async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ message: "Access denied" });

    const complaints = await Complaint.find()
      .populate("user", "name email")
      .sort({ createdAt: -1 });

    res.json(complaints);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// UPDATE COMPLAINT STATUS (ADMIN)
exports.updateStatus = async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ message: "Access denied" });

    const { status } = req.body;
    if (!statuses.includes(status))
      return res.status(400).json({ message: "Invalid status" });

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint)
      return res.status(404).json({ message: "Complaint not found" });

    complaint.status = status;
    await complaint.save();

    const io = req.app.get("io");
    io.emit(`statusUpdate_${complaint.user}`, complaint);

    res.json({ message: "Status updated", complaint });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET ADMIN STATS — fixed: enum values are Title Case in schema
exports.getStats = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const [total, pending, inProgress, resolved, categoryCounts] =
      await Promise.all([
        Complaint.countDocuments(),
        Complaint.countDocuments({ status: "Pending" }),
        Complaint.countDocuments({ status: "In Progress" }),
        Complaint.countDocuments({ status: "Resolved" }),
        // Bonus: category breakdown for the new admin chart
        Complaint.aggregate([
          { $group: { _id: "$category", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]),
      ]);

    res.json({
      total,
      pending,
      inProgress,
      resolved,
      categoryCounts,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};