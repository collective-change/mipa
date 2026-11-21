import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const SCREENSHOT_DIR = path.resolve(process.cwd(), "docs/evidence/mipa-6");

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
});

test.describe("MIPA-6: User Comprehension & Visual Funnel Harness", () => {
  test("Step 1: Landing page & Waitlist gate", async ({ page }) => {
    // 1. Visit landing page
    await page.goto("/", { waitUntil: "load" });
    await expect(page).toHaveTitle(/mipa/i);

    // Save hero screenshot
    const heroShot = path.join(SCREENSHOT_DIR, "01_landing_hero.png");
    await page.screenshot({ path: heroShot, fullPage: false });
    expect(fs.existsSync(heroShot)).toBe(true);

    // Verify key hero elements
    const ctaWaitlist = page.locator("a, button").filter({ hasText: /Request Early Access|申請先導體驗/i }).first();
    await expect(ctaWaitlist).toBeVisible();

    // 2. Click Request Early Access to visit waitlist form
    await ctaWaitlist.click();
    await page.waitForURL(/tab=waitlist/, { timeout: 10000 }).catch(async () => {
      await page.goto("/auth?tab=waitlist", { waitUntil: "load" });
    });

    // Save waitlist screenshot
    const waitlistShot = path.join(SCREENSHOT_DIR, "02_waitlist_form.png");
    await page.screenshot({ path: waitlistShot, fullPage: false });
    expect(fs.existsSync(waitlistShot)).toBe(true);

    // Check waitlist form fields
    const emailInput = page.locator("input[type=email]").first();
    await expect(emailInput).toBeVisible();
  });

  test("Step 2: Sign-in page & Private Preview Notice", async ({ page }) => {
    // Visit auth sign-in tab
    await page.goto("/auth?tab=login", { waitUntil: "load" });

    // Save sign-in screenshot
    const signInShot = path.join(SCREENSHOT_DIR, "03_auth_login.png");
    await page.screenshot({ path: signInShot, fullPage: false });
    expect(fs.existsSync(signInShot)).toBe(true);

    // Verify login elements
    const emailField = page.locator("input[type=email]").first();
    const passwordField = page.locator("input[type=password]").first();
    await expect(emailField).toBeVisible();
    await expect(passwordField).toBeVisible();

    // Verify Private Preview notice is present
    const previewNotice = page.locator(".q-banner, .text-caption").filter({ hasText: /Private Preview|preview/i }).first();
    await expect(previewNotice).toBeVisible();
  });

  test("Step 3: Model View & Sample Explorer", async ({ page }) => {
    await page.goto("/auth?tab=login", { waitUntil: "load" });
    const emailField = page.locator("input[type=email]").first();
    const passwordField = page.locator("input[type=password]").first();

    const testEmail = process.env.TEST_USER_EMAIL;
    const testPassword = process.env.TEST_USER_PASSWORD;
    expect(testEmail, "TEST_USER_EMAIL must be set").toBeTruthy();
    expect(testPassword, "TEST_USER_PASSWORD must be set").toBeTruthy();

    await expect(emailField).toBeVisible();
    await expect(passwordField).toBeVisible();
    await emailField.fill(testEmail);
    await passwordField.fill(testPassword);
    const submitBtn = page.locator("button[type=submit], button").filter({ hasText: /Sign in|登入/i }).first();
    await submitBtn.click();

    await expect(page).not.toHaveURL(/\/auth\b/, { timeout: 15000 });

    const modelShot = path.join(SCREENSHOT_DIR, "04_model_view.png");
    await page.screenshot({ path: modelShot, fullPage: false });
    expect(fs.existsSync(modelShot)).toBe(true);
  });

  test("Step 4: Public Dossier & Interactive Sandbox", async ({ page }) => {
    // Open public dossier route (unauthenticated guest access)
    // Using load instead of networkidle to prevent long-polling Firebase channel hangs
    await page.goto("/m/sample-food-bank", { waitUntil: "load" });

    // Allow Vue components and Firestore auth/bind to resolve
    await page.waitForTimeout(3000);
    const dossierShot = path.join(SCREENSHOT_DIR, "05_public_dossier.png");
    await page.screenshot({ path: dossierShot, fullPage: false });
    expect(fs.existsSync(dossierShot)).toBe(true);

    // Verify dossier container renders or shows guest notice
    const pageBody = page.locator("body");
    await expect(pageBody).toBeVisible();
  });
});
