import express from "express";
import sharp from "sharp";
import cookieParser from "cookie-parser";
import multer from "multer";
import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import {
  provision,
  getWorkspace,
  acquire,
  one,
  token,
  sha,
  matches,
  passwordHash,
  swapDatabase,
} from "./workspaces.mjs";
import { pdf, catalog } from "./documents.mjs";
const reports = {
  products: "products",
  stock: "stock",
  "low-stock": "low-stock",
  "out-of-stock": "out-of-stock",
  "stock-in": "stock-ins",
  "stock-out": "dispatches",
  orders: "orders",
  customers: "customers",
  returns: "returns",
  "damaged-items": "damaged-items",
  adjustments: "stock-adjustments",
  ledger: "stock-movements",
  audit: "audit-logs",
};
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const admin = (a) => ({
  id: 1,
  username: a.username,
  full_name: a.full_name,
  must_change_password: a.must_change_password,
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2097152, files: 1 },
});
const probes = new Map();
function rate(req, key, max) {
  const k = `${key}:${req.ip}`,
    now = Date.now();
  let r = probes.get(k);
  if (!r || now - r[0] > 60000) {
    r = [now, 0];
    probes.set(k, r);
  }
  if (++r[1] > max) fail(429, "Too many requests. Try again in a minute.");
}
function cookies(req, p = "/api") {
  const secure =
    req.secure ||
    req.headers["x-forwarded-proto"] === "https" ||
    (req.headers.host ?? "").endsWith(".e2b.app");
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    partitioned: secure,
    path: p,
  };
}
async function issue(
  req,
  res,
  ws,
  sid = randomUUID(),
  until = new Date(Date.now() + 43200000),
  old = null,
) {
  const raw = token();
  const row = await one(
    ws.db,
    "INSERT INTO refresh_tokens(admin_id,session_id,token_hash,expires_at,created_ip) VALUES(1,$1,$2,$3,$4) RETURNING id",
    [sid, sha(raw), until, req.ip],
  );
  if (old)
    await ws.db.query(
      "UPDATE refresh_tokens SET revoked_at=now(),replaced_by_id=$1 WHERE id=$2",
      [row.id, old],
    );
  res.cookie("stockroom_refresh", raw, {
    ...cookies(req, "/api/auth"),
    expires: until,
  });
  return new SignJWT({ sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("1")
    .setIssuer("stockroom-preview")
    .setAudience("stockroom-web")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode(ws.secret));
}
async function audit(req, act, msg) {
  await req.ws.db.query(
    "INSERT INTO audit_logs(admin_id,action,entity_type,description,ip_address) VALUES(1,$1,'system',$2,$3)",
    [act, msg, req.ip],
  );
}
const getSettings = async (db) =>
  (
    await one(
      db,
      "SELECT to_jsonb(s)||jsonb_build_object('version',xmin::text) j FROM system_settings s",
    )
  ).j;
const list = async (db, r, f = {}) =>
  (await one(db, "select stock_list($1,$2) j", [r, JSON.stringify(f)])).j;
const detail = async (db, r, i) =>
  (await one(db, "select stock_detail($1,$2) j", [r, i])).j;
async function command(req, r, op, id, b) {
  return req.ws.db.transaction(async (tx) => {
    await tx.query(
      "SELECT set_config('stockms.ip',$1,true),set_config('stockms.agent',$2,true)",
      [req.ip ?? "", req.headers["user-agent"] ?? ""],
    );
    return (
      await one(tx, "select stock_command($1,$2,$3,$4) j", [
        r,
        op,
        id,
        JSON.stringify(b),
      ])
    ).j;
  });
}
async function snapshot(req, type) {
  const { db, dir } = req.ws;
  const name = `stockroom_${new Date().toISOString().replace(/[:.]/g, "-")}.tar.gz`;
  const id = (
    await one(
      db,
      "INSERT INTO backups(file_name,file_path,type,status) VALUES($1,$1,$2,'InProgress') RETURNING id",
      [name, type],
    )
  ).id;
  try {
    const buf = Buffer.from(await (await db.dumpDataDir("gzip")).arrayBuffer());
    await mkdir(path.join(dir, "backups"), { recursive: true });
    await writeFile(path.join(dir, "backups", name), buf, { mode: 0o600 });
    await db.query(
      "UPDATE backups SET status='Completed',completed_at=now(),checksum_sha256=$2,file_size=$3 WHERE id=$1",
      [id, sha(buf), buf.length],
    );
    await audit(req, "Backup", "Database backup completed");
    return detail(db, "backups", id);
  } catch (e) {
    await db.query(
      "UPDATE backups SET status='Failed',error_message='Archive creation failed' WHERE id=$1",
      [id],
    );
    throw e;
  }
}
async function verify(req, id) {
  const r = await detail(req.ws.db, "backups", id);
  if (r.status !== "Completed") fail(409, "Backup is not complete.");
  const buf = await readFile(
    path.join(req.ws.dir, "backups", path.basename(r.file_name)),
  );
  if (sha(buf) !== r.checksum_sha256) fail(409, "Checksum mismatch.");
  gunzipSync(buf);
  await req.ws.db.query("UPDATE backups SET verified_at=now() WHERE id=$1", [
    id,
  ]);
  await audit(req, "Verify", "Backup checksum verified");
  return { buf, r };
}
export function api() {
  const a = express.Router();
  a.use(express.json({ limit: "256kb" }), cookieParser());
  a.use((req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin
    ) {
      const origin = new URL(req.headers.origin).host;
      if (![req.headers.host, req.headers["x-forwarded-host"]].includes(origin))
        return res.status(403).json({ title: "Origin not allowed." });
    }
    next();
  });
  a.get("/auth/config", (req, res) =>
    res.json({ preview: true, auto_start: !req.cookies.stockroom_workspace }),
  );
  a.post("/auth/preview", async (req, res) => {
    rate(req, "new", 8);
    if (req.cookies.stockroom_workspace && !req.body?.newWorkspace)
      fail(401, "Sign in to your workspace.");
    const { ws, password, key } = await provision();
    req.ws = ws;
    res.cookie("stockroom_workspace", ws.id, {
      ...cookies(req),
      maxAge: 7 * 86400000,
    });
    res.json({
      token: await issue(req, res, ws),
      admin: admin(await one(ws.db, "select * from admin_users")),
      preview_password: password,
      recovery_key: key,
    });
  });
  a.use(async (req, res, next) => {
    const w = await getWorkspace(req.cookies.stockroom_workspace);
    if (!w) fail(401, "Sign in to continue.");
    await acquire(w, res);
    req.ws = w;
    next();
  });
  a.post("/auth/login", async (req, res) => {
    rate(req, "login", 20);
    const { db } = req.ws,
      r = await one(db, "select * from admin_users");
    if (r.locked_until && new Date(r.locked_until) > new Date())
      fail(429, "Account locked. Try again in 15 minutes.");
    if (
      !matches(req.body?.password, r.password_hash) ||
      req.body?.username !== r.username
    ) {
      const n = r.locked_until ? 1 : r.failed_login_count + 1;
      await db.query(
        "UPDATE admin_users SET failed_login_count=$1,locked_until=$2",
        [n, n >= 5 ? new Date(Date.now() + 900000) : null],
      );
      await audit(req, "LoginFailed", "Sign-in attempt rejected");
      fail(401, "Invalid username or password.");
    }
    let key = null;
    if (!r.recovery_key_hash) {
      key = token();
      await db.query("UPDATE admin_users SET recovery_key_hash=$1", [
        passwordHash(key),
      ]);
    }
    await db.exec(
      "UPDATE admin_users SET failed_login_count=0,locked_until=null,last_login_at=now()",
    );
    await audit(req, "Login", "Administrator signed in");
    res.json({
      admin: admin(r),
      token: await issue(req, res, req.ws),
      recovery_key: key,
    });
  });
  a.post("/auth/refresh", async (req, res) => {
    const { db } = req.ws;
    const row = await one(
      db,
      "SELECT *,expires_at>now() AND last_seen>now()-(SELECT session_timeout_minutes FROM system_settings)*interval '1 minute' valid FROM refresh_tokens WHERE token_hash=$1",
      [sha(req.cookies.stockroom_refresh ?? "")],
    );
    if (!row) fail(401, "Session expired.");
    if (row.revoked_at || !row.valid) {
      await db.query(
        "UPDATE refresh_tokens SET revoked_at=now() WHERE session_id=$1 AND revoked_at IS NULL",
        [row.session_id],
      );
      fail(401, "Session expired.");
    }
    res.json({
      admin: admin(await one(db, "select * from admin_users")),
      token: await issue(
        req,
        res,
        req.ws,
        row.session_id,
        new Date(row.expires_at),
        row.id,
      ),
    });
  });
  async function change(req, res, recovery) {
    const { db } = req.ws,
      r = await one(db, "select * from admin_users");
    const p = req.body;
    if (
      !matches(
        recovery ? p.recoveryKey : p.currentPassword,
        recovery ? r.recovery_key_hash : r.password_hash,
      )
    )
      fail(401, "Credentials do not match.");
    if (
      typeof p.newPassword !== "string" ||
      p.newPassword.length < 12 ||
      p.newPassword.length > 256 ||
      matches(p.newPassword, r.password_hash)
    )
      fail(422, "Use a new password between 12 and 256 characters.");
    await db.transaction(async (tx) => {
      await tx.query(
        "UPDATE admin_users SET password_hash=$1,recovery_key_hash=CASE WHEN $2 THEN NULL ELSE recovery_key_hash END,password_changed_at=now(),must_change_password=false,failed_login_count=0,locked_until=NULL",
        [passwordHash(p.newPassword), recovery],
      );
      await tx.exec(
        "UPDATE refresh_tokens SET revoked_at=now() WHERE revoked_at IS NULL",
      );
    });
    await audit(req, "PasswordChanged", "Administrator password changed");
    res.sendStatus(204);
  }
  a.post("/auth/reset-password", async (req, res) => {
    rate(req, "reset", 8);
    await change(req, res, true);
  });
  a.use(async (req, res, next) => {
    let sid;
    try {
      const { payload } = await jwtVerify(
        (req.headers.authorization ?? "").replace(/^Bearer /, ""),
        new TextEncoder().encode(req.ws.secret),
        {
          issuer: "stockroom-preview",
          audience: "stockroom-web",
          algorithms: ["HS256"],
        },
      );
      sid = payload.sid;
    } catch {
      fail(401, "Sign in to continue.");
    }
    const row = await one(
      req.ws.db,
      "UPDATE refresh_tokens SET last_seen=now() WHERE session_id=$1 AND revoked_at IS NULL AND expires_at>now() AND last_seen>now()-(SELECT session_timeout_minutes FROM system_settings)*interval '1 minute' RETURNING id",
      [sid],
    );
    if (!row) fail(401, "Session expired.");
    req.sid = sid;
    next();
  });
  a.get("/auth/me", async (req, res) =>
    res.json(admin(await one(req.ws.db, "select * from admin_users"))),
  );
  a.post("/auth/logout", async (req, res) => {
    await req.ws.db.query(
      "UPDATE refresh_tokens SET revoked_at=now() WHERE session_id=$1",
      [req.sid],
    );
    res.clearCookie("stockroom_refresh", cookies(req, "/api/auth"));
    await audit(req, "Logout", "Administrator signed out");
    res.sendStatus(204);
  });
  a.post("/auth/change-password", (req, res) => change(req, res, false));
  a.get("/dashboard/summary", async (req, res) =>
    res.json((await one(req.ws.db, "select dashboard_summary() j")).j),
  );
  for (const [suffix, r] of [
    ["recent-activities", "audit-logs"],
    ["recent-movements", "stock-movements"],
  ])
    a.get("/dashboard/" + suffix, async (req, res) =>
      res.json(await list(req.ws.db, r, { pageSize: 5 })),
    );
  a.get("/settings", async (req, res) =>
    res.json(await getSettings(req.ws.db)),
  );
  a.put("/settings", async (req, res) =>
    res.json(await command(req, "settings", "update", 1, req.body)),
  );
  a.get("/settings/integrity-check", async (req, res) =>
    res.json((await one(req.ws.db, "select stock_integrity() j")).j),
  );
  a.get("/products/:id/movements", async (req, res) =>
    res.json(
      await list(req.ws.db, "stock-movements", {
        ...req.query,
        product_id: req.params.id,
      }),
    ),
  );
  a.get("/customers/:id/history", async (req, res) => {
    const f = { ...req.query, customer_id: req.params.id };
    res.json({
      orders: await list(req.ws.db, "orders", f),
      returns: await list(req.ws.db, "returns", f),
      dispatches: await list(req.ws.db, "dispatches", f),
    });
  });
  a.get("/reports/:type", async (req, res) =>
    res.json(
      await list(
        req.ws.db,
        Object.hasOwn(reports, req.params.type)
          ? reports[req.params.type]
          : fail(404, "Unknown report."),
        req.query,
      ),
    ),
  );
  async function exportPdf(req, res, r, id) {
    if (!Object.hasOwn(catalog, r) || !Array.isArray(catalog[r]))
      fail(404, "Unknown report.");
    const rows = [];
    if (id) rows.push(await detail(req.ws.db, r, id));
    else
      for (let page = 1; ; page++) {
        const l = await list(req.ws.db, r, {
          ...req.query,
          pageSize: 100,
          page,
        });
        rows.push(...l.items);
        if (page >= l.totalPages) break;
      }
    pdf(
      res,
      r,
      await getSettings(req.ws.db),
      rows,
      req.query,
      req.headers["accept-language"]?.startsWith("so"),
      req.ws.dir,
    );
  }
  a.get("/reports/:type/pdf", (req, res) =>
    exportPdf(req, res, reports[req.params.type]),
  );
  a.get("/:res/pdf", (req, res) => exportPdf(req, res, req.params.res));
  a.get("/:res/:id/pdf", (req, res) =>
    exportPdf(req, res, req.params.res, req.params.id),
  );
  async function image(req, res, id) {
    const b = req.file?.buffer;
    if (!b || b.length < 12) fail(415, "Select a valid image.");
    const ext = b
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? "png"
      : b.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
        ? "jpg"
        : b.toString("ascii", 0, 4) === "RIFF" &&
            b.toString("ascii", 8, 12) === "WEBP"
          ? "webp"
          : null;
    if (!ext) fail(415, "Choose PNG, JPEG or WebP.");
    // PDFKit supports PNG/JPEG. Normalize every logo so WebP works in PDFs too.
    let bytes = b;
    try {
      const decoder = sharp(b, { limitInputPixels: 20000000 });
      if (id) await decoder.metadata();
      else
        bytes = await decoder
          .rotate()
          .resize({
            width: 600,
            height: 600,
            fit: "inside",
            withoutEnlargement: true,
          })
          .png()
          .toBuffer();
    } catch {
      fail(415, "Choose a valid image under 20 megapixels.");
    }
    const name = token().slice(0, 32) + "." + (id ? ext : "png");
    await mkdir(path.join(req.ws.dir, "uploads"), { recursive: true });
    await writeFile(path.join(req.ws.dir, "uploads", name), bytes);
    res.json(
      await command(
        req,
        id ? "products" : "settings",
        id ? "image" : "logo",
        id || 1,
        { path: "/api/files/" + name },
      ),
    );
  }
  a.post("/products/:id/image", upload.single("file"), (req, res) =>
    image(req, res, req.params.id),
  );
  a.post("/settings/logo", upload.single("file"), (req, res) =>
    image(req, res),
  );
  a.get("/files/:name", (req, res) => {
    if (!/^[a-f0-9]{32}\.(png|webp|jpg)$/.test(req.params.name))
      fail(404, "Image not found.");
    res.sendFile(path.join(req.ws.dir, "uploads", req.params.name));
  });
  a.post("/backups", async (req, res) =>
    res.json(await snapshot(req, "Manual")),
  );
  a.post("/backups/:id/verify", async (req, res) => {
    await verify(req, req.params.id);
    res.json({ ok: true });
  });
  a.get("/backups/:id/download", async (req, res) => {
    const { buf, r } = await verify(req, req.params.id);
    res.attachment(r.file_name).send(buf);
  });
  a.post("/backups/:id/restore", async (req, res) => {
    const u = await one(req.ws.db, "select * from admin_users");
    if (
      req.body.confirmation !== "RESTORE" ||
      !matches(req.body.password, u.password_hash)
    )
      fail(403, "Administrator password and RESTORE confirmation required.");
    const { buf } = await verify(req, req.params.id);
    const safety = await snapshot(req, "PreRestore");
    await verify(req, safety.id);
    const { id } = await one(
      req.ws.db,
      "INSERT INTO restore_logs(backup_id,status) VALUES($1,'InProgress') RETURNING id",
      [req.params.id],
    );
    try {
      await swapDatabase(req.ws, buf);
      await req.ws.db.query(
        "UPDATE restore_logs SET status='Completed',completed_at=now() WHERE id=$1",
        [id],
      );
      await audit(req, "Restore", "Verified database backup restored");
      res.json({ ok: true });
    } catch (e) {
      await req.ws.db.query(
        "UPDATE restore_logs SET status='Failed',completed_at=now() WHERE id=$1",
        [id],
      );
      throw e;
    }
  });
  const mutable = [
    "products",
    "categories",
    "customers",
    "stock-ins",
    "stock-outs",
    "orders",
    "returns",
    "stock-adjustments",
  ];
  for (const r of [
    ...mutable,
    "stock-movements",
    "dispatches",
    "audit-logs",
    "backups",
  ]) {
    a.get("/" + r, async (req, res) =>
      res.json(await list(req.ws.db, r, req.query)),
    );
    a.get(`/${r}/:id`, async (req, res) =>
      res.json(await detail(req.ws.db, r, req.params.id)),
    );
    if (mutable.includes(r))
      a.post("/" + r, async (req, res) =>
        res.status(201).json(await command(req, r, "create", null, req.body)),
      );
    if (["products", "customers", "categories", "orders"].includes(r))
      a.put(`/${r}/:id`, async (req, res) =>
        res.json(await command(req, r, "update", req.params.id, req.body)),
      );
    if (["products", "customers", "categories"].includes(r))
      a.patch(`/${r}/:id/status`, async (req, res) =>
        res.json(await command(req, r, "status", req.params.id, req.body)),
      );
    for (const op of {
      "stock-ins": ["reverse"],
      "stock-outs": ["reverse"],
      orders: ["confirm", "deliver", "cancel"],
      returns: ["approve", "reject"],
    }[r] ?? [])
      a.post(`/${r}/:id/${op}`, async (req, res) =>
        res.json(await command(req, r, op, req.params.id, req.body)),
      );
  }
  a.use((req, res) =>
    res.status(404).json({ status: 404, title: "Not found." }),
  );
  a.use((e, req, res, next) => {
    if (res.headersSent) return next(e);
    let status =
      e.status ??
      { P0002: 404, P0001: 422, 23505: 409, 40001: 409, LIMIT_FILE_SIZE: 413 }[
        e.code
      ] ??
      (/^(22|23)/.test(e.code) ? 422 : 500);
    let title =
      e.status || e.code === "P0001"
        ? e.message
        : ({
            404: "Record not found.",
            409: "A record already exists or has changed. Reload and try again.",
            422: "Check required fields, quantities and prices.",
            413: "Image must be under 2 MB.",
          }[status] ?? "Operation could not be completed.");
    if (status === 500) console.error(e);
    if (req.headers["accept-language"]?.startsWith("so"))
      title =
        {
          401: "Fadlan dib u gal.",
          409: "Xogtu way jirtaa ama way is beddeshay.",
          422: "Hubi xogta iyo tirada aad gelisay.",
          404: "Xogta lama helin.",
        }[status] ?? title;
    res
      .status(status)
      .type("application/problem+json")
      .send({ type: "about:blank", status, title });
  });
  return a;
}
