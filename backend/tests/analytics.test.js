const request = require("supertest");
const Complaint = require("../models/Complaint");
const { toGeoPoint, SLA_HOURS } = require("../utils/workflow");
const { startTestServer, makeUser } = require("./helpers");

const HOUR = 3_600_000;
const STATUSES = ["Pending", "In Progress", "Resolved"];
const CATEGORIES = ["Road", "Garbage", "Electricity", "Water", "Other"];

// three areas: A has 370 complaints (so it gets clustered), B has 5, C has 80 open "Water" complaints
const A = { west: 75.9, south: 9.9, east: 76.2, north: 10.2 };
const B = { west: 79.9, south: 19.9, east: 80.1, north: 20.1 };

let server, admin, citizen, docs;
const now = Date.now();

const isOpen = (d) => d.status !== "Resolved";
const isOverdue = (d) => isOpen(d) && d.dueAt instanceof Date && d.dueAt.getTime() < Date.now();
const inBox = (d, b) =>
  d.location.lat >= b.south && d.location.lat <= b.north && d.location.lng >= b.west && d.location.lng <= b.east;

function build(i, overrides = {}) {
  const category = overrides.category ?? CATEGORIES[i % 5];
  const status = overrides.status ?? STATUSES[i % 3];
  const createdAt = new Date(now - (50 + i) * HOUR);
  const resolvedAt =
    status === "Resolved"
      ? new Date(Math.min(now - HOUR, createdAt.getTime() + (10 + (i % 7) * 20) * HOUR))
      : null;
  const location = overrides.location ?? { lat: 0, lng: 0 };
  return {
    user: citizen.user._id,
    title: `Generated complaint ${i}`,
    description: "Generated for the analytics tests.",
    category,
    image: "",
    location,
    geo: toGeoPoint(location.lat, location.lng),
    status,
    statusHistory: [{ status: "Pending", by: citizen.user._id, at: createdAt, note: "" }],
    resolvedAt,
    supportCount: 0,
    createdAt,
    updatedAt: resolvedAt || createdAt,
    dueAt: new Date(createdAt.getTime() + SLA_HOURS[category] * HOUR),
    escalatedAt: null,
    __v: 0,
    ...overrides,
  };
}

beforeAll(async () => {
  server = await startTestServer();
  admin = await makeUser("Admin", "admin");
  citizen = await makeUser("Citizen");
  await Complaint.init();

  docs = [];
  // area A: 350 complaints on a grid
  for (let i = 0; i < 350; i++) {
    docs.push(build(i, { location: { lat: 10.001 + (i % 35) * 0.001, lng: 76.001 + Math.floor(i / 35) * 0.004 } }));
  }
  // area A: 20 old open complaints that never got a deadline (created before the SLA feature)
  for (let i = 350; i < 370; i++) {
    const doc = build(i, { status: "Pending", location: { lat: 10.001 + (i % 35) * 0.001, lng: 76.041 } });
    delete doc.dueAt;
    delete doc.escalatedAt;
    docs.push(doc);
  }
  // area B: 5 complaints
  for (let i = 370; i < 375; i++) docs.push(build(i, { location: { lat: 20 + (i - 370) * 0.001, lng: 80 } }));
  // area C: a deliberate hotspot of 80 open Water complaints at one point
  for (let i = 375; i < 455; i++) {
    docs.push(build(i, { category: "Water", status: i % 2 ? "Pending" : "In Progress", location: { lat: 30, lng: 70 } }));
  }
  await Complaint.collection.insertMany(docs);
});
afterAll(() => server.stop());

const api = () => request(server.app);
const authed = (req, token) => req.set("Authorization", `Bearer ${token}`);
const mapQuery = (bbox, extra = {}, token = admin.token) =>
  authed(api().get("/api/complaints/map").query({ ...bbox, zoom: 12, ...extra }), token);

