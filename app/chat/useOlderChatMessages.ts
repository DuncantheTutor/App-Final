import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { callEmulatorFunction } from "../../backendBridge";
import { decryptPayloadForRecipient } from "../../e2eeCrypto";
import { logAppError } from "../../telemetry";
import type { Chat, Friend, Message, ViewState } from "../domain/types";
import { resolveInboundDirectMessageTarget } from "../lib/directChatId";
import { mergeSyncedMessages } from "../lib/mergeEncryptedSync";
import { parseMessageMediaFromPlain } from "../lib/tierBMedia/messageMedia";
import { overlayMessageDocMetadata, type MessageDocMetadata } from "../messaging/messageMetadata";
import type { BackendSession } from "../messaging/types";
import {
  CHAT_OLDER_MESSAGES_PAGE_SIZE,
  CHAT_UI_DISPLAY_PAGE_SIZE,
  CHAT_UI_INITIAL_DISPLAY_COUNT,
  CURRENT_USER_ID,
  DEMO_OFFLINE_MODE,
} from "../theme/preludeConstants";

type OlderChatMessagesDeps = {
  view: ViewState;
  chats: Chat[];
  friendMap: Record<string, Friend>;
  friendIdToBackendUid: Record<string, string>;
  backendUidToFriendId: Record<string, string>;
  identityLockedChatIdsSet: ReadonlySet<string>;
  activeChatMessages: Message[];
  invertedChatMessages: Message[];
  chatLoadingOlder: boolean;
  chatHasMoreOlder: Record<string, boolean>;
  chatListDisplayLimit: number;
  setChatLoadingOlder: Dispatch<SetStateAction<boolean>>;
  setChatHasMoreOlder: Dispatch<SetStateAction<Record<string, boolean>>>;
  setChatListDisplayLimit: Dispatch<SetStateAction<number>>;
  chatPaginationBeforeMsRef: MutableRefObject<Record<string, number>>;
  chatEndReachedBusyRef: MutableRefObject<boolean>;
  hiddenChatIdsRef: MutableRefObject<string[]>;
  hiddenServerConversationIdsRef: MutableRefObject<Set<string>>;
  getBackendSession: () => BackendSession | null;
  joinCutoffForViewer: (chat: Chat | null | undefined) => number;
  resolveConversationId: (chatId: string) => string;
  applyMessages: (updater: (current: Message[]) => Message[]) => void;
};

