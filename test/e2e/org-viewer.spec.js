import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const SCREENSHOT_DIR = path.resolve(process.cwd(), "docs/evidence/mipa-51");

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
});

function requireCredentials() {
  const testEmail = process.env.TEST_USER_EMAIL;
  const testPassword = process.env.TEST_USER_PASSWORD;
  expect(testEmail, "TEST_USER_EMAIL must be set").toBeTruthy();
  expect(testPassword, "TEST_USER_PASSWORD must be set").toBeTruthy();
  return { testEmail, testPassword };
}

async function signIn(page, email, password) {
  await page.goto("/auth?tab=login", { waitUntil: "load" });
  const emailField = page.locator("input[type=email]").first();
  const passwordField = page.locator("input[type=password]").first();
  await expect(emailField).toBeVisible();
  await expect(passwordField).toBeVisible();

  await emailField.fill(email);
  await passwordField.fill(password);
  const submitBtn = page.locator("button[type=submit], button").filter({ hasText: /Sign in|登入/i }).first();
  await submitBtn.click();

  await expect(page).not.toHaveURL(/\/auth\b/, { timeout: 15000 });
}

test.describe("MIPA-51: Org Viewer & Empty Graph Guardrails", () => {
  test("Viewer granted via viewers.org opens model and renders non-zero graph nodes or graph canvas", async ({ page }) => {
    const { testEmail, testPassword } = requireCredentials();
    await signIn(page, testEmail, testPassword);

    // Navigate to org model route and verify the graph canvas actually renders
    await page.goto("/org/mipa-ops/model/ZpZkSmHRzIpI2CvnR9Lh/ZpZkSmHRzIpI2CvnR9Lh", { waitUntil: "load" });

    const svgGraph = page.locator("#dependencyGraph");
    const noAccessBox = page.locator("[data-testid='no-model-access']");
    await expect(svgGraph).toBeVisible({ timeout: 15000 });
    await expect(noAccessBox).toHaveCount(0);

    const shotPath = path.join(SCREENSHOT_DIR, "01_viewer_graph_nodes.png");
    await page.screenshot({ path: shotPath, fullPage: false });
  });

  test("Unauthorized user navigating to inaccessible model sees explicit no-access state", async ({ page }) => {
    const { testEmail, testPassword } = requireCredentials();
    await signIn(page, testEmail, testPassword);

    // Visit an inaccessible private model route while signed in
    await page.goto("/org/org-unauthorized/model/org-unauthorized/model-unauthorized", { waitUntil: "load" });

    const noAccessBox = page.locator("[data-testid='no-model-access']");
    const viewerBanner = page.locator(".q-banner").filter({ hasText: /stakeholder|利益關係人/i });
    await expect(noAccessBox).toBeVisible({ timeout: 15000 });
    await expect(noAccessBox).toContainText(/No Access|無權限/i);
    await expect(viewerBanner).toHaveCount(0);
    await expect(page.locator("#dependencyGraph")).toHaveCount(0);

    const shotPath = path.join(SCREENSHOT_DIR, "02_no_access_state.png");
    await page.screenshot({ path: shotPath, fullPage: false });
  });

  test("Fails sign-in when password is wrong and stays on /auth", async ({ page }) => {
    const { testEmail, testPassword } = requireCredentials();
    await page.goto("/auth?tab=login", { waitUntil: "load" });

    const emailField = page.locator("input[type=email]").first();
    const passwordField = page.locator("input[type=password]").first();
    await expect(emailField).toBeVisible();
    await expect(passwordField).toBeVisible();

    await emailField.fill(testEmail);
    await passwordField.fill(`${testPassword}-wrong`);
    const submitBtn = page.locator("button[type=submit], button").filter({ hasText: /Sign in|登入/i }).first();
    await submitBtn.click();

    await expect(page.locator(".q-dialog")).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/auth\b/);
  });
});
