"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateEncryptedMessage = exports.updateMessageMetadata = exports.updateEncryptedPost = exports.setEncryptedPostReaction = exports.manageConversationMembership = exports.setConversationNotificationMute = exports.updateConversationReadPosition = exports.listConversationMessages = exports.registerPushToken = void 0;
exports.notifyConversationParticipantsPush = notifyConversationParticipantsPush;
exports.kickPairFromSharedGroups = kickPairFromSharedGroups;
exports.filterPostItemsByFriendship = filterPostItemsByFriendship;
exports.writePresenceWithViewers = writePresenceWithViewers;
exports.isPresenceFresh = isPresenceFresh;
/**
 * Chat/feed/social extensions (May 2026 roadmap).
 * Imported and re-exported from index.ts.
 */
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const deviceSession_1 = require("./deviceSession");
const firebaseAdmin_1 = require("./firebaseAdmin");
function firestoreDb() {
    return (0, firebaseAdmin_1.getFirestore)();
}
const PRESENCE_STALE_MS = 45_000;
function requireAuthUid(uid) {
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Authentication required.");
    return uid;
}
function nowMs() {
    return Date.now();
}
function friendshipId(a, b) {
    return a < b ? `${a}_${b}` : `${b}_${a}`;
}
function timestampToMs(value) {
    if (typeof value === "number")
        return value;
    if (value &&
        typeof value === "object" &&
        "toMillis" in value &&
        typeof value.toMillis === "function") {
        return value.toMillis();
    }
    return 0;
}
function parseSinceMs(raw) {
    if (raw === undefined || raw === null || raw === "")
        return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0)
        return null;
    return Math.floor(n);
}
async function assertAcceptedFriendship(uid, otherUid) {
    if (uid === otherUid)
        return;
    const snap = await firestoreDb().collection("friendships").doc(friendshipId(uid, otherUid)).get();
    if (!snap.exists) {
        throw new https_1.HttpsError("permission-denied", "Friendship required.");
    }
    const data = snap.data();
    if (data?.status !== "accepted") {
        throw new https_1.HttpsError("permission-denied", "Friendship not accepted.");
    }
}
async function resolveParticipantAuthUids(uids) {
    const unique = [...new Set(uids.filter((x) => !!x))];
    if (unique.length === 0)
        return [];
    const refs = unique.map((uid) => firestoreDb().collection("userFirebaseAuthMap").doc(uid));
    const snaps = await firestoreDb().getAll(...refs);
    const out = [];
    for (const snap of snaps) {
        const data = snap.data();
        const authUid = (data?.firebaseAuthUid ?? "").trim();
        if (authUid)
            out.push(authUid);
    }
    return [...new Set(out)].sort();
}
function isAppBackendUid(id) {
    return id.startsWith("u_");
}
/** Maps friendship participant entries (app uid or legacy Firebase Auth uid) to `u_*`. */
async function normalizeParticipantToAppUid(raw) {
    const id = String(raw ?? "").trim();
    if (!id)
        return null;
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
    if (!appUid || !isAppBackendUid(appUid))
        return null;
    const userSnap = await firestoreDb().collection("users").doc(appUid).get();
    return userSnap.exists ? appUid : null;
}
async function getAcceptedFriendUids(uid) {
    const mine = await firestoreDb()
        .collection("friendships")
        .where("participants", "array-contains", uid)
        .where("status", "==", "accepted")
        .get();
    const friendUids = [];
    for (const doc of mine.docs) {
        const participants = (doc.data().participants ?? []);
        for (const raw of participants) {
            if (raw === uid)
                continue;
            const normalized = await normalizeParticipantToAppUid(raw);
            if (normalized && normalized !== uid)
                friendUids.push(normalized);
        }
    }
    return [...new Set(friendUids)];
}
function memberJoinCutoffMs(conv, uid) {
    const raw = conv.memberJoinedAt?.[uid];
    return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}
