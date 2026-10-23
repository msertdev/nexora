import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DEFAULT_DEMO_EMAIL = "demo.owner@nexora.test";
const DEFAULT_CAPTURE_INSTANT = `${new Date().toISOString().slice(0, 10)}T12:00:00.000Z`;
const CAPTURE_INSTANT =
  process.env.NEXORA_CAPTURE_DATE ?? DEFAULT_CAPTURE_INSTANT;
const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const THEME_KEY = "nexora.workspace.theme";
const UI_TIMEOUT = 15_000;
const MAX_SCREENSHOT_BYTES = 500_000;
const MAX_GIF_BYTES = 5_000_000;

const seed = Object.freeze({
  ownerName: "NEXORA Demo Owner",
  members: [
    {
      name: "NEXORA Demo Admin",
      email: "demo.admin@nexora.test",
      role: "ADMIN",
    },
    {
      name: "NEXORA Demo Engineer",
      email: "demo.engineer@nexora.test",
      role: "MEMBER",
    },
    {
      name: "NEXORA Demo Reviewer",
      email: "demo.reviewer@nexora.test",
      role: "MEMBER",
    },
  ],
  organization: "NEXORA AI Lab (Demo)",
  projectLabel: "NEXORA AI Agent v1 · AGENT",
  issueTitles: [
    "Define agent execution contract",
    "Build planner and executor loop",
    "Implement tool registry and permission policy",
  ],
});

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readDemoPassword() {
  const password = requiredEnvironment("NEXORA_DEMO_PASSWORD");
  delete process.env.NEXORA_DEMO_PASSWORD;
  if (password.length < 12 || password.length > 128) {
    throw new Error(
      "NEXORA_DEMO_PASSWORD must contain between 12 and 128 characters",
    );
  }
  return password;
}

function isWithin(parent, candidate) {
  const pathFromParent = relative(parent, candidate);
  return (
    pathFromParent === "" ||
    (!pathFromParent.startsWith("..") && !isAbsolute(pathFromParent))
  );
}

async function physicalPathFor(candidate) {
  let cursor = resolve(candidate);
  const missingSegments = [];

  for (;;) {
    try {
      const existingRealPath = await realpath(cursor);
      return resolve(existingRealPath, ...missingSegments);
    } catch (error) {
      if (!(error instanceof Error) || error.code !== "ENOENT") throw error;
      const parent = dirname(cursor);
      if (parent === cursor) throw error;
      missingSegments.unshift(basename(cursor));
      cursor = parent;
    }
  }
}

async function requireOutsideRepository(candidate, label) {
  const repositoryRealPath = await realpath(REPOSITORY_ROOT);
  const physicalCandidate = await physicalPathFor(candidate);
  if (isWithin(repositoryRealPath, physicalCandidate)) {
    throw new Error(`${label} must be outside the repository`);
  }
  return physicalCandidate;
}

async function requireInsideRepository(candidate, label) {
  const repositoryRealPath = await realpath(REPOSITORY_ROOT);
  const physicalCandidate = await physicalPathFor(candidate);
  if (
    physicalCandidate === repositoryRealPath ||
    !isWithin(repositoryRealPath, physicalCandidate)
  ) {
    throw new Error(`${label} must be a subdirectory inside the repository`);
  }
  return physicalCandidate;
}

function parseLoopbackBaseUrl(rawValue) {
  let url;
  try {
    url = new URL(rawValue);
  } catch {
    throw new Error("BASE_URL must be an absolute URL");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("BASE_URL must use http: or https:");
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new Error("BASE_URL must point to a loopback host");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      "BASE_URL must not contain credentials, a query, or a hash",
    );
  }
  if (url.pathname !== "/") {
    throw new Error("BASE_URL must be an origin without a path");
  }
  return url.origin;
}

