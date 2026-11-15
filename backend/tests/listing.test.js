const request = require("supertest");
const Complaint = require("../models/Complaint");
const { toGeoPoint } = require("../utils/workflow");
const { startTestServer, makeUser } = require("./helpers");

const COUNT = 45;
const HOUR = 3_600_000;
const STATUSES = ["Pending", "In Progress", "Resolved"];
const CATEGORIES = ["Road", "Garbage", "Electricity", "Water", "Other"];

let server, admin, citizen, docs;

beforeAll(async () => {
  server = await startTestServer();
  admin = await makeUser("Admin", "admin");
  citizen = await makeUser("Citizen");
  await Complaint.init(); // build the indexes, including the text index

  // 45 complaints: statuses and categories cycle, one new complaint per hour going back
  const now = Date.now();
  docs = Array.from({ length: COUNT }, (_, i) => {
    const status = STATUSES[i % 3];
    const createdAt = new Date(now - i * HOUR);
    const resolvedAt =
      status === "Resolved" ? new Date(Math.min(now, createdAt.getTime() + (2 + (i % 4)) * HOUR)) : null;
    return {
      user: citizen.user._id,
      title: i % 9 === 0 ? `Broken streetlight number ${i}` : `Pothole report number ${i}`,
      description: "Detailed description of the problem.",
      category: CATEGORIES[i % 5],
      image: "",
      location: { lat: 23.8, lng: 91.2 },
      geo: toGeoPoint(23.8, 91.2),
      status,
      statusHistory: [{ status: "Pending", by: citizen.user._id, at: createdAt, note: "" }],
      resolvedAt,
      createdAt,
      updatedAt: resolvedAt || createdAt,
      __v: 0,
    };
  });
  await Complaint.collection.insertMany(docs); // the driver adds an _id to each object
});
afterAll(() => server.stop());

const get = (path, query, token = admin.token) =>
  request(server.app).get(path).set("Authorization", `Bearer ${token}`).query(query);
const list = (query, token) => get("/api/complaints/list", query, token);
const count = (predicate) => docs.filter(predicate).length;

describe("pagination", () => {
  test("pages through every complaint exactly once, newest first", async () => {
    const seen = [];
    const sizes = [];
    for (let page = 1; page <= 5; page++) {
      const res = await list({ page, limit: 10 });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ page, limit: 10, total: COUNT, totalPages: 5 });
      sizes.push(res.body.items.length);
      seen.push(...res.body.items);
    }

    expect(sizes).toEqual([10, 10, 10, 10, 5]);
    expect(new Set(seen.map((c) => c._id)).size).toBe(COUNT); // no duplicates, nothing missing
    expect(seen[0]._id).toBe(String(docs[0]._id)); // docs[0] is the newest

    const times = seen.map((c) => new Date(c.createdAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);

    const beyond = await list({ page: 6, limit: 10 });
    expect(beyond.body.items).toEqual([]);
    expect(beyond.body.total).toBe(COUNT);
  });

  test("defaults to page 1 with 20 items and includes the reporter's name and email", async () => {
    const res = await list({});
    expect(res.body).toMatchObject({ page: 1, limit: 20, total: COUNT, totalPages: 3 });
    expect(res.body.items).toHaveLength(20);
    expect(res.body.items[0].user).toEqual(expect.objectContaining({ name: "Citizen" }));
  });
});

describe("filters and sorting", () => {
  test("filters by status, by category and by both", async () => {
    const pending = await list({ status: "Pending", limit: 100 });
    expect(pending.body.total).toBe(count((d) => d.status === "Pending"));
    expect(pending.body.items.every((c) => c.status === "Pending")).toBe(true);

    expect((await list({ category: "Road", limit: 100 })).body.total).toBe(count((d) => d.category === "Road"));

    const both = await list({ status: "Resolved", category: "Water", limit: 100 });
    expect(both.body.total).toBe(count((d) => d.status === "Resolved" && d.category === "Water"));
    expect(both.body.items.every((c) => c.status === "Resolved" && c.category === "Water")).toBe(true);
  });

  test("sorts oldest first and by status", async () => {
    const oldest = await list({ sort: "oldest", limit: 100 });
    expect(oldest.body.items[0]._id).toBe(String(docs[COUNT - 1]._id));

    const byStatus = await list({ sort: "status", limit: 100 });
    const order = byStatus.body.items.map((c) => c.status);
    expect(order).toEqual([...order].sort()); // "In Progress" < "Pending" < "Resolved"
  });
});

describe("search", () => {
  test("finds whole words ignoring case, and combines with filters", async () => {
    expect((await list({ q: "streetlight", limit: 100 })).body.total).toBe(5);
    expect((await list({ q: "STREETLIGHT", limit: 100 })).body.total).toBe(5);
    expect((await list({ q: "pothole", limit: 100 })).body.total).toBe(COUNT - 5);
    expect((await list({ q: "streetlight", status: "Pending" })).body.total).toBe(5);
    expect((await list({ q: "streetlight", status: "Resolved" })).body.total).toBe(0);
    expect((await list({ q: "nothingmatchesthis" })).body.total).toBe(0);
  });
});

describe("access and validation", () => {
  test("citizens get 403 and anonymous requests get 401", async () => {
    expect((await list({}, citizen.token)).status).toBe(403);
    expect((await request(server.app).get("/api/complaints/list")).status).toBe(401);
  });

  test.each([
    ["limit above 100", { limit: 101 }],
    ["page 0", { page: 0 }],
    ["page that is not a number", { page: "abc" }],
    ["search of one character", { q: "a" }],
    ["unknown sort", { sort: "random" }],
    ["unknown status", { status: "Done" }],
    ["unknown category", { category: "Parks" }],
  ])("rejects %s", async (label, query) => {
    expect((await list(query)).status).toBe(400);
  });
});

describe("statistics", () => {
  test("totals, categories, average resolution time and a zero-filled 30-day trend", async () => {
    const res = await get("/api/complaints/stats");
    expect(res.status).toBe(200);
    const s = res.body;

    expect(s).toMatchObject({ total: COUNT, pending: 15, inProgress: 15, resolved: 15 });
    expect(s.categoryCounts).toHaveLength(5);
    expect(s.categoryCounts.reduce((sum, c) => sum + c.count, 0)).toBe(COUNT);

    const resolvedDocs = docs.filter((d) => d.resolvedAt);
    const avgHours =
      resolvedDocs.reduce((sum, d) => sum + (d.resolvedAt - d.createdAt), 0) / resolvedDocs.length / HOUR;
    expect(s.avgResolutionHours).toBeCloseTo(avgHours, 0);

    expect(s.trend).toHaveLength(30);
    const dates = s.trend.map((d) => d.date);
    expect(new Set(dates).size).toBe(30);
    expect([...dates].sort()).toEqual(dates); // oldest day first
    expect(s.trend.reduce((sum, d) => sum + d.created, 0)).toBe(COUNT);
    expect(s.trend.reduce((sum, d) => sum + d.resolved, 0)).toBe(15);

    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    expect(dates[dates.length - 1]).toBe(today);
  });

  test("stats are admin-only", async () => {
    expect((await get("/api/complaints/stats", {}, citizen.token)).status).toBe(403);
  });
});

describe("index usage", () => {
  test("the admin list query uses an index and needs no in-memory sort", async () => {
    const explain = await Complaint.find({ status: "Pending" })
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .explain("queryPlanner");
    const plan = JSON.stringify(explain.queryPlanner.winningPlan);

    expect(plan).toContain("IXSCAN");
    expect(plan).not.toContain('"stage":"SORT"');
  });
});