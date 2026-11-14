import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import * as logger from "firebase-functions/logger";

export interface WeChatTokenResponse {
  customToken: string;
  uid: string;
}

export async function processWeChatCode(
  code: string,
  config?: { appId?: string; appSecret?: string; isTestOrEmulator?: boolean }
): Promise<WeChatTokenResponse> {
  const trimmed = code?.trim();
  if (!trimmed) {
    throw new HttpsError("invalid-argument", "Missing or invalid WeChat authorization code.");
  }

  const isTestOrEmulator =
    config?.isTestOrEmulator ??
    (process.env.FUNCTIONS_EMULATOR === "true" || process.env.NODE_ENV === "test");

  const appId = config?.appId ?? process.env.WECHAT_APP_ID;
  const appSecret = config?.appSecret ?? process.env.WECHAT_APP_SECRET;

  if (!appId || !appSecret) {
    if (isTestOrEmulator) {
      const mockUid = `wechat_${trimmed.slice(0, 16)}`;
      let customToken = `mock_custom_token_${mockUid}`;
      try {
        customToken = await getAuth().createCustomToken(mockUid, { provider: "wechat" });
      } catch {
        // fallback in offline test environments
      }
      return { customToken, uid: mockUid };
    }
    throw new HttpsError("failed-precondition", "WeChat OAuth provider is not configured on this server.");
  }

  const tokenUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${encodeURIComponent(
    appId
  )}&secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(
    trimmed
  )}&grant_type=authorization_code`;

  const res = await fetch(tokenUrl);
  const data = (await res.json()) as { openid?: string; unionid?: string; errcode?: number; errmsg?: string };

  if (data.errcode || !data.openid) {
    logger.error("WeChat auth code exchange failed", data);
    throw new HttpsError("unauthenticated", `WeChat authorization failed: ${data.errmsg || "invalid code"}`);
  }

  const uid = `wechat_${data.unionid || data.openid}`;
  const customToken = await getAuth().createCustomToken(uid, { provider: "wechat" });
  return { customToken, uid };
}

export const exchangeWeChatCode = onCall<{ code: string }>(async (request) => {
  return processWeChatCode(request.data?.code);
});
