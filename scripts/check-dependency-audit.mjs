import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const policy = JSON.parse(
  readFileSync(
    new URL("../security/audit-exceptions.json", import.meta.url),
    "utf8",
  ),
);
const auditCommand =
  process.platform === "win32"
    ? {
        file: process.env.ComSpec ?? "cmd.exe",
        args: ["/d", "/s", "/c", "pnpm audit --json"],
      }
    : { file: "pnpm", args: ["audit", "--json"] };
const audit = spawnSync(auditCommand.file, auditCommand.args, {
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
  windowsHide: true,
});

if (audit.error) {
  throw audit.error;
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  console.error(audit.stderr || audit.stdout);
  throw new Error("pnpm audit did not return valid JSON");
}

if (audit.status !== 0 && audit.status !== 1) {
  console.error(audit.stderr || audit.stdout);
  throw new Error(`pnpm audit exited unexpectedly with ${audit.status}`);
}

const advisories = Object.values(report.advisories ?? {});
const exceptions = new Map(
  policy.exceptions.map((entry) => [entry.githubAdvisoryId, entry]),
);
const today = new Date().toISOString().slice(0, 10);
const failures = [];

for (const advisory of advisories) {
  const exception = exceptions.get(advisory.github_advisory_id);
  if (!exception) {
    failures.push(
      `${advisory.github_advisory_id}: unexpected ${advisory.severity} advisory in ${advisory.module_name}`,
    );
    continue;
  }

  const versions = new Set(
    advisory.findings.flatMap((finding) => [finding.version]),
  );
  const isDevOnly = advisory.findings.every((finding) => finding.dev === true);

  if (exception.reviewBy < today) {
    failures.push(
      `${advisory.github_advisory_id}: exception expired on ${exception.reviewBy}`,
    );
  }
  if (advisory.module_name !== exception.package) {
    failures.push(
      `${advisory.github_advisory_id}: expected package ${exception.package}, found ${advisory.module_name}`,
    );
  }
  if (advisory.severity !== exception.severity) {
    failures.push(
      `${advisory.github_advisory_id}: expected severity ${exception.severity}, found ${advisory.severity}`,
    );
  }
  if (versions.size !== 1 || !versions.has(exception.version)) {
    failures.push(
      `${advisory.github_advisory_id}: expected version ${exception.version}, found ${[...versions].join(", ")}`,
    );
  }
  if (exception.devOnly && !isDevOnly) {
    failures.push(
      `${advisory.github_advisory_id}: dependency is no longer development-only`,
    );
  }

  exceptions.delete(advisory.github_advisory_id);
}

for (const [githubAdvisoryId] of exceptions) {
  failures.push(
    `${githubAdvisoryId}: exception is stale because the advisory is no longer reported`,
  );
}

if (failures.length > 0) {
  console.error("Dependency audit policy failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

for (const exception of policy.exceptions) {
  console.warn(
    `Accepted temporarily: ${exception.githubAdvisoryId} (${exception.package}@${exception.version}, review by ${exception.reviewBy}, owner ${exception.owner})`,
  );
}

console.log("Dependency audit matches the reviewed exception policy.");
