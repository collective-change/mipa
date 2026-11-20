import { initializeApp } from "firebase-admin/app";

initializeApp();

export { updateExchangeRates } from "./exchangeRates";
export { acceptInvitation, removeMember, setMemberRole, createInvitation, resendInvitation, checkUserAccess } from "./orgMembers";
export { setAiSettings, disconnectAi, setAiManagers } from "./ai/aiSettings";
export { draftModel } from "./ai/draftModel";
export { draftAction } from "./ai/draftAction";
export { getAiAllowanceStatus } from "./ai/starterAllowance";
export { exchangeWeChatCode } from "./wechatAuth";
export { getPublicDossierActions } from "./publicDossier";
export { lemonSqueezyWebhook, getCheckoutUrl, getCustomerPortalUrl } from "./billing/lemonSqueezy";
export {
  sendWeeklyStrategicDigest,
  triggerStrategicDigestNow,
  unsubscribeWeeklyDigest
} from "./notifications/weeklyDigest";
export { requestPasswordReset } from "./notifications/transactionalEmail";
export {
  scheduledFirestoreBackup,
  triggerManualBackup
} from "./backups/scheduledBackup";
export {
  deleteOrganization,
  deleteUserAccount
} from "./accountDeletion";
export {
  scheduledSyntheticFunnelCheck,
  triggerSyntheticCheck
} from "./monitoring/syntheticCheck";
export {
  submitSupportTicket
} from "./support/supportIntake";