async function loadPlaywright(playwrightDirectory) {
  const absoluteDirectory = await requireOutsideRepository(
    resolve(playwrightDirectory),
    "NEXORA_PLAYWRIGHT_DIR",
  );
  const playwrightRealPath = await realpath(absoluteDirectory).catch(() => {
    throw new Error(
      "NEXORA_PLAYWRIGHT_DIR does not exist; install Playwright there first",
    );
  });

  const requireFromThrowaway = createRequire(
    join(playwrightRealPath, "package.json"),
  );
  let playwrightEntry;
  try {
    playwrightEntry = requireFromThrowaway.resolve("playwright");
  } catch {
    throw new Error("Playwright is not installed under NEXORA_PLAYWRIGHT_DIR");
  }
  const playwrightEntryRealPath = await realpath(playwrightEntry);
  if (!isWithin(playwrightRealPath, playwrightEntryRealPath)) {
    throw new Error(
      "Playwright resolved outside NEXORA_PLAYWRIGHT_DIR; use an isolated throwaway installation",
    );
  }

  const module = await import(pathToFileURL(playwrightEntryRealPath).href);
  const chromium = module.chromium ?? module.default?.chromium;
  if (!chromium)
    throw new Error("The external Playwright package has no Chromium API");
  return { chromium };
}

async function createRunDirectory() {
  const configuredOutput = process.env.NEXORA_CAPTURE_OUTPUT?.trim();
  if (!configuredOutput) {
    const temporaryRoot = await requireOutsideRepository(
      resolve(tmpdir()),
      "The operating-system temporary directory",
    );
    const runDirectory = await mkdtemp(join(temporaryRoot, "nexora-capture-"));
    return requireOutsideRepository(runDirectory, "The capture run directory");
  }

  const outputRoot = await requireOutsideRepository(
    resolve(configuredOutput),
    "NEXORA_CAPTURE_OUTPUT",
  );
  await mkdir(outputRoot, { recursive: true });
  const outputRealPath = await realpath(outputRoot);
  await requireOutsideRepository(outputRealPath, "NEXORA_CAPTURE_OUTPUT");

  const runId = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replaceAll(".", "-");
  const runDirectory = join(outputRealPath, `capture-${runId}-${process.pid}`);
  await mkdir(runDirectory, { recursive: false });
  return requireOutsideRepository(runDirectory, "The capture run directory");
}

async function prepareAssetOutput() {
  const configuredOutput = process.env.NEXORA_ASSET_OUTPUT?.trim();
  const requestedOutput = configuredOutput
    ? isAbsolute(configuredOutput)
      ? configuredOutput
      : resolve(REPOSITORY_ROOT, configuredOutput)
    : join(REPOSITORY_ROOT, "docs", "images");
  const assetOutput = await requireInsideRepository(
    requestedOutput,
    "NEXORA_ASSET_OUTPUT",
  );
  await mkdir(assetOutput, { recursive: true });
  const assetOutputRealPath = await realpath(assetOutput);
  await requireInsideRepository(assetOutputRealPath, "NEXORA_ASSET_OUTPUT");
  return assetOutputRealPath;
}

function runFfmpeg(ffmpegPath, arguments_, label) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(ffmpegPath, arguments_, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    let diagnostics = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      diagnostics = `${diagnostics}${chunk}`.slice(-16_000);
    });
    child.once("error", () => {
      rejectPromise(
        new Error(
          `${label} could not start; check FFMPEG_PATH and permissions`,
        ),
      );
    });
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      const suffix = diagnostics.trim()
        ? `\n${diagnostics.trim()}`
        : signal
          ? ` (signal ${signal})`
          : "";
      rejectPromise(
        new Error(`${label} failed with exit code ${code}${suffix}`),
      );
    });
  });
}

async function validateFfmpeg(ffmpegPath) {
  await runFfmpeg(
    ffmpegPath,
    ["-hide_banner", "-version"],
    "FFmpeg validation",
  );
}

async function encodeScreenshot(ffmpegPath, source, destination) {
  const qualities = [82, 74, 66, 58, 50];
  for (const quality of qualities) {
    await runFfmpeg(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        source,
        "-frames:v",
        "1",
        "-map_metadata",
        "-1",
        "-c:v",
        "libwebp",
        "-lossless",
        "0",
        "-preset",
        "text",
        "-quality",
        String(quality),
        destination,
      ],
      `WebP encoding for ${basename(destination)}`,
    );
    const output = await stat(destination);
    if (output.size > 0 && output.size < MAX_SCREENSHOT_BYTES)
      return output.size;
  }
  const output = await stat(destination);
  throw new Error(
    `${basename(destination)} is ${output.size} bytes; screenshots must be smaller than ${MAX_SCREENSHOT_BYTES} bytes`,
  );
}

