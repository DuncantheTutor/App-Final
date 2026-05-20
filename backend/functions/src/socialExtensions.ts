/**
 * Chat/feed/social extensions (May 2026 roadmap).
 * Imported and re-exported from index.ts.
 */
import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { assertVerifiedCallableCaller } from "./deviceSession";
import { getFirestore } from "./firebaseAdmin";

function firestoreDb() {
  return getFirestore();
}

const PRESENCE_STALE_MS = 45_000;

type EnvelopeMap = Record<string, string>;

function requireAuthUid(uid: string | null | undefined): string {
  if (!uid) throw new HttpsError("unauthenticated", "Authentication required.");
  return uid;
}

function nowMs(): number {
  return Date.now();
}

function friendshipId(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

function timestampToMs(value: unknown): number {
  if (typeof value === "number") return value;
  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof (value as { toMillis: unknown }).toMillis === "function"
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
}

function parseSinceMs(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

async function assertAcceptedFriendship(uid: string, otherUid: string): Promise<void> {
  if (uid === otherUid) return;
  const snap = await firestoreDb().collection("friendships").doc(friendshipId(uid, otherUid)).get();
  if (!snap.exists) {
    throw new HttpsError("permission-denied", "Friendship required.");
  }
  const data = snap.data() as { status?: string } | undefined;
  if (data?.status !== "accepted") {
    throw new HttpsError("permission-denied", "Friendship not accepted.");
  }
}

async function resolveParticipantAuthUids(uids: string[]): Promise<string[]> {
  const unique = [...new Set(uids.filter((x) => !!x))];
  if (unique.length === 0) return [];
  const refs = unique.map((uid) => firestoreDb().collection("userFirebaseAuthMap").doc(uid));
  const snaps = await firestoreDb().getAll(...refs);
  const out: string[] = [];
  for (const snap of snaps) {
    const data = snap.data() as { firebaseAuthUid?: string } | undefined;
    const authUid = (data?.firebaseAuthUid ?? "").trim();
    if (authUid) out.push(authUid);
  }
  return [...new Set(out)].sort();
}

function isAppBackendUid(id: string): boolean {
  return id.startsWith("u_");
}

/** Maps friendship participant entries (app uid or legacy Firebase Auth uid) to `u_*`. */
async function normalizeParticipantToAppUid(raw: string): Promise<string | null> {
  const id = String(raw ?? "").trim();
  if (!id) return null;
  if (isAppBackendUid(id)) {
    const snap = await firestoreDb().collection("users").doc(id).get();
    return snap.exists ? id : null;
  }
  const rev = await firestoreDb().collection("firebaseAuthToAppUid").doc(id).get();
  let appUid = String(rev.data()?.appUid ?? "").trim();
  if (!appUid) {
    const mapQuery = await firestoreDb()
      .collection("userFirebaseAuthMap")
      .where("firebaseAuthUid", "==", id)
      .limit(1)
      .get();
    if (!mapQuery.empty) {
      appUid = mapQuery.docs[0].id.trim();
    }
  }
  if (!appUid || !isAppBackendUid(appUid)) return null;
  const userSnap = await firestoreDb().collection("users").doc(appUid).get();
  return userSnap.exists ? appUid : null;
}

async function getAcceptedFriendUids(uid: string): Promise<string[]> {
  const mine = await firestoreDb()
    .collection("friendships")
    .where("participants", "array-contains", uid)
    .where("status", "==", "accepted")
    .get();
  const friendUids: string[] = [];
  for (const doc of mine.docs) {
    const participants = (doc.data().participants ?? []) as string[];
    for (const raw of participants) {
      if (raw === uid) continue;
      const normalized = await normalizeParticipantToAppUid(raw);
      if (normalized && normalized !== uid) friendUids.push(normalized);
    }
  }
  return [...new Set(friendUids)];
}

type ConversationData = {
  participantUids?: string[];
  participantAuthUids?: string[];
  createdBy?: string;
  adminIds?: string[];
  memberJoinedAt?: Record<string, number>;
  readBy?: Record<string, { lastReadAtMs?: number; lastReadMessageId?: string }>;
  mutedBy?: Record<string, boolean>;
};

function memberJoinCutoffMs(conv: ConversationData, uid: string): number {
  const raw = conv.memberJoinedAt?.[uid];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}

function isConversationAdmin(conv: ConversationData, uid: string): boolean {
  if (conv.createdBy === uid) return true;
  return Array.isArray(conv.adminIds) && conv.adminIds.includes(uid);
}

async function loadConversation(conversationId: string): Promise<{
  ref: FirebaseFirestore.DocumentReference;
  data: ConversationData;
}> {
  const ref = firestoreDb().collection("conversations").doc(conversationId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Conversation not found.");
  return { ref, data: snap.data() as ConversationData };
}

function assertParticipant(conv: ConversationData, uid: string): void {
  if (!(conv.participantUids ?? []).includes(uid)) {
    throw new HttpsError("permission-denied", "User is not in this conversation.");
  }
}

/** Sends FCM to other participants (best-effort). */
export async function notifyConversationParticipantsPush(args: {
  senderUid: string;
  conversationId: string;
  participantUids: string[];
  previewText?: string;
}): Promise<void> {
  const recipients = args.participantUids.filter((id) => id !== args.senderUid);
  if (recipients.length === 0) return;

  const convSnap = await firestoreDb().collection("conversations").doc(args.conversationId).get();
  const mutedBy = (convSnap.data()?.mutedBy ?? {}) as Record<string, boolean>;

  const tokenSnaps = await Promise.all(
    recipients.map(async (uid) => {
      if (mutedBy[uid]) return [];
      const snap = await firestoreDb().collection("users").doc(uid).collection("pushTokens").get();
      return snap.docs
        .map((d) => String(d.data().token ?? "").trim())
        .filter(Boolean);
    })
  );
  const tokens = [...new Set(tokenSnaps.flat())];
  if (tokens.length === 0) return;

  const expoTokens = tokens.filter((t) => t.startsWith("ExponentPushToken"));
  const fcmTokens = tokens.filter((t) => !t.startsWith("ExponentPushToken"));

  if (expoTokens.length > 0) {
    try {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          expoTokens.map((to) => ({
            to,
            title: "New message",
            body: args.previewText?.trim() || "You have a new message",
            data: { type: "chat_message", conversationId: args.conversationId },
            sound: "default",
            priority: "high",
          }))
        ),
      });
    } catch {
      /* push is best-effort */
    }
  }

  if (fcmTokens.length > 0) {
    try {
      await admin.messaging().sendEachForMulticast({
        tokens: fcmTokens,
        notification: {
          title: "New message",
          body: args.previewText?.trim() || "You have a new message",
        },
        data: {
          type: "chat_message",
          conversationId: args.conversationId,
        },
        android: { priority: "high" },
      });
    } catch {
      /* push is best-effort */
    }
  }
}

