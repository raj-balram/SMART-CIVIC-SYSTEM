const request = require("supertest");
const User = require("../models/User");
const { startTestServer } = require("./helpers");

let server;
let n = 0;
const PASSWORD = "Password123";

beforeAll(async () => {
  server = await startTestServer();
});
afterAll(() => server.stop());

const api = () => request(server.app);
const uniqueEmail = () => `user${++n}-${Date.now()}@test.local`;
const register = (body) => api().post("/api/auth/register").send(body);
const login = (body) => api().post("/api/auth/login").send(body);

test("register creates a user, returns a token and never returns the password", async () => {
  const email = uniqueEmail();
  const res = await register({ name: "Test User", email, password: PASSWORD });

  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ name: "Test User", role: "user" });
  expect(res.body.token).toEqual(expect.any(String));
  expect(JSON.stringify(res.body)).not.toMatch(/password|\$2[aby]\$/i);

  const me = await api().get("/api/auth/me").set("Authorization", `Bearer ${res.body.token}`);
  expect(me.status).toBe(200);
  expect(me.body.email).toBe(email);
  expect(me.body).not.toHaveProperty("password");
});

test("register ignores role and adminSecret sent by the client", async () => {
  const email = uniqueEmail();
  const res = await register({
    name: "Sneaky User", email, password: PASSWORD, role: "admin", adminSecret: "anything",
  });

  expect(res.status).toBe(201);
  expect(res.body.role).toBe("user");
  expect((await User.findOne({ email })).role).toBe("user");
});

test("emails are trimmed and lowercased, and duplicates are caught regardless of case", async () => {
  const base = uniqueEmail();
  const first = await register({ name: "Mixed Case", email: `  ${base.toUpperCase()}  `, password: PASSWORD });
  expect(first.status).toBe(201);
  expect(await User.findOne({ email: base })).not.toBeNull();

  expect((await register({ name: "Second", email: base, password: PASSWORD })).status).toBe(409);
  expect((await register({ name: "Third", email: base.toUpperCase(), password: PASSWORD })).status).toBe(409);
});

test.each([
  ["short password", { name: "Test User", email: "a@test.local", password: "short" }, /8 characters/],
  ["password over 72 characters", { name: "Test User", email: "a@test.local", password: "a".repeat(73) }, /72/],
  ["invalid email", { name: "Test User", email: "not-an-email", password: PASSWORD }, /valid email/i],
  ["missing name", { email: "a@test.local", password: PASSWORD }, /name/i],
  ["one-letter name", { name: "A", email: "a@test.local", password: PASSWORD }, /2 characters/],
  ["object instead of an email (NoSQL injection attempt)", { name: "Test User", email: { $ne: null }, password: PASSWORD }, /email/i],
])("register rejects: %s", async (label, body, message) => {
  const res = await register(body);
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(message);
  expect(res.body.errors.length).toBeGreaterThan(0);
});

test("login works, and a wrong password and an unknown email look identical", async () => {
  const email = uniqueEmail();
  await register({ name: "Login User", email, password: PASSWORD });

  const ok = await login({ email: email.toUpperCase(), password: PASSWORD });
  expect(ok.status).toBe(200);
  expect(ok.body.token).toEqual(expect.any(String));

  const wrongPassword = await login({ email, password: "WrongPass123" });
  const unknownEmail = await login({ email: uniqueEmail(), password: PASSWORD });
  expect(wrongPassword.status).toBe(401);
  expect(unknownEmail.status).toBe(401);
  expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
});

test("login rejects operator objects instead of strings (NoSQL injection)", async () => {
  expect((await login({ email: { $gt: "" }, password: PASSWORD })).status).toBe(400);
  expect((await login({ email: uniqueEmail(), password: { $ne: "" } })).status).toBe(400);
});

test("/me needs a valid token", async () => {
  expect((await api().get("/api/auth/me")).status).toBe(401);
  expect((await api().get("/api/auth/me").set("Authorization", "Bearer garbage")).status).toBe(401);
});

test("profile update validates the name and saves it", async () => {
  const { body } = await register({ name: "Old Name", email: uniqueEmail(), password: PASSWORD });
  const put = (name) =>
    api().put("/api/auth/me").set("Authorization", `Bearer ${body.token}`).send({ name });

  expect((await put("A")).status).toBe(400);
  const ok = await put("  New Name  ");
  expect(ok.status).toBe(200);
  expect(ok.body.name).toBe("New Name");
});

test("malformed JSON returns 400 and unknown routes return 404 (never a 500)", async () => {
  const bad = await api().post("/api/auth/login").set("Content-Type", "application/json").send("{bad json");
  expect(bad.status).toBe(400);

  const missing = await api().get("/api/nope");
  expect(missing.status).toBe(404);
  expect(missing.body.message).toMatch(/not found/i);
});