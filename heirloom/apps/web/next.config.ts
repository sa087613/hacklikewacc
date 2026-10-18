import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app has its own lockfile; don't let Next pick a parent directory as the workspace root.
  outputFileTracingRoot: path.join(__dirname),
  // Keep the dev-mode badge out of demo screenshots.
  devIndicators: false,
  // On Vercel Services the API shares this domain under /api; locally it runs on :8000.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? (process.env.VERCEL ? "/api" : "http://localhost:8000"),
  },
};

export default nextConfig;
