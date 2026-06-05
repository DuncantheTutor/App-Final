/**
 * HTTPS Cloud Function export names (URL path segment). Stable keys + values that match
 * `backend/functions/src/index.ts` exports used from `callEmulatorFunction` in this app.
 * When the backend renames a function, update the string value here (and deploy).
 */
export const FirebaseCallables = {
  claimDeviceSession: "claimDeviceSession",
  releaseDeviceSession: "releaseDeviceSession",
  registerFirebaseAuthUid: "registerFirebaseAuthUid",
  requestEmailOtp: "requestEmailOtp",
  verifyEmailOtp: "verifyEmailOtp",
  logClientTelemetry: "logClientTelemetry",

  /** NFC PIN + QR pairing surface (current production naming). */
  registerNfcPinPairOffer: "registerNfcPinPairOffer",
  getNfcPinPairOfferStatus: "getNfcPinPairOfferStatus",
  previewNfcPinPairOffer: "previewNfcPinPairOffer",
  confirmNfcPinPairOffer: "confirmNfcPinPairOffer",
  finalizeNfcPinPairOffer: "finalizeNfcPinPairOffer",
  cancelNfcPinPairOffer: "cancelNfcPinPairOffer",

  listMyFriends: "listMyFriends",
  /** End accepted friendship (both sides); deletes `friendships/{id}` edge. */
  removeFriendship: "removeFriendship",
  getUserProfiles: "getUserProfiles",
  upsertUserProfile: "upsertUserProfile",
  publishUserKeyBundle: "publishUserKeyBundle",
  putUserKeyBackup: "putUserKeyBackup",
  getUserKeyBackup: "getUserKeyBackup",
  putUserSocialSnapshot: "putUserSocialSnapshot",
  getUserSocialSnapshot: "getUserSocialSnapshot",
  getFriendKeyBundles: "getFriendKeyBundles",
  putEncryptedProfile: "putEncryptedProfile",
  getEncryptedProfile: "getEncryptedProfile",

  upsertConversation: "upsertConversation",
  sendEncryptedMessage: "sendEncryptedMessage",
  listEncryptedMessages: "listEncryptedMessages",
  listConversationMessages: "listConversationMessages",
  updateConversationReadPosition: "updateConversationReadPosition",
  setConversationNotificationMute: "setConversationNotificationMute",
  manageConversationMembership: "manageConversationMembership",
  updateMessageMetadata: "updateMessageMetadata",
  registerPushToken: "registerPushToken",

  createEncryptedPost: "createEncryptedPost",
  deleteEncryptedPost: "deleteEncryptedPost",
  listEncryptedPosts: "listEncryptedPosts",
  listMyOwnedEncryptedPosts: "listMyOwnedEncryptedPosts",
  setEncryptedPostReaction: "setEncryptedPostReaction",
  updateEncryptedPost: "updateEncryptedPost",
  createPrivatePostThreadMessage: "createPrivatePostThreadMessage",
  listPrivatePostThreadMessages: "listPrivatePostThreadMessages",
  togglePrivatePostThreadMessageReaction: "togglePrivatePostThreadMessageReaction",

  setMyPresence: "setMyPresence",
  getFriendPresence: "getFriendPresence",

  seedDemoFriendships: "seedDemoFriendships",
} as const satisfies Record<string, string>;

export type FirebaseCallableKey = keyof typeof FirebaseCallables;
