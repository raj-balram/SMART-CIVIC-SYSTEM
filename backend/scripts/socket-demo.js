const { io } = require("socket.io-client");

const BASE = process.env.BASE_URL || "http://localhost:5000";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed for ${email} (${res.status}). Run "npm run seed" first.`);
  return res.json(); // { _id, name, role, token }
}

function connect(label, token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ["websocket"] });
    const client = { label, socket, received: [] };
    socket.onAny((event, payload) =>
      client.received.push({ event, title: payload && payload.title })
    );
    socket.on("connect", () => resolve(client));
    socket.on("connect_error", reject);
  });
}

const show = (clients) =>
  console.table(
    clients.map((c) => ({
      client: c.label,
      "events received": c.received.map((e) => e.event).join(", ") || "(nothing)",
    }))
  );

async function main() {
  const [userA, userB, admin] = await Promise.all([
    login("citizen1@civic.test", "Citizen@12345"),
    login("citizen2@civic.test", "Citizen@12345"),
    login("admin@civic.test", "Admin@12345"),
  ]);

  const clients = await Promise.all([
    connect("admin", admin.token),
    connect("citizen1 (owns the complaint)", userA.token),
    connect("citizen2 (unrelated user)", userB.token),
  ]);
  const [, , other] = clients;

  // STEP 1: citizen1 submits a complaint
  const title = `SOCKET-DEMO ${Date.now()}`;
  const form = new FormData();
  form.append("title", title);
  form.append("description", "Demo complaint created by scripts/socket-demo.js");
  form.append("category", "Road");
  form.append("lat", "23.8315");
  form.append("lng", "91.2868");

  const created = await fetch(`${BASE}/api/complaints`, {
    method: "POST",
    headers: { Authorization: `Bearer ${userA.token}` },
    body: form,
  });
  if (!created.ok) throw new Error(`Create failed: ${created.status} ${await created.text()}`);
  const complaint = await created.json();
  await sleep(700);

  console.log("\nSTEP 1: citizen1 submitted a complaint. Who received events?");
  show(clients);
  const leakedNew = other.received.length > 0;
  console.log(
    leakedNew
      ? "RESULT: LEAK. citizen2 (unrelated) received citizen1's new complaint.\n"
      : "RESULT: OK. citizen2 did not receive citizen1's complaint.\n"
  );
  clients.forEach((c) => (c.received.length = 0));

  // STEP 2: the admin moves it to "In Progress"
  const updated = await fetch(`${BASE}/api/complaints/${complaint._id}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${admin.token}` },
    body: JSON.stringify({ status: "In Progress" }),
  });
  if (!updated.ok) throw new Error(`Status update failed: ${updated.status} ${await updated.text()}`);
  await sleep(700);

  console.log("STEP 2: the admin changed the status. Who received events?");
  show(clients);
  const leakedStatus = other.received.length > 0;
  console.log(
    leakedStatus
      ? "RESULT: LEAK. citizen2 (unrelated) received an event meant only for citizen1.\n"
      : "RESULT: OK. citizen2 did not receive citizen1's status event.\n"
  );

  clients.forEach((c) => c.socket.close());
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});