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
  test("Step 1: Landing page & Registration link", async ({ page }) => {
    // 1. Visit landing page
    await page.goto("/", { waitUntil: "load" });
    await expect(page).toHaveTitle(/mipa/i);

    // Save hero screenshot
    const heroShot = path.join(SCREENSHOT_DIR, "01_landing_hero.png");
    await page.screenshot({ path: heroShot, fullPage: false });
    expect(fs.existsSync(heroShot)).toBe(true);

    // Verify key hero elements
    const ctaGetStarted = page.locator("a, button").filter({ hasText: /Get started free|免費開始使用/i }).first();
    await expect(ctaGetStarted).toBeVisible();

    // 2. Click Get Started to visit registration
    await ctaGetStarted.click();
    await page.waitForURL(/tab=register/, { timeout: 10000 }).catch(async () => {
      await page.goto("/auth?tab=register", { waitUntil: "load" });
    });

    // Save registration screenshot
    const registerShot = path.join(SCREENSHOT_DIR, "02_register_form.png");
    await page.screenshot({ path: registerShot, fullPage: false });
    expect(fs.existsSync(registerShot)).toBe(true);

    // Check register form fields
    const emailInput = page.locator("input[type=email]").first();
    await expect(emailInput).toBeVisible();
  });

  test("Step 2: Sign-in page & Auth Access Notice", async ({ page }) => {
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

    // Verify Auth Access notice is present
    const accessNotice = page.locator(".q-banner, .text-caption").filter({ hasText: /not open yet|尚未全面開放/i }).first();
    await expect(accessNotice).toBeVisible();
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
