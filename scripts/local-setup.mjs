#!/usr/bin/env node
// Creates deploy/runtime.env for the isolated local deployment with a fresh
// random PostgreSQL password. Hex passwords need no URL encoding.
// Usage: node scripts/local-setup.mjs [--force]
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const example = join(root, "deploy", "runtime.local.env.example");
const target = join(root, "deploy", "runtime.env");
const force = process.argv.includes("--force");

if (existsSync(target) && !force) {
  console.error(
    `deploy/runtime.env already exists. Re-run with --force to replace it.`,
  );
  process.exit(1);
}

const password = randomBytes(24).toString("hex");
const env = readFileSync(example, "utf8")
  .replace(/^POSTGRES_PASSWORD=.*$/m, `POSTGRES_PASSWORD=${password}`)
  .replace(/^# Replace URL_PASSWORD.*\r?\n/m, "")
  .replace(/^(DATABASE_URL=.*?)URL_PASSWORD/m, `$1${password}`);

if (env.includes("replace-with") || env.includes("URL_PASSWORD")) {
  console.error(
    "Unexpected example format; deploy/runtime.env was not written.",
  );
  process.exit(1);
}

writeFileSync(target, env, { mode: 0o600, flag: force ? "w" : "wx" });
console.log(
  "Created deploy/runtime.env with a new local-only database password.",
);
console.log("Next:");
console.log(
  "  docker compose --env-file deploy/runtime.env -p nexora-local-test \\\n" +
    "    -f compose.prod.yaml -f compose.local-test.yaml up -d --build",
);
