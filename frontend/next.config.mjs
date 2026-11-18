import path from "node:path";
import { fileURLToPath } from "node:url";
/** @type {import('next').NextConfig} */
const config = {
  ...(process.env.STANDALONE === "1"
    ? {
        output: "standalone",
        outputFileTracingRoot: path.resolve(
          path.dirname(fileURLToPath(import.meta.url)),
          "..",
        ),
      }
    : {}),
  distDir: process.env.NEXT_BUILD_DIR || ".next",
  poweredByHeader: false,
  devIndicators: false,
  allowedDevOrigins: ["*.e2b.app", "127.0.0.1", "localhost"],
  experimental: { cpus: 2 },
  async rewrites() {
    return process.env.API_ORIGIN
      ? [
          {
            source: "/api/:path*",
            destination: `${process.env.API_ORIGIN}/api/:path*`,
          },
        ]
      : [];
  },
};
export default config;
