import type { NextConfig } from "next";

const localDevHostname = process.env.LOCAL_DEV_HOSTNAME;
if (localDevHostname && !/^[A-Za-z0-9.-]+$/.test(localDevHostname)) {
  throw new Error("LOCAL_DEV_HOSTNAME must be one exact host without a scheme or wildcard");
}

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  outputFileTracingRoot: process.cwd(),
  ...(localDevHostname ? { allowedDevOrigins: [localDevHostname] } : {}),
  experimental: { serverActions: { bodySizeLimit: "16mb" }, middlewareClientMaxBodySize: "16mb" }
};
export default nextConfig;
