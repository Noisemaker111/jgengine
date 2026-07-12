import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@jgengine/shell",
    "@games/nonogram",
    "@jgengine/core",
    "@jgengine/react",
    "@jgengine/ws",
    "@jgengine/sql",
  ],
};

export default nextConfig;
