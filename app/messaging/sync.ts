import { callEmulatorFunction } from "../../backendBridge";

import { logAppError } from "../../telemetry";

import {

  collection,

  collectionGroup,

  limit as firestoreLimit,

  onSnapshot,

  orderBy,

  query as firestoreQuery,

  where,

} from "firebase/firestore";

import { firebaseAuth, getFirestoreDb } from "../../firebaseAuthClient";

import { logAppEvent } from "../../telemetry";

import {
  ENCRYPTED_MESSAGES_CONVERSATION_LISTENER_LIMIT,
  ENCRYPTED_MESSAGES_LISTENER_LIMIT,
  ENCRYPTED_MESSAGES_SYNC_LIMIT,
  CHAT_INITIAL_MESSAGE_LIMIT,
} from "../theme/preludeConstants";

import { applyMetadataPatchesToMessages, type MessageDocMetadata } from "./messageMetadata";

import { rosterFriendBackendUidsFromMap } from "../lib/messageIngestPolicy";
import { mergeMissingChatsIntoState, mergeMessagesIntoState } from "./applyMessageBatch";

import { decodeIncomingEncryptedMessage, logDecodeIncomingError } from "./decodeIncoming";

import {

  applyDecodedBatchToState,

  decodeEncryptedMessagePullItems,

  messageSyncCursorMs,

  nextSafeWatermarkMs,

  type EncryptedMessagePullItem,

} from "./decodeMessageBatch";

import type { Dispatch, SetStateAction } from "react";

import type { Chat, Friend, Message } from "../domain/types";

import type {

  BackendSession,

  DecodedIncomingBatch,

  EncryptedSyncStateBundle,

  MessagingSyncRefs,

} from "./types";



const CONVERSATION_PULL_LIMIT = CHAT_INITIAL_MESSAGE_LIMIT;



export type PullEncryptedMessagesParams = {

  session: BackendSession;

  refs: MessagingSyncRefs;

  persistWatermarksNow: () => void;

  setChats: (updater: (current: Chat[]) => Chat[]) => void;

  setMessages: (updater: (current: Message[]) => Message[]) => void;

  /** Override callable page size (boot uses a smaller cap). */
  limit?: number;

};



function allFriendsFromRefs(refs: MessagingSyncRefs): Friend[] {

  return Object.values(refs.friendMapRef.current ?? {});

}



/** Callable pull — durable fallback when the Firestore listener misses or is offline. */

export async function pullEncryptedMessagesIncremental(

  params: PullEncryptedMessagesParams

): Promise<void> {

  const { session, refs, persistWatermarksNow, setChats, setMessages, limit } = params;

  const watermarkMs = refs.messagesWatermarkMsRef.current ?? 0;

  const messagesRequest: {

    uid: string;

    deviceId: string;

    limit: number;

    sinceMs?: number;

  } = {

    uid: session.uid,

    deviceId: session.deviceId,

    limit: limit ?? ENCRYPTED_MESSAGES_SYNC_LIMIT,

  };

  if (watermarkMs > 0) {

    messagesRequest.sinceMs = Math.max(0, watermarkMs - 5_000);

  }

  const res = await callEmulatorFunction<{

    items: EncryptedMessagePullItem[];

    incremental?: boolean;

  }>("listEncryptedMessages", messagesRequest);

  if (!Array.isArray(res.items) || res.items.length === 0) return;



  const { batch, decodeFailures, earliestFailureMs } = await decodeEncryptedMessagePullItems({

    sessionUid: session.uid,

    items: res.items,

    refs,

    allFriends: allFriendsFromRefs(refs),

  });

  applyDecodedBatchToState({

    batch,

    decodeFailures,

    earliestFailureMs,

    incremental: Boolean(res.incremental),

    refs,

    persistWatermarksNow,

    setChats,

    setMessages,

  });

}



/** Pull one conversation thread (opening a chat) — not capped by the global 500/1000 listener window. */

