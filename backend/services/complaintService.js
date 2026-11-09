const Complaint = require("../models/Complaint");
const AppError = require("../utils/AppError");
const { allowedFrom, toGeoPoint } = require("../utils/workflow");

const TIMEZONE = "Asia/Kolkata"; // the city this app serves: statistics days follow it
const DAY_MS = 24 * 60 * 60 * 1000;
const dayLabel = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(date); // YYYY-MM-DD

// every sort ends with _id, so two complaints created at the same instant keep a stable order
const SORT_ORDERS = {
  newest: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  status: { status: 1, createdAt: -1, _id: -1 },
  support: { supportCount: -1, createdAt: -1, _id: -1 },
};

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
// point for `to`, so concurrent admins cannot both succeed.
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

  const current = await Complaint.findById(id).select("status").lean();
  if (!current) throw new AppError(404, "Complaint not found");
  throw new AppError(
    409,
    current.status === to
      ? `Complaint is already ${to}`
      : `Cannot move a complaint from ${current.status} to ${to}`
  );
}

// "Me too". ONE atomic write: the filter only matches if the user is not already a supporter,
// so the counter can never be incremented twice for the same person, however many requests arrive.
async function addSupport({ id, userId }) {
  const updated = await Complaint.findOneAndUpdate(
    { _id: id, status: { $ne: "Resolved" }, user: { $ne: userId }, supporters: { $ne: userId } },
    { $addToSet: { supporters: userId }, $inc: { supportCount: 1 } },
    { returnDocument: "after" }
  );
  if (updated) {
    return {
      supportCount: updated.supportCount,
      supportedByMe: true,
      changed: true,
      complaint: { _id: updated._id, title: updated.title, user: updated.user, supportCount: updated.supportCount },
    };
  }
  return supportMiss({ id, userId, adding: true });
}

async function removeSupport({ id, userId }) {
  const updated = await Complaint.findOneAndUpdate(
    { _id: id, supporters: userId },
    { $pull: { supporters: userId }, $inc: { supportCount: -1 } },
    { returnDocument: "after" }
  );
  if (updated) return { supportCount: updated.supportCount, supportedByMe: false, changed: true };
  return supportMiss({ id, userId, adding: false });
}

// The atomic write did not match: work out why, and make repeated requests harmless.
async function supportMiss({ id, userId, adding }) {
  const current = await Complaint.findById(id).select("status user supportCount").lean();
  if (!current) throw new AppError(404, "Complaint not found");

  const supports = Boolean(await Complaint.exists({ _id: id, supporters: userId }));
  const result = { supportCount: current.supportCount ?? 0, supportedByMe: supports, changed: false };

  if (adding) {
    if (String(current.user) === String(userId)) throw new AppError(400, "You cannot support your own complaint");
    if (current.status === "Resolved") throw new AppError(409, "This complaint is already resolved");
    if (supports) return result; // already supporting: repeating the request is harmless
  } else if (!supports) {
    return result; // nothing to remove
  }
  throw new AppError(409, "Please try again");
}

// Open complaints near a point, nearest first. Non-identifying fields only,
// plus what the viewer needs to act on them.
async function findNearby({ lat, lng, radius, category }, viewerId) {
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
        supportCount: { $ifNull: ["$supportCount", 0] },
        supportedByMe: { $in: [viewerId, { $ifNull: ["$supporters", []] }] },
        isMine: { $eq: ["$user", viewerId] },
      },
    },
  ]);
}

// One page of complaints for the admin dashboard: the database filters, searches, sorts and pages.
async function listForAdmin({ page, limit, status, category, q, sort }) {
  const filter = {};
  if (status) filter.status = status;
  if (category) filter.category = category;
  if (q) filter.$text = { $search: q }; // uses the text index

  const [items, total] = await Promise.all([
    Complaint.find(filter)
      .populate("user", "name email")
      .sort(SORT_ORDERS[sort])
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Complaint.countDocuments(filter),
  ]);

  return { items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

// Dashboard numbers. Each aggregation starts with an indexed $match or a covered $group,
// and they run in parallel.
async function getStats() {
  const now = Date.now();
  const since = new Date(now - 31 * DAY_MS);

  const perDay = (field) => [
    { $match: { [field]: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: `$${field}`, timezone: TIMEZONE } },
        count: { $sum: 1 },
      },
    },
  ];

  const [byStatus, categoryCounts, resolution, created, resolved] = await Promise.all([
    Complaint.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Complaint.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Complaint.aggregate([
      { $match: { status: "Resolved", resolvedAt: { $type: "date" } } },
      { $group: { _id: null, avgMs: { $avg: { $subtract: ["$resolvedAt", "$createdAt"] } } } },
    ]),
    Complaint.aggregate(perDay("createdAt")),
    Complaint.aggregate(perDay("resolvedAt")),
  ]);

  const countOf = (status) => byStatus.find((s) => s._id === status)?.count ?? 0;
  const pending = countOf("Pending");
  const inProgress = countOf("In Progress");
  const resolvedCount = countOf("Resolved");

  const createdByDay = new Map(created.map((d) => [d._id, d.count]));
  const resolvedByDay = new Map(resolved.map((d) => [d._id, d.count]));
  const trend = [];
  for (let i = 29; i >= 0; i--) {
    const date = dayLabel(new Date(now - i * DAY_MS)); // oldest day first; days without data are zero
    trend.push({ date, created: createdByDay.get(date) ?? 0, resolved: resolvedByDay.get(date) ?? 0 });
  }

  const avgMs = resolution[0]?.avgMs;
  return {
    total: pending + inProgress + resolvedCount,
    pending,
    inProgress,
    resolved: resolvedCount,
    categoryCounts,
    avgResolutionHours: avgMs == null ? null : Math.round((avgMs / 3_600_000) * 10) / 10,
    trend,
  };
}

// What a citizen may see: no admin identities, and never the list of supporters.
function toCitizenView(complaint) {
  const obj = typeof complaint.toObject === "function" ? complaint.toObject() : { ...complaint };
  delete obj.supporters;
  if (Array.isArray(obj.statusHistory)) {
    obj.statusHistory = obj.statusHistory.map(({ by, ...rest }) => rest);
  }
  return obj;
}

module.exports = {
  create,
  changeStatus,
  addSupport,
  removeSupport,
  findNearby,
  listForAdmin,
  getStats,
  toCitizenView,
};