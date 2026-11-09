const mongoose = require("mongoose");
const { CATEGORIES, STATUSES } = require("../utils/workflow");

const historySchema = new mongoose.Schema(
  {
    status: { type: String, enum: STATUSES, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // null for migrated old entries
    at: { type: Date, default: Date.now },
    note: { type: String, trim: true, maxlength: 200, default: "" },
  },
  { _id: false }
);

const complaintSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    category: { type: String, enum: CATEGORIES, required: true },
    image: { type: String, default: "" },

    // kept as-is because the frontend reads it
    location: {
      lat: { type: Number, required: true, min: -90, max: 90 },
      lng: { type: Number, required: true, min: -180, max: 180 },
    },
    // the same point as GeoJSON ([longitude, latitude]) for geo queries
    geo: {
      type: { type: String, enum: ["Point"] },
      coordinates: { type: [Number], default: undefined },
    },

    status: { type: String, enum: STATUSES, default: "Pending" },
    statusHistory: { type: [historySchema], default: [] },
    resolvedAt: { type: Date, default: null },
        // "me too" support: who supports it (never sent to clients) and how many
    supporters: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
      select: false,
    },
    supportCount: { type: Number, default: 0, min: 0 },
    dueAt: { type: Date, default: null }, // target date to resolve it, from the category's SLA
    escalatedAt: { type: Date, default: null }, // when the system first flagged it as overdue
  },
  { timestamps: true }
);

complaintSchema.index({ user: 1, createdAt: -1 }); // "my complaints", newest first
complaintSchema.index({ status: 1, createdAt: -1, _id: -1 }); // admin list by status; _id makes paging stable without an in-memory sort
complaintSchema.index({ category: 1, status: 1 }); // category filters and analytics
complaintSchema.index({ createdAt: -1, _id: -1 }); // unfiltered admin list
complaintSchema.index({ resolvedAt: 1 }); // resolution statistics
complaintSchema.index({ geo: "2dsphere" }); // nearby search
complaintSchema.index(
  { title: "text", description: "text" },
  { weights: { title: 5, description: 1 }, name: "complaint_text" } // title matches count more
);
complaintSchema.index({ supportCount: -1, createdAt: -1, _id: -1 }); // "most supported" sort
complaintSchema.index({ status: 1, dueAt: 1 }); // overdue queries and the SLA job


module.exports = mongoose.model("Complaint", complaintSchema);