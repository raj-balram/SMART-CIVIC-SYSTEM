const request = require("supertest");
const Complaint = require("../models/Complaint");
const { migrate } = require("../scripts/migrate-phase3");
const { sleep, startTestServer, makeUser, connectSocket } = require("./helpers");

let server, admin, citizen, other;
const open = [];

beforeAll(async () => {
  server = await startTestServer();
  admin = await makeUser("Admin", "admin");
  citizen = await makeUser("Citizen");
  other = await makeUser("Other Citizen");
});
afterEach(() => open.splice(0).forEach((c) => c.socket.close()));
afterAll(() => server.stop());

const api = () => request(server.app);
const authed = (req, token) => req.set("Authorization", `Bearer ${token}`);
const fromDb = (id) => Complaint.findById(id).lean();

const create = (token, overrides = {}) => {
  const fields = {
    title: "Pothole near the market",
    description: "A deep pothole near the market entrance.",
    category: "Road",
    lat: "23.8315",
    lng: "91.2868",
    ...overrides,
  };
  let req = authed(api().post("/api/complaints"), token);
  for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
  return req;
};

const setStatus = (id, status, note, token = admin.token) =>
  authed(api().put(`/api/complaints/${id}/status`), token).send(note === undefined ? { status } : { status, note });

describe("workflow", () => {
  test("a new complaint starts Pending with one history entry and a GeoJSON point (longitude first)", async () => {
    const doc = await fromDb((await create(citizen.token)).body._id);

    expect(doc.geo).toEqual({ type: "Point", coordinates: [91.2868, 23.8315] });
    expect(doc.statusHistory).toHaveLength(1);
    expect(doc.statusHistory[0]).toMatchObject({ status: "Pending", note: "" });
    expect(String(doc.statusHistory[0].by)).toBe(citizen.user._id.toString());
    expect(doc.resolvedAt).toBeNull();
  });

  test("Pending -> In Progress -> Resolved -> reopened records history, notes and resolvedAt", async () => {
    const id = (await create(citizen.token)).body._id;

    expect((await setStatus(id, "In Progress", "Crew dispatched")).status).toBe(200);
    expect((await setStatus(id, "Resolved", "Road repaired")).status).toBe(200);

    let doc = await fromDb(id);
    expect(doc.status).toBe("Resolved");
    expect(doc.resolvedAt).toBeInstanceOf(Date);
    expect(doc.statusHistory.map((h) => h.status)).toEqual(["Pending", "In Progress", "Resolved"]);
    expect(doc.statusHistory.map((h) => h.note)).toEqual(["", "Crew dispatched", "Road repaired"]);
    expect(String(doc.statusHistory[1].by)).toBe(admin.user._id.toString());

    expect((await setStatus(id, "In Progress", "Reopened after a new report")).status).toBe(200);
    doc = await fromDb(id);
    expect(doc.resolvedAt).toBeNull();
    expect(doc.statusHistory).toHaveLength(4);
  });

  test("invalid moves return 409 and change nothing", async () => {
    const id = (await create(citizen.token)).body._id;

    const skip = await setStatus(id, "Resolved");
    expect(skip.status).toBe(409);
    expect(skip.body.message).toBe("Cannot move a complaint from Pending to Resolved");

    const same = await setStatus(id, "Pending");
    expect(same.status).toBe(409);
    expect(same.body.message).toBe("Complaint is already Pending");

    const doc = await fromDb(id);
    expect(doc.status).toBe("Pending");
    expect(doc.statusHistory).toHaveLength(1);
  });

  test("input errors: unknown id 404, malformed id 400, bad status 400, long note 400, citizen 403", async () => {
    const id = (await create(citizen.token)).body._id;

    expect((await setStatus("64b7f0c2a3d4e5f607182930", "In Progress")).status).toBe(404);
    expect((await setStatus("abc", "In Progress")).status).toBe(400);
    expect((await setStatus(id, "Done")).status).toBe(400);
    expect((await setStatus(id, "In Progress", "x".repeat(201))).status).toBe(400);
    expect((await setStatus(id, "In Progress", "fine", citizen.token)).status).toBe(403);
  });

  test("20 admins pressing the same button at once: exactly one wins", async () => {
    const id = (await create(citizen.token)).body._id;

    const responses = await Promise.all(Array.from({ length: 20 }, () => setStatus(id, "In Progress")));
    const codes = responses.map((r) => r.status);

    expect(codes.filter((c) => c === 200)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(19);
    expect((await fromDb(id)).statusHistory).toHaveLength(2); // creation + one change
  });

  test("two admins pushing different outcomes at once: only one wins and history stays consistent", async () => {
    const id = (await create(citizen.token)).body._id;
    await setStatus(id, "In Progress");

    const [toResolved, toPending] = await Promise.all([setStatus(id, "Resolved"), setStatus(id, "Pending")]);
    expect([toResolved.status, toPending.status].sort()).toEqual([200, 409]);

    const doc = await fromDb(id);
    expect(doc.status).toBe(toResolved.status === 200 ? "Resolved" : "Pending");
    expect(doc.statusHistory).toHaveLength(3);
  });
});

describe("privacy", () => {
  test("citizens never see which admin changed a status (REST), admins do", async () => {
    const id = (await create(citizen.token)).body._id;
    await setStatus(id, "In Progress", "On it");

    const mine = await authed(api().get("/api/complaints"), citizen.token);
    const own = mine.body.find((c) => c._id === id);
    expect(own.statusHistory).toHaveLength(2);
    expect(own.statusHistory[1].note).toBe("On it");
    for (const entry of own.statusHistory) expect(entry).not.toHaveProperty("by");

    const all = await authed(api().get("/api/complaints/list"), admin.token);
    const adminView = all.body.items.find((c) => c._id === id);
    expect(adminView.statusHistory[1].by).toBe(admin.user._id.toString());
  });

  test("the same holds for live socket events", async () => {
    const id = (await create(citizen.token)).body._id;
    const owner = await connectSocket(server.url, citizen.token);
    const adminSocket = await connectSocket(server.url, admin.token);
    open.push(owner, adminSocket);

    await setStatus(id, "In Progress", "On it");
    await sleep(400);

    expect(owner.received).toHaveLength(1);
    for (const entry of owner.received[0].payload.statusHistory) expect(entry).not.toHaveProperty("by");
    expect(adminSocket.received).toHaveLength(1);
    expect(adminSocket.received[0].payload.statusHistory[1].by).toBeDefined();
  });
});

describe("indexes", () => {
  test("the compound, geo, resolution and text indexes exist", async () => {
    await Complaint.init(); // wait until the indexes are built
    const indexes = await Complaint.collection.indexes();
    const keys = indexes.map((i) => JSON.stringify(i.key));

    expect(keys).toEqual(
      expect.arrayContaining([
        JSON.stringify({ user: 1, createdAt: -1 }),
        JSON.stringify({ status: 1, createdAt: -1, _id: -1 }),
        JSON.stringify({ category: 1, status: 1 }),
        JSON.stringify({ createdAt: -1, _id: -1 }),
        JSON.stringify({ resolvedAt: 1 }),
        JSON.stringify({ geo: "2dsphere" }),
      ])
    );
    expect(indexes.some((i) => i.name === "complaint_text")).toBe(true);
  });
});

describe("nearby search", () => {
  // placed far away from the other tests' complaints so results are predictable
  let near, otherCategory, close, far, resolved;

  beforeAll(async () => {
    const make = async (overrides) => (await create(citizen.token, overrides)).body._id;
    near = await make({ title: "Pothole at the junction", lat: "10.0", lng: "76.0" });
    otherCategory = await make({ title: "Garbage nearby", category: "Garbage", lat: "10.0002", lng: "76.0" }); // ~22 m
    close = await make({ title: "Another pothole close by", lat: "10.0009", lng: "76.0" }); // ~100 m
    far = await make({ title: "Pothole far away", lat: "10.018", lng: "76.0" }); // ~2 km
    resolved = await make({ title: "Fixed pothole nearby", lat: "10.0001", lng: "76.0" });
    await setStatus(resolved, "In Progress");
    await setStatus(resolved, "Resolved");
  });

  const nearby = (query, token = other.token) => authed(api().get("/api/complaints/nearby"), token).query(query);

  test("returns open complaints inside the radius, nearest first, without resolved or far ones", async () => {
    const res = await nearby({ lat: 10, lng: 76, radius: 300 });

    expect(res.status).toBe(200);
    expect(res.body.map((r) => r._id)).toEqual([near, otherCategory, close]);
    expect(res.body.map((r) => r._id)).not.toContain(far);
    expect(res.body.map((r) => r._id)).not.toContain(resolved);

    const closeResult = res.body.find((r) => r._id === close);
    expect(closeResult.distanceMeters).toBeGreaterThan(80);
    expect(closeResult.distanceMeters).toBeLessThan(120);
  });

  test("exposes only non-identifying fields", async () => {
    const res = await nearby({ lat: 10, lng: 76, radius: 300 });
    expect(Object.keys(res.body[0]).sort()).toEqual([
      "_id", "category", "createdAt", "distanceMeters", "isMine",
      "location", "status", "supportCount", "supportedByMe", "title",
    ]);
  });

  test("can filter by category", async () => {
    const res = await nearby({ lat: 10, lng: 76, radius: 300, category: "Garbage" });
    expect(res.body.map((r) => r._id)).toEqual([otherCategory]);
  });

  test("validates its input and requires login", async () => {
    expect((await nearby({ lng: 76 })).status).toBe(400); // latitude missing
    expect((await nearby({ lat: 10, lng: 76, radius: 6000 })).status).toBe(400);
    expect((await nearby({ lat: 10, lng: 76, radius: 5 })).status).toBe(400);
    expect((await nearby({ lat: 10, lng: 76, radius: "abc" })).status).toBe(400);
    expect((await nearby({ lat: 10, lng: 76, category: "Parks" })).status).toBe(400);
    expect((await api().get("/api/complaints/nearby").query({ lat: 10, lng: 76 })).status).toBe(401);
  });
});

describe("migration of old complaints", () => {
  const legacy = (overrides) => ({
    user: citizen.user._id,
    title: "Legacy complaint",
    description: "Created before the workflow existed.",
    category: "Road",
    image: "",
    location: { lat: 23.8, lng: 91.2 },
    status: "Pending",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-02T10:00:00Z"),
    __v: 0,
    ...overrides,
  });

  test("adds geo, history and resolvedAt, skips bad coordinates, supports dry runs, and is safe to re-run", async () => {
    const inserted = await Complaint.collection.insertMany([
      legacy({ title: "legacy pending" }),
      legacy({ title: "legacy in progress", status: "In Progress" }),
      legacy({ title: "legacy resolved", status: "Resolved" }),
      legacy({ title: "legacy broken", location: { lat: 999, lng: 91.2 } }),
    ]);
    const [pending, inProgress, resolved, broken] = Object.values(inserted.insertedIds);
    const quiet = { log: () => {} };

    // a dry run reports what it would do but writes nothing
    const dry = await migrate({ dryRun: true, ...quiet });
    expect(dry).toMatchObject({ updated: 3, skipped: 1 });
    expect((await fromDb(pending)).geo).toBeUndefined();

    const first = await migrate(quiet);
    expect(first).toMatchObject({ updated: 3, skipped: 1 });

    const p = await fromDb(pending);
    expect(p.geo).toEqual({ type: "Point", coordinates: [91.2, 23.8] });
    expect(p.statusHistory.map((h) => h.status)).toEqual(["Pending"]);
    expect(p.resolvedAt).toBeNull();

    expect((await fromDb(inProgress)).statusHistory.map((h) => h.status)).toEqual(["Pending", "In Progress"]);

    const r = await fromDb(resolved);
    expect(r.statusHistory.map((h) => h.status)).toEqual(["Pending", "Resolved"]);
    expect(r.resolvedAt).toEqual(new Date("2026-01-02T10:00:00Z"));

    expect((await fromDb(broken)).geo).toBeUndefined();

    const second = await migrate(quiet);
    expect(second.updated).toBe(0); // nothing left to do
  });
});