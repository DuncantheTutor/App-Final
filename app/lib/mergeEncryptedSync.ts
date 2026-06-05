import type { Message, Post } from "../domain/types";
import { mergeMessageReactions } from "../messaging/messageMetadata";
import { CURRENT_USER_LOCAL_ID } from "./chatMemberJoinedAt";
import { CURRENT_USER_ID } from "../theme/preludeConstants";

function isOwnOutgoingMessage(message: Message): boolean {
  return message.senderId === CURRENT_USER_ID || message.senderId === CURRENT_USER_LOCAL_ID;
}

/** Server echo confirms delivery — clear stuck `sending` on optimistic rows. */
function resolveDeliveryStatusAfterSync(existing: Message, incoming: Message): Message["deliveryStatus"] {
  if (existing.deliveryStatus === "sending" && isOwnOutgoingMessage(incoming)) {
    return "sent";
  }
  return existing.deliveryStatus ?? incoming.deliveryStatus;
}

export function mergeSyncedMessages(
  current: Message[],
  decoded: Message[],
  options: { incremental: boolean; optimisticWindowMs: number }
): Message[] {
  const currentById = Object.fromEntries(current.map((message) => [message.id, message] as const));
  const decodedIds = new Set(decoded.map((message) => message.id));

  if (options.incremental) {
    for (const message of decoded) {
      const existing = currentById[message.id];
      currentById[message.id] = existing
        ? {
            ...message,
            createdAt:
              existing.deliveryStatus === "sending" && isOwnOutgoingMessage(message)
                ? existing.createdAt
                : message.createdAt,
            reactions: mergeMessageReactions(existing.reactions, message.reactions),
            editedAt: message.editedAt ?? existing.editedAt,
            unsentAt: message.unsentAt ?? existing.unsentAt,
            deliveryStatus: resolveDeliveryStatusAfterSync(existing, message),
          }
        : message;
    }
    for (const message of current) {
      if (!decodedIds.has(message.id)) {
        currentById[message.id] = message;
      }
    }
    return Object.values(currentById).sort((a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      return a.id.localeCompare(b.id);
    });
  }

  for (const message of decoded) {
    const existing = currentById[message.id];
    currentById[message.id] = existing
      ? {
          ...message,
          createdAt:
            existing.deliveryStatus === "sending" && isOwnOutgoingMessage(message)
              ? existing.createdAt
              : message.createdAt,
          reactions: mergeMessageReactions(existing.reactions, message.reactions),
          editedAt: message.editedAt ?? existing.editedAt,
          unsentAt: message.unsentAt ?? existing.unsentAt,
          deliveryStatus: resolveDeliveryStatusAfterSync(existing, message),
        }
      : message;
  }
  for (const message of current) {
    if (!decodedIds.has(message.id)) {
      currentById[message.id] = message;
    }
  }
  return Object.values(currentById).sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.id.localeCompare(b.id);
  });
}

export type MergeSyncedPostsOptions = {
  incremental: boolean;
  optimisticWindowMs: number;
  /** Locally deleted post ids — never re-merge from server or cloud snapshot. */
  suppressedPostIds?: ReadonlySet<string>;
};

function isSuppressedPostId(postId: string, suppressed?: ReadonlySet<string>): boolean {
  return suppressed != null && suppressed.has(postId);
}

function isPostVisibleAfterMerge(post: Post, suppressed?: ReadonlySet<string>): boolean {
  return !post.deletedAt && !isSuppressedPostId(post.id, suppressed);
}

function filterVisibleMergedPosts(posts: Post[], suppressed?: ReadonlySet<string>): Post[] {
  return posts.filter((post) => isPostVisibleAfterMerge(post, suppressed));
}

export function mergeSyncedPosts(
  current: Post[],
  decoded: Post[],
  options: MergeSyncedPostsOptions
): Post[] {
  const now = Date.now();
  const currentById = Object.fromEntries(current.map((post) => [post.id, post] as const));
  const decodedIds = new Set(decoded.map((post) => post.id));

  if (options.incremental) {
    for (const post of decoded) {
      if (isSuppressedPostId(post.id, options.suppressedPostIds)) continue;
      const existing = currentById[post.id];
      currentById[post.id] = existing
        ? {
            ...post,
            comments: existing.comments,
            feedReactions: post.feedReactions ?? existing.feedReactions,
            deletedAt: existing.deletedAt,
          }
        : post;
    }
    for (const post of current) {
      if (isSuppressedPostId(post.id, options.suppressedPostIds)) {
        delete currentById[post.id];
        continue;
      }
      if (
        !decodedIds.has(post.id) &&
        post.authorId === CURRENT_USER_ID &&
        now - post.createdAt < options.optimisticWindowMs
      ) {
        currentById[post.id] = post;
      }
    }
    return filterVisibleMergedPosts(Object.values(currentById), options.suppressedPostIds).sort(
      (a, b) => b.createdAt - a.createdAt
    );
  }

  const mergedDecoded = decoded
    .filter((post) => !isSuppressedPostId(post.id, options.suppressedPostIds))
    .map((post) => {
      const existing = currentById[post.id];
      if (!existing) return post;
      return {
        ...post,
        comments: existing.comments,
        feedReactions: post.feedReactions ?? existing.feedReactions,
        deletedAt: existing.deletedAt,
      };
    });
  const optimisticLocalOnly = current.filter(
    (post) =>
      !decodedIds.has(post.id) &&
      !post.deletedAt &&
      post.authorId === CURRENT_USER_ID &&
      now - post.createdAt < options.optimisticWindowMs
  );
  // Full catalog replace: drop friend posts removed on server (deleteEncryptedPost).
  return filterVisibleMergedPosts(
    [...mergedDecoded, ...optimisticLocalOnly],
    options.suppressedPostIds
  ).sort((a, b) => b.createdAt - a.createdAt);
}

export function maxCreatedAtMs<T extends { createdAt: number }>(items: T[]): number {
  return items.reduce((max, item) => (item.createdAt > max ? item.createdAt : max), 0);
}
