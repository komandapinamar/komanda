import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  images: {
    dangerouslyAllowLocalIP: true,
    remotePatterns: [],
  },
};

export default nextConfig;