export async function pullEncryptedMessagesForConversation(

  params: PullEncryptedMessagesParams & { conversationId: string }

): Promise<void> {

  const { session, conversationId, refs, persistWatermarksNow, setChats, setMessages } = params;

  const trimmed = conversationId.trim();

  if (!trimmed) return;



  const res = await callEmulatorFunction<{

    items: EncryptedMessagePullItem[];

  }>("listConversationMessages", {

    uid: session.uid,

    deviceId: session.deviceId,

    conversationId: trimmed,

    limit: CONVERSATION_PULL_LIMIT,

  });

  if (!Array.isArray(res.items) || res.items.length === 0) return;



  const { batch, decodeFailures, earliestFailureMs } = await decodeEncryptedMessagePullItems({

    sessionUid: session.uid,

    items: res.items,

    refs,

    allFriends: allFriendsFromRefs(refs),

  });

  applyDecodedBatchToState({

    batch,

    decodeFailures,

    earliestFailureMs,

    incremental: true,

    refs,

    persistWatermarksNow,

    setChats,

    setMessages,

  });

}



export type AttachMessageListenerParams = {

  session: BackendSession;

  signedIn: boolean;

  allFriends: Friend[];

  refs: MessagingSyncRefs;

  persistWatermarksNow: () => void;

  setChats: (updater: (current: Chat[]) => Chat[]) => void;

  setMessages: (updater: (current: Message[]) => Message[]) => void;

  setEncryptedSyncState: PullEncryptedMessagesParams extends never

    ? never

    : (updater: (current: { messages: string; lastSuccessAt?: number }) => unknown) => void;

  refreshHiddenConversationIdsFromServer: () => Promise<void>;

  backendUidToFriendId: Record<string, string>;

};



