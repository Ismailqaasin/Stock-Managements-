import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
const secret = () => randomBytes(32).toString("hex");
let contents = await readFile(
  new URL("../.env.example", import.meta.url),
  "utf8",
);
for (const k of ["POSTGRES_PASSWORD", "ADMIN_PASSWORD", "JWT_SECRET"])
  contents = contents.replace(k + "=\n", k + "=" + secret() + "\n");
try {
  await writeFile(new URL("../.env", import.meta.url), contents, {
    flag: "wx",
    mode: 0o600,
  });
  console.log(
    "Created .env with unique secrets. Set DOMAIN and read ADMIN_PASSWORD locally for the first sign-in.",
  );
} catch (e) {
  if (e.code !== "EEXIST") throw e;
  console.error(".env already exists; no changes made.");
  process.exitCode = 1;
}
