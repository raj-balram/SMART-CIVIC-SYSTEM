process.env.TEST_RATE_LIMIT = "1"; // turn the limiters ON (they are skipped by default under test)

const request = require("supertest");
const Complaint = require("../models/Complaint");
const { startTestServer, makeUser } = require("./helpers");

let server;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(() => server.stop());

test("security headers are set and x-powered-by is not exposed", async () => {
  const res = await request(server.app).get("/health");
  expect(res.headers["x-powered-by"]).toBeUndefined();
  expect(res.headers["x-content-type-options"]).toBe("nosniff");
});

test("a server error returns a generic message and leaks no internals", async () => {
  const { token } = await makeUser("Victim");
  const quiet = jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(Complaint, "find").mockImplementationOnce(() => {
    throw new Error("secret database detail");
  });

  const res = await request(server.app).get("/api/complaints").set("Authorization", `Bearer ${token}`);
  quiet.mockRestore();

  expect(res.status).toBe(500);
  expect(res.body).toEqual({ message: "Internal server error" });
  expect(JSON.stringify(res.body)).not.toMatch(/secret/);
});

test("login is rate limited (the 21st attempt gets 429 with Retry-After)", async () => {
  const attempt = () =>
    request(server.app).post("/api/auth/login").send({ email: "nobody@test.local", password: "WrongPass123" });

  for (let i = 0; i < 20; i++) expect((await attempt()).status).toBe(401);

  const blocked = await attempt();
  expect(blocked.status).toBe(429);
  expect(blocked.headers["retry-after"]).toBeDefined();
});

test("complaint creation is limited per user, and other users are unaffected", async () => {
  const spammer = await makeUser("Spammer");
  const bystander = await makeUser("Bystander");
  const create = (token) =>
    request(server.app)
      .post("/api/complaints")
      .set("Authorization", `Bearer ${token}`)
      .field("title", "Spam complaint")
      .field("description", "This complaint was created by the rate limit test.")
      .field("category", "Other")
      .field("lat", "23.8")
      .field("lng", "91.2");

  for (let i = 0; i < 10; i++) expect((await create(spammer.token)).status).toBe(201);
  expect((await create(spammer.token)).status).toBe(429);
  expect((await create(bystander.token)).status).toBe(201);
});