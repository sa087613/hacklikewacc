import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app has its own lockfile; don't let Next pick a parent directory as the workspace root.
  outputFileTracingRoot: path.join(__dirname),
  // Keep the dev-mode badge out of demo screenshots.
  devIndicators: false,
};

export default nextConfig;
