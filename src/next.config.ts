import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    dangerouslyAllowLocalIP: true,
    remotePatterns: [
      // strapi local
      {
        protocol: "http",
        hostname: "localhost",
        port: "1337",
        pathname: "/uploads/**",
      },
      {
        protocol: "https",
        hostname: "localhost",
        port: "1337",
        pathname: "/uploads/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "1337",
        pathname: "/uploads/**",
      },
      {
        protocol: "https",
        hostname: "127.0.0.1",
        port: "1337",
        pathname: "/uploads/**",
      },
      {
        protocol: "http",
        hostname: "hamburguesasdeautor-cms-dct6vu-b63b41-144-225-147-121.traefik.me",
        pathname: "/uploads/**",
      },
      {
        protocol: "https",
        hostname: "hamburguesasdeautor-cms-dct6vu-b63b41-144-225-147-121.traefik.me",
        pathname: "/uploads/**",
      },
    ],
  },
};

export default nextConfig;
