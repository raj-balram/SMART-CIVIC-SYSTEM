const env = require("../config/env"); // loads and validates .env
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const connectDB = require("../config/db");
const User = require("../models/User");
const Complaint = require("../models/Complaint");
const { toGeoPoint } = require("../utils/workflow");

// Safety: never seed a remote (production) database by accident
if (!/127\.0\.0\.1|localhost/.test(env.MONGO_URI) && process.env.ALLOW_REMOTE_SEED !== "1") {
  console.error("Refusing to seed a non-local database. MONGO_URI must point to localhost.");
  process.exit(1);
}

const COUNT = Number(process.env.SEED_COUNT || 300);
const CITY = { lat: 23.8315, lng: 91.2868 }; // Agartala (demo coordinates)
const DAY = 86_400_000;

// deterministic random numbers: every run produces the same data
let state = 42;
const rand = () => {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const weighted = (pairs) => {
  let r = rand();
  for (const [value, weight] of pairs) {
    if (r < weight) return value;
    r -= weight;
  }
  return pairs[pairs.length - 1][0];
};

// complaint clusters, so the heatmap shows real hotspots
const HOTSPOTS = [
  { lat: CITY.lat, lng: CITY.lng, spread: 0.004 },
  { lat: CITY.lat + 0.013, lng: CITY.lng - 0.007, spread: 0.003 },
  { lat: CITY.lat - 0.011, lng: CITY.lng + 0.013, spread: 0.003 },
  { lat: CITY.lat + 0.038, lng: CITY.lng - 0.017, spread: 0.006 },
  { lat: CITY.lat - 0.021, lng: CITY.lng - 0.027, spread: 0.01 },
];

const TEMPLATES = {
  Road: [
    ["Large pothole on main road", "A deep pothole has formed and two-wheelers are swerving to avoid it."],
    ["Broken road after rain", "The surface has collapsed near the junction and needs urgent repair."],
    ["Missing manhole cover", "An open manhole is a serious danger, especially at night."],
  ],
  Garbage: [
    ["Garbage not collected for days", "Waste has piled up on the corner and is attracting stray animals."],
    ["Overflowing public dustbin", "The bin is overflowing and the smell is spreading to nearby shops."],
    ["Illegal dumping near the drain", "People are dumping waste beside the drain, which is blocking the flow."],
  ],
  Electricity: [
    ["Street light not working", "The whole stretch has been dark for a week and feels unsafe."],
    ["Hanging electric wire", "A loose wire is hanging low over the footpath."],
    ["Frequent power cuts in the area", "Power goes out several times a day, mostly in the evenings."],
  ],
  Water: [
    ["Water pipe leakage", "Clean water is leaking from the main pipe and flooding the lane."],
    ["No water supply since morning", "Households in this block have had no water for over 24 hours."],
    ["Dirty water in taps", "The water is yellowish and smells bad. Please test the supply."],
  ],
  Other: [
    ["Stray dog menace", "A pack of stray dogs is chasing children near the school gate."],
    ["Encroachment on footpath", "Shops are using the whole footpath, forcing pedestrians onto the road."],
    ["Broken park bench and swings", "The playground equipment is damaged and unsafe for children."],
  ],
};

async function main() {
  await connectDB();

  // remove only previously seeded data (emails ending @civic.test)
  const old = await User.find({ email: /@civic\.test$/ }).select("_id");
  const oldIds = old.map((u) => u._id);
  await Complaint.deleteMany({ user: { $in: oldIds } });
  await User.deleteMany({ _id: { $in: oldIds } });

  const adminPassword = await bcrypt.hash("Admin@12345", 10);
  const citizenPassword = await bcrypt.hash("Citizen@12345", 10);

  const adminUser = await User.create({ name: "Demo Admin", email: "admin@civic.test", password: adminPassword, role: "admin" });
  const citizens = [];
  for (let i = 1; i <= 5; i++) {
    citizens.push(
      await User.create({ name: `Citizen ${i}`, email: `citizen${i}@civic.test`, password: citizenPassword })
    );
  }

    const now = Date.now();
  const docs = [];
  for (let i = 0; i < COUNT; i++) {
    const category = weighted([["Road", 0.3], ["Garbage", 0.25], ["Water", 0.2], ["Electricity", 0.15], ["Other", 0.1]]);
    const [title, description] = pick(TEMPLATES[category]);
    const spot = rand() < 0.8 ? pick(HOTSPOTS) : { ...CITY, spread: 0.02 };
    const lat = +(spot.lat + (rand() - 0.5) * 2 * spot.spread).toFixed(6);
    const lng = +(spot.lng + (rand() - 0.5) * 2 * spot.spread).toFixed(6);

    const owner = pick(citizens)._id;
    const createdAt = new Date(now - rand() * 60 * DAY);
    const status = weighted([["Pending", 0.4], ["In Progress", 0.3], ["Resolved", 0.3]]);
    let updatedAt = createdAt;
    if (status !== "Pending") {
      updatedAt = new Date(Math.min(now, createdAt.getTime() + (0.5 + rand() * 6) * DAY));
    }

    const statusHistory = [{ status: "Pending", by: owner, at: createdAt, note: "" }];
    if (status === "Resolved") {
      const midpoint = new Date((createdAt.getTime() + updatedAt.getTime()) / 2);
      statusHistory.push({ status: "In Progress", by: adminUser._id, at: midpoint, note: "" });
    }
    if (status !== "Pending") statusHistory.push({ status, by: adminUser._id, at: updatedAt, note: "" });

    docs.push({
      user: owner,
      title,
      description,
      category,
      image: "",
      location: { lat, lng },
      geo: toGeoPoint(lat, lng),
      status,
      statusHistory,
      resolvedAt: status === "Resolved" ? updatedAt : null,
      createdAt,
      updatedAt,
      __v: 0,
    });
  }
  // native insert so createdAt and updatedAt keep the dates above
  await Complaint.collection.insertMany(docs);

  const byStatus = docs.reduce((acc, d) => ({ ...acc, [d.status]: (acc[d.status] || 0) + 1 }), {});
  console.log(`Seeded ${docs.length} complaints`, byStatus);
  console.log("Admin:    admin@civic.test / Admin@12345");
  console.log("Citizens: citizen1@civic.test ... citizen5@civic.test / Citizen@12345");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});