import next from "next";
import express from "express";
import { api } from "../preview/api.mjs";
import { prepare } from "../preview/workspaces.mjs";
if (process.env.NODE_ENV === "production")
  throw new Error(
    "The disposable preview must not serve production. Use Docker Compose.",
  );
process.env.STOCKROOM_PRIVATE_PREVIEW = "1";
const port = Number(process.env.PORT ?? 3000);
const web = next({ dir: "frontend", dev: true, hostname: "0.0.0.0", port });
await Promise.all([web.prepare(), prepare()]);
const app = express();
app.disable("x-powered-by");
app.use("/api", api());
app.use((req, res) => web.getRequestHandler()(req, res));
app.listen(port, "0.0.0.0", () =>
  console.log(`Stockroom private-workspace preview ready on port ${port}`),
);
