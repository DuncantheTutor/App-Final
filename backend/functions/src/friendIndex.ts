import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

import { getFirestore } from "./firebaseAdmin";
import { appUidsFromEdgeParticipants, friendshipId } from "./friendIndexIds";

export { appUidsFromEdgeParticipants, friendshipId };

const FRIEND_INDEX = "friendIndex";

type IndexData = { uids?: unknown; ready?: boolean };

function indexRef(uid: string): FirebaseFirestore.DocumentReference {
  return getFirestore().collection(FRIEND_INDEX).doc(uid);
}

function uidsFromIndex(data: IndexData | undefined): string[] {
  if (!Array.isArray(data?.uids)) return [];
  return [
    ...new Set(
      data.uids
        .map((entry) => String(entry ?? "").trim())
        .filter((id) => id.startsWith("u_"))
    ),
  ];
}

/** Admin `getAll` is capped per RPC. Callers pass document refs in input order. */
export async function getAllChunked(
  refs: FirebaseFirestore.DocumentReference[]
): Promise<FirebaseFirestore.DocumentSnapshot[]> {
  const db = getFirestore();
  const out: FirebaseFirestore.DocumentSnapshot[] = [];
  for (let i = 0; i < refs.length; i += 100) {
    const chunk = refs.slice(i, i + 100);
    if (chunk.length === 0) continue;
    out.push(...(await db.getAll(...chunk)));
  }
  return out;
}

async function legacyAppUid(raw: string): Promise<string | null> {
  const id = raw.trim();
  if (!id || id.startsWith("u_")) return null;
  const rev = await getFirestore().collection("firebaseAuthToAppUid").doc(id).get();
  const appUid = String(rev.data()?.appUid ?? "").trim();
  return appUid.startsWith("u_") ? appUid : null;
}

/**
 * One friendships query, then a single index doc. Legacy non-`u_*` participant
 * ids are resolved here only, not on later reads.
 */
export async function rebuildFriendIndex(uid: string): Promise<string[]> {
  const db = getFirestore();
  const mine = await db
    .collection("friendships")
    .where("participants", "array-contains", uid)
    .where("status", "==", "accepted")
    .get();
  const friendUids: string[] = [];
  for (const doc of mine.docs) {
    const participants = doc.data().participants as unknown;
    friendUids.push(...appUidsFromEdgeParticipants(uid, participants));
    if (!Array.isArray(participants)) continue;
    for (const raw of participants) {
      const id = String(raw ?? "").trim();
      if (!id || id === uid || id.startsWith("u_")) continue;
      const normalized = await legacyAppUid(id);
      if (normalized && normalized !== uid) friendUids.push(normalized);
    }
  }
  const unique = [...new Set(friendUids)];
  await indexRef(uid).set({
    uids: unique,
    ready: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return unique;
}

/** Accepted friend app uids. One document read after the index has been built. */
export async function getAcceptedFriendUids(uid: string): Promise<string[]> {
  const snap = await indexRef(uid).get();
  const data = snap.data() as IndexData | undefined;
  if (snap.exists && data?.ready === true) return uidsFromIndex(data);
  return rebuildFriendIndex(uid);
}

export async function getAcceptedFriendSet(uid: string): Promise<Set<string>> {
  return new Set(await getAcceptedFriendUids(uid));
}

async function addToIndex(owner: string, friend: string): Promise<void> {
  const ref = indexRef(owner);
  const snap = await ref.get();
  const data = snap.data() as IndexData | undefined;
  if (snap.exists && data?.ready === true) {
    await ref.set(
      {
        uids: admin.firestore.FieldValue.arrayUnion(friend),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }
  await rebuildFriendIndex(owner);
}

async function removeFromIndex(owner: string, friend: string): Promise<void> {
  const ref = indexRef(owner);
  const snap = await ref.get();
  const data = snap.data() as IndexData | undefined;
  if (snap.exists && data?.ready === true) {
    await ref.set(
      {
        uids: admin.firestore.FieldValue.arrayRemove(friend),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }
  await rebuildFriendIndex(owner);
}

/** Record a new accepted pair on both indexes. Safe to call after the edge commit. */
export async function linkAcceptedFriends(a: string, b: string): Promise<void> {
  if (!a.startsWith("u_") || !b.startsWith("u_") || a === b) return;
  await Promise.all([addToIndex(a, b), addToIndex(b, a)]);
}

/** Drop a pair from both indexes after the edge is deleted. */
export async function unlinkAcceptedFriends(a: string, b: string): Promise<void> {
  if (!a.startsWith("u_") || !b.startsWith("u_") || a === b) return;
  await Promise.all([removeFromIndex(a, b), removeFromIndex(b, a)]);
}

function edgeAccepted(snap: FirebaseFirestore.DocumentSnapshot): boolean {
  if (!snap.exists) return false;
  return (snap.data() as { status?: string } | undefined)?.status === "accepted";
}

/** Canonical edge only. A missing or non-accepted doc is not a friendship. */
export async function assertAcceptedFriendship(uid: string, otherUid: string): Promise<void> {
  if (uid === otherUid) return;
  const snap = await getFirestore().collection("friendships").doc(friendshipId(uid, otherUid)).get();
  if (!edgeAccepted(snap)) {
    throw new HttpsError("permission-denied", "Friendship required.");
  }
}

/** One batched read of the caller's edges with each other uid. */
export async function assertAcceptedFriendships(uid: string, otherUids: string[]): Promise<void> {
  const others = [...new Set(otherUids.map((id) => id.trim()).filter((id) => id && id !== uid))];
  if (others.length === 0) return;
  const db = getFirestore();
  const snaps = await getAllChunked(
    others.map((other) => db.collection("friendships").doc(friendshipId(uid, other)))
  );
  if (snaps.some((snap) => !edgeAccepted(snap))) {
    throw new HttpsError("permission-denied", "Friendship required.");
  }
}

/** Every unique pair, in one batched read. Used when creating a group. */
export async function assertEveryPairFriends(uids: string[]): Promise<void> {
  const unique = [...new Set(uids.map((id) => id.trim()).filter(Boolean))];
  const refs: FirebaseFirestore.DocumentReference[] = [];
  const db = getFirestore();
  for (let i = 0; i < unique.length; i += 1) {
    for (let j = i + 1; j < unique.length; j += 1) {
      refs.push(db.collection("friendships").doc(friendshipId(unique[i]!, unique[j]!)));
    }
  }
  if (refs.length === 0) return;
  const snaps = await getAllChunked(refs);
  if (snaps.some((snap) => !edgeAccepted(snap))) {
    throw new HttpsError("permission-denied", "Friendship required.");
  }
}

/** Which candidates have an accepted canonical edge with `uid`. Does not throw. */
export async function filterAcceptedFriendUids(uid: string, candidateUids: string[]): Promise<string[]> {
  const others = [
    ...new Set(candidateUids.map((id) => id.trim()).filter((id) => id.startsWith("u_") && id !== uid)),
  ];
  if (others.length === 0) return [];
  const db = getFirestore();
  const snaps = await getAllChunked(
    others.map((other) => db.collection("friendships").doc(friendshipId(uid, other)))
  );
  const accepted: string[] = [];
  snaps.forEach((snap, index) => {
    if (edgeAccepted(snap)) accepted.push(others[index]!);
  });
  return accepted;
}
