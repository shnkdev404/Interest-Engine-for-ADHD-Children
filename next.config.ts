import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Loaded from node_modules at runtime: PGlite ships WASM + data files the
  // bundler shouldn't touch; postgres is a Node-only driver.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
};

export default nextConfig;
