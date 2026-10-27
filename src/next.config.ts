import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["kda.ar", "*.kda.ar"],
  turbopack: {
    root: process.cwd(),
  },
  images: {
    dangerouslyAllowLocalIP: true,
    remotePatterns: [],
  },
};

export default nextConfig;
