import { test } from "node:test";
import assert from "node:assert/strict";
import { compareFormula, versions } from "./compare.mjs";

test("uses the expected mathjs versions", () => {
  assert.equal(versions.old, "8.1.1");
  assert.match(versions.new, /^15\./);
});

test("unchanged formulas are not reported", () => {
  for (const f of [
    "",
    "a + b * c",
    "-1 / (2 * x)",
    "delay($abc, dt, 0)",
    "best_guess(1, 2, 3) * 5 USD",
    "2x + 3",
    "a > 0 ? a : 0",
    'dateAdd(t, "1 year")',
    "(a + b) / c"
  ]) {
    assert.equal(compareFormula(f), null, f);
  }
});

test("number / number followed by a symbol changed meaning", () => {
  const result = compareFormula("-1 / 2 x");
  assert.equal(result.kind, "meaning changed");
  assert.notEqual(result.before, result.after);
});

test("changes inside string arguments parsed by the engine are found", () => {
  const result = compareFormula('dateAdd(t, "-1 / 2 x")');
  assert.equal(result?.kind, "meaning changed");
});

test("invalid formulas are reported, not thrown", () => {
  assert.equal(compareFormula("a +").kind, "invalid in both");
});
