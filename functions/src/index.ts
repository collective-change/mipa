import { initializeApp } from "firebase-admin/app";

initializeApp();

export { updateExchangeRates } from "./exchangeRates";
export { acceptInvitation, removeMember, setMemberRole, createInvitation } from "./orgMembers";
export { setAiSettings, disconnectAi, setAiManagers } from "./ai/aiSettings";
export { draftModel } from "./ai/draftModel";
export { draftAction } from "./ai/draftAction";
export { getAiAllowanceStatus } from "./ai/starterAllowance";
export { exchangeWeChatCode } from "./wechatAuth";
export { lemonSqueezyWebhook, getCheckoutUrl, getCustomerPortalUrl } from "./billing/lemonSqueezy";
export {
  sendWeeklyStrategicDigest,
  triggerStrategicDigestNow,
  unsubscribeWeeklyDigest
} from "./notifications/weeklyDigest";
