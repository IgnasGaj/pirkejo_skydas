import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  outputFileTracingRoot: process.cwd(),
  experimental: { serverActions: { bodySizeLimit: "16mb" }, middlewareClientMaxBodySize: "16mb" }
};
export default nextConfig;
