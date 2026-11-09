const request = require("supertest");
const Complaint = require("../models/Complaint");
const { escalateOverdue } = require("../jobs/slaEscalation");
const { migrate } = require("../scripts/migrate-phase5");
const { toGeoPoint, SLA_HOURS } = require("../utils/workflow");
const { sleep, startTestServer, makeUser, connectSocket } = require("./helpers");

const HOUR = 3_600_000;
let server, admin, citizen, bystander;
const open = [];
let seq = 0;

beforeAll(async () => {
  server = await startTestServer();
  admin = await makeUser("Admin", "admin");
  citizen = await makeUser("Citizen");
  bystander = await makeUser("Bystander");
  await Complaint.init();
});
afterEach(() => open.splice(0).forEach((c) => c.socket.close()));
afterAll(() => server.stop());

const api = () => request(server.app);
const authed = (req, token) => req.set("Authorization", `Bearer ${token}`);
const fromDb = (id) => Complaint.findById(id).lean();
const ids = (items) => items.map((c) => String(c._id));

// inserts directly, so the test controls createdAt, dueAt and status
const insert = async (overrides = {}, { legacy = false } = {}) => {
  const now = Date.now();
  const doc = {
    user: citizen.user._id,
    title: `SLA test complaint ${++seq}`,
    description: "Inserted directly by the SLA test.",
    category: "Road",
    image: "",
    location: { lat: 23.8, lng: 91.2 },
    geo: toGeoPoint(23.8, 91.2),
    status: "Pending",
    statusHistory: [{ status: "Pending", by: citizen.user._id, at: new Date(now), note: "" }],
    resolvedAt: null,
    supportCount: 0,
    createdAt: new Date(now - 100 * HOUR),
    updatedAt: new Date(now - 100 * HOUR),
    dueAt: new Date(now - 10 * HOUR),
    escalatedAt: null,
    __v: 0,
    ...overrides,
  };
  if (legacy) {
    delete doc.dueAt; // complaints created before this phase have no target date
    delete doc.escalatedAt;
  }
  const { insertedId } = await Complaint.collection.insertOne(doc);
  return insertedId.toString();
};

const create = async (category) => {
  let req = authed(api().post("/api/complaints"), citizen.token);
  const fields = {
    title: "Deadline test complaint",
    description: "Checking the target date.",
    category,
    lat: "23.8",
    lng: "91.2",
  };
  for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
  return (await req).body._id;
};

const move = (id, status) => authed(api().put(`/api/complaints/${id}/status`), admin.token).send({ status });
const list = (query) =>
  authed(api().get("/api/complaints/list").query({ limit: 100, ...query }), admin.token);

describe("target dates", () => {
  test("a new complaint gets its deadline from its category's SLA", async () => {
    const before = Date.now();
    const road = await fromDb(await create("Road"));
    const garbage = await fromDb(await create("Garbage"));
    const after = Date.now();

    expect(road.dueAt.getTime()).toBeGreaterThanOrEqual(before + SLA_HOURS.Road * HOUR);
    expect(road.dueAt.getTime()).toBeLessThanOrEqual(after + SLA_HOURS.Road * HOUR);
    expect(garbage.dueAt.getTime()).toBeGreaterThanOrEqual(before + SLA_HOURS.Garbage * HOUR);
    expect(garbage.dueAt.getTime()).toBeLessThanOrEqual(after + SLA_HOURS.Garbage * HOUR);
    expect(road.escalatedAt).toBeNull();
  });

  test("a reopened complaint keeps its original deadline", async () => {
    const id = await create("Water");
    const original = (await fromDb(id)).dueAt;

    await move(id, "In Progress");
    await move(id, "Resolved");
    await move(id, "In Progress");

    expect((await fromDb(id)).dueAt).toEqual(original);
  });
});

