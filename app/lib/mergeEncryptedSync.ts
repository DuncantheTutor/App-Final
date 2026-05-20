import type { Message, Post } from "../domain/types";
import { mergeMessageReactions } from "../messaging/messageMetadata";
import { CURRENT_USER_ID } from "../theme/preludeConstants";

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
            reactions: mergeMessageReactions(existing.reactions, message.reactions),
            editedAt: message.editedAt ?? existing.editedAt,
            unsentAt: message.unsentAt ?? existing.unsentAt,
            deliveryStatus: existing.deliveryStatus ?? message.deliveryStatus,
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
          reactions: mergeMessageReactions(existing.reactions, message.reactions),
          editedAt: message.editedAt ?? existing.editedAt,
          unsentAt: message.unsentAt ?? existing.unsentAt,
          deliveryStatus: existing.deliveryStatus ?? message.deliveryStatus,
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

export function mergeSyncedPosts(
  current: Post[],
  decoded: Post[],
  options: { incremental: boolean; optimisticWindowMs: number }
): Post[] {
  const now = Date.now();
  const currentById = Object.fromEntries(current.map((post) => [post.id, post] as const));
  const decodedIds = new Set(decoded.map((post) => post.id));

  if (options.incremental) {
    for (const post of decoded) {
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
      if (
        !decodedIds.has(post.id) &&
        post.authorId === CURRENT_USER_ID &&
        now - post.createdAt < options.optimisticWindowMs
      ) {
        currentById[post.id] = post;
      }
    }
    return Object.values(currentById).sort((a, b) => b.createdAt - a.createdAt);
  }

  const mergedDecoded = decoded.map((post) => {
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
      !decodedIds.has(post.id) && post.authorId === CURRENT_USER_ID && now - post.createdAt < options.optimisticWindowMs
  );
  return [...mergedDecoded, ...optimisticLocalOnly].sort((a, b) => b.createdAt - a.createdAt);
}

export function maxCreatedAtMs<T extends { createdAt: number }>(items: T[]): number {
  return items.reduce((max, item) => (item.createdAt > max ? item.createdAt : max), 0);
}