describe("map", () => {
  test("a few complaints in view come back as individual pins without heavy fields", async () => {
    const res = await mapQuery(B);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ mode: "points", total: 5 });
    expect(res.body.items).toHaveLength(5);
    const item = res.body.items[0];
    expect(item.user).toEqual(expect.objectContaining({ name: "Citizen" }));
    expect(item).not.toHaveProperty("statusHistory");
    expect(item).not.toHaveProperty("supporters");
  });

  test("many complaints in view become clusters whose counts add up, and finer at higher zoom", async () => {
    const expected = docs.filter((d) => inBox(d, A)).length;
    const coarse = await mapQuery(A, { zoom: 10 });

    expect(coarse.body.mode).toBe("clusters");
    expect(coarse.body.total).toBe(expected);
    expect(coarse.body.items.reduce((sum, c) => sum + c.count, 0)).toBe(expected);
    for (const c of coarse.body.items) {
      expect(c.lat).toBeGreaterThanOrEqual(A.south);
      expect(c.lat).toBeLessThanOrEqual(A.north);
      expect(c.lng).toBeGreaterThanOrEqual(A.west);
      expect(c.lng).toBeLessThanOrEqual(A.east);
    }

    const fine = await mapQuery(A, { zoom: 18 });
    expect(fine.body.items.length).toBeGreaterThan(coarse.body.items.length);
    expect(fine.body.items.reduce((sum, c) => sum + c.count, 0)).toBe(expected);
  });

  test("filters apply, and complaints without a deadline are never counted as overdue", async () => {
    const inA = docs.filter((d) => inBox(d, A));

    const resolved = await mapQuery(A, { status: "Resolved" });
    expect(resolved.body.total).toBe(inA.filter((d) => d.status === "Resolved").length);

    const expectedOverdue = inA.filter(isOverdue).length;
    expect(expectedOverdue).toBeGreaterThan(0);

    const overdueOnly = await mapQuery(A, { overdue: "true", zoom: 10 });
    expect(overdueOnly.body.total).toBe(expectedOverdue);

    // the cluster counters use an aggregation expression: the 20 old complaints must not leak in
    const clusters = await mapQuery(A, { zoom: 10 });
    expect(clusters.body.items.reduce((sum, c) => sum + c.overdue, 0)).toBe(expectedOverdue);
    expect(clusters.body.items.reduce((sum, c) => sum + c.open, 0)).toBe(inA.filter(isOpen).length);
  });

  test("an area with nothing in it returns an empty result", async () => {
    const res = await mapQuery({ west: -10, south: -10, east: -9, north: -9 });
    expect(res.body).toEqual({ mode: "points", total: 0, items: [] });
  });

  test("validation and access control", async () => {
    expect((await authed(api().get("/api/complaints/map"), admin.token)).status).toBe(400); // no box
    expect((await mapQuery({ west: 76.2, south: 9.9, east: 75.9, north: 10.2 })).status).toBe(400);
    expect((await mapQuery({ west: 75.9, south: 10.2, east: 76.2, north: 9.9 })).status).toBe(400);
    expect((await mapQuery(A, { zoom: 0 })).status).toBe(400);
    expect((await mapQuery(A, { zoom: 21 })).status).toBe(400);
    expect((await mapQuery(A, { status: "Done" })).status).toBe(400);
    expect((await mapQuery(A, {}, citizen.token)).status).toBe(403);
    expect((await api().get("/api/complaints/map").query({ ...A, zoom: 12 })).status).toBe(401);
  });
});

describe("analytics", () => {
  const expectedFor = (category) => {
    const list = docs.filter((d) => d.category === category);
    const resolved = list.filter((d) => d.status === "Resolved");
    const onTime = resolved.filter((d) => d.dueAt && d.resolvedAt <= d.dueAt).length;
    const avgMs = resolved.length
      ? resolved.reduce((sum, d) => sum + (d.resolvedAt - d.createdAt), 0) / resolved.length
      : null;
    return {
      category,
      total: list.length,
      open: list.filter(isOpen).length,
      resolved: resolved.length,
      overdue: list.filter(isOverdue).length,
      avgResolutionHours: avgMs == null ? null : Math.round((avgMs / HOUR) * 10) / 10,
      slaCompliancePct: resolved.length ? Math.round((onTime / resolved.length) * 100) : null,
    };
  };

  test("category performance matches an independent calculation", async () => {
    const res = await authed(api().get("/api/complaints/analytics"), admin.token);
    expect(res.status).toBe(200);

    for (const category of CATEGORIES) {
      const actual = res.body.categories.find((c) => c.category === category);
      const { avgResolutionHours, ...expected } = expectedFor(category);
      const { avgResolutionHours: actualAvg, ...actualRest } = actual;

      expect(actualRest).toEqual(expected);
      expect(actualAvg).toBeCloseTo(avgResolutionHours, 1);
    }
  });

  test("the busiest area is the planted hotspot, and hotspots are ordered", async () => {
    const res = await authed(api().get("/api/complaints/analytics"), admin.token);
    const { hotspots } = res.body;

    expect(hotspots.length).toBeGreaterThan(0);
    expect(hotspots.length).toBeLessThanOrEqual(5);
    expect(hotspots[0]).toMatchObject({ openCount: 80, topCategory: "Water", topCategoryCount: 80 });
    expect(hotspots[0].lat).toBeCloseTo(30, 4);
    expect(hotspots[0].lng).toBeCloseTo(70, 4);

    const counts = hotspots.map((h) => h.openCount);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  test("admin-only", async () => {
    expect((await authed(api().get("/api/complaints/analytics"), citizen.token)).status).toBe(403);
    expect((await api().get("/api/complaints/analytics")).status).toBe(401);
  });
});