// A disposable, per-browser PostgreSQL workspace for the live preview only.
// Production never mounts these routes or uses the embedded engine.
import { PGlite } from "@electric-sql/pglite";
import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  stat,
  rm,
} from "node:fs/promises";
import path from "node:path";
import {
  randomBytes,
  createHash,
  pbkdf2Sync,
  timingSafeEqual,
} from "node:crypto";
export const root = path.resolve(".local/private-workspaces");
export const token = () => randomBytes(32).toString("hex");
export const sha = (x) => createHash("sha256").update(x).digest("hex");
export function passwordHash(value) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${pbkdf2Sync(value, salt, 120000, 32, "sha512").toString("hex")}`;
}
export function matches(value, hashed) {
  if (!hashed || typeof value !== "string" || value.length > 256) return false;
  const [salt, hash] = hashed.split(":");
  return timingSafeEqual(
    pbkdf2Sync(value, salt, 120000, 32, "sha512"),
    Buffer.from(hash, "hex"),
  );
}
export const one = async (db, sql, args = []) =>
  (await db.query(sql, args)).rows[0];
const open = new Map();
let template;
export async function prepare() {
  await mkdir(root, { recursive: true });
  const init = new PGlite();
  for (const f of ["001_schema", "002_engine", "003_queries"])
    await init.exec(await readFile(`database/${f}.sql`, "utf8"));
  template = await init.dumpDataDir("gzip");
  await init.close();
}
export async function provision() {
  const dirs = await readdir(root, { withFileTypes: true });
  let count = 0;
  for (const d of dirs.filter((d) => d.isDirectory())) {
    const p = path.join(root, d.name);
    if (
      !open.has(d.name) &&
      Date.now() - (await stat(p)).mtimeMs > 7 * 86400000
    )
      await rm(p, { recursive: true, force: true });
    else count++;
  }
  if (count >= 100)
    throw Object.assign(new Error("Preview workspace capacity reached."), {
      status: 503,
    });
  const id = token(),
    dir = path.join(root, id);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const version = "data-" + token().slice(0, 10);
  const db = new PGlite({
    dataDir: path.join(dir, version),
    loadDataDir: template,
  });
  await db.waitReady;
  const secret = token(),
    password = randomBytes(15).toString("base64url"),
    key = token();
  await writeFile(
    path.join(dir, "workspace.json"),
    JSON.stringify({ version, secret }),
    { mode: 0o600 },
  );
  await db.query(
    "INSERT INTO admin_users(id,username,full_name,password_hash,recovery_key_hash,must_change_password,last_login_at) VALUES(1,'admin','Administrator',$1,$2,false,now())",
    [passwordHash(password), passwordHash(key)],
  );
  await db.query(
    "SELECT log_event('Setup','workspace',1,'Warehouse workspace created')",
  );
  await db.query(
    "SELECT log_event('Login','system',1,'Administrator signed in')",
  );
  const ws = {
    id,
    dir,
    db,
    secret,
    version,
    last: Date.now(),
    busy: 0,
    queue: Promise.resolve(),
  };
  open.set(id, ws);
  return { ws, password, key };
}
export async function getWorkspace(id) {
  if (typeof id !== "string" || !/^\w{64}$/.test(id)) return null;
  if (open.has(id)) return await open.get(id);
  const dir = path.join(root, id);
  const promise = (async () => {
    let meta;
    try {
      meta = JSON.parse(
        await readFile(path.join(dir, "workspace.json"), "utf8"),
      );
    } catch {
      return null;
    }
    const db = new PGlite(path.join(dir, meta.version));
    await db.waitReady;
    return {
      id,
      dir,
      db,
      ...meta,
      last: Date.now(),
      busy: 0,
      queue: Promise.resolve(),
    };
  })();
  open.set(id, promise);
  try {
    const w = await promise;
    if (!w) open.delete(id);
    else open.set(id, w);
    return w;
  } catch (e) {
    open.delete(id);
    throw e;
  }
}
export async function acquire(ws, res) {
  ws.busy++;
  const prior = ws.queue;
  let release;
  ws.queue = new Promise((r) => (release = r));
  await prior;
  ws.last = Date.now();
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    ws.busy--;
    ws.last = Date.now();
    release();
  };
  res.once("finish", finish);
  res.once("close", finish);
  if (res.destroyed) finish();
}
setInterval(() => {
  for (const [key, w] of open)
    if (w.db && !w.busy && Date.now() - w.last > 120000) {
      open.delete(key);
      w.db.close().catch(console.error);
    }
}, 30000).unref();
export async function swapDatabase(ws, buffer) {
  const version = "data-" + token().slice(0, 10);
  const next = new PGlite({
    dataDir: path.join(ws.dir, version),
    loadDataDir: new Blob([buffer]),
  });
  try {
    await next.waitReady;
    if (!(await one(next, "select stock_integrity() j")).j.ok)
      throw new Error("Restored ledger does not reconcile.");
    // Safety-backup metadata must outlive the dataset it protects.
    for (const table of ["backups", "restore_logs"]) {
      const rows = (await ws.db.query(`select * from ${table} order by id`))
        .rows;
      for (const row of rows) {
        const keys = Object.keys(row);
        await next.query(
          `INSERT INTO ${table}(${keys.join(",")}) OVERRIDING SYSTEM VALUE VALUES(${keys.map((_, i) => "$" + (i + 1)).join(",")}) ON CONFLICT(id) DO UPDATE SET ${keys
            .filter((k) => k !== "id")
            .map((k) => k + "=excluded." + k)
            .join(",")}`,
          Object.values(row),
        );
      }
      await next.exec(
        `select setval(pg_get_serial_sequence('${table}','id'),coalesce(max(id),1),max(id) is not null) from ${table}`,
      );
    }
    await next.exec(
      "UPDATE refresh_tokens SET revoked_at=now() WHERE revoked_at IS NULL",
    );
    await writeFile(
      path.join(ws.dir, "workspace.tmp"),
      JSON.stringify({ secret: ws.secret, version }),
      { mode: 0o600 },
    );
    const { rename } = await import("node:fs/promises");
    await rename(
      path.join(ws.dir, "workspace.tmp"),
      path.join(ws.dir, "workspace.json"),
    );
    const old = ws.db,
      oldPath = ws.version;
    ws.db = next;
    ws.version = version;
    await old.close();
    await rm(path.join(ws.dir, oldPath), { recursive: true, force: true });
  } catch (e) {
    if (ws.db !== next) {
      await next.close();
      await rm(path.join(ws.dir, version), { recursive: true, force: true });
    }
    throw e;
  }
}
