import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@jgengine/shell",
    "@jgengine/core",
    "@jgengine/ui",
    "@jgengine/ws",
    "@jgengine/sql",
  ],
};

export default nextConfig;