export const registerPushToken = onCall(async (req) => {
  const { appUid: uid, deviceId } = await assertVerifiedCallableCaller(req);
  const token = String(req.data?.token ?? "").trim();
  const platform = String(req.data?.platform ?? "unknown").trim();
  if (!token) throw new HttpsError("invalid-argument", "token is required.");
  await firestoreDb()
    .collection("users")
    .doc(uid)
    .collection("pushTokens")
    .doc(deviceId)
    .set({
      token,
      platform,
      deviceId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  return { ok: true };
});

export const listConversationMessages = onCall(async (req) => {
  const { appUid: uid } = await assertVerifiedCallableCaller(req);
  const conversationId = String(req.data?.conversationId ?? "").trim();
  if (!conversationId) throw new HttpsError("invalid-argument", "conversationId is required.");
  const limit = Math.max(1, Math.min(500, Number(req.data?.limit ?? 120)));
  const beforeMs = parseSinceMs(req.data?.beforeMs);

  const { data: conv } = await loadConversation(conversationId);
  assertParticipant(conv, uid);
  const joinCutoff = memberJoinCutoffMs(conv, uid);

  let query: FirebaseFirestore.Query = firestoreDb()
    .collection("conversations")
    .doc(conversationId)
    .collection("messages")
    .orderBy("createdAt", "desc");

  if (beforeMs != null) {
    query = query.where("createdAt", "<", admin.firestore.Timestamp.fromMillis(beforeMs));
  }

  const snap = await query.limit(limit + 1).get();
  const items = snap.docs
    .map((doc) => {
      const data = doc.data() as {
        messageId: string;
        senderUid: string;
        ciphertext: string;
        nonce: string;
        envelopes: EnvelopeMap;
        createdAt?: unknown;
        reactions?: Record<string, string>;
        editedAt?: number;
        unsentAt?: number;
      };
      const createdAtMs = timestampToMs(data.createdAt);
      if (createdAtMs < joinCutoff) return null;
      const envelope = data.envelopes?.[uid];
      if (!envelope) return null;
      return {
        messageId: data.messageId || doc.id,
        conversationId,
        senderUid: data.senderUid,
        ciphertext: data.ciphertext,
        nonce: data.nonce,
        envelope,
        createdAtMs,
        reactions: data.reactions ?? {},
        editedAt: data.editedAt ?? null,
        unsentAt: data.unsentAt ?? null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const hasMore = items.length > limit;
  const page = items.slice(0, limit);
  const oldestMs = page.length > 0 ? Math.min(...page.map((i) => i.createdAtMs)) : null;
  return { items: page, hasMore, oldestMs };
});

export const updateConversationReadPosition = onCall(async (req) => {
  const { appUid: uid } = await assertVerifiedCallableCaller(req);
  const conversationId = String(req.data?.conversationId ?? "").trim();
  const lastReadAtMs = Number(req.data?.lastReadAtMs ?? 0);
  const lastReadMessageId = String(req.data?.lastReadMessageId ?? "").trim();
  if (!conversationId) throw new HttpsError("invalid-argument", "conversationId is required.");
  if (!Number.isFinite(lastReadAtMs) || lastReadAtMs <= 0) {
    throw new HttpsError("invalid-argument", "lastReadAtMs is required.");
  }

  const { ref, data: conv } = await loadConversation(conversationId);
  assertParticipant(conv, uid);
  await ref.set(
    {
      readBy: {
        ...(conv.readBy ?? {}),
        [uid]: {
          lastReadAtMs: Math.floor(lastReadAtMs),
          ...(lastReadMessageId ? { lastReadMessageId } : {}),
        },
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { ok: true };
});

export const setConversationNotificationMute = onCall(async (req) => {
  const { appUid: uid } = await assertVerifiedCallableCaller(req);
  const conversationId = String(req.data?.conversationId ?? "").trim();
  const muted = Boolean(req.data?.muted);
  if (!conversationId) throw new HttpsError("invalid-argument", "conversationId is required.");

  const { ref, data: conv } = await loadConversation(conversationId);
  assertParticipant(conv, uid);
  const mutedBy = { ...(conv.mutedBy ?? {}), [uid]: muted };
  if (!muted) delete mutedBy[uid];
  await ref.set(
    {
      mutedBy,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { ok: true, muted };
});

export const manageConversationMembership = onCall(async (req) => {
  const { appUid: uid } = await assertVerifiedCallableCaller(req);
  const conversationId = String(req.data?.conversationId ?? "").trim();
  const action = String(req.data?.action ?? "").trim() as "addMember" | "leave" | "kick";
  const targetUid = String(req.data?.targetUid ?? "").trim();
  if (!conversationId) throw new HttpsError("invalid-argument", "conversationId is required.");

  const { ref, data: conv } = await loadConversation(conversationId);
  assertParticipant(conv, uid);
  const participants = [...new Set(conv.participantUids ?? [])];
  const now = nowMs();

  if (action === "addMember") {
    if (!targetUid) throw new HttpsError("invalid-argument", "targetUid is required.");
    if (!isConversationAdmin(conv, uid)) {
      throw new HttpsError("permission-denied", "Only admins can add members.");
    }
    if (participants.includes(targetUid)) return { ok: true, participantUids: participants };
    for (const memberUid of participants) {
      await assertAcceptedFriendship(memberUid, targetUid);
    }
    const nextParticipants = [...participants, targetUid].sort();
    const memberJoinedAt = { ...(conv.memberJoinedAt ?? {}), [targetUid]: now };
    const participantAuthUids = await resolveParticipantAuthUids(nextParticipants);
    const adminIds = conv.adminIds?.length
      ? conv.adminIds
      : conv.createdBy
        ? [conv.createdBy]
        : [uid];
    await ref.set(
      {
        participantUids: nextParticipants,
        participantAuthUids,
        memberJoinedAt,
        adminIds,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { ok: true, participantUids: nextParticipants, memberJoinedAt };
  }

  if (action === "leave") {
    const nextParticipants = participants.filter((id) => id !== uid);
    if (nextParticipants.length === 0) {
      await ref.delete();
      return { ok: true, participantUids: [] };
    }
    const participantAuthUids = await resolveParticipantAuthUids(nextParticipants);
    await ref.set(
      {
        participantUids: nextParticipants,
        participantAuthUids,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { ok: true, participantUids: nextParticipants };
  }

  if (action === "kick") {
    if (!targetUid) throw new HttpsError("invalid-argument", "targetUid is required.");
    if (!isConversationAdmin(conv, uid)) {
      throw new HttpsError("permission-denied", "Only admins can remove members.");
    }
    if (targetUid === uid) {
      throw new HttpsError("invalid-argument", "Use leave to exit the group.");
    }
    const nextParticipants = participants.filter((id) => id !== targetUid);
    const participantAuthUids = await resolveParticipantAuthUids(nextParticipants);
    await ref.set(
      {
        participantUids: nextParticipants,
        participantAuthUids,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { ok: true, participantUids: nextParticipants };
  }

  throw new HttpsError("invalid-argument", "action must be addMember, leave, or kick.");
});

export const setEncryptedPostReaction = onCall(async (req) => {
  const { appUid: uid } = await assertVerifiedCallableCaller(req);
  const postId = String(req.data?.postId ?? "").trim();
  const emoji = String(req.data?.emoji ?? "").trim();
  if (!postId) throw new HttpsError("invalid-argument", "postId is required.");

  const postRef = firestoreDb().collection("encryptedPosts").doc(postId);
  const postSnap = await postRef.get();
  if (!postSnap.exists) throw new HttpsError("not-found", "Post not found.");
  const post = postSnap.data() as { ownerUid?: string; recipientUids?: string[] };
  const recipients = post.recipientUids ?? [];
  if (!recipients.includes(uid)) {
    throw new HttpsError("permission-denied", "Not a recipient of this post.");
  }
  if (post.ownerUid && post.ownerUid !== uid) {
    await assertAcceptedFriendship(uid, post.ownerUid);
  }

  const reactionRef = firestoreDb().collection("encryptedPostReactions").doc(postId);
  await firestoreDb().runTransaction(async (tx) => {
    const snap = await tx.get(reactionRef);
    const reactions = { ...((snap.data()?.reactions ?? {}) as Record<string, string>) };
    if (!emoji) delete reactions[uid];
    else reactions[uid] = emoji;
    tx.set(
      reactionRef,
      { postId, reactions, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
  });
  return { ok: true };
});

export const updateEncryptedPost = onCall(async (req) => {
  const { appUid: uid } = await assertVerifiedCallableCaller(req);
  const postId = String(req.data?.postId ?? "").trim();
  const ciphertext = String(req.data?.ciphertext ?? "");
  const nonce = String(req.data?.nonce ?? "");
  const envelopes = (req.data?.envelopes ?? {}) as EnvelopeMap;
  if (!postId) throw new HttpsError("invalid-argument", "postId is required.");
  if (!ciphertext || !nonce) throw new HttpsError("invalid-argument", "ciphertext and nonce required.");

  const postRef = firestoreDb().collection("encryptedPosts").doc(postId);
  const snap = await postRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Post not found.");
  const data = snap.data() as { ownerUid?: string; recipientUids?: string[] };
  if (data.ownerUid !== uid) {
    throw new HttpsError("permission-denied", "Only the post owner can edit.");
  }
  const recipientAuthUids = await resolveParticipantAuthUids(data.recipientUids ?? []);
  await postRef.set(
    {
      ciphertext,
      nonce,
      envelopes,
      recipientAuthUids,
      editedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { ok: true };
});

export const updateMessageMetadata = onCall(async (req) => {
  const { appUid: uid } = await assertVerifiedCallableCaller(req);
  const conversationId = String(req.data?.conversationId ?? "").trim();
  const messageId = String(req.data?.messageId ?? "").trim();
  if (!conversationId || !messageId) {
    throw new HttpsError("invalid-argument", "conversationId and messageId are required.");
  }

  const { data: conv } = await loadConversation(conversationId);
  assertParticipant(conv, uid);

  const msgRef = firestoreDb().collection("conversations").doc(conversationId).collection("messages").doc(messageId);
  const msgSnap = await msgRef.get();
  if (!msgSnap.exists) throw new HttpsError("not-found", "Message not found.");
  const msg = msgSnap.data() as { senderUid?: string; reactions?: Record<string, string> };

  const patch: Record<string, unknown> = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (req.data?.reactions !== undefined) {
    const emoji = String((req.data.reactions as Record<string, string>)?.[uid] ?? "").trim();
    const reactions = { ...(msg.reactions ?? {}) };
    if (emoji) reactions[uid] = emoji;
    else delete reactions[uid];
    patch.reactions = reactions;
  }

  if (req.data?.editedAt != null) {
    if (msg.senderUid !== uid) throw new HttpsError("permission-denied", "Only sender can edit.");
    patch.editedAt = Number(req.data.editedAt);
    patch.unsentAt = admin.firestore.FieldValue.delete();
  }

  if (req.data?.unsentAt != null) {
    if (msg.senderUid !== uid) throw new HttpsError("permission-denied", "Only sender can unsend.");
    patch.unsentAt = Number(req.data.unsentAt);
  }

  await msgRef.set(patch, { merge: true });
  return { ok: true };
});

/** Replace ciphertext for an existing message (edit body). Sender-only. */
export const updateEncryptedMessage = onCall(async (req) => {
  const { appUid: uid } = await assertVerifiedCallableCaller(req);
  const conversationId = String(req.data?.conversationId ?? "").trim();
  const messageId = String(req.data?.messageId ?? "").trim();
  const ciphertext = String(req.data?.ciphertext ?? "");
  const nonce = String(req.data?.nonce ?? "").trim();
  const envelopes = (req.data?.envelopes ?? {}) as EnvelopeMap;
  if (!conversationId || !messageId) {
    throw new HttpsError("invalid-argument", "conversationId and messageId are required.");
  }
  if (!ciphertext || !nonce) {
    throw new HttpsError("invalid-argument", "ciphertext and nonce are required.");
  }
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(messageId)) {
    throw new HttpsError("invalid-argument", "messageId format is invalid.");
  }

  const { data: conv } = await loadConversation(conversationId);
  assertParticipant(conv, uid);
  const participants = conv.participantUids ?? [];
  for (const participantUid of participants) {
    if (participantUid !== uid && !envelopes[participantUid]) {
      throw new HttpsError("invalid-argument", "Envelope missing for a participant.");
    }
  }

  const msgRef = firestoreDb().collection("conversations").doc(conversationId).collection("messages").doc(messageId);
  const msgSnap = await msgRef.get();
  if (!msgSnap.exists) throw new HttpsError("not-found", "Message not found.");
  const msg = msgSnap.data() as { senderUid?: string };
  if (msg.senderUid !== uid) throw new HttpsError("permission-denied", "Only sender can edit message body.");

  const editedAt = Number(req.data?.editedAt ?? Date.now());
  await msgRef.set(
    {
      ciphertext,
      nonce,
      envelopes,
      editedAt,
      unsentAt: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { ok: true, editedAt };
});

/** Extends removeFriendship: kick both from shared groups. */
export async function kickPairFromSharedGroups(uidA: string, uidB: string): Promise<void> {
  const snap = await firestoreDb()
    .collection("conversations")
    .where("participantUids", "array-contains", uidA)
    .get();
  const batch = firestoreDb().batch();
  let pending = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as ConversationData;
    const participants = data.participantUids ?? [];
    if (!participants.includes(uidA) || !participants.includes(uidB)) continue;
    if (participants.length <= 2) continue;
    const next = participants.filter((id) => id !== uidA && id !== uidB);
    if (next.length === participants.length) continue;
    const participantAuthUids = await resolveParticipantAuthUids(next);
    if (next.length === 0) {
      batch.delete(doc.ref);
    } else {
      batch.set(
        doc.ref,
        {
          participantUids: next,
          participantAuthUids,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    pending++;
    if (pending >= 400) break;
  }
  if (pending > 0) await batch.commit();
}

export async function filterPostItemsByFriendship<T extends { ownerUid: string }>(
  uid: string,
  items: T[]
): Promise<T[]> {
  const friendSet = new Set(await getAcceptedFriendUids(uid));
  friendSet.add(uid);
  return items.filter((item) => friendSet.has(item.ownerUid));
}

/** Refresh `viewerAuthUids` only — does not mark the user online (auth map repair). */
export async function refreshPresenceViewerAuthUids(
  uid: string,
  deviceId?: string
): Promise<void> {
  const friendUids = await getAcceptedFriendUids(uid);
  const viewerAuthUids = await resolveParticipantAuthUids([uid, ...friendUids]);
  const patch: Record<string, unknown> = {
    viewerAuthUids,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const trimmedDevice = String(deviceId ?? "").trim();
  if (trimmedDevice) patch.deviceId = trimmedDevice;
  await firestoreDb().collection("presence").doc(uid).set(patch, { merge: true });
}

/**
 * After `registerFirebaseAuthUid`, add this device's Firebase Auth UID to each
 * accepted friend's `presence.viewerAuthUids` so their Firestore listener can
 * read our presence doc without waiting for our next heartbeat.
 */
export async function propagateFirebaseAuthUidToFriendsPresenceViewers(
  registrantAppUid: string
): Promise<void> {
  const mapSnap = await firestoreDb().collection("userFirebaseAuthMap").doc(registrantAppUid).get();
  const authUid = String(mapSnap.data()?.firebaseAuthUid ?? "").trim();
  if (!authUid) return;

  const friendUids = await getAcceptedFriendUids(registrantAppUid);
  if (friendUids.length === 0) return;

  let batch = firestoreDb().batch();
  let pending = 0;
  for (const friendUid of friendUids) {
    batch.set(
      firestoreDb().collection("presence").doc(friendUid),
      { viewerAuthUids: admin.firestore.FieldValue.arrayUnion(authUid) },
      { merge: true }
    );
    pending += 1;
    if (pending >= 400) {
      await batch.commit();
      batch = firestoreDb().batch();
      pending = 0;
    }
  }
  if (pending > 0) await batch.commit();
}

/** Backfill `participantAuthUids` on recent message docs after auth registration. */
export async function backfillMessageParticipantAuthUid(
  appUid: string,
  firebaseAuthUid: string
): Promise<void> {
  const authUid = firebaseAuthUid.trim();
  if (!authUid || !appUid.startsWith("u_")) return;

  const snap = await firestoreDb()
    .collectionGroup("messages")
    .where("participantUids", "array-contains", appUid)
    .orderBy("createdAt", "desc")
    .limit(120)
    .get();

  let batch = firestoreDb().batch();
  let pending = 0;
  for (const doc of snap.docs) {
    const existing = (doc.data().participantAuthUids ?? []) as unknown;
    if (Array.isArray(existing) && existing.includes(authUid)) continue;
    batch.set(
      doc.ref,
      {
        participantAuthUids: admin.firestore.FieldValue.arrayUnion(authUid),
      },
      { merge: true }
    );
    pending += 1;
    if (pending >= 400) {
      await batch.commit();
      batch = firestoreDb().batch();
      pending = 0;
    }
  }
  if (pending > 0) await batch.commit();
}

/**
 * Ensures friends can read this user's presence doc (adds each friend's Firebase Auth
 * UID to this user's `presence.viewerAuthUids`).
 */
export async function mergeFriendAuthOntoRegistrantPresence(
  registrantAppUid: string
): Promise<void> {
  const friendUids = await getAcceptedFriendUids(registrantAppUid);
  const friendAuthUids = await resolveParticipantAuthUids(friendUids);
  const mapSnap = await firestoreDb().collection("userFirebaseAuthMap").doc(registrantAppUid).get();
  const selfAuth = String(mapSnap.data()?.firebaseAuthUid ?? "").trim();
  const toUnion = [...new Set([selfAuth, ...friendAuthUids].filter(Boolean))];
  if (toUnion.length === 0) return;
  await firestoreDb()
    .collection("presence")
    .doc(registrantAppUid)
    .set({ viewerAuthUids: admin.firestore.FieldValue.arrayUnion(...toUnion) }, { merge: true });
}

/** Rebuild presence viewer lists for both sides after a new friendship edge. */
export async function refreshPresenceAfterFriendshipPair(
  uidA: string,
  uidB: string
): Promise<void> {
  await Promise.all([
    propagateFirebaseAuthUidToFriendsPresenceViewers(uidA),
    propagateFirebaseAuthUidToFriendsPresenceViewers(uidB),
    mergeFriendAuthOntoRegistrantPresence(uidA),
    mergeFriendAuthOntoRegistrantPresence(uidB),
    refreshPresenceViewerAuthUids(uidA),
    refreshPresenceViewerAuthUids(uidB),
  ]);
}

/** Presence heartbeat with viewerAuthUids for client onSnapshot. */
export async function writePresenceWithViewers(
  uid: string,
  deviceId: string,
  state: "active" | "background",
  heartbeatAtMs?: number
): Promise<void> {
  const friendUids = await getAcceptedFriendUids(uid);
  const viewerAuthUids = await resolveParticipantAuthUids([uid, ...friendUids]);
  const clientHb = Number(heartbeatAtMs ?? 0);
  const safeHeartbeatAtMs =
    Number.isFinite(clientHb) &&
    clientHb > 0 &&
    nowMs() - clientHb <= PRESENCE_STALE_MS
      ? clientHb
      : nowMs();
  await firestoreDb().collection("presence").doc(uid).set(
    {
      uid,
      state,
      heartbeatAtMs: safeHeartbeatAtMs,
      deviceId,
      viewerAuthUids,
      online: state === "active",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/** Normalize stored heartbeat (number or legacy Timestamp) to epoch ms. */
export function normalizePresenceHeartbeatMs(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (raw && typeof raw === "object") {
    const withToMillis = raw as { toMillis?: () => number };
    if (typeof withToMillis.toMillis === "function") {
      const ms = withToMillis.toMillis();
      if (Number.isFinite(ms)) return ms;
    }
    const withSeconds = raw as { seconds?: number; nanoseconds?: number };
    if (typeof withSeconds.seconds === "number" && Number.isFinite(withSeconds.seconds)) {
      const nano = Number(withSeconds.nanoseconds ?? 0);
      return withSeconds.seconds * 1000 + Math.floor(nano / 1_000_000);
    }
  }
  return 0;
}

export function isPresenceFresh(heartbeatAtMs: number): boolean {
  const ms = normalizePresenceHeartbeatMs(heartbeatAtMs);
  return Number.isFinite(ms) && ms > 0 && nowMs() - ms <= PRESENCE_STALE_MS;
}

export function presenceDocOnlineFromData(data: {
  state?: string;
  heartbeatAtMs?: unknown;
  online?: boolean;
}): boolean {
  const heartbeatAtMs = normalizePresenceHeartbeatMs(data.heartbeatAtMs);
  const fresh = isPresenceFresh(heartbeatAtMs);
  if (!fresh) return false;
  if (data.online === true) return true;
  return data.state === "active";
}
