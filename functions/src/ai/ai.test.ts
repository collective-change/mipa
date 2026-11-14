// node --test lib/ai/ai.test.js (npm test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { seal, open } from "./keyBox";
import { isAllowedEndpoint, parseReply, parseActionReply, ProviderReplyError } from "./providers";
import { contextText, SYSTEM_PROMPT, ACTION_DRAFT_SYSTEM_PROMPT, actionDraftUserPrompt } from "./prompt";

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
  assert.ok(!isAllowedEndpoint("https://169.254.169.254/computeMetadata/v1/"));
  assert.ok(!isAllowedEndpoint("https://metadata.google.internal/"));
  assert.ok(!isAllowedEndpoint("https://192.168.1.1/api"));
  assert.ok(!isAllowedEndpoint("https://10.0.0.1/"));
});

const actionReply = {
  title: "安裝環保站太陽能板",
  summary: "在花蓮環保站屋頂鋪設太陽能發電設備，降低長期電費支出並減少碳足跡。",
  estEffortHrs: 120,
  effortReasoning: "前置評估20小時，採購招標30小時，施工監督與驗收70小時。",
  estSpending: 450000,
  spendingReasoning: "太陽能模組與變流器約35萬元，安裝工資與安全驗證約10萬元。",
  currency: "TWD",
  impacts: [
    {
      factorSymbol: "electricityCost",
      factorName: "每月用電費用",
      operation: "-",
      operand: "12000",
      durationType: "for_period",
      durationNumber: 120,
      durationUnit: "months",
      thenText: "每期省下約1.2萬元電費",
      source: "台電平均度數與日照發電換算"
    }
  ],
  notes: "需先評估屋頂結構載重與日照遮蔽率。"
};

test("parses a valid action draft reply, also inside a code fence", () => {
  assert.deepEqual(parseActionReply(JSON.stringify(actionReply)), actionReply);
  assert.deepEqual(parseActionReply("```json\n" + JSON.stringify(actionReply) + "\n```"), actionReply);
});

test("rejects invalid action draft reply", () => {
  assert.throws(() => parseActionReply(JSON.stringify({ ...actionReply, title: 123 })), ProviderReplyError);
});

test("action draft prompt includes model factors and idea", () => {
  const prompt = actionDraftUserPrompt(
    {
      org: { name: "Eco Center", goal: "Sustainability", orgType: "ngo", currency: "TWD" },
      timeStep: "1 months",
      horizon: "60 months",
      factors: [{ name: "Electricity", symbol: "electricityCost", formula: "25000", unit: "TWD", group: "Costs" }]
    },
    "Install solar panels"
  );
  assert.match(prompt, /Install solar panels/);
  assert.match(prompt, /electricityCost/);
  assert.doesNotMatch(ACTION_DRAFT_SYSTEM_PROMPT, /\d{4}-\d{2}-\d{2}/);
});
