// node --test lib/ai/ai.test.js (npm test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { seal, open } from "./keyBox";
import { isAllowedEndpoint, parseReply, ProviderReplyError } from "./providers";
import { contextText, SYSTEM_PROMPT } from "./prompt";

const secret = randomBytes(32).toString("base64");

test("a sealed key opens with the same secret only", () => {
  const sealed = seal("sk-ant-example-1234", secret);
  assert.ok(!sealed.includes("sk-ant"));
  assert.equal(open(sealed, secret), "sk-ant-example-1234");
  assert.throws(() => open(sealed, randomBytes(32).toString("base64")));
});

test("sealing twice gives different ciphertexts", () => {
  assert.notEqual(seal("same", secret), seal("same", secret));
});

const reply = {
  kind: "draft",
  message: "Here is a draft.",
  questions: [],
  summary: "A bakery.",
  groups: ["Sales"],
  factors: [
    {
      name: "loaves sold",
      symbol: "loavesSold",
      formula: "3000",
      unit: "",
      group: "Sales",
      explanation: "Loaves sold each month.",
      isEstimate: true,
      estimateReasoning: "about 100 a day",
      isHourlyCost: false
    }
  ],
  changesToExisting: []
};

test("parses a valid reply, also inside a code fence", () => {
  assert.deepEqual(parseReply(JSON.stringify(reply)), reply);
  assert.deepEqual(parseReply("```json\n" + JSON.stringify(reply) + "\n```"), reply);
});

test("rejects replies that aren't JSON or don't match the format", () => {
  assert.throws(() => parseReply("Sure! Here's your model."), ProviderReplyError);
  assert.throws(() => parseReply(JSON.stringify({ ...reply, kind: "poem" })), ProviderReplyError);
});

test("the context lists the organization and every factor", () => {
  const text = contextText({
    org: { name: "Bakery", goal: "Good bread", orgType: "business", currency: "TWD" },
    timeStep: "1 months",
    horizon: "120 months",
    factors: [{ name: "price", symbol: "price", formula: "4", unit: "TWD", group: "" }]
  });
  assert.match(text, /Currency: TWD/);
  assert.match(text, /- price = 4 \(name: price; unit: TWD\)/);
});

test("the fixed instructions hold nothing that varies per request", () => {
  assert.doesNotMatch(SYSTEM_PROMPT, /\d{4}-\d{2}-\d{2}/); // no dates
});

test("endpoints must use https outside the emulator", () => {
  assert.ok(isAllowedEndpoint("https://openrouter.ai/api/v1"));
  assert.ok(!isAllowedEndpoint("http://127.0.0.1:8787/v1"));
  assert.ok(!isAllowedEndpoint("ftp://example.org"));
});
