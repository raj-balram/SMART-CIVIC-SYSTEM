const Complaint = require("../models/Complaint");
const AppError = require("../utils/AppError");
const { allowedFrom, toGeoPoint } = require("../utils/workflow");

async function create({ user, title, description, category, image, lat, lng }) {
  return Complaint.create({
    user,
    title,
    description,
    category,
    image,
    location: { lat, lng },
    geo: toGeoPoint(lat, lng),
    status: "Pending",
    statusHistory: [{ status: "Pending", by: user, at: new Date(), note: "" }],
    resolvedAt: null,
  });
}

// ONE atomic operation: the status changes only if it is currently a valid starting
// point for `to`. The check and the write cannot be separated, so concurrent admins
// cannot both succeed.
async function changeStatus({ id, to, adminId, note }) {
  const now = new Date();
  const updated = await Complaint.findOneAndUpdate(
    { _id: id, status: { $in: allowedFrom(to) } },
    {
      $set: { status: to, resolvedAt: to === "Resolved" ? now : null },
      $push: { statusHistory: { status: to, by: adminId, at: now, note: note || "" } },
    },
    { returnDocument: "after" }
  );
  if (updated) return updated;

  // we did not win: work out why, so the admin gets a useful message
  const current = await Complaint.findById(id).select("status").lean();
  if (!current) throw new AppError(404, "Complaint not found");
  throw new AppError(
    409,
    current.status === to
      ? `Complaint is already ${to}`
      : `Cannot move a complaint from ${current.status} to ${to}`
  );
}

// Open complaints near a point, nearest first. Returns only non-identifying fields.
async function findNearby({ lat, lng, radius, category }) {
  const query = { status: { $ne: "Resolved" } };
  if (category) query.category = category;

  return Complaint.aggregate([
    {
      $geoNear: {
        near: { type: "Point", coordinates: [lng, lat] },
        distanceField: "distanceMeters",
        maxDistance: radius,
        spherical: true,
        query,
      },
    },
    { $limit: 20 },
    {
      $project: {
        title: 1,
        category: 1,
        status: 1,
        location: 1,
        createdAt: 1,
        distanceMeters: { $round: ["$distanceMeters", 0] },
      },
    },
  ]);
}

// What a citizen may see: everything except which admin made each change.
function toCitizenView(complaint) {
  const obj = typeof complaint.toObject === "function" ? complaint.toObject() : { ...complaint };
  if (Array.isArray(obj.statusHistory)) {
    obj.statusHistory = obj.statusHistory.map(({ by, ...rest }) => rest);
  }
  return obj;
}

module.exports = { create, changeStatus, findNearby, toCitizenView };