export function attachEncryptedMessageListener(params: {

  session: BackendSession;

  refs: MessagingSyncRefs;

  persistWatermarksNow: () => void;

  setChats: (updater: (current: Chat[]) => Chat[]) => void;

  setMessages: (updater: (current: Message[]) => Message[]) => void;

  setEncryptedSyncState: Dispatch<SetStateAction<EncryptedSyncStateBundle>>;

  refreshHiddenConversationIdsFromServer: () => Promise<void>;

}): () => void {

  const {

    session,

    refs,

    persistWatermarksNow,

    setChats,

    setMessages,

    setEncryptedSyncState,

    refreshHiddenConversationIdsFromServer,

  } = params;



  const firebaseAuthUid = firebaseAuth.currentUser?.uid;

  if (!firebaseAuthUid) return () => {};



  let cancelled = false;

  const db = getFirestoreDb();

  const q = firestoreQuery(

    collectionGroup(db, "messages"),

    where("participantAuthUids", "array-contains", firebaseAuthUid),

    orderBy("createdAt", "desc"),

    firestoreLimit(ENCRYPTED_MESSAGES_LISTENER_LIMIT)

  );



  setEncryptedSyncState((current) => ({ ...current, messages: "syncing" }));

  logAppEvent("messages.listener.attach", { firebaseAuthUid });



  let unsubscribe = () => {};

  let snapshotGeneration = 0;



  void (async () => {

    try {

      await callEmulatorFunction("registerFirebaseAuthUid", {

        uid: session.uid,

        deviceId: session.deviceId,

        firebaseAuthUid,

      });

    } catch (err) {

      logAppError("messages.listener.register_firebase_uid", err, { uid: session.uid });

    }

    await refreshHiddenConversationIdsFromServer();

    if (cancelled) return;

    unsubscribe = onSnapshot(

    q,

    async (snap) => {
      try {
      if (cancelled) return;

      const generation = ++snapshotGeneration;

      const changes = snap.docChanges().filter((c) => c.type !== "removed");

      if (changes.length === 0) {

        setEncryptedSyncState((current) => ({

          ...current,

          messages: "ok",

          lastSuccessAt: Date.now(),

        }));

        return;

      }

      logAppEvent("messages.listener.snapshot", {

        changeCount: changes.length,

        fromCache: snap.metadata.fromCache,

        hasPendingWrites: snap.metadata.hasPendingWrites,

      });



      const knownChatIds = new Set(refs.chatsRef.current?.map((chat) => chat.id) ?? []);

      const hiddenChatIdSet = new Set(refs.hiddenChatIdsRef.current ?? []);

      const hiddenServerConversationIds = refs.hiddenServerConversationIdsRef.current ?? new Set();

      const uidToFriendId = refs.backendUidToFriendIdRef.current ?? {};

      const batch: DecodedIncomingBatch = { decoded: [], missingChats: [] };

      const metadataPatches: Array<{ messageId: string; doc: MessageDocMetadata }> = [];

      const watermarkMs = refs.messagesWatermarkMsRef.current ?? 0;

      const localMessages = refs.messagesRef.current ?? [];

      const allFriends = allFriendsFromRefs(refs);
      const rosterFriendBackendUids = rosterFriendBackendUidsFromMap(refs.friendMapRef.current);

      let decodeFailures = 0;
      let earliestFailureMs: number | null = null;



      for (const change of changes) {

        let docCreatedAtMs = 0;

        try {

          const data = change.doc.data() as {

            messageId?: string;

            senderUid?: string;

            participantUids?: string[];

            ciphertext?: string;

            nonce?: string;

            envelopes?: Record<string, string>;

            createdAt?: { toMillis?: () => number } | null;

            reactions?: Record<string, string>;

            editedAt?: number | null;

            unsentAt?: number | null;

          };

          const messageDocId = String(data.messageId ?? change.doc.id).trim();

          const docMetadata: MessageDocMetadata = {

            reactions: data.reactions,

            editedAt: data.editedAt,

            unsentAt: data.unsentAt,

          };



          if (change.type === "modified") {

            metadataPatches.push({ messageId: messageDocId, doc: docMetadata });

            const existsLocally = localMessages.some((m) => m.id === messageDocId);

            const hasEdit =

              docMetadata.editedAt != null && Number.isFinite(Number(docMetadata.editedAt));

            if (existsLocally && !hasEdit) {

              continue;

            }

          }



          const conversationId = change.doc.ref.parent.parent?.id ?? "";

          if (!data.ciphertext || !data.nonce || !data.envelopes) {

            logDecodeIncomingError(

              "messages.listener.missing_payload",

              new Error("Message doc missing ciphertext, nonce, or envelopes"),

              { conversationId, messageId: data.messageId ?? change.doc.id }

            );

            continue;

          }

          const envelope = data.envelopes[session.uid];

          if (!envelope) {

            logDecodeIncomingError(

              "messages.listener.missing_envelope",

              new Error("No envelope for this recipient on message doc"),

              {

                conversationId,

                senderUid: data.senderUid ?? "",

                participantUids: data.participantUids ?? [],

              }

            );

            continue;

          }

          const createdAtMs =

            typeof data.createdAt?.toMillis === "function"

              ? data.createdAt.toMillis()

              : Date.now();

          docCreatedAtMs = createdAtMs;



          const result = await decodeIncomingEncryptedMessage({

            sessionUid: session.uid,

            ciphertext: data.ciphertext,

            nonce: data.nonce,

            envelope,

            senderUid: data.senderUid ?? "",

            conversationId,

            messageDocId,

            createdAtMs,

            uidToFriendId,

            knownChatIds,

            hiddenChatIdSet,

            hiddenServerConversationIds,

            chats: refs.chatsRef.current ?? [],

            friendMap: refs.friendMapRef.current ?? {},

            friendIdToBackendUid: refs.friendIdToBackendUidRef.current ?? {},

            identityLockedChatIds: new Set(refs.identityLockedChatIdsRef.current ?? []),

            allFriends,

            // Real-time listener must not use the global pull watermark — it can skip
            // new server messages when the watermark was seeded from cloud sync.
            watermarkMs: undefined,

            acceptedFriendBackendUids: refs.acceptedFriendBackendUidsRef.current,
            rosterFriendBackendUids,

            docMetadata,

          });

          if (!result) {

            if (change.type === "modified") {

              metadataPatches.push({ messageId: messageDocId, doc: docMetadata });

            }

            continue;

          }

          batch.decoded.push(result.message);

          if (result.missingChat) batch.missingChats.push(result.missingChat);

        } catch (err) {

          decodeFailures += 1;

          if (docCreatedAtMs > 0 && (earliestFailureMs == null || docCreatedAtMs < earliestFailureMs)) {

            earliestFailureMs = docCreatedAtMs;

          }

          logDecodeIncomingError("messages.listener.decode", err, {

            conversationId: change.doc.ref.parent.parent?.id ?? "",

            senderUid: String((change.doc.data() as { senderUid?: string }).senderUid ?? ""),

          });

        }

      }



      if (cancelled || generation !== snapshotGeneration) return;



      if (metadataPatches.length > 0) {

        setMessages((current) =>

          applyMetadataPatchesToMessages(current, metadataPatches, session.uid, uidToFriendId)

        );

      }



      if (batch.missingChats.length > 0) {

        setChats((current) => mergeMissingChatsIntoState(current, batch.missingChats));

      }

      if (batch.decoded.length > 0) {

        setMessages((current) => mergeMessagesIntoState(current, batch.decoded, true));

        const successCursor = Math.max(...batch.decoded.map((m) => messageSyncCursorMs(m)));

        const prior = refs.messagesWatermarkMsRef.current ?? 0;

        const next = nextSafeWatermarkMs({ prior, successCursorMs: successCursor, earliestFailureMs });

        if (next > prior) {

          refs.messagesWatermarkMsRef.current = next;

          persistWatermarksNow();

        }

      }

      setEncryptedSyncState((current) => ({

        ...current,

        messages: "ok",

        lastSuccessAt: Date.now(),

      }));
      } catch (err) {
        logAppError(
          "messages.listener.snapshot_handler",
          err instanceof Error ? err : new Error(String(err ?? "")),
          { firebaseAuthUid, changeCount: snap.docChanges().length }
        );
        setEncryptedSyncState((current) => ({ ...current, messages: "error" }));
      }
    },

    (err) => {

      if (cancelled) return;

      logAppError("messages.listener.error", err instanceof Error ? err : new Error(String(err ?? "")), {

        firebaseAuthUid,

      });

      setEncryptedSyncState((current) => ({ ...current, messages: "error" }));

    }

  );

  })();



  return () => {

    cancelled = true;

    unsubscribe();

  };

}

