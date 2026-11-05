import { expect, test, type Page } from "@playwright/test";

const email = process.env.NEXORA_E2E_MEMBER_EMAIL ?? "";
const password = process.env.NEXORA_E2E_MEMBER_PASSWORD ?? "";
const issuePath = process.env.NEXORA_E2E_ISSUE_PATH ?? "";

test.beforeEach(async ({ page }) => {
  if (
    !email ||
    !password ||
    !/^\/orgs\/[^/]+\/projects\/[^/]+\/issues\/[1-9]\d*$/.test(issuePath)
  ) {
    throw new Error(
      "Set NEXORA_E2E_MEMBER_EMAIL, NEXORA_E2E_MEMBER_PASSWORD and NEXORA_E2E_ISSUE_PATH for an isolated test stack.",
    );
  }
  await page.goto("/login?returnTo=" + encodeURIComponent(issuePath));
  await page.getByLabel("Email").fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Comments", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add comment", exact: true }),
  ).toBeDisabled();
});

function thread(page: Page) {
  return page.getByRole("region", { name: "Comments", exact: true });
}

test("adds a comment, persists an edit across refresh, and deletes with confirmation", async ({
  page,
}) => {
  const body = "Browser comment " + Date.now();
  await page.getByLabel("Add a comment", { exact: true }).fill(body);
  await page.getByRole("button", { name: "Add comment", exact: true }).click();
  let article = thread(page).getByRole("article").filter({ hasText: body });
  await expect(article).toBeVisible();
  await article
    .getByRole("button", { name: "Edit comment", exact: true })
    .click();
  await page.getByLabel("Edit comment", { exact: true }).fill(body + " edited");
  await page.getByRole("button", { name: "Save comment", exact: true }).click();
  await expect(
    thread(page).getByRole("status").filter({ hasText: "Comment saved." }),
  ).toBeVisible();
  await page.reload();
  article = thread(page)
    .getByRole("article")
    .filter({ hasText: body + " edited" });
  await expect(article).toBeVisible();
  await article
    .getByRole("button", { name: "Delete comment", exact: true })
    .click();
  await expect(article).toContainText("This cannot be undone.");
  await article
    .getByRole("button", { name: "Keep comment", exact: true })
    .click();
  await expect(
    article.getByRole("button", { name: "Confirm delete" }),
  ).toHaveCount(0);
  await article
    .getByRole("button", { name: "Delete comment", exact: true })
    .click();
  await article
    .getByRole("button", { name: "Confirm delete", exact: true })
    .click();
  await expect(article).toHaveCount(0);
});

test("preserves a draft after a rejected write and renders text safely on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const body = '<img src=x onerror="alert(1)"> ' + "long".repeat(40);
  await page.getByLabel("Add a comment", { exact: true }).fill(body);
  let rejectNext = true;
  await page.route("**/comments", async (route) => {
    if (route.request().method() === "POST" && rejectNext) {
      rejectNext = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Temporarily unavailable" }),
      });
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Add comment", exact: true }).click();
  await expect(thread(page).getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Add a comment", { exact: true })).toHaveValue(
    body,
  );
  await page.getByRole("button", { name: "Add comment", exact: true }).click();
  const article = thread(page).getByRole("article").filter({ hasText: body });
  await expect(article).toBeVisible();
  await expect(article.locator("img")).toHaveCount(0);
  expect(
    await page
      .getByRole("dialog")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await article
    .getByRole("button", { name: "Delete comment", exact: true })
    .click();
  await article
    .getByRole("button", { name: "Confirm delete", exact: true })
    .click();
  await expect(article).toHaveCount(0);
});
