// simulate a server without image storage, like a fresh clone of the repo
// (empty strings, not deletes: dotenv would refill deleted variables from a local .env file)
process.env.CLOUDINARY_CLOUD_NAME = "";
process.env.CLOUDINARY_API_KEY = "";
process.env.CLOUDINARY_API_SECRET = "";

const request = require("supertest");
const Complaint = require("../models/Complaint");
const { startTestServer, makeUser } = require("./helpers");

let server, citizen;
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001", "hex");

beforeAll(async () => {
  server = await startTestServer();
  citizen = await makeUser("Citizen");
});
afterAll(() => server.stop());

const submit = () =>
  request(server.app)
    .post("/api/complaints")
    .set("Authorization", `Bearer ${citizen.token}`)
    .field("title", "No photo needed")
    .field("description", "This server has no image storage configured.")
    .field("category", "Other")
    .field("lat", "23.8")
    .field("lng", "91.2");

test("complaints without a photo still work when image storage is not configured", async () => {
  expect((await submit()).status).toBe(201);
});

test("a photo is refused with a clear message and nothing is stored", async () => {
  const before = await Complaint.countDocuments();
  const res = await submit().attach("image", PNG, { filename: "photo.png", contentType: "image/png" });

  expect(res.status).toBe(503);
  expect(res.body.message).toMatch(/not configured/i);
  expect(await Complaint.countDocuments()).toBe(before);
});