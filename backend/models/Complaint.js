const mongoose = require("mongoose");

const complaintSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: {
      type: String,
      enum: ["Road", "Garbage", "Electricity", "Water", "Other"],
      required: true,
    },
    image: String,
    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    // ✅ Fixed: all values now Title Case to match controller + frontend
    status: {
      type: String,
      enum: ["Pending", "In Progress", "Resolved"],
      default: "Pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Complaint", complaintSchema);