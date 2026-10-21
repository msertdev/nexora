/** @type {import('next').NextConfig} */
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const nextConfig = {};
nextConfig.output = "standalone";
nextConfig.outputFileTracingRoot = workspaceRoot;

export default nextConfig;
