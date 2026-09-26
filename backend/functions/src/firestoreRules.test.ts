import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const rulesPath = path.join(process.cwd(), "backend", "firestore.rules");
const rules = readFileSync(rulesPath, "utf8");

test("social reads require an auth-uid mirror and clients cannot write them", () => {
  for (const field of ["recipientAuthUids", "participantAuthUids", "viewerAuthUids"]) {
    assert.match(rules, new RegExp(`request\\.auth\\.uid in resource\\.data\\.${field}`));
  }
  assert.match(rules, /match \/users\/\{uid\}[\s\S]*?allow write: if false/);
  assert.doesNotMatch(rules, /function isFriend/);
  assert.doesNotMatch(rules, /allow create, update: if isSelf/);
});

test(
  "a non-friend auth uid cannot read posts, profiles, messages, or presence",
  { skip: !process.env.FIRESTORE_EMULATOR_HOST },
  async () => {
    const { assertFails, assertSucceeds, initializeTestEnvironment } = await import(
      "@firebase/rules-unit-testing"
    );
    const { doc, getDoc, setDoc } = await import("firebase/firestore");
    const testEnv = await initializeTestEnvironment({
      projectId: "demo-erdos-rules",
      firestore: { rules },
    });
    try {
      const friend = "friend-auth";
      const stranger = "stranger-auth";
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "encryptedPosts/post-1"), {
          recipientAuthUids: [friend],
        });
        await setDoc(doc(db, "encryptedProfiles/owner"), {
          recipientAuthUids: [friend],
        });
        await setDoc(doc(db, "conversations/chat-1"), {
          participantAuthUids: [friend],
        });
        await setDoc(doc(db, "conversations/chat-1/messages/msg-1"), {
          participantAuthUids: [friend],
        });
        await setDoc(doc(db, "presence/owner"), {
          viewerAuthUids: [friend],
        });
        await setDoc(doc(db, "encryptedPosts/no-mirror"), {
          recipientUids: ["u_owner"],
        });
      });

      const strangerDb = testEnv.authenticatedContext(stranger).firestore();
      const friendDb = testEnv.authenticatedContext(friend).firestore();

      await assertFails(getDoc(doc(strangerDb, "encryptedPosts/post-1")));
      await assertFails(getDoc(doc(strangerDb, "encryptedProfiles/owner")));
      await assertFails(getDoc(doc(strangerDb, "conversations/chat-1/messages/msg-1")));
      await assertFails(getDoc(doc(strangerDb, "presence/owner")));
      await assertFails(getDoc(doc(friendDb, "encryptedPosts/no-mirror")));

      await assertSucceeds(getDoc(doc(friendDb, "encryptedPosts/post-1")));
      await assertSucceeds(getDoc(doc(friendDb, "encryptedProfiles/owner")));
      await assertSucceeds(getDoc(doc(friendDb, "conversations/chat-1/messages/msg-1")));
      await assertSucceeds(getDoc(doc(friendDb, "presence/owner")));

      await assertFails(setDoc(doc(friendDb, "encryptedPosts/post-1"), { recipientAuthUids: [friend] }));
      await assertFails(setDoc(doc(friendDb, "users/friend-auth"), { username: "friend" }));
    } finally {
      await testEnv.cleanup();
    }
  }
);