function isConversationAdmin(conv, uid) {
    if (conv.createdBy === uid)
        return true;
    return Array.isArray(conv.adminIds) && conv.adminIds.includes(uid);
}
async function loadConversation(conversationId) {
    const ref = firestoreDb().collection("conversations").doc(conversationId);
    const snap = await ref.get();
    if (!snap.exists)
        throw new https_1.HttpsError("not-found", "Conversation not found.");
    return { ref, data: snap.data() };
}
function assertParticipant(conv, uid) {
    if (!(conv.participantUids ?? []).includes(uid)) {
        throw new https_1.HttpsError("permission-denied", "User is not in this conversation.");
    }
}
/** Sends FCM to other participants (best-effort). */
async function notifyConversationParticipantsPush(args) {
    const recipients = args.participantUids.filter((id) => id !== args.senderUid);
    if (recipients.length === 0)
        return;
    const convSnap = await firestoreDb().collection("conversations").doc(args.conversationId).get();
    const mutedBy = (convSnap.data()?.mutedBy ?? {});
    const tokenSnaps = await Promise.all(recipients.map(async (uid) => {
        if (mutedBy[uid])
            return [];
        const snap = await firestoreDb().collection("users").doc(uid).collection("pushTokens").get();
        return snap.docs
            .map((d) => String(d.data().token ?? "").trim())
            .filter(Boolean);
    }));
    const tokens = [...new Set(tokenSnaps.flat())];
    if (tokens.length === 0)
        return;
    const expoTokens = tokens.filter((t) => t.startsWith("ExponentPushToken"));
    const fcmTokens = tokens.filter((t) => !t.startsWith("ExponentPushToken"));
    if (expoTokens.length > 0) {
        try {
            await fetch("https://exp.host/--/api/v2/push/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(expoTokens.map((to) => ({
                    to,
                    title: "New message",
                    body: args.previewText?.trim() || "You have a new message",
                    data: { type: "chat_message", conversationId: args.conversationId },
                    sound: "default",
                    priority: "high",
                }))),
            });
        }
        catch {
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
        }
        catch {
            /* push is best-effort */
        }
    }
}
exports.registerPushToken = (0, https_1.onCall)(async (req) => {
    const { appUid: uid, deviceId } = await (0, deviceSession_1.assertVerifiedCallableCaller)(req);
    const token = String(req.data?.token ?? "").trim();
    const platform = String(req.data?.platform ?? "unknown").trim();
    if (!token)
        throw new https_1.HttpsError("invalid-argument", "token is required.");
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
exports.listConversationMessages = (0, https_1.onCall)(async (req) => {
    const { appUid: uid } = await (0, deviceSession_1.assertVerifiedCallableCaller)(req);
    const conversationId = String(req.data?.conversationId ?? "").trim();
    if (!conversationId)
        throw new https_1.HttpsError("invalid-argument", "conversationId is required.");
    const limit = Math.max(1, Math.min(100, Number(req.data?.limit ?? 50)));
    const beforeMs = parseSinceMs(req.data?.beforeMs);
    const { data: conv } = await loadConversation(conversationId);
    assertParticipant(conv, uid);
    const joinCutoff = memberJoinCutoffMs(conv, uid);
    let query = firestoreDb()
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
        const data = doc.data();
        const createdAtMs = timestampToMs(data.createdAt);
        if (createdAtMs < joinCutoff)
            return null;
        const envelope = data.envelopes?.[uid];
        if (!envelope)
            return null;
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
        .filter((x) => !!x);
    const hasMore = items.length > limit;
    const page = items.slice(0, limit);
    const oldestMs = page.length > 0 ? Math.min(...page.map((i) => i.createdAtMs)) : null;
    return { items: page, hasMore, oldestMs };
});
exports.updateConversationReadPosition = (0, https_1.onCall)(async (req) => {
    const { appUid: uid } = await (0, deviceSession_1.assertVerifiedCallableCaller)(req);
    const conversationId = String(req.data?.conversationId ?? "").trim();
    const lastReadAtMs = Number(req.data?.lastReadAtMs ?? 0);
    const lastReadMessageId = String(req.data?.lastReadMessageId ?? "").trim();
    if (!conversationId)
        throw new https_1.HttpsError("invalid-argument", "conversationId is required.");
    if (!Number.isFinite(lastReadAtMs) || lastReadAtMs <= 0) {
        throw new https_1.HttpsError("invalid-argument", "lastReadAtMs is required.");
    }
    const { ref, data: conv } = await loadConversation(conversationId);
    assertParticipant(conv, uid);
    await ref.set({
        readBy: {
            ...(conv.readBy ?? {}),
            [uid]: {
                lastReadAtMs: Math.floor(lastReadAtMs),
                ...(lastReadMessageId ? { lastReadMessageId } : {}),
            },
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ok: true };
});
exports.setConversationNotificationMute = (0, https_1.onCall)(async (req) => {
    const { appUid: uid } = await (0, deviceSession_1.assertVerifiedCallableCaller)(req);
    const conversationId = String(req.data?.conversationId ?? "").trim();
    const muted = Boolean(req.data?.muted);
    if (!conversationId)
        throw new https_1.HttpsError("invalid-argument", "conversationId is required.");
    const { ref, data: conv } = await loadConversation(conversationId);
    assertParticipant(conv, uid);
    const mutedBy = { ...(conv.mutedBy ?? {}), [uid]: muted };
    if (!muted)
        delete mutedBy[uid];
    await ref.set({
        mutedBy,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ok: true, muted };
});
exports.manageConversationMembership = (0, https_1.onCall)(async (req) => {
    const { appUid: uid } = await (0, deviceSession_1.assertVerifiedCallableCaller)(req);
    const conversationId = String(req.data?.conversationId ?? "").trim();
    const action = String(req.data?.action ?? "").trim();
    const targetUid = String(req.data?.targetUid ?? "").trim();
    if (!conversationId)
        throw new https_1.HttpsError("invalid-argument", "conversationId is required.");
    const { ref, data: conv } = await loadConversation(conversationId);
    assertParticipant(conv, uid);
    const participants = [...new Set(conv.participantUids ?? [])];
    const now = nowMs();
    if (action === "addMember") {
        if (!targetUid)
            throw new https_1.HttpsError("invalid-argument", "targetUid is required.");
        if (!isConversationAdmin(conv, uid)) {
            throw new https_1.HttpsError("permission-denied", "Only admins can add members.");
        }
        if (participants.includes(targetUid))
            return { ok: true, participantUids: participants };
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
        await ref.set({
            participantUids: nextParticipants,
            participantAuthUids,
            memberJoinedAt,
            adminIds,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return { ok: true, participantUids: nextParticipants, memberJoinedAt };
    }
    if (action === "leave") {
        const nextParticipants = participants.filter((id) => id !== uid);
        if (nextParticipants.length === 0) {
            await ref.delete();
            return { ok: true, participantUids: [] };
        }
        const participantAuthUids = await resolveParticipantAuthUids(nextParticipants);
        await ref.set({
            participantUids: nextParticipants,
            participantAuthUids,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return { ok: true, participantUids: nextParticipants };
    }
    if (action === "kick") {
        if (!targetUid)
            throw new https_1.HttpsError("invalid-argument", "targetUid is required.");
        if (!isConversationAdmin(conv, uid)) {
            throw new https_1.HttpsError("permission-denied", "Only admins can remove members.");
        }
        if (targetUid === uid) {
            throw new https_1.HttpsError("invalid-argument", "Use leave to exit the group.");
        }
        const nextParticipants = participants.filter((id) => id !== targetUid);
        const participantAuthUids = await resolveParticipantAuthUids(nextParticipants);
        await ref.set({
            participantUids: nextParticipants,
            participantAuthUids,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return { ok: true, participantUids: nextParticipants };
    }
    throw new https_1.HttpsError("invalid-argument", "action must be addMember, leave, or kick.");
});
exports.setEncryptedPostReaction = (0, https_1.onCall)(async (req) => {
    const { appUid: uid } = await (0, deviceSession_1.assertVerifiedCallableCaller)(req);
    const postId = String(req.data?.postId ?? "").trim();
    const emoji = String(req.data?.emoji ?? "").trim();
    if (!postId)
        throw new https_1.HttpsError("invalid-argument", "postId is required.");
    const postRef = firestoreDb().collection("encryptedPosts").doc(postId);
    const postSnap = await postRef.get();
    if (!postSnap.exists)
        throw new https_1.HttpsError("not-found", "Post not found.");
    const post = postSnap.data();
    const recipients = post.recipientUids ?? [];
    if (!recipients.includes(uid)) {
        throw new https_1.HttpsError("permission-denied", "Not a recipient of this post.");
    }
    if (post.ownerUid && post.ownerUid !== uid) {
        await assertAcceptedFriendship(uid, post.ownerUid);
    }
    const reactionRef = firestoreDb().collection("encryptedPostReactions").doc(postId);
    await firestoreDb().runTransaction(async (tx) => {
        const snap = await tx.get(reactionRef);
        const reactions = { ...(snap.data()?.reactions ?? {}) };
        if (!emoji)
            delete reactions[uid];
        else
            reactions[uid] = emoji;
        tx.set(reactionRef, { postId, reactions, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    });
    return { ok: true };
});
exports.updateEncryptedPost = (0, https_1.onCall)(async (req) => {
    const { appUid: uid } = await (0, deviceSession_1.assertVerifiedCallableCaller)(req);
    const postId = String(req.data?.postId ?? "").trim();
    const ciphertext = String(req.data?.ciphertext ?? "");
    const nonce = String(req.data?.nonce ?? "");
    const envelopes = (req.data?.envelopes ?? {});
    if (!postId)
        throw new https_1.HttpsError("invalid-argument", "postId is required.");
    if (!ciphertext || !nonce)
        throw new https_1.HttpsError("invalid-argument", "ciphertext and nonce required.");
    const postRef = firestoreDb().collection("encryptedPosts").doc(postId);
    const snap = await postRef.get();
    if (!snap.exists)
        throw new https_1.HttpsError("not-found", "Post not found.");
    const data = snap.data();
    if (data.ownerUid !== uid) {
        throw new https_1.HttpsError("permission-denied", "Only the post owner can edit.");
    }
    const recipientAuthUids = await resolveParticipantAuthUids(data.recipientUids ?? []);
    await postRef.set({
        ciphertext,
        nonce,
        envelopes,
        recipientAuthUids,
        editedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ok: true };
});
exports.updateMessageMetadata = (0, https_1.onCall)(async (req) => {
    const { appUid: uid } = await (0, deviceSession_1.assertVerifiedCallableCaller)(req);
    const conversationId = String(req.data?.conversationId ?? "").trim();
    const messageId = String(req.data?.messageId ?? "").trim();
    if (!conversationId || !messageId) {
        throw new https_1.HttpsError("invalid-argument", "conversationId and messageId are required.");
    }
    const { data: conv } = await loadConversation(conversationId);
    assertParticipant(conv, uid);
    const msgRef = firestoreDb().collection("conversations").doc(conversationId).collection("messages").doc(messageId);
    const msgSnap = await msgRef.get();
    if (!msgSnap.exists)
        throw new https_1.HttpsError("not-found", "Message not found.");
    const msg = msgSnap.data();
    const patch = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (req.data?.reactions !== undefined) {
        const emoji = String(req.data.reactions?.[uid] ?? "").trim();
        const reactions = { ...(msg.reactions ?? {}) };
        if (emoji)
            reactions[uid] = emoji;
        else
            delete reactions[uid];
        patch.reactions = reactions;
    }
    if (req.data?.editedAt != null) {
        if (msg.senderUid !== uid)
            throw new https_1.HttpsError("permission-denied", "Only sender can edit.");
        patch.editedAt = Number(req.data.editedAt);
        patch.unsentAt = admin.firestore.FieldValue.delete();
    }
    if (req.data?.unsentAt != null) {
        if (msg.senderUid !== uid)
            throw new https_1.HttpsError("permission-denied", "Only sender can unsend.");
        patch.unsentAt = Number(req.data.unsentAt);
    }
    await msgRef.set(patch, { merge: true });
    return { ok: true };
});
/** Replace ciphertext for an existing message (edit body). Sender-only. */
exports.updateEncryptedMessage = (0, https_1.onCall)(async (req) => {
    const { appUid: uid } = await (0, deviceSession_1.assertVerifiedCallableCaller)(req);
    const conversationId = String(req.data?.conversationId ?? "").trim();
    const messageId = String(req.data?.messageId ?? "").trim();
    const ciphertext = String(req.data?.ciphertext ?? "");
    const nonce = String(req.data?.nonce ?? "").trim();
    const envelopes = (req.data?.envelopes ?? {});
    if (!conversationId || !messageId) {
        throw new https_1.HttpsError("invalid-argument", "conversationId and messageId are required.");
    }
    if (!ciphertext || !nonce) {
        throw new https_1.HttpsError("invalid-argument", "ciphertext and nonce are required.");
    }
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(messageId)) {
        throw new https_1.HttpsError("invalid-argument", "messageId format is invalid.");
    }
    const { data: conv } = await loadConversation(conversationId);
    assertParticipant(conv, uid);
    const participants = conv.participantUids ?? [];
    for (const participantUid of participants) {
        if (participantUid !== uid && !envelopes[participantUid]) {
            throw new https_1.HttpsError("invalid-argument", "Envelope missing for a participant.");
        }
    }
    const msgRef = firestoreDb().collection("conversations").doc(conversationId).collection("messages").doc(messageId);
    const msgSnap = await msgRef.get();
    if (!msgSnap.exists)
        throw new https_1.HttpsError("not-found", "Message not found.");
    const msg = msgSnap.data();
    if (msg.senderUid !== uid)
        throw new https_1.HttpsError("permission-denied", "Only sender can edit message body.");
    const editedAt = Number(req.data?.editedAt ?? Date.now());
    await msgRef.set({
        ciphertext,
        nonce,
        envelopes,
        editedAt,
        unsentAt: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ok: true, editedAt };
});
/** Extends removeFriendship: kick both from shared groups. */
async function kickPairFromSharedGroups(uidA, uidB) {
    const snap = await firestoreDb()
        .collection("conversations")
        .where("participantUids", "array-contains", uidA)
        .get();
    const batch = firestoreDb().batch();
    let pending = 0;
    for (const doc of snap.docs) {
        const data = doc.data();
        const participants = data.participantUids ?? [];
        if (!participants.includes(uidA) || !participants.includes(uidB))
            continue;
        if (participants.length <= 2)
            continue;
        const next = participants.filter((id) => id !== uidA && id !== uidB);
        if (next.length === participants.length)
            continue;
        const participantAuthUids = await resolveParticipantAuthUids(next);
        if (next.length === 0) {
            batch.delete(doc.ref);
        }
        else {
            batch.set(doc.ref, {
                participantUids: next,
                participantAuthUids,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        }
        pending++;
        if (pending >= 400)
            break;
    }
    if (pending > 0)
        await batch.commit();
}
async function filterPostItemsByFriendship(uid, items) {
    const friendSet = new Set(await getAcceptedFriendUids(uid));
    friendSet.add(uid);
    return items.filter((item) => friendSet.has(item.ownerUid));
}
/** Presence heartbeat with viewerAuthUids for client onSnapshot. */
async function writePresenceWithViewers(uid, deviceId, state) {
    const friendUids = await getAcceptedFriendUids(uid);
    const viewerAuthUids = await resolveParticipantAuthUids([uid, ...friendUids]);
    const safeHeartbeatAtMs = nowMs();
    await firestoreDb().collection("presence").doc(uid).set({
        uid,
        state,
        heartbeatAtMs: safeHeartbeatAtMs,
        deviceId,
        viewerAuthUids,
        online: state === "active",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
}
function isPresenceFresh(heartbeatAtMs) {
    return Number.isFinite(heartbeatAtMs) && nowMs() - heartbeatAtMs <= PRESENCE_STALE_MS;
}
