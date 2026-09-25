import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type { Chat, Friend, Message } from "../domain/types";
import { storageSetItem } from "../lib/encryptedLocalStorage";
import { logAppError } from "../../telemetry";
import { DEMO_OFFLINE_MODE, socialMessagingStorageKeyForEmail } from "../theme/preludeConstants";

type SocialCacheSnapshot = {
  chats: Chat[];
  messages: Message[];
  hiddenChatIds: string[];
  addedFriendsFromRitual: Friend[];
  unfriendedIds: string[];
  identityLockedChatIds: string[];
};

function writeSocialCache(
  email: string | null | undefined,
  snapshot: SocialCacheSnapshot,
  logFailure: boolean
) {
  const normalized = email?.trim().toLowerCase();
  if (!normalized || DEMO_OFFLINE_MODE) return;
  void storageSetItem(
    socialMessagingStorageKeyForEmail(normalized),
    JSON.stringify({
      savedAtMs: Date.now(),
      chats: snapshot.chats,
      messages: snapshot.messages,
      hiddenChatIds: snapshot.hiddenChatIds,
      addedFriendsFromRitual: snapshot.addedFriendsFromRitual,
      unfriendedIds: snapshot.unfriendedIds,
      identityLockedChatIds: snapshot.identityLockedChatIds,
    })
  ).catch(() => {
    if (logFailure) logAppError("messaging.persist", new Error("write failed"), { email: normalized });
  });
}

/** Debounced local save of chats, messages, and friend-list flags, plus an immediate flush. */
export function usePersistSocialMessaging(params: {
  signedIn: boolean;
  sessionEmailRef: MutableRefObject<string | null>;
  chats: Chat[];
  messages: Message[];
  hiddenChatIds: string[];
  addedFriendsFromRitual: Friend[];
  unfriendedIds: string[];
  identityLockedChatIds: string[];
  chatsRef: MutableRefObject<Chat[]>;
  messagesRef: MutableRefObject<Message[]>;
  hiddenChatIdsRef: MutableRefObject<string[]>;
  addedFriendsFromRitualRef: MutableRefObject<Friend[]>;
  unfriendedIdsRef: MutableRefObject<string[]>;
  identityLockedChatIdsRef: MutableRefObject<string[]>;
}) {
  const {
    signedIn,
    sessionEmailRef,
    chats,
    messages,
    hiddenChatIds,
    addedFriendsFromRitual,
    unfriendedIds,
    identityLockedChatIds,
    chatsRef,
    messagesRef,
    hiddenChatIdsRef,
    addedFriendsFromRitualRef,
    unfriendedIdsRef,
    identityLockedChatIdsRef,
  } = params;
  const persistSocialTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const email = sessionEmailRef.current?.trim().toLowerCase();
    if (!signedIn || DEMO_OFFLINE_MODE) return;
    if (!email) return;
    if (persistSocialTimerRef.current) clearTimeout(persistSocialTimerRef.current);
    persistSocialTimerRef.current = setTimeout(() => {
      persistSocialTimerRef.current = null;
      writeSocialCache(
        email,
        {
          chats,
          messages,
          hiddenChatIds,
          addedFriendsFromRitual,
          unfriendedIds,
          identityLockedChatIds,
        },
        true
      );
    }, 2200);
    return () => {
      if (persistSocialTimerRef.current) clearTimeout(persistSocialTimerRef.current);
    };
  }, [
    signedIn,
    chats,
    messages,
    hiddenChatIds,
    addedFriendsFromRitual,
    unfriendedIds,
    identityLockedChatIds,
    sessionEmailRef,
  ]);

  return useCallback(() => {
    writeSocialCache(
      sessionEmailRef.current,
      {
        chats: chatsRef.current,
        messages: messagesRef.current,
        hiddenChatIds: hiddenChatIdsRef.current,
        addedFriendsFromRitual: addedFriendsFromRitualRef.current,
        unfriendedIds: unfriendedIdsRef.current,
        identityLockedChatIds: identityLockedChatIdsRef.current,
      },
      false
    );
  }, [
    sessionEmailRef,
    chatsRef,
    messagesRef,
    hiddenChatIdsRef,
    addedFriendsFromRitualRef,
    unfriendedIdsRef,
    identityLockedChatIdsRef,
  ]);
}
