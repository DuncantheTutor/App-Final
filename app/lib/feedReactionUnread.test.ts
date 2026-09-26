import assert from "node:assert/strict";
import { test } from "node:test";

import type { Post } from "../domain/types.ts";
import { countUnreadFeedReactionPosts } from "./feedReactionUnread.ts";

function post(overrides: Partial<Post> = {}): Post {
  return {
    id: "p1",
    authorId: "me",
    createdAt: 1,
    feedReactions: { me: "👍", u_a: "🔥" },
    ...overrides,
  };
}

test("the feed badge counts a friend's reaction on my post and ignores my own emoji", () => {
  assert.equal(countUnreadFeedReactionPosts([post()], "me", "u_me", {}), 1);
  assert.equal(
    countUnreadFeedReactionPosts([post({ feedReactions: { me: "👍", u_me: "❤️" } })], "me", "u_me", {}),
    0
  );
  assert.equal(
    countUnreadFeedReactionPosts([post({ authorId: "u_a" })], "me", "u_me", {}),
    0
  );
});

test("a seen signature clears the badge until a friend changes emoji", () => {
  const seen = countUnreadFeedReactionPosts([post()], "me", "u_me", {});
  assert.equal(seen, 1);
  const signature = "u_a:🔥";
  assert.equal(countUnreadFeedReactionPosts([post()], "me", "u_me", { p1: signature }), 0);
  assert.equal(
    countUnreadFeedReactionPosts([post({ feedReactions: { u_a: "😂" } })], "me", "u_me", { p1: signature }),
    1
  );
});
