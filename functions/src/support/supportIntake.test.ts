import { test } from "node:test";
import * as assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  SUPPORT_RESPONSE_EXPECTATIONS,
  findHighestMipaId,
  fileSupportBoardTask
} from "./supportIntake";

test("SUPPORT_RESPONSE_EXPECTATIONS declares stated response times across all tiers", () => {
  assert.equal(SUPPORT_RESPONSE_EXPECTATIONS.community.hours, 0);
  assert.equal(SUPPORT_RESPONSE_EXPECTATIONS.community.guaranteed, false);

  assert.equal(SUPPORT_RESPONSE_EXPECTATIONS.starter.hours, 48);
  assert.equal(SUPPORT_RESPONSE_EXPECTATIONS.starter.guaranteed, true);

  assert.equal(SUPPORT_RESPONSE_EXPECTATIONS.growth.hours, 24);
  assert.equal(SUPPORT_RESPONSE_EXPECTATIONS.growth.guaranteed, true);

  assert.equal(SUPPORT_RESPONSE_EXPECTATIONS.pro.hours, 12);
  assert.equal(SUPPORT_RESPONSE_EXPECTATIONS.pro.guaranteed, true);

  assert.equal(SUPPORT_RESPONSE_EXPECTATIONS.enterprise.hours, 4);
  assert.equal(SUPPORT_RESPONSE_EXPECTATIONS.enterprise.guaranteed, true);
});

test("findHighestMipaId finds highest integer MIPA-ID", () => {
  const sample = `
  ### [DONE] MIPA-10: Test
  ### [TODO] MIPA-34: Backup drill
  ### [TODO] MIPA-35: Terms
  ### [TODO] MIPA-51: Viewers
  `;
  assert.equal(findHighestMipaId(sample), 51);
  assert.equal(findHighestMipaId("No tasks here"), 0);
});

test("fileSupportBoardTask formats task and appends to Queue in BACKLOG.md", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mipa-test-"));
  const tempBacklog = path.join(tempDir, "BACKLOG.md");

  const initialBacklog = [
    "# Backlog",
    "",
    "## Active / In Progress",
    "",
    "## Queue (Priority Order)",
    "",
    "### [TODO] MIPA-35: Terms and deletion",
    "- **Date**: 2026-11-18",
    "",
    "## Completed",
    "### [DONE] MIPA-34: Backup drill"
  ].join("\n");

  fs.writeFileSync(tempBacklog, initialBacklog, "utf8");

  const result = fileSupportBoardTask(
    "TICK-1795000000-xyz",
    "Calculations show NaN on delayed factors",
    "When I run delay() with 3 steps on monthly frequency, leverage shows NaN.",
    "buyer@tzuchi.org.tw",
    "org-tzuchi-1",
    "starter",
    tempBacklog
  );

  assert.equal(result.success, true);
  assert.equal(result.taskId, "MIPA-36");
  assert.ok(result.taskTitle.includes("Support Ticket: Calculations show NaN on delayed factors"));

  const updatedContent = fs.readFileSync(tempBacklog, "utf8");
  assert.ok(updatedContent.includes("### [TODO] MIPA-36: Support Ticket: Calculations show NaN on delayed factors (STARTER - TICK-1795000000-xyz)"));
  assert.ok(updatedContent.includes("- **Customer Tier**: **STARTER** (48 business hours response expectation)"));
  assert.ok(updatedContent.includes("buyer@tzuchi.org.tw"));

  // Clean up
  fs.rmSync(tempDir, { recursive: true, force: true });
});
