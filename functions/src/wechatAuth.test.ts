import { test } from "node:test";
import assert from "node:assert/strict";
import { processWeChatCode } from "./wechatAuth";

test("processWeChatCode rejects empty code with invalid-argument error", async () => {
  await assert.rejects(
    async () => {
      await processWeChatCode("");
    },
    { code: "invalid-argument" }
  );
  await assert.rejects(
    async () => {
      await processWeChatCode("   ");
    },
    { code: "invalid-argument" }
  );
});

test("processWeChatCode returns custom token in test/emulator mode", async () => {
  const result = await processWeChatCode("authcode12345678", { isTestOrEmulator: true });
  assert.ok(result.uid.startsWith("wechat_authcode"));
  assert.ok(result.customToken);
});

test("processWeChatCode throws failed-precondition if unconfigured outside emulator", async () => {
  await assert.rejects(
    async () => {
      await processWeChatCode("authcode123", { isTestOrEmulator: false });
    },
    { code: "failed-precondition" }
  );
});
