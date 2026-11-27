import type { NextConfig } from "next";
import os from "node:os";

const localIps = Object.values(os.networkInterfaces())
  .flat()
  .filter((iface): iface is os.NetworkInterfaceInfo => Boolean(iface))
  .map((iface) => iface.address);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: Array.from(
    new Set(["localhost", "127.0.0.1", ...localIps])
  ),
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