async function encodeGif(ffmpegPath, rawVideoPath, stagingDirectory) {
  const palettePath = join(stagingDirectory, "nexora-demo-palette.png");
  const gifPath = join(stagingDirectory, "nexora-demo.gif");
  const attempts = [
    { width: 1000, fps: 12, colors: 96 },
    { width: 1000, fps: 12, colors: 64 },
    { width: 960, fps: 12, colors: 64 },
    { width: 900, fps: 12, colors: 48 },
  ];

  for (const { width, fps, colors } of attempts) {
    await runFfmpeg(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        rawVideoPath,
        "-vf",
        `fps=${fps},scale=${width}:-2:flags=lanczos,palettegen=max_colors=${colors}:stats_mode=diff`,
        "-frames:v",
        "1",
        palettePath,
      ],
      "GIF palette generation",
    );
    await runFfmpeg(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        rawVideoPath,
        "-i",
        palettePath,
        "-filter_complex",
        `[0:v]fps=${fps},scale=${width}:-2:flags=lanczos[scaled];[scaled][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
        "-loop",
        "0",
        "-an",
        gifPath,
      ],
      "GIF encoding",
    );
    const output = await stat(gifPath);
    if (output.size > 0 && output.size < MAX_GIF_BYTES) return gifPath;
  }

  const output = await stat(gifPath);
  throw new Error(
    `nexora-demo.gif is ${output.size} bytes; the final GIF must be smaller than ${MAX_GIF_BYTES} bytes`,
  );
}

async function encodeFinalAssets(ffmpegPath, runDirectory, rawVideoPath) {
  const stagingDirectory = join(runDirectory, "final-staging");
  await mkdir(stagingDirectory);
  const screenshotSpecs = [
    {
      source: join(runDirectory, "desktop-light-issue-list.png"),
      name: "nexora-issue-list-light.webp",
    },
    {
      source: join(runDirectory, "desktop-dark-issue-list.png"),
      name: "nexora-issue-list-dark.webp",
    },
    {
      source: join(runDirectory, "desktop-dark-issue-detail.png"),
      name: "nexora-issue-detail.webp",
    },
    {
      source: join(runDirectory, "desktop-dark-create-issue.png"),
      name: "nexora-create-issue.webp",
    },
    {
      source: join(runDirectory, "desktop-dark-members-roles.png"),
      name: "nexora-members-roles.webp",
    },
    {
      source: join(runDirectory, "desktop-dark-roadmap.png"),
      name: "nexora-roadmap.webp",
    },
    {
      source: join(runDirectory, "mobile-dark-issue-list.png"),
      name: "nexora-mobile-issue-list.webp",
    },
  ];

  const assets = [];
  for (const screenshot of screenshotSpecs) {
    const stagedPath = join(stagingDirectory, screenshot.name);
    await encodeScreenshot(ffmpegPath, screenshot.source, stagedPath);
    assets.push({ name: screenshot.name, stagedPath });
  }

  const finalWebmPath = join(stagingDirectory, "nexora-demo.webm");
  await runFfmpeg(
    ffmpegPath,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      rawVideoPath,
      "-vf",
      "scale=1440:-2:flags=lanczos,fps=24",
      "-map_metadata",
      "-1",
      "-an",
      "-c:v",
      "libvpx-vp9",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "34",
      "-b:v",
      "0",
      "-deadline",
      "good",
      "-cpu-used",
      "2",
      "-row-mt",
      "1",
      finalWebmPath,
    ],
    "WebM encoding",
  );
  if ((await stat(finalWebmPath)).size === 0) {
    throw new Error("nexora-demo.webm is empty");
  }
  assets.push({ name: "nexora-demo.webm", stagedPath: finalWebmPath });

  const gifPath = await encodeGif(ffmpegPath, rawVideoPath, stagingDirectory);
  assets.push({ name: "nexora-demo.gif", stagedPath: gifPath });
  return assets;
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function publishFinalAssets(assets, assetOutput) {
  const stamp = `${Date.now()}-${process.pid}`;
  const records = assets.map(({ name, stagedPath }) => {
    if (basename(name) !== name)
      throw new Error(`Unsafe final asset name: ${name}`);
    return {
      name,
      stagedPath,
      destination: join(assetOutput, name),
      temporary: join(assetOutput, `.${name}.${stamp}.new`),
      backup: join(assetOutput, `.${name}.${stamp}.backup`),
      backedUp: false,
      installed: false,
    };
  });

  try {
    for (const record of records) {
      await copyFile(record.stagedPath, record.temporary);
      const [staged, copied] = await Promise.all([
        stat(record.stagedPath),
        stat(record.temporary),
      ]);
      if (staged.size === 0 || copied.size !== staged.size) {
        throw new Error(
          `Final asset copy verification failed for ${record.name}`,
        );
      }
    }

    for (const record of records) {
      if (await pathExists(record.destination)) {
        await rename(record.destination, record.backup);
        record.backedUp = true;
      }
      await rename(record.temporary, record.destination);
      record.installed = true;
    }
  } catch (error) {
    for (const record of [...records].reverse()) {
      try {
        if (record.installed) await rm(record.destination, { force: true });
        if (record.backedUp) await rename(record.backup, record.destination);
        await rm(record.temporary, { force: true });
      } catch {
        // Keep attempting to restore the remaining exact, precomputed paths.
      }
    }
    throw error;
  }

  for (const record of records) {
    if (!record.backedUp) continue;
    try {
      await rm(record.backup, { force: true });
    } catch {
      console.error(`Warning: stale backup remains at ${record.backup}`);
    }
  }

  return records.map((record) => record.destination);
}

function contextOptions(overrides = {}) {
  return {
    viewport: DESKTOP_VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: "dark",
    reducedMotion: "reduce",
    locale: "en-GB",
    timezoneId: "UTC",
    ignoreHTTPSErrors: true,
    ...overrides,
  };
}

async function freezeBrowserClock(context, captureInstant) {
  const fixedNow = Date.parse(captureInstant);
  if (!Number.isFinite(fixedNow)) {
    throw new Error("NEXORA_CAPTURE_DATE must be a valid ISO-8601 timestamp");
  }

  await context.addInitScript(
    ({ now }) => {
      const BrowserDate = Date;
      function CaptureDate(...arguments_) {
        if (!new.target) return new BrowserDate(now).toString();
        if (arguments_.length === 0) return new BrowserDate(now);
        return new BrowserDate(...arguments_);
      }
      CaptureDate.prototype = BrowserDate.prototype;
      Object.setPrototypeOf(CaptureDate, BrowserDate);
      Object.defineProperty(CaptureDate, "now", {
        configurable: true,
        value() {
          return now;
        },
      });
      Object.defineProperty(globalThis, "Date", {
        configurable: true,
        value: CaptureDate,
      });
    },
    { now: fixedNow },
  );
}

async function waitForFontsAndPaint(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await page.waitForTimeout(150);
}

async function installDemoCursor(page) {
  await page.evaluate(() => {
    if (document.querySelector("[data-nexora-capture-cursor]")) return;
    const cursor = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    cursor.setAttribute("data-nexora-capture-cursor", "true");
    cursor.setAttribute("width", "30");
    cursor.setAttribute("height", "38");
    cursor.setAttribute("viewBox", "0 0 30 38");
    cursor.setAttribute("aria-hidden", "true");
    cursor.innerHTML =
      '<path d="M3 2.5 25.2 24l-10.4 1.1 5.7 8.8-5.1 3.1-5.5-8.8L3 36V2.5Z" fill="#fff" stroke="#15161a" stroke-width="2.2" stroke-linejoin="round"/><circle cx="4" cy="3.5" r="2.2" fill="#9b75e8"/>';
    Object.assign(cursor.style, {
      position: "fixed",
      left: "0",
      top: "0",
      zIndex: "2147483647",
      pointerEvents: "none",
      filter: "drop-shadow(0 3px 4px rgba(0,0,0,.45))",
      opacity: "0",
      transform: "translate3d(32px, 32px, 0)",
      transformOrigin: "3px 3px",
    });
    document.documentElement.append(cursor);

    let x = 32;
    let y = 32;
    globalThis.__nexoraCaptureCursor = {
      async moveTo(nextX, nextY, duration) {
        cursor.style.opacity = "1";
        const animation = cursor.animate(
          [
            { transform: `translate3d(${x}px, ${y}px, 0)` },
            { transform: `translate3d(${nextX}px, ${nextY}px, 0)` },
          ],
          {
            duration,
            easing: "cubic-bezier(.22,.8,.3,1)",
            fill: "forwards",
          },
        );
        await animation.finished;
        x = nextX;
        y = nextY;
      },
      async pulse() {
        const animation = cursor.animate(
          [
            { transform: `translate3d(${x}px, ${y}px, 0) scale(1)` },
            { transform: `translate3d(${x}px, ${y}px, 0) scale(.78)` },
            { transform: `translate3d(${x}px, ${y}px, 0) scale(1)` },
          ],
          { duration: 280, easing: "ease-out" },
        );
        await animation.finished;
      },
    };
  });
}

async function moveDemoCursor(page, locator, duration = 650) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("A demo control has no visible bounding box");
  const x = Math.round(box.x + Math.min(box.width * 0.7, box.width - 8));
  const y = Math.round(box.y + box.height / 2);
  await page.evaluate(
    async ({ nextX, nextY, milliseconds }) => {
      const cursor = globalThis.__nexoraCaptureCursor;
      if (!cursor) throw new Error("The demo cursor is not installed");
      await cursor.moveTo(nextX, nextY, milliseconds);
    },
    { nextX: x, nextY: y, milliseconds: duration },
  );
}

async function cursorClick(page, locator) {
  await moveDemoCursor(page, locator);
  await page.waitForTimeout(180);
  await Promise.all([
    locator.click(),
    page.evaluate(async () => {
      await globalThis.__nexoraCaptureCursor?.pulse();
    }),
  ]);
}

async function cursorSelect(page, locator, value) {
  await moveDemoCursor(page, locator);
  await page.waitForTimeout(180);
  await locator.click();
  await page.evaluate(async () => {
    await globalThis.__nexoraCaptureCursor?.pulse();
  });
  await locator.selectOption(value);
}

function monitorPage(page) {
  const problems = [];
  page.on("pageerror", (error) => {
    problems.push(`page error: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      problems.push(`console error: ${message.text()}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      problems.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });
  return problems;
}

async function assertNoUiFeedback(page, label) {
  const alert = page.locator('[role="alert"]:visible');
  const alertMessages = (await alert.allTextContents())
    .map((message) => message.trim())
    .filter(Boolean);
  if (alertMessages.length > 0) {
    throw new Error(`${label} contains an alert: ${alertMessages.join(" | ")}`);
  }

  const toast = page.locator(
    ".workspace-success:visible, .workspace-management-success:visible, .auth-notice:visible",
  );
  const toastCount = await toast.count();
  if (toastCount > 0) {
    throw new Error(
      `${label} contains a transient toast: ${(await toast.allTextContents()).join(" | ")}`,
    );
  }
}

function assertNoBrowserProblems(problems, label) {
  if (problems.length > 0) {
    throw new Error(
      `${label} encountered browser errors:\n${problems.join("\n")}`,
    );
  }
}

async function capture(page, path, label, browserProblems) {
  await waitForFontsAndPaint(page);
  await assertNoUiFeedback(page, label);
  assertNoBrowserProblems(browserProblems, label);
  await page.screenshot({
    path,
    animations: "disabled",
    caret: "hide",
    fullPage: false,
  });
}

async function login(page, baseUrl, email, password) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  const emailField = page.getByLabel("Email", { exact: true });
  await emailField.waitFor({ state: "visible", timeout: UI_TIMEOUT });
  await emailField.fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /^Sign in/ }).click();

  try {
    await page.waitForURL(
      (url) => url.origin === baseUrl && url.pathname === "/",
      { timeout: UI_TIMEOUT },
    );
  } catch {
    const message = await page
      .locator('[role="alert"]:visible')
      .allTextContents()
      .catch(() => []);
    throw new Error(
      `Demo login did not reach the workspace${message.length ? `: ${message.join(" | ")}` : ""}`,
    );
  }

  await page
    .getByRole("heading", { name: "Issues", level: 1 })
    .waitFor({ state: "visible", timeout: UI_TIMEOUT });
}

async function selectSeedScope(page) {
  const sidebar = page.locator(".workspace-sidebar");
  const workspaceTrigger = sidebar.locator(
    '.workspace-switcher__trigger[aria-haspopup="menu"]',
  );
  await workspaceTrigger.waitFor({ state: "visible", timeout: UI_TIMEOUT });
  await workspaceTrigger.click();

  const workspaceMenu = page.getByRole("menu", { name: "Workspaces" });
  await workspaceMenu.waitFor({ state: "visible", timeout: UI_TIMEOUT });
  const organization = workspaceMenu
    .getByRole("menuitemradio")
    .filter({ hasText: seed.organization });
  await organization.waitFor({ state: "visible", timeout: UI_TIMEOUT });
  await organization.click();

  const project = page.getByLabel("Project", { exact: true });
  await project.waitFor({ state: "visible", timeout: UI_TIMEOUT });
  await page.waitForFunction(
    ({ label }) =>
      [
        ...document.querySelectorAll('select[aria-label="Project"] option'),
      ].some((option) => option.textContent?.trim() === label),
    { label: seed.projectLabel },
    { timeout: UI_TIMEOUT },
  );
  await project.selectOption({ label: seed.projectLabel });

  const issueList = page.locator('[aria-label="Issues in selected project"]');
  await issueList.waitFor({ state: "visible", timeout: UI_TIMEOUT });
  for (const title of seed.issueTitles) {
    await issueList
      .getByText(title, { exact: true })
      .waitFor({ state: "visible", timeout: UI_TIMEOUT });
  }
}

async function setTheme(page, theme) {
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: THEME_KEY, value: theme },
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    (expectedTheme) => document.documentElement.dataset.theme === expectedTheme,
    theme,
    { timeout: UI_TIMEOUT },
  );
  await page
    .getByRole("heading", { name: "Issues", level: 1 })
    .waitFor({ state: "visible", timeout: UI_TIMEOUT });
  await selectSeedScope(page);
}

function seedIssueRow(page, title = seed.issueTitles[0]) {
  return page
    .locator('[aria-label="Issues in selected project"] .issue-row')
    .filter({ hasText: title })
    .first();
}

async function openSeedIssueDetails(page) {
  const row = seedIssueRow(page);
  await row.locator("button.issue-row__main").click();
  const panel = page.locator('aside[aria-label="Issue details"]');
  await panel.waitFor({ state: "visible", timeout: UI_TIMEOUT });
  await panel
    .getByRole("heading", { name: seed.issueTitles[0], exact: true })
    .waitFor({ state: "visible", timeout: UI_TIMEOUT });
  return panel;
}

async function openCreateIssueDialog(page) {
  await page
    .locator(".workspace-sidebar")
    .getByRole("button", { name: /New issue/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Create an issue" });
  await dialog.waitFor({ state: "visible", timeout: UI_TIMEOUT });
  return dialog;
}

async function openMembersDialog(page) {
  const sidebar = page.locator(".workspace-sidebar");
  await sidebar
    .locator('.workspace-switcher__trigger[aria-haspopup="menu"]')
    .click();
  const workspaceMenu = page.getByRole("menu", { name: "Workspaces" });
  await workspaceMenu.getByRole("menuitem", { name: "View members" }).click();

  const dialog = page.getByRole("dialog", {
    name: seed.organization,
    exact: true,
  });
  await dialog.waitFor({ state: "visible", timeout: UI_TIMEOUT });
  await dialog
    .getByText(seed.ownerName, { exact: true })
    .waitFor({ state: "visible", timeout: UI_TIMEOUT });
  await dialog
    .getByText("OWNER", { exact: true })
    .waitFor({ state: "visible", timeout: UI_TIMEOUT });
  for (const member of seed.members) {
    await dialog
      .getByText(member.name, { exact: true })
      .waitFor({ state: "visible", timeout: UI_TIMEOUT });
    await dialog
      .getByText(member.email, { exact: true })
      .waitFor({ state: "visible", timeout: UI_TIMEOUT });
    const role = dialog.getByLabel(`Role for ${member.name}`, { exact: true });
    await role.waitFor({ state: "visible", timeout: UI_TIMEOUT });
    if ((await role.inputValue()) !== member.role) {
      throw new Error(
        `${member.name} does not have the seeded ${member.role} role`,
      );
    }
  }
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[role="status"]')].every(
      (element) => !element.textContent?.includes("Loading"),
    ),
  );
  return dialog;
}

async function openRoadmap(page) {
  await page
    .getByRole("navigation", { name: "Workspace navigation" })
    .getByRole("button", { name: "Roadmap", exact: true })
    .click();
  const board = page.locator(".issue-board");
  await board.waitFor({ state: "visible", timeout: UI_TIMEOUT });
  for (const title of seed.issueTitles) {
    await board
      .getByText(title, { exact: true })
      .waitFor({ state: "visible", timeout: UI_TIMEOUT });
  }
  return board;
}

async function openInbox(page) {
  await page
    .locator(".workspace-sidebar")
    .getByRole("button", { name: /^Inbox\b/ })
    .click();
  await page
    .locator('[aria-label="Issues in selected project"]')
    .waitFor({ state: "visible", timeout: UI_TIMEOUT });
}

async function captureDesktopTheme(page, runDirectory, theme, browserProblems) {
  await page.setViewportSize(DESKTOP_VIEWPORT);
  await setTheme(page, theme);

  await capture(
    page,
    join(runDirectory, `desktop-${theme}-issue-list.png`),
    `${theme} issue list`,
    browserProblems,
  );

  const detailPanel = await openSeedIssueDetails(page);
  await capture(
    page,
    join(runDirectory, `desktop-${theme}-issue-detail.png`),
    `${theme} issue detail`,
    browserProblems,
  );
  await detailPanel.getByRole("button", { name: "Close details" }).click();

  const createDialog = await openCreateIssueDialog(page);
  await capture(
    page,
    join(runDirectory, `desktop-${theme}-create-issue.png`),
    `${theme} create issue dialog`,
    browserProblems,
  );
  await createDialog.getByRole("button", { name: "Cancel" }).click();

  const membersDialog = await openMembersDialog(page);
  await capture(
    page,
    join(runDirectory, `desktop-${theme}-members-roles.png`),
    `${theme} members and roles dialog`,
    browserProblems,
  );
  await membersDialog.getByRole("button", { name: "Close dialog" }).click();

  await openRoadmap(page);
  await capture(
    page,
    join(runDirectory, `desktop-${theme}-roadmap.png`),
    `${theme} roadmap`,
    browserProblems,
  );
  await openInbox(page);
}

async function captureMobile(page, runDirectory, browserProblems) {
  await setTheme(page, "dark");
  await page.setViewportSize(MOBILE_VIEWPORT);
  const mobileNavigation = page.getByRole("navigation", {
    name: "Workspace views",
  });
  await mobileNavigation.waitFor({ state: "visible", timeout: UI_TIMEOUT });
  await mobileNavigation
    .getByRole("button", { name: "Inbox", exact: true })
    .click();
  await capture(
    page,
    join(runDirectory, "mobile-dark-issue-list.png"),
    "mobile dark issue list",
    browserProblems,
  );
}

async function recordDemoVideo(browser, storageState, baseUrl, runDirectory) {
  const videoDirectory = join(runDirectory, "raw-video");
  await mkdir(videoDirectory);
  const context = await browser.newContext(
    contextOptions({
      storageState,
      recordVideo: {
        dir: videoDirectory,
        size: DESKTOP_VIEWPORT,
      },
    }),
  );
  await freezeBrowserClock(context, CAPTURE_INSTANT);
  const page = await context.newPage();
  const problems = monitorPage(page);
  const video = page.video();
  const startedAt = Date.now();
  const pause = (milliseconds) => page.waitForTimeout(milliseconds);

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Issues", level: 1 })
      .waitFor({ state: "visible", timeout: UI_TIMEOUT });
    await selectSeedScope(page);
    await assertNoUiFeedback(page, "video start");
    await installDemoCursor(page);
    await pause(1_200);

    const newIssueButton = page
      .locator(".workspace-sidebar")
      .getByRole("button", { name: /New issue/ });
    await cursorClick(page, newIssueButton);
    const dialog = page.getByRole("dialog", { name: "Create an issue" });
    await dialog.waitFor({ state: "visible", timeout: UI_TIMEOUT });
    await pause(900);
    const videoIssueTitle = `Demonstrate agent execution lifecycle ${new Date()
      .toISOString()
      .slice(11, 19)} UTC`;
    const title = dialog.getByLabel("Title", { exact: true });
    await cursorClick(page, title);
    await title.pressSequentially(videoIssueTitle, { delay: 24 });
    await pause(800);
    const description = dialog.getByLabel("Description", { exact: true });
    await cursorClick(page, description);
    await description.fill(
      "Show a governed create, assignment, prioritisation, and status transition for the NEXORA AI Agent.",
    );
    await pause(1_000);

    const assignee = dialog
      .locator("label")
      .filter({ hasText: /^Assignee/ })
      .locator("select");
    await page.waitForFunction(
      ({ assigneeName, assigneeEmail }) => {
        const select = document.querySelector('[role="dialog"] select');
        if (!(select instanceof HTMLSelectElement) || select.disabled)
          return false;
        const expected = `${assigneeName} (${assigneeEmail})`;
        return [...select.options].some(
          (option) => option.textContent?.trim() === expected,
        );
      },
      {
        assigneeName: seed.members[1].name,
        assigneeEmail: seed.members[1].email,
      },
      { timeout: UI_TIMEOUT },
    );
    await cursorSelect(page, assignee, {
      label: `${seed.members[1].name} (${seed.members[1].email})`,
    });
    await pause(1_500);
    await cursorSelect(
      page,
      dialog
        .locator("label")
        .filter({ hasText: /^Priority/ })
        .locator("select"),
      "HIGH",
    );
    await pause(1_500);
    await cursorSelect(
      page,
      dialog
        .locator("label")
        .filter({ hasText: /^Status/ })
        .locator("select"),
      "IN_PROGRESS",
    );
    await pause(1_500);
    await cursorClick(
      page,
      dialog.getByRole("button", { name: "Create issue" }),
    );

    await page
      .getByRole("status")
      .filter({ hasText: "Issue created." })
      .waitFor({ state: "visible", timeout: UI_TIMEOUT });
    await pause(1_500);

    const createdRow = seedIssueRow(page, videoIssueTitle);
    await createdRow.waitFor({ state: "visible", timeout: UI_TIMEOUT });
    await cursorClick(page, createdRow.locator("button.issue-row__main"));
    const details = page.locator('aside[aria-label="Issue details"]');
    await details.waitFor({ state: "visible", timeout: UI_TIMEOUT });
    await details
      .getByRole("heading", { name: videoIssueTitle, exact: true })
      .waitFor({ state: "visible", timeout: UI_TIMEOUT });
    await pause(1_500);
    await cursorClick(
      page,
      details.getByRole("button", { name: "Close details" }),
    );

    const roadmapButton = page
      .getByRole("navigation", { name: "Workspace navigation" })
      .getByRole("button", { name: "Roadmap", exact: true });
    await cursorClick(page, roadmapButton);
    await page
      .locator(".issue-board")
      .waitFor({ state: "visible", timeout: UI_TIMEOUT });
    await page
      .locator(".issue-board")
      .getByText(videoIssueTitle, { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: UI_TIMEOUT });
    assertNoBrowserProblems(problems, "demo video");

    const minimumDuration = 23_000;
    const remaining = minimumDuration - (Date.now() - startedAt);
    if (remaining > 0) await pause(remaining);
    const duration = Date.now() - startedAt;
    if (duration > 30_000) {
      throw new Error(
        `Demo video took ${duration}ms; expected a successful local run to stay below 30 seconds`,
      );
    }
    assertNoBrowserProblems(problems, "demo video");
  } finally {
    await page.close();
    await context.close();
  }

  if (!video) throw new Error("Playwright did not create a video artifact");
  return video.path();
}

const baseUrl = parseLoopbackBaseUrl(requiredEnvironment("BASE_URL"));
const playwrightDirectory = requiredEnvironment("NEXORA_PLAYWRIGHT_DIR");
let demoPassword = readDemoPassword();
const demoEmail =
  process.env.NEXORA_DEMO_EMAIL?.trim().toLowerCase() ?? DEFAULT_DEMO_EMAIL;
const ffmpegPath = process.env.FFMPEG_PATH?.trim() || "ffmpeg";
const runDirectory = await createRunDirectory();
await validateFfmpeg(ffmpegPath);
const { chromium } = await loadPlaywright(playwrightDirectory);
const browser = await chromium.launch({ headless: true });
let rawVideoPath;

try {
  const context = await browser.newContext(contextOptions());
  await freezeBrowserClock(context, CAPTURE_INSTANT);
  const page = await context.newPage();

  await login(page, baseUrl, demoEmail, demoPassword);
  demoPassword = "";
  const browserProblems = monitorPage(page);
  await selectSeedScope(page);

  for (const theme of ["light", "dark"]) {
    await captureDesktopTheme(page, runDirectory, theme, browserProblems);
  }
  await captureMobile(page, runDirectory, browserProblems);

  const storageState = await context.storageState();
  await context.close();
  rawVideoPath = await recordDemoVideo(
    browser,
    storageState,
    baseUrl,
    runDirectory,
  );
} finally {
  demoPassword = "";
  await browser.close();
}

const stagedAssets = await encodeFinalAssets(
  ffmpegPath,
  runDirectory,
  rawVideoPath,
);
const assetOutput = await prepareAssetOutput();
const finalAssets = await publishFinalAssets(stagedAssets, assetOutput);
console.error(`Screenshots written under ${runDirectory}`);
console.error(
  `${finalAssets.length} final asset candidates published under ${assetOutput}; inspect them before committing`,
);
process.stdout.write(`${rawVideoPath}\n`);
