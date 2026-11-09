const request = require("supertest");
const Complaint = require("../models/Complaint");
const { sleep, startTestServer, makeUser, connectSocket } = require("./helpers");

let server, admin, owner, fan;
const open = [];

beforeAll(async () => {
  server = await startTestServer();
  admin = await makeUser("Admin", "admin");
  owner = await makeUser("Owner");
  fan = await makeUser("Fan");
  await Complaint.init();
});
afterEach(() => open.splice(0).forEach((c) => c.socket.close()));
afterAll(() => server.stop());

const api = () => request(server.app);
const authed = (req, token) => req.set("Authorization", `Bearer ${token}`);

const create = async (overrides = {}, token = owner.token) => {
  const fields = {
    title: "Broken street light",
    description: "The street light has been out for a week.",
    category: "Electricity",
    lat: "23.8315",
    lng: "91.2868",
    ...overrides,
  };
  let req = authed(api().post("/api/complaints"), token);
  for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
  return (await req).body._id;
};

const support = (id, token = fan.token) => authed(api().post(`/api/complaints/${id}/support`), token);
const unsupport = (id, token = fan.token) => authed(api().delete(`/api/complaints/${id}/support`), token);
const supportersOf = async (id) =>
  (await Complaint.findById(id).select("+supporters").lean()).supporters.map(String);
const countOf = async (id) => (await Complaint.findById(id).lean()).supportCount;

describe("supporting a complaint", () => {
  test("adds one supporter and raises the count", async () => {
    const id = await create();
    const res = await support(id);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ supportCount: 1, supportedByMe: true });
    expect(await supportersOf(id)).toEqual([fan.user._id.toString()]);
  });

  test("repeating the request changes nothing", async () => {
    const id = await create();
    await support(id);
    const again = await support(id);

    expect(again.status).toBe(200);
    expect(again.body).toEqual({ supportCount: 1, supportedByMe: true });
    expect(await countOf(id)).toBe(1);
  });

  test("20 simultaneous requests from the same user count exactly once", async () => {
    const id = await create();
    const responses = await Promise.all(Array.from({ length: 20 }, () => support(id)));

    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(responses.every((r) => r.body.supportCount === 1)).toBe(true);
    expect(await countOf(id)).toBe(1);
    expect(await supportersOf(id)).toHaveLength(1);
  });

  test("different users add up", async () => {
    const id = await create();
    const users = await Promise.all(["A", "B", "C", "D", "E"].map((n) => makeUser(`Fan ${n}`)));
    await Promise.all(users.map((u) => support(id, u.token)));

    expect(await countOf(id)).toBe(5);
    expect(new Set(await supportersOf(id)).size).toBe(5);
  });

  test("guards: not your own, not resolved, unknown id, malformed id, not logged in", async () => {
    const id = await create();

    const own = await support(id, owner.token);
    expect(own.status).toBe(400);
    expect(own.body.message).toMatch(/own complaint/i);

    const resolved = await create({ title: "Already fixed pothole" });
    const move = (status) =>
      authed(api().put(`/api/complaints/${resolved}/status`), admin.token).send({ status });
    await move("In Progress");
    await move("Resolved");
    const late = await support(resolved);
    expect(late.status).toBe(409);
    expect(late.body.message).toMatch(/resolved/i);

    expect((await support("64b7f0c2a3d4e5f607182930")).status).toBe(404);
    expect((await support("abc")).status).toBe(400);
    expect((await api().post(`/api/complaints/${id}/support`)).status).toBe(401);
  });
});

describe("removing support", () => {
  test("decrements once, is safe to repeat, and does nothing for people who never supported", async () => {
    const id = await create();
    await support(id);

    const first = await unsupport(id);
    expect(first.body).toEqual({ supportCount: 0, supportedByMe: false });
    const second = await unsupport(id);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ supportCount: 0, supportedByMe: false });
    expect(await countOf(id)).toBe(0);

    await support(id);
    const stranger = await makeUser("Stranger");
    const noop = await unsupport(id, stranger.token);
    expect(noop.body).toEqual({ supportCount: 1, supportedByMe: false });
  });
});

describe("privacy and visibility", () => {
  test("the list of supporters is never exposed, only the count", async () => {
    const id = await create();
    await support(id);

    const mine = await authed(api().get("/api/complaints"), owner.token);
    const own = mine.body.find((c) => c._id === id);
    expect(own.supportCount).toBe(1);
    expect(own).not.toHaveProperty("supporters");

    const list = await authed(api().get("/api/complaints/list").query({ limit: 100 }), admin.token);
    const adminItem = list.body.items.find((c) => c._id === id);
    expect(adminItem.supportCount).toBe(1);
    expect(adminItem).not.toHaveProperty("supporters");
  });

  test("nearby results tell each viewer whether they support it and whether it is theirs", async () => {
    const id = await create({ lat: "-33.0", lng: "151.0" });
    await support(id);
    const near = (token) =>
      authed(api().get("/api/complaints/nearby").query({ lat: -33, lng: 151, radius: 100 }), token);

    const asFan = (await near(fan.token)).body.find((r) => r._id === id);
    expect(asFan).toMatchObject({ supportCount: 1, supportedByMe: true, isMine: false });

    const asOwner = (await near(owner.token)).body.find((r) => r._id === id);
    expect(asOwner).toMatchObject({ supportCount: 1, supportedByMe: false, isMine: true });
    expect(asOwner).not.toHaveProperty("supporters");
  });
});

describe("admin view", () => {
  test("sort=support puts the most supported complaints first", async () => {
    const none = await create({ title: "Nobody supports this" });
    const two = await create({ title: "Two people support this" });
    const one = await create({ title: "One person supports this" });
    const [u1, u2] = await Promise.all([makeUser("Backer One"), makeUser("Backer Two")]);

    await Promise.all([support(two, u1.token), support(two, u2.token), support(one, u1.token)]);

    const res = await authed(api().get("/api/complaints/list").query({ sort: "support", limit: 100 }), admin.token);
    const order = res.body.items.map((c) => c._id).filter((id) => [none, two, one].includes(id));
    expect(order).toEqual([two, one, none]);
  });
});

describe("live events", () => {
  test("the owner and admins hear about new support; nobody else does; repeats stay silent", async () => {
    const id = await create();
    const bystander = await makeUser("Bystander");
    const [ownerSocket, adminSocket, otherSocket] = await Promise.all([
      connectSocket(server.url, owner.token),
      connectSocket(server.url, admin.token),
      connectSocket(server.url, bystander.token),
    ]);
    open.push(ownerSocket, adminSocket, otherSocket);

    await support(id);
    await support(id); // a repeat changes nothing, so it must send nothing
    await sleep(400);

    for (const client of [ownerSocket, adminSocket]) {
      expect(client.received).toHaveLength(1);
      expect(client.received[0].event).toBe("complaint:supported");
      expect(client.received[0].payload).toMatchObject({ _id: id, supportCount: 1 });
      expect(client.received[0].payload).not.toHaveProperty("supporters");
    }
    expect(otherSocket.received).toHaveLength(0);
  });
});