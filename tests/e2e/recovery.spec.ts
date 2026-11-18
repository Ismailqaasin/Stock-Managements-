import { test, expect } from "@playwright/test";
test("verified restore reverts stock, retains safety snapshot, and revokes sessions", async ({
  request,
}) => {
  const setup = await (
    await request.post("/api/auth/preview", { data: {} })
  ).json();
  let headers = { Authorization: "Bearer " + setup.token };
  const post = (url: string, data: unknown = {}) =>
    request.post("/api" + url, { headers, data });
  const get = (url: string) => request.get("/api" + url, { headers });
  const p = await (
    await post("/products", {
      name: "Archive test",
      sku: "BACKUP-TEST",
      selling_price: 2,
    })
  ).json();
  expect(p.id).toBeGreaterThan(0);
  const receipt = (quantity: number) =>
    post("/stock-ins", { items: [{ product_id: p.id, quantity }] });
  expect((await receipt(7)).ok()).toBe(true);
  const backup = await (await post("/backups")).json();
  expect(backup.status).toBe("Completed");
  expect((await post(`/backups/${backup.id}/verify`)).ok()).toBe(true);
  const file = await get(`/backups/${backup.id}/download`);
  expect(file.ok()).toBe(true);
  expect((await file.body()).length).toBe(backup.file_size);
  await receipt(5);
  expect((await (await get("/products/" + p.id)).json()).current_stock).toBe(
    12,
  );
  expect(
    (
      await post(`/backups/${backup.id}/restore`, {
        password: setup.preview_password,
        confirmation: "NOT CONFIRMED",
      })
    ).status(),
  ).toBe(403);
  const restored = await post(`/backups/${backup.id}/restore`, {
    password: setup.preview_password,
    confirmation: "RESTORE",
  });
  expect(await restored.text()).toContain('"ok":true');
  expect((await get("/products")).status()).toBe(401);
  const login = await (
    await post("/auth/login", {
      username: "admin",
      password: setup.preview_password,
    })
  ).json();
  headers = { Authorization: "Bearer " + login.token };
  expect((await (await get("/products/" + p.id)).json()).current_stock).toBe(7);
  expect(
    (await (await get("/backups")).json()).items.map(
      (b: { type: string }) => b.type,
    ),
  ).toContain("PreRestore");
  expect((await (await get("/settings/integrity-check")).json()).ok).toBe(true);
});
test("change password and one-time recovery revoke earlier credentials", async ({
  request,
}) => {
  const session = await (
    await request.post("/api/auth/preview", { data: {} })
  ).json();
  const one = "Changed-" + crypto.randomUUID(),
    two = "Recovered-" + crypto.randomUUID();
  const change = await request.post("/api/auth/change-password", {
    headers: { Authorization: "Bearer " + session.token },
    data: { currentPassword: session.preview_password, newPassword: one },
  });
  expect(change.status()).toBe(204);
  expect(
    (
      await request.post("/api/auth/login", {
        data: { username: "admin", password: session.preview_password },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/auth/reset-password", {
        data: { recoveryKey: session.recovery_key, newPassword: two },
      })
    ).status(),
  ).toBe(204);
  expect(
    (
      await request.post("/api/auth/reset-password", {
        data: { recoveryKey: session.recovery_key, newPassword: one },
      })
    ).status(),
  ).toBe(401);
  const login = await (
    await request.post("/api/auth/login", {
      data: { username: "admin", password: two },
    })
  ).json();
  expect(login.recovery_key).toBeTruthy();
  expect(login.recovery_key).not.toBe(session.recovery_key);
});
