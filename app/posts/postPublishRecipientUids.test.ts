import assert from "node:assert/strict";
import { test } from "node:test";

import type { Friend } from "../domain/types";
import { postPublishRecipientUids } from "./postPublishRecipientUids.ts";

function friend(backendUid: string, id = backendUid): Friend {
  return {
    id,
    backendUid,
    displayName: backendUid,
    online: false,
    profilePictureUrl: "",
    bio: "",
    messageCount: 0,
  };
}

test("always includes the publisher and accepted u_* friends", () => {
  const uids = postPublishRecipientUids({
    sessionUid: "u_me",
    visibleFriendIds: ["u_a"],
    allFriends: [friend("u_a"), friend("u_stale")],
    acceptedFriendBackendUids: new Set(["u_a"]),
  });
  assert.deepEqual(uids.sort(), ["u_a", "u_me"].sort());
});

test("drops leftover roster rows when accepted set is present", () => {
  const uids = postPublishRecipientUids({
    sessionUid: "u_me",
    visibleFriendIds: ["u_a", "u_gone"],
    allFriends: [friend("u_a"), friend("u_gone")],
    acceptedFriendBackendUids: new Set(["u_a"]),
  });
  assert.equal(uids.includes("u_gone"), false);
  assert.deepEqual(uids.sort(), ["u_a", "u_me"].sort());
});

test("falls back to visible roster u_* friends when accepted set is empty", () => {
  const uids = postPublishRecipientUids({
    sessionUid: "u_me",
    visibleFriendIds: ["local-a"],
    allFriends: [friend("u_a", "local-a"), friend("not_u")],
  });
  assert.deepEqual(uids.sort(), ["u_a", "u_me"].sort());
});
