const request = require("supertest");
const jwt = require("jsonwebtoken");
const { sleep, startTestServer, makeUser, connectSocket } = require("./helpers");

let server;
const open = [];

beforeAll(async () => {
  server = await startTestServer();
});
afterEach(() => {
  open.splice(0).forEach((c) => c.socket.close());
});
afterAll(() => server.stop());

const connect = async (token) => {
  const client = await connectSocket(server.url, token);
  open.push(client);
  return client;
};
const names = (client) => client.received.map((e) => e.event);

const createComplaint = (token, title) =>
  request(server.app)
    .post("/api/complaints")
    .set("Authorization", `Bearer ${token}`)
    .field("title", title)
    .field("description", "test description")
    .field("category", "Road")
    .field("lat", "23.8315")
    .field("lng", "91.2868");

const setStatus = (token, id, status) =>
  request(server.app)
    .put(`/api/complaints/${id}/status`)
    .set("Authorization", `Bearer ${token}`)
    .send({ status });

test("a socket without a token is rejected", async () => {
  await expect(connectSocket(server.url)).rejects.toThrow("Authentication required");
});

test("a token signed with the wrong secret is rejected", async () => {
  const { user } = await makeUser("Forger", "user");
  const forged = jwt.sign({ id: user._id, role: "admin" }, "not-the-real-secret", { expiresIn: "1h" });
  await expect(connectSocket(server.url, forged)).rejects.toThrow("Authentication required");
});

test("a valid token for a deleted user is rejected", async () => {
  const { user, token } = await makeUser("Ghost");
  await user.deleteOne();
  await expect(connectSocket(server.url, token)).rejects.toThrow("Authentication required");
});

test("a new complaint reaches the owner and every admin, and nobody else", async () => {
  const admin1 = await makeUser("Admin One", "admin");
  const admin2 = await makeUser("Admin Two", "admin");
  const owner = await makeUser("Owner");
  const other = await makeUser("Unrelated");

  const [a1, a2, o, x] = await Promise.all([
    connect(admin1.token), connect(admin2.token), connect(owner.token), connect(other.token),
  ]);

  const res = await createComplaint(owner.token, "Pothole near market");
  expect(res.status).toBe(201);
  await sleep(400);

  for (const client of [a1, a2, o]) expect(names(client)).toEqual(["complaint:created"]);
  expect(x.received).toHaveLength(0); // the unrelated citizen sees nothing

  // the payload is populated, so admin rows can show who reported it
  expect(a1.received[0].payload.title).toBe("Pothole near market");
  expect(a1.received[0].payload.user.name).toBe("Owner");
});

test("a status change reaches the owner and every admin, and nobody else", async () => {
  const admin1 = await makeUser("Admin One", "admin");
  const admin2 = await makeUser("Admin Two", "admin");
  const owner = await makeUser("Owner");
  const other = await makeUser("Unrelated");

  const created = await createComplaint(owner.token, "Broken street light");
  const complaintId = created.body._id;

  const [a1, a2, o, x] = await Promise.all([
    connect(admin1.token), connect(admin2.token), connect(owner.token), connect(other.token),
  ]);

  const res = await setStatus(admin1.token, complaintId, "In Progress");
  expect(res.status).toBe(200);
  await sleep(400);

  for (const client of [a1, a2, o]) {
    expect(names(client)).toEqual(["complaint:updated"]);
    expect(client.received[0].payload.status).toBe("In Progress");
  }
  expect(x.received).toHaveLength(0);
});

test("a normal user with a token that CLAIMS admin does not get admin events", async () => {
  const owner = await makeUser("Owner");
  const pretender = await makeUser("Pretender", "user");
  const claimsAdmin = jwt.sign(
    { id: pretender.user._id, role: "admin" },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  ); // validly signed, but the database says this user is not an admin

  const p = await connect(claimsAdmin);
  await createComplaint(owner.token, "Garbage pile");
  await sleep(400);

  expect(p.received).toHaveLength(0); // the role comes from the database, not the token
});