/** Page older encrypted messages into the open chat, and expand the on-screen window first. */
export function useOlderChatMessages(deps: OlderChatMessagesDeps) {
  const {
    view,
    chats,
    friendMap,
    friendIdToBackendUid,
    backendUidToFriendId,
    identityLockedChatIdsSet,
    activeChatMessages,
    invertedChatMessages,
    chatLoadingOlder,
    chatHasMoreOlder,
    chatListDisplayLimit,
    setChatLoadingOlder,
    setChatHasMoreOlder,
    setChatListDisplayLimit,
    chatPaginationBeforeMsRef,
    chatEndReachedBusyRef,
    hiddenChatIdsRef,
    hiddenServerConversationIdsRef,
    getBackendSession,
    joinCutoffForViewer,
    resolveConversationId,
    applyMessages,
  } = deps;

  const loadOlderChatMessages = useCallback(async () => {
    if (view.screen !== "chat" || !("chatId" in view) || chatLoadingOlder) return;
    const chatId = view.chatId;
    if (chatHasMoreOlder[chatId] === false) return;
    const session = getBackendSession();
    if (!session || DEMO_OFFLINE_MODE) return;
    const oldest = activeChatMessages[0];
    const paginationBeforeMs =
      chatPaginationBeforeMsRef.current[chatId] ?? oldest?.createdAt;
    setChatLoadingOlder(true);
    try {
      const res = await callEmulatorFunction<{
        items: Array<{
          messageId: string;
          conversationId: string;
          senderUid: string;
          ciphertext: string;
          nonce: string;
          envelope: string;
          createdAtMs: number;
          reactions?: Record<string, string>;
          editedAt?: number | null;
          unsentAt?: number | null;
        }>;
        hasMore?: boolean;
      }>("listConversationMessages", {
        uid: session.uid,
        deviceId: session.deviceId,
        conversationId: resolveConversationId(chatId),
        beforeMs: paginationBeforeMs,
        limit: CHAT_OLDER_MESSAGES_PAGE_SIZE,
      });
      const chatRow = chats.find((c) => c.id === chatId) ?? null;
      const cutoff = joinCutoffForViewer(chatRow);
      const hiddenLocal = new Set(hiddenChatIdsRef.current);
      const hiddenServer = hiddenServerConversationIdsRef.current;
      const decoded: Message[] = [];
      for (const item of res.items ?? []) {
        const rawLocal = item.conversationId.replace(/^enc_/, "");
        const preTarget = resolveInboundDirectMessageTarget({
          conversationId: item.conversationId,
          rawLocalChatId: rawLocal,
          senderAppUid: item.senderUid,
          sessionAppUid: session.uid,
          chats,
          friendMap,
          friendIdToBackendUid,
          hiddenLocalChatIds: hiddenLocal,
          hiddenServerConversationIds: hiddenServer,
          identityLockedChatIds: identityLockedChatIdsSet,
        });
        if ("drop" in preTarget) continue;
        try {
          const plain = await decryptPayloadForRecipient<{
            messageId: string;
            chatId: string;
            text: string;
            createdAt: number;
            kind?: Message["kind"];
            mediaUri?: string | null;
            mediaTier?: number | null;
            mediaObjectPath?: string | null;
            mediaKeyB64?: string | null;
            mediaNonceB64?: string | null;
            mediaContentType?: string | null;
            durationSec?: number | null;
            replyToMessageId?: string | null;
            broadcastThreadFriendId?: string | null;
          }>(session.uid, item.ciphertext, item.nonce, item.envelope);
          const createdAt = item.createdAtMs ?? plain.createdAt ?? Date.now();
          if (createdAt < cutoff) continue;
          const docMeta: MessageDocMetadata = {
            reactions: item.reactions,
            editedAt: item.editedAt,
            unsentAt: item.unsentAt,
          };
          const postTarget = resolveInboundDirectMessageTarget({
            conversationId: item.conversationId,
            rawLocalChatId: rawLocal,
            senderAppUid: item.senderUid,
            sessionAppUid: session.uid,
            chats,
            friendMap,
            friendIdToBackendUid,
            hiddenLocalChatIds: hiddenLocal,
            hiddenServerConversationIds: hiddenServer,
            identityLockedChatIds: identityLockedChatIdsSet,
            plainLocalChatId: plain.chatId,
          });
          if ("drop" in postTarget) continue;
          const parsedMedia = parseMessageMediaFromPlain(plain);
          const messageChatId = postTarget.resolvedLocalChatId;
          const baseRow: Message = {
            id: item.messageId,
            chatId: messageChatId,
            senderId:
              item.senderUid === session.uid
                ? CURRENT_USER_ID
                : backendUidToFriendId[item.senderUid] ?? item.senderUid,
            text: plain.text ?? "",
            createdAt,
            kind: plain.kind,
            mediaUri: parsedMedia.mediaUri,
            mediaEncrypted: parsedMedia.mediaEncrypted,
            durationSec:
              typeof plain.durationSec === "number" && Number.isFinite(plain.durationSec)
                ? Math.max(0, Math.round(plain.durationSec))
                : undefined,
            replyToMessageId: plain.replyToMessageId ?? undefined,
            broadcastThreadFriendId: plain.broadcastThreadFriendId ?? undefined,
          };
          const row = overlayMessageDocMetadata(
            baseRow,
            docMeta,
            session.uid,
            backendUidToFriendId
          );
          decoded.push(row);
        } catch (err) {
          logAppError("chat.pagination.decode", err, {
            chatId,
            conversationId: item.conversationId,
          });
        }
      }
      if (decoded.length > 0) {
        applyMessages((current) => mergeSyncedMessages(current, decoded, { incremental: true, optimisticWindowMs: 120_000 }));
      }
      const fetchedCount = res.items?.length ?? 0;
      if (fetchedCount > 0) {
        setChatListDisplayLimit((current) =>
          current + Math.max(decoded.length, CHAT_UI_DISPLAY_PAGE_SIZE)
        );
      }
      if (fetchedCount === 0) {
        setChatHasMoreOlder((current) => ({ ...current, [chatId]: false }));
      } else if (decoded.length === 0) {
        const oldestFetchedMs = Math.min(
          ...(res.items ?? []).map((item) => item.createdAtMs ?? Number.MAX_SAFE_INTEGER)
        );
        if (
          Number.isFinite(oldestFetchedMs) &&
          oldestFetchedMs < Number.MAX_SAFE_INTEGER &&
          oldestFetchedMs !== paginationBeforeMs
        ) {
          chatPaginationBeforeMsRef.current[chatId] = oldestFetchedMs;
          setChatHasMoreOlder((current) => ({
            ...current,
            [chatId]: Boolean(res.hasMore),
          }));
        } else {
          setChatHasMoreOlder((current) => ({ ...current, [chatId]: false }));
        }
      } else {
        const decodedOldestMs = decoded.reduce(
          (min, row) => Math.min(min, row.createdAt),
          Number.MAX_SAFE_INTEGER
        );
        if (decodedOldestMs < Number.MAX_SAFE_INTEGER) {
          chatPaginationBeforeMsRef.current[chatId] = decodedOldestMs;
        }
        setChatHasMoreOlder((current) => ({
          ...current,
          [chatId]: Boolean(res.hasMore),
        }));
      }
    } finally {
      setChatLoadingOlder(false);
    }
  }, [
    view,
    chats,
    joinCutoffForViewer,
    chatLoadingOlder,
    chatHasMoreOlder,
    activeChatMessages,
    getBackendSession,
    backendUidToFriendId,
    friendMap,
    friendIdToBackendUid,
    identityLockedChatIdsSet,
    resolveConversationId,
    applyMessages,
    setChatLoadingOlder,
    setChatHasMoreOlder,
    setChatListDisplayLimit,
    chatPaginationBeforeMsRef,
    hiddenChatIdsRef,
    hiddenServerConversationIdsRef,
  ]);

  useEffect(() => {
    if (view.screen !== "chat" || !("chatId" in view)) return;
    setChatListDisplayLimit(CHAT_UI_INITIAL_DISPLAY_COUNT);
    delete chatPaginationBeforeMsRef.current[view.chatId];
  }, [view, setChatListDisplayLimit, chatPaginationBeforeMsRef]);

  const handleChatListEndReached = useCallback(() => {
    if (view.screen !== "chat" || !("chatId" in view)) return;
    const chatId = view.chatId;
    if (invertedChatMessages.length > chatListDisplayLimit) {
      setChatListDisplayLimit((current) => current + CHAT_UI_DISPLAY_PAGE_SIZE);
      return;
    }
    if (chatHasMoreOlder[chatId] === false) return;
    if (chatEndReachedBusyRef.current || chatLoadingOlder) return;
    chatEndReachedBusyRef.current = true;
    void loadOlderChatMessages().finally(() => {
      chatEndReachedBusyRef.current = false;
    });
  }, [
    view,
    invertedChatMessages.length,
    chatListDisplayLimit,
    chatHasMoreOlder,
    chatLoadingOlder,
    loadOlderChatMessages,
    setChatListDisplayLimit,
    chatEndReachedBusyRef,
  ]);

  return { loadOlderChatMessages, handleChatListEndReached };
}