describe("the escalation job", () => {
  test("flags only open, overdue, not-yet-flagged complaints, and only once", async () => {
    const overdue = await insert();
    const notDue = await insert({ dueAt: new Date(Date.now() + 10 * HOUR) });
    const resolved = await insert({ status: "Resolved", resolvedAt: new Date() });
    const flaggedBefore = new Date(Date.now() - 5 * HOUR);
    const alreadyFlagged = await insert({ escalatedAt: flaggedBefore });

    const first = ids(await escalateOverdue());
    expect(first).toContain(overdue);
    expect(first).not.toContain(notDue);
    expect(first).not.toContain(resolved);
    expect(first).not.toContain(alreadyFlagged);

    expect((await fromDb(overdue)).escalatedAt).toBeInstanceOf(Date);
    expect((await fromDb(notDue)).escalatedAt).toBeNull();
    expect((await fromDb(resolved)).escalatedAt).toBeNull();
    expect((await fromDb(alreadyFlagged)).escalatedAt).toEqual(flaggedBefore);

    const second = ids(await escalateOverdue());
    expect(second).not.toContain(overdue); // never flagged twice
  });

  test("flagging does not touch updatedAt", async () => {
    const id = await insert();
    const before = (await fromDb(id)).updatedAt;
    await escalateOverdue();
    expect((await fromDb(id)).updatedAt).toEqual(before);
  });

  test("two job runs at the same moment flag a complaint exactly once between them", async () => {
    const id = await insert();
    const [a, b] = await Promise.all([escalateOverdue(), escalateOverdue()]);

    const times = [...ids(a), ...ids(b)].filter((x) => x === id).length;
    expect(times).toBe(1);
  });

  test("admins get a live alert; other users hear nothing", async () => {
    const id = await insert({ title: "Most overdue complaint of all", dueAt: new Date(Date.now() - 1000 * HOUR) });
    const [adminSocket, citizenSocket, otherSocket] = await Promise.all([
      connectSocket(server.url, admin.token),
      connectSocket(server.url, citizen.token),
      connectSocket(server.url, bystander.token),
    ]);
    open.push(adminSocket, citizenSocket, otherSocket);

    await escalateOverdue({ io: server.app.get("io") });
    await sleep(400);

    expect(adminSocket.received).toHaveLength(1);
    expect(adminSocket.received[0].event).toBe("complaint:overdue");
    expect(adminSocket.received[0].payload.count).toBeGreaterThanOrEqual(1);
    expect(ids(adminSocket.received[0].payload.items)).toContain(id);
    expect(citizenSocket.received).toHaveLength(0);
    expect(otherSocket.received).toHaveLength(0);
  });
});

describe("overdue filter and stats", () => {
  test("the overdue filter returns open complaints past their deadline, and combines with status", async () => {
    const overdue = await insert();
    const notDue = await insert({ dueAt: new Date(Date.now() + 10 * HOUR) });
    const resolved = await insert({ status: "Resolved", resolvedAt: new Date() });

    const res = await list({ overdue: "true" });
    expect(res.status).toBe(200);
    expect(ids(res.body.items)).toContain(overdue);
    expect(ids(res.body.items)).not.toContain(notDue);
    expect(ids(res.body.items)).not.toContain(resolved);
    expect(res.body.items.every((c) => c.status !== "Resolved" && new Date(c.dueAt) < new Date())).toBe(true);

    expect((await list({ overdue: "true", status: "Resolved" })).body.total).toBe(0);
    expect(ids((await list({ overdue: "true", status: "Pending" })).body.items)).toContain(overdue);

    const all = ids((await list({ overdue: "false" })).body.items);
    expect(all).toEqual(expect.arrayContaining([overdue, notDue, resolved]));

    expect((await list({ overdue: "maybe" })).status).toBe(400);
  });

  test("stats report how many complaints are overdue right now", async () => {
    await insert();
    const expected = await Complaint.countDocuments({
      status: { $in: ["Pending", "In Progress"] },
      dueAt: { $lt: new Date() },
    });

    const res = await authed(api().get("/api/complaints/stats"), admin.token);
    expect(res.body.overdue).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });
});

describe("migration of old complaints", () => {
  test("adds target dates, pre-flags already-overdue ones, supports dry runs, and is safe to re-run", async () => {
    const now = Date.now();
    const oldOpen = await insert({ category: "Road", createdAt: new Date(now - 120 * HOUR) }, { legacy: true });
    const newOpen = await insert({ category: "Garbage", createdAt: new Date(now - 1 * HOUR) }, { legacy: true });
    const oldResolved = await insert(
      { category: "Water", status: "Resolved", resolvedAt: new Date(), createdAt: new Date(now - 240 * HOUR) },
      { legacy: true }
    );
    const quiet = { log: () => {} };

    const dry = await migrate({ dryRun: true, ...quiet });
    expect(dry).toMatchObject({ updated: 3, skipped: 0 });
    expect((await fromDb(oldOpen)).dueAt).toBeUndefined(); // a dry run writes nothing

    expect(await migrate(quiet)).toMatchObject({ updated: 3, skipped: 0 });

    const a = await fromDb(oldOpen);
    expect(a.dueAt.getTime()).toBe(a.createdAt.getTime() + SLA_HOURS.Road * HOUR);
    expect(a.escalatedAt).toBeInstanceOf(Date); // already overdue: pre-flagged so admins are not flooded

    const b = await fromDb(newOpen);
    expect(b.dueAt.getTime()).toBe(b.createdAt.getTime() + SLA_HOURS.Garbage * HOUR);
    expect(b.escalatedAt).toBeNull();

    const c = await fromDb(oldResolved);
    expect(c.dueAt.getTime()).toBe(c.createdAt.getTime() + SLA_HOURS.Water * HOUR);
    expect(c.escalatedAt).toBeNull(); // resolved complaints are never overdue

    expect((await migrate(quiet)).updated).toBe(0);
  });
});