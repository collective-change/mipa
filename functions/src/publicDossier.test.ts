import { test } from "node:test";
import * as assert from "node:assert/strict";
import { projectPublicActions, PUBLIC_DOSSIER_ACTIONS_LIMIT } from "./publicDossier";

test("projectPublicActions exposes only id, title and leverage, ranked", () => {
  const out = projectPublicActions([
    {
      id: "a1",
      title: "Low",
      actionLeverage: 1,
      orgId: "org-secret",
      description: "private notes",
      outstandingSpending: 5000,
      responsiblePersons: ["uid-1"],
      marginalTotalBenefitNpv: 99
    },
    { id: "a2", title: "High", actionLeverage: 9.5, notes: "x" }
  ]);
  assert.deepEqual(out, [
    { id: "a2", title: "High", actionLeverage: 9.5 },
    { id: "a1", title: "Low", actionLeverage: 1 }
  ]);
  for (const row of out) {
    assert.deepEqual(Object.keys(row).sort(), ["actionLeverage", "id", "title"]);
  }
});

test("projectPublicActions normalises bad leverage and skips untitled rows", () => {
  const out = projectPublicActions([
    { id: "a", title: "Inf", actionLeverage: Infinity },
    { id: "b", title: "NaN", actionLeverage: NaN },
    { id: "c", title: "Str", actionLeverage: "7" },
    { id: "d", title: "", actionLeverage: 3 },
    { id: "e", actionLeverage: 3 }
  ]);
  assert.equal(out.length, 3);
  assert.ok(out.every((r) => r.actionLeverage === 0));
});

test("projectPublicActions caps the number of rows", () => {
  const many = Array.from({ length: PUBLIC_DOSSIER_ACTIONS_LIMIT + 20 }, (_, i) => ({
    id: `a${i}`,
    title: `T${i}`,
    actionLeverage: i
  }));
  assert.equal(projectPublicActions(many).length, PUBLIC_DOSSIER_ACTIONS_LIMIT);
});
