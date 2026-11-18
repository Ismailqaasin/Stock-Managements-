// CI ONLY. Run inside the freshly built web container on a disposable compose network.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
if (process.env.STOCKROOM_TEST_DATABASE !== "disposable")
  throw new Error("Use a disposable test database.");
let bearer = "";
const base = "http://api:8080/api";
async function call(path, method = "GET", body) {
  const r = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(bearer ? { Authorization: "Bearer " + bearer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok)
    throw new Error(
      `${method} ${path}: ${r.status}: ${(await r.text()).slice(0, 600)}`,
    );
  return r.status === 204
    ? null
    : r.headers.get("content-type")?.includes("json")
      ? r.json()
      : r;
}
const initial = await call("/auth/login", "POST", {
  username: "admin",
  password: process.env.ADMIN_PASSWORD,
});
assert.equal(
  initial.admin.must_change_password,
  true,
  "Expected a pristine installation",
);
bearer = initial.token;
const password = randomBytes(24).toString("hex");
await call("/auth/change-password", "POST", {
  currentPassword: process.env.ADMIN_PASSWORD,
  newPassword: password,
});
bearer = (await call("/auth/login", "POST", { username: "admin", password }))
  .token;
assert.equal((await call("/products")).totalCount, 0);
const p = await call("/products", "POST", {
  name: "Integration item",
  sku: "TEST-SMOKE",
  selling_price: 1.25,
});
const receive = (n) =>
  call("/stock-ins", "POST", { items: [{ product_id: p.id, quantity: n }] });
await receive(8);
const pdf = Buffer.from(await (await call("/reports/stock/pdf")).arrayBuffer());
assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
const backup = await call("/backups", "POST", {});
let state = backup;
for (let i = 0; i < 40 && state.status === "InProgress"; i++) {
  await delay(1000);
  state = await call("/backups/" + backup.id);
}
assert.equal(state.status, "Completed");
await call(`/backups/${backup.id}/verify`, "POST", {});
await receive(3);
await call(`/backups/${backup.id}/restore`, "POST", {
  password,
  confirmation: "RESTORE",
});
assert.equal(
  (
    await fetch(base + "/products", {
      headers: { Authorization: "Bearer " + bearer },
    })
  ).status,
  401,
);
bearer = (await call("/auth/login", "POST", { username: "admin", password }))
  .token;
assert.equal((await call("/products/" + p.id)).current_stock, 8);
assert.equal((await call("/settings/integrity-check")).ok, true);
assert.ok((await call("/backups")).items.some((b) => b.type === "PreRestore"));
console.log("Production container smoke checks passed.");
