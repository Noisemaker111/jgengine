import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@jgengine/core",
    "@jgengine/ws",
    "@jgengine/sql",
  ],
};

export default nextConfig;
