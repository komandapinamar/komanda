import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["hamburguesasdeautor.lat", "*.hamburguesasdeautor.lat"],
  turbopack: {
    root: process.cwd(),
  },
  images: {
    dangerouslyAllowLocalIP: true,
    remotePatterns: [],
  },
};

export default nextConfig;
