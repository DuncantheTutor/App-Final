import { useEffect } from "react";

import { logAppError } from "../../telemetry";
import {
  addNotificationReceivedListener,
  addNotificationResponseListener,
  conversationIdFromNotificationData,
  pushNotificationType,
} from "../lib/pushNotifications";
import { DEMO_OFFLINE_MODE } from "../theme/preludeConstants";

type PushNavigationDeps = {
  signedIn: boolean;
  goToChat: (chatId: string) => void;
  openHomeFeedFromNav: () => void;
  pullEncryptedMessagesForConversation: (conversationId: string) => Promise<unknown>;
  pullEncryptedMessagesIncremental: () => Promise<unknown>;
  pullEncryptedPostsIncremental: () => Promise<unknown>;
};

/** Foreground and tap handling for chat and post pushes. No-op while signed out or in demo mode. */
export function usePushNotificationRouting(deps: PushNavigationDeps): void {
  const {
    signedIn,
    goToChat,
    openHomeFeedFromNav,
    pullEncryptedMessagesForConversation,
    pullEncryptedMessagesIncremental,
    pullEncryptedPostsIncremental,
  } = deps;

  useEffect(() => {
    if (!signedIn || DEMO_OFFLINE_MODE) return;
    const syncMessagesFromPush = (conversationId: string) => {
      void pullEncryptedMessagesForConversation(conversationId).catch((err) => {
        logAppError("messages.push_pull", err, { conversationId });
      });
      void pullEncryptedMessagesIncremental().catch((err) => {
        logAppError("messages.push_inbox_pull", err, { conversationId });
      });
    };

    const handlePushData = (data: Record<string, unknown>) => {
      const type = pushNotificationType(data);
      if (type === "post_reaction" || type === "new_post") {
        void pullEncryptedPostsIncremental().catch((err) => {
          logAppError("posts.push_pull", err, { type });
        });
        return;
      }
      const conversationId = conversationIdFromNotificationData(data);
      if (conversationId || type === "chat_message") {
        if (conversationId) syncMessagesFromPush(conversationId);
      }
    };

    const handlePushResponse = (data: Record<string, unknown>) => {
      const type = pushNotificationType(data);
      if (type === "post_reaction" || type === "new_post") {
        void pullEncryptedPostsIncremental().catch((err) => {
          logAppError("posts.push_pull", err, { type });
        });
        openHomeFeedFromNav();
        return;
      }
      const conversationId = conversationIdFromNotificationData(data);
      if (conversationId) {
        syncMessagesFromPush(conversationId);
        const localChatId = conversationId.replace(/^enc_/, "");
        if (localChatId) goToChat(localChatId);
      }
    };

    const unsubReceived = addNotificationReceivedListener(handlePushData);
    const unsubResponse = addNotificationResponseListener(handlePushResponse);
    return () => {
      unsubReceived();
      unsubResponse();
    };
  }, [
    signedIn,
    goToChat,
    openHomeFeedFromNav,
    pullEncryptedMessagesForConversation,
    pullEncryptedMessagesIncremental,
    pullEncryptedPostsIncremental,
  ]);
}
