jest.mock("../utils/cloudinaryUpload"); // never call the real Cloudinary from tests

const request = require("supertest");
const mongoose = require("mongoose");
const streamUpload = require("../utils/cloudinaryUpload");
const Complaint = require("../models/Complaint");
const { startTestServer, makeUser } = require("./helpers");

let server, admin, citizen, other;
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001", "hex"); // PNG signature + start of a header

const VALID = {
  title: "Pothole near the market",
  description: "A deep pothole near the market entrance is damaging vehicles.",
  category: "Road",
  lat: "23.8315",
  lng: "91.2868",
};

beforeAll(async () => {
  server = await startTestServer();
  admin = await makeUser("Admin", "admin");
  citizen = await makeUser("Citizen");
  other = await makeUser("Other Citizen");
});
afterAll(() => server.stop());
beforeEach(() => {
  streamUpload.mockReset();
  streamUpload.mockResolvedValue({ secure_url: "https://res.test/image.png" });
});

const authed = (req, token) => req.set("Authorization", `Bearer ${token}`);

const submit = (token, overrides = {}, file) => {
  let req = authed(request(server.app).post("/api/complaints"), token);
  for (const [key, value] of Object.entries({ ...VALID, ...overrides })) {
    if (value !== undefined) req = req.field(key, value);
  }
  if (file) req = req.attach("image", file.buffer, { filename: file.name, contentType: file.type });
  return req;
};

describe("validation", () => {
  test.each([
    ["missing title", { title: undefined }, /title/i],
    ["title too short", { title: "ab" }, /3 characters/],
    ["title too long", { title: "x".repeat(101) }, /100/],
    ["description too short", { description: "too short" }, /10 characters/],
    ["unknown category", { category: "Parks" }, /category/i],
    ["latitude out of range", { lat: "91" }, /Latitude/],
    ["latitude not a number", { lat: "abc" }, /Latitude/],
    ["longitude out of range", { lng: "181" }, /Longitude/],
    ["empty longitude", { lng: "" }, /Longitude/],
  ])("rejects %s", async (label, overrides, message) => {
    const before = await Complaint.countDocuments();
    const res = await submit(citizen.token, overrides);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(message);
    expect(await Complaint.countDocuments()).toBe(before);
  });

  test("accepts latitude and longitude 0 (the old code treated 0 as missing)", async () => {
    const res = await submit(citizen.token, { lat: "0", lng: "0" });
    expect(res.status).toBe(201);
    expect(res.body.location).toEqual({ lat: 0, lng: 0 });
  });
});

describe("creating complaints", () => {
  test("creates a trimmed complaint owned by the logged-in user, ignoring spoofed fields", async () => {
    const res = await submit(citizen.token, {
      title: "  Pothole near the market  ",
      user: other.user._id.toString(), // spoof attempt
      status: "Resolved", // spoof attempt
    });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Pothole near the market");
    expect(res.body.user).toBe(citizen.user._id.toString());
    expect(res.body.status).toBe("Pending");
    expect(res.body.location).toEqual({ lat: 23.8315, lng: 91.2868 });
  });

  test("a user only sees their own complaints", async () => {
    await submit(citizen.token, { title: "Citizen complaint one" });
    await submit(other.token, { title: "Other user complaint" });

    const res = await authed(request(server.app).get("/api/complaints"), citizen.token);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((c) => c.user === citizen.user._id.toString())).toBe(true);
  });
});

describe("roles", () => {
  let complaintId;
  beforeAll(async () => {
    complaintId = (await submit(citizen.token)).body._id;
  });

  test("anonymous requests get 401", async () => {
    expect((await request(server.app).get("/api/complaints")).status).toBe(401);
    expect((await request(server.app).get("/api/complaints/all")).status).toBe(401);
  });

  test("a normal user gets 403 on every admin route", async () => {
    expect((await authed(request(server.app).get("/api/complaints/all"), citizen.token)).status).toBe(403);
    expect((await authed(request(server.app).get("/api/complaints/stats"), citizen.token)).status).toBe(403);
    const put = authed(request(server.app).put(`/api/complaints/${complaintId}/status`), citizen.token);
    expect((await put.send({ status: "Resolved" })).status).toBe(403);
  });

  test("an admin lists everything (with the reporter's name) and sees stats", async () => {
    const all = await authed(request(server.app).get("/api/complaints/all"), admin.token);
    expect(all.status).toBe(200);
    expect(all.body[0].user).toEqual(expect.objectContaining({ name: expect.any(String) }));

    const stats = await authed(request(server.app).get("/api/complaints/stats"), admin.token);
    expect(stats.status).toBe(200);
    expect(stats.body).toEqual(
      expect.objectContaining({
        total: expect.any(Number), pending: expect.any(Number),
        inProgress: expect.any(Number), resolved: expect.any(Number),
        categoryCounts: expect.any(Array),
      })
    );
  });

  test("status updates: success, invalid status, malformed id, unknown id", async () => {
    const put = (id, body) => authed(request(server.app).put(`/api/complaints/${id}/status`), admin.token).send(body);

    const ok = await put(complaintId, { status: "In Progress" });
    expect(ok.status).toBe(200);
    expect(ok.body.complaint.status).toBe("In Progress");

    expect((await put(complaintId, { status: "Done" })).status).toBe(400);
    expect((await put("abc", { status: "Resolved" })).status).toBe(400);
    expect((await put(new mongoose.Types.ObjectId().toString(), { status: "Resolved" })).status).toBe(404);
  });
});

describe("image uploads", () => {
  test("a real PNG is accepted and the uploaded URL is stored", async () => {
    const res = await submit(citizen.token, {}, { buffer: PNG, name: "photo.png", type: "image/png" });
    expect(res.status).toBe(201);
    expect(res.body.image).toBe("https://res.test/image.png");
    expect(streamUpload).toHaveBeenCalledTimes(1);
  });

  test("a non-image type is rejected before anything is uploaded", async () => {
    const res = await submit(citizen.token, {}, { buffer: Buffer.from("hello"), name: "note.txt", type: "text/plain" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/JPEG, PNG or WebP/);
    expect(streamUpload).not.toHaveBeenCalled();
  });

  test("a file that only CLAIMS to be an image is rejected", async () => {
    const fake = { buffer: Buffer.from("this is definitely not an image"), name: "fake.png", type: "image/png" };
    const res = await submit(citizen.token, {}, fake);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not a valid image/i);
    expect(streamUpload).not.toHaveBeenCalled();
  });

  test("an oversized image returns 413", async () => {
    const big = { buffer: Buffer.concat([PNG, Buffer.alloc(30_000)]), name: "big.png", type: "image/png" };
    const res = await submit(citizen.token, {}, big);
    expect(res.status).toBe(413);
  });

  test("if Cloudinary fails the request returns 502 and nothing is stored", async () => {
    const quiet = jest.spyOn(console, "error").mockImplementation(() => {});
    streamUpload.mockRejectedValueOnce(new Error("boom"));
    const before = await Complaint.countDocuments();

    const res = await submit(citizen.token, {}, { buffer: PNG, name: "photo.png", type: "image/png" });
    quiet.mockRestore();

    expect(res.status).toBe(502);
    expect(await Complaint.countDocuments()).toBe(before);
  });
});