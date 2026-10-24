import { expect, test, type Page } from "@playwright/test";

const credentials = {
  member: {
    email: process.env.NEXORA_E2E_MEMBER_EMAIL ?? "",
    password: process.env.NEXORA_E2E_MEMBER_PASSWORD ?? "",
  },
  nonMember: {
    email: process.env.NEXORA_E2E_NON_MEMBER_EMAIL ?? "",
    password: process.env.NEXORA_E2E_NON_MEMBER_PASSWORD ?? "",
  },
};
const issuePath = process.env.NEXORA_E2E_ISSUE_PATH ?? "";

test.beforeAll(() => {
  const missing = [
    ["NEXORA_E2E_MEMBER_EMAIL", credentials.member.email],
    ["NEXORA_E2E_MEMBER_PASSWORD", credentials.member.password],
    ["NEXORA_E2E_NON_MEMBER_EMAIL", credentials.nonMember.email],
    ["NEXORA_E2E_NON_MEMBER_PASSWORD", credentials.nonMember.password],
    ["NEXORA_E2E_ISSUE_PATH", issuePath],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing required E2E environment: ${missing.join(", ")}`);
  }
  if (!/^\/orgs\/[^/]+\/projects\/[^/]+\/issues\/[1-9]\d*$/.test(issuePath)) {
    throw new Error("NEXORA_E2E_ISSUE_PATH must be a relative issue permalink");
  }
});

async function signIn(
  page: Page,
  account: { email: string; password: string },
  returnTo: string,
) {
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel("Email").fill(account.email);
  await page.locator('input[name="password"]').fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(returnTo)}$`));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function openKnownIssueFromList(page: Page) {
  await signIn(page, credentials.member, issuePath);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const identifier = (
    await dialog.locator(".detail-panel__topline > span").innerText()
  ).trim();

  await dialog.getByRole("button", { name: "Close details" }).click();
  await expect(page).toHaveURL(/\/$/);

  const trigger = page.locator(".issue-row__main").filter({
    hasText: identifier,
  });
  await expect(trigger).toBeVisible();
  return trigger;
}

test("opens an issue permalink after a full refresh", async ({ page }) => {
  await signIn(page, credentials.member, issuePath);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const title = await dialog.getByRole("heading", { level: 2 }).innerText();

  await page.reload();

  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(issuePath)}$`));
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(title);
});

test("keeps issue state in sync with browser back and forward", async ({
  page,
}) => {
  const trigger = await openKnownIssueFromList(page);
  await trigger.click();
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(issuePath)}$`));
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(issuePath)}$`));
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("shows the same safe not-found panel to a non-member", async ({
  page,
}) => {
  await signIn(page, credentials.nonMember, issuePath);

  const dialog = page.getByRole("dialog", { name: "Issue not found" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(
    "This issue does not exist or you do not have access to it.",
  );
});

test("Escape closes the issue panel and restores focus to its trigger", async ({
  page,
}) => {
  const trigger = await openKnownIssueFromList(page);
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("copies the canonical issue permalink", async ({ page, baseURL }) => {
  await signIn(page, credentials.member, issuePath);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Copy issue link" }).click();

  await expect(dialog.getByRole("status")).toHaveText("Issue link copied.");
  const clipboardValue = await page.evaluate(() =>
    navigator.clipboard.readText(),
  );
  expect(clipboardValue).toBe(new URL(issuePath, baseURL).toString());
});
