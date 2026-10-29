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
  async rewrites() {
    const endpoint = (
      process.env.OBJECT_STORAGE_ENDPOINT || "http://127.0.0.1:9000"
    ).replace(/\/+$/, "");
    const bucket = process.env.OBJECT_STORAGE_BUCKET || "komanda-dev-media";
    return [
      {
        source: `/${bucket}/:path*`,
        destination: `${endpoint}/${bucket}/:path*`,
      },
    ];
  },
};

export default nextConfig;
