import { test } from "node:test";
import * as assert from "node:assert/strict";
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

test("fileSupportBoardTask is retired and safely returns without reading markdown files", () => {
  // (Note: docs/BACKLOG.md was retired on 2026-11-26 in favor of the Firestore ops-store)
  const result = fileSupportBoardTask(
    "TICK-1795000000-xyz",
    "Calculations show NaN on delayed factors",
    "When I run delay() with 3 steps on monthly frequency, leverage shows NaN.",
    "buyer@tzuchi.org.tw",
    "org-tzuchi-1",
    "starter"
  );

  assert.equal(result.success, false);
  assert.ok(result.taskTitle.includes("Support: Calculations show NaN on delayed factors"));
});