/** Realtime delivery for the chat currently on screen (scoped query, not collection-group). */
export function attachConversationMessageListener(params: {
  session: BackendSession;
  conversationId: string;
  refs: MessagingSyncRefs;
  persistWatermarksNow: () => void;
  setChats: (updater: (current: Chat[]) => Chat[]) => void;
  setMessages: (updater: (current: Message[]) => Message[]) => void;
  setEncryptedSyncState: Dispatch<SetStateAction<EncryptedSyncStateBundle>>;
}): () => void {
  const {
    session,
    conversationId,
    refs,
    persistWatermarksNow,
    setChats,
    setMessages,
    setEncryptedSyncState,
  } = params;

  const trimmedConversationId = conversationId.trim();
  if (!trimmedConversationId) return () => {};

  let cancelled = false;
  const db = getFirestoreDb();
  const q = firestoreQuery(
    collection(db, "conversations", trimmedConversationId, "messages"),
    orderBy("createdAt", "desc"),
    firestoreLimit(ENCRYPTED_MESSAGES_CONVERSATION_LISTENER_LIMIT)
  );

  let snapshotGeneration = 0;
  logAppEvent("messages.conversation_listener.attach", { conversationId: trimmedConversationId });

  const unsubscribe = onSnapshot(
    q,
    async (snap) => {
      try {
        if (cancelled) return;
        const generation = ++snapshotGeneration;
        const changes = snap.docChanges().filter((c) => c.type !== "removed");
        if (changes.length === 0) return;

        const knownChatIds = new Set(refs.chatsRef.current?.map((chat) => chat.id) ?? []);
        const hiddenChatIdSet = new Set(refs.hiddenChatIdsRef.current ?? []);
        const hiddenServerConversationIds = refs.hiddenServerConversationIdsRef.current ?? new Set();
        const uidToFriendId = refs.backendUidToFriendIdRef.current ?? {};
        const batch: DecodedIncomingBatch = { decoded: [], missingChats: [] };
        const metadataPatches: Array<{ messageId: string; doc: MessageDocMetadata }> = [];
        const localMessages = refs.messagesRef.current ?? [];
        const allFriends = allFriendsFromRefs(refs);
        const rosterFriendBackendUids = rosterFriendBackendUidsFromMap(refs.friendMapRef.current);
        let decodeFailures = 0;
        let earliestFailureMs: number | null = null;

        for (const change of changes) {
          let docCreatedAtMs = 0;
          try {
            const data = change.doc.data() as {
              messageId?: string;
              senderUid?: string;
              participantUids?: string[];
              ciphertext?: string;
              nonce?: string;
              envelopes?: Record<string, string>;
              createdAt?: { toMillis?: () => number } | null;
              reactions?: Record<string, string>;
              editedAt?: number | null;
              unsentAt?: number | null;
            };
            const messageDocId = String(data.messageId ?? change.doc.id).trim();
            const docMetadata: MessageDocMetadata = {
              reactions: data.reactions,
              editedAt: data.editedAt,
              unsentAt: data.unsentAt,
            };

            if (change.type === "modified") {
              metadataPatches.push({ messageId: messageDocId, doc: docMetadata });
              const existsLocally = localMessages.some((m) => m.id === messageDocId);
              const hasEdit =
                docMetadata.editedAt != null && Number.isFinite(Number(docMetadata.editedAt));
              if (existsLocally && !hasEdit) continue;
            }

            if (!data.ciphertext || !data.nonce || !data.envelopes) continue;
            const envelope = data.envelopes[session.uid];
            if (!envelope) continue;

            const createdAtMs =
              typeof data.createdAt?.toMillis === "function"
                ? data.createdAt.toMillis()
                : Date.now();
            docCreatedAtMs = createdAtMs;

            const result = await decodeIncomingEncryptedMessage({
              sessionUid: session.uid,
              ciphertext: data.ciphertext,
              nonce: data.nonce,
              envelope,
              senderUid: data.senderUid ?? "",
              conversationId: trimmedConversationId,
              messageDocId,
              createdAtMs,
              uidToFriendId,
              knownChatIds,
              hiddenChatIdSet,
              hiddenServerConversationIds,
              chats: refs.chatsRef.current ?? [],
              friendMap: refs.friendMapRef.current ?? {},
              friendIdToBackendUid: refs.friendIdToBackendUidRef.current ?? {},
              identityLockedChatIds: new Set(refs.identityLockedChatIdsRef.current ?? []),
              allFriends,
              watermarkMs: undefined,
              acceptedFriendBackendUids: refs.acceptedFriendBackendUidsRef.current,
              rosterFriendBackendUids,
              docMetadata,
            });
            if (!result) continue;
            batch.decoded.push(result.message);
            if (result.missingChat) batch.missingChats.push(result.missingChat);
          } catch (err) {
            decodeFailures += 1;
            if (docCreatedAtMs > 0 && (earliestFailureMs == null || docCreatedAtMs < earliestFailureMs)) {
              earliestFailureMs = docCreatedAtMs;
            }
            logDecodeIncomingError("messages.conversation_listener.decode", err, {
              conversationId: trimmedConversationId,
            });
          }
        }

        if (cancelled || generation !== snapshotGeneration) return;

        if (metadataPatches.length > 0) {
          setMessages((current) =>
            applyMetadataPatchesToMessages(current, metadataPatches, session.uid, uidToFriendId)
          );
        }
        if (batch.missingChats.length > 0) {
          setChats((current) => mergeMissingChatsIntoState(current, batch.missingChats));
        }
        if (batch.decoded.length > 0) {
          setMessages((current) => mergeMessagesIntoState(current, batch.decoded, true));
          const successCursor = Math.max(...batch.decoded.map((m) => messageSyncCursorMs(m)));
          const prior = refs.messagesWatermarkMsRef.current ?? 0;
          const next = nextSafeWatermarkMs({ prior, successCursorMs: successCursor, earliestFailureMs });
          if (next > prior) {
            refs.messagesWatermarkMsRef.current = next;
            persistWatermarksNow();
          }
        }
        setEncryptedSyncState((current) => ({
          ...current,
          messages: "ok",
          lastSuccessAt: Date.now(),
        }));
      } catch (err) {
        logAppError(
          "messages.conversation_listener.snapshot_handler",
          err instanceof Error ? err : new Error(String(err ?? "")),
          { conversationId: trimmedConversationId }
        );
      }
    },
    (err) => {
      if (cancelled) return;
      logAppError(
        "messages.conversation_listener.error",
        err instanceof Error ? err : new Error(String(err ?? "")),
        { conversationId: trimmedConversationId }
      );
    }
  );

  return () => {
    cancelled = true;
    unsubscribe();
  };
}


