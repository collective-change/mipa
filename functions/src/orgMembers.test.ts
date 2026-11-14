import { test } from "node:test";
import * as assert from "node:assert/strict";
import { checkSeatCapacity } from "./orgMembers";

test("checkSeatCapacity enforces seat limits correctly", () => {
  // Free / Community tier default (1 seat limit)
  assert.deepEqual(checkSeatCapacity(1, 0, 1), { allowed: false, remaining: 0 });
  assert.deepEqual(checkSeatCapacity(0, 0, 1), { allowed: true, remaining: 1 });
  assert.deepEqual(checkSeatCapacity(0, 1, 1), { allowed: false, remaining: 0 });

  // Starter tier (5 seat limit)
  assert.deepEqual(checkSeatCapacity(3, 1, 5), { allowed: true, remaining: 1 });
  assert.deepEqual(checkSeatCapacity(4, 1, 5), { allowed: false, remaining: 0 });
  assert.deepEqual(checkSeatCapacity(5, 0, 5), { allowed: false, remaining: 0 });

  // Growth tier (20 seat limit)
  assert.deepEqual(checkSeatCapacity(15, 4, 20), { allowed: true, remaining: 1 });
  assert.deepEqual(checkSeatCapacity(18, 2, 20), { allowed: false, remaining: 0 });

  // Pro tier (50 seat limit)
  assert.deepEqual(checkSeatCapacity(45, 3, 50), { allowed: true, remaining: 2 });

  // Fallback when seatLimit <= 0 defaults to 1
  assert.deepEqual(checkSeatCapacity(1, 0, 0), { allowed: false, remaining: 0 });
});
