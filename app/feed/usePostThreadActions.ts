import { useCallback, useEffect, useMemo, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { collection, onSnapshot, query as firestoreQuery, where } from "firebase/firestore";

import { backendUidForFriendId, callEmulatorFunction } from "../../backendBridge";
import { firebaseAuth, getFirestoreDb } from "../../firebaseAuthClient";
import { logAppError } from "../../telemetry";
import type { Chat, Friend, Message, Post, PostComment } from "../domain/types";
import { mergeHydratedPostComments } from "../lib/mergePostComments";
import { getMyReactionEmoji } from "../lib/reactionHelpers";
import { readComposerTextTrimmed } from "../lib/syncedComposerText";
import { yieldToUi } from "../lib/yieldToUi";
import { mapServerReactionsToLocal } from "../messaging/messageMetadata";
import type { BackendSession } from "../messaging/types";
import { CURRENT_USER_ID } from "../theme/preludeConstants";
import type { CommentReactionTarget } from "./useReactionPicker";

/**
 * Post comment/thread writes, feed and message reaction applies, and the
 * private-thread hydrate that those writes confirm against.
 * Picker target state stays in `useReactionPicker`; composer drafts stay in
 * `useFullscreenPostThread`.
 */
export function usePostThreadActions(params: {
  demoOfflineMode: boolean;
  signedIn: boolean;
  appLifecycleState: string;
  viewScreen: string;
  homeTab: string;
  getBackendSession: () => BackendSession | null;
  posts: Post[];
  setPosts: Dispatch<SetStateAction<Post[]>>;
  myProfilePosts: Post[];
  friendProfilePosts: Post[];
  fullScreenPost: Post | null;
  postFullscreenThreadReplyKey: string | null;
  postCommentTextRef: MutableRefObject<string>;
  setPostCommentInput: Dispatch<SetStateAction<string>>;
  setCommentDraftByPostId: Dispatch<SetStateAction<Record<string, string>>>;
  setThreadDraftByChainKey: Dispatch<SetStateAction<Record<string, string>>>;
  allFriends: Friend[];
  friendMap: Record<string, Friend>;
  backendUidToFriendId: Record<string, string>;
  messages: Message[];
  chats: Chat[];
  patchMessage: (messageId: string, updater: (message: Message) => Message) => void;
  resolveConversationId: (chatOrLocalId: Chat | string) => string;
  messageActionTargetId: string | null;
  setMessageActionTargetId: Dispatch<SetStateAction<string | null>>;
  reactionTargetMessageId: string | null;
  setReactionTargetMessageId: Dispatch<SetStateAction<string | null>>;
  postReactionTargetId: string | null;
  setPostReactionTargetId: Dispatch<SetStateAction<string | null>>;
  commentReactionTarget: CommentReactionTarget | null;
  setCommentReactionTarget: Dispatch<SetStateAction<CommentReactionTarget | null>>;
  setReactionPickerOpen: Dispatch<SetStateAction<boolean>>;
  openReactionPickerForMessageBase: (messageId: string) => void;
  openReactionPickerForPostBase: (postId: string) => void;
  openReactionPickerForCommentBase: (
    postId: string,
    commentId: string,
    threadEntryId?: string
  ) => void;
}) {
  const {
    demoOfflineMode,
    signedIn,
    appLifecycleState,
    viewScreen,
    homeTab,
    getBackendSession,
    posts,
    setPosts,
    myProfilePosts,
    friendProfilePosts,
    fullScreenPost,
    postFullscreenThreadReplyKey,
    postCommentTextRef,
    setPostCommentInput,
    setCommentDraftByPostId,
    setThreadDraftByChainKey,
    allFriends,
    friendMap,
    backendUidToFriendId,
    messages,
    chats,
    patchMessage,
    resolveConversationId,
    messageActionTargetId,
    setMessageActionTargetId,
    reactionTargetMessageId,
    setReactionTargetMessageId,
    postReactionTargetId,
    setPostReactionTargetId,
    commentReactionTarget,
    setCommentReactionTarget,
    setReactionPickerOpen,
    openReactionPickerForMessageBase,
    openReactionPickerForPostBase,
    openReactionPickerForCommentBase,
  } = params;

  const hydrateInFlightPostIdsRef = useRef<Set<string>>(new Set());
  const hydratedCommentPostAtRef = useRef<Record<string, number>>({});

  const resolvePostOwnerBackendUid = useCallback(
    (post: Post, sessionDemoUid: string) => {
      if (post.authorId === CURRENT_USER_ID) return sessionDemoUid;
      return friendMap[post.authorId]?.backendUid ?? null;
    },
    [friendMap]
  );

  const togglePostReaction = useCallback(
    (post: Post, emoji: string) => {
      const session = getBackendSession();
      if (!session || demoOfflineMode) return;
      const prev = post.feedReactions ?? {};
      const mine = prev[CURRENT_USER_ID] ?? prev[session.uid];
      const nextEmoji = mine === emoji ? "" : emoji;
      const next = { ...prev };
      delete next[CURRENT_USER_ID];
      delete next[session.uid];
      if (nextEmoji) next[CURRENT_USER_ID] = nextEmoji;
      setPosts((current) =>
        current.map((p) => (p.id === post.id ? { ...p, feedReactions: next } : p))
      );
      void callEmulatorFunction("setEncryptedPostReaction", {
        uid: session.uid,
        deviceId: session.deviceId,
        postId: post.id,
        emoji: nextEmoji,
      }).catch(() => {
        setPosts((current) =>
          current.map((p) => (p.id === post.id ? { ...p, feedReactions: prev } : p))
        );
      });
    },
    [demoOfflineMode, getBackendSession, setPosts]
  );

  const hydratePrivateThreadForPost = useCallback(
    async (post: Post) => {
      const session = getBackendSession();
      if (!session) return;
      const lastHydratedAt = hydratedCommentPostAtRef.current[post.id];
      if (lastHydratedAt && Date.now() - lastHydratedAt < 120_000) return;
      if (hydrateInFlightPostIdsRef.current.has(post.id)) return;
      hydrateInFlightPostIdsRef.current.add(post.id);
      try {
        const postOwnerUid = resolvePostOwnerBackendUid(post, session.uid);
        if (!postOwnerUid) return;
        const pairFriendUids =
          post.authorId === CURRENT_USER_ID
            ? allFriends.map((f) => f.backendUid).filter((x): x is string => !!x && x !== session.uid)
            : [session.uid];
        const chainResults = await Promise.all(
          pairFriendUids.map(async (friendUid) => {
            const res = await callEmulatorFunction<{
              items?: Array<{
                messageId: string;
                authorUid: string;
                text: string;
                reactions?: Record<string, string>;
                createdAtMs?: number;
              }>;
            }>("listPrivatePostThreadMessages", {
              uid: session.uid,
              deviceId: session.deviceId,
              postId: post.id,
              postOwnerUid,
              friendUid,
            }).catch(() => ({ items: [] }));
            const items = (res.items ?? []).slice().sort((a, b) => (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0));
            if (items.length === 0) return null;
            const toLocalId = (uid: string) =>
              uid === session.uid ? CURRENT_USER_ID : backendUidToFriendId[uid] ?? backendUidForFriendId(uid);
            const mapCommentReactions = (reactions?: Record<string, string>) =>
              mapServerReactionsToLocal(reactions, session.uid, backendUidToFriendId) ?? {};
            const first = items[0];
            const commentAuthorLocalId = toLocalId(friendUid);
            const firstAuthorLocal = toLocalId(first.authorUid);
            const comment: PostComment = {
              id: first.messageId,
              authorId: commentAuthorLocalId,
              text: first.text,
              createdAt: first.createdAtMs ?? Date.now(),
              reactions: mapCommentReactions(first.reactions),
              thread: items.slice(1).map((entry) => ({
                id: entry.messageId,
                authorId: toLocalId(entry.authorUid),
                text: entry.text,
                createdAt: entry.createdAtMs ?? Date.now(),
                reactions: mapCommentReactions(entry.reactions),
              })),
            };
            if (firstAuthorLocal === comment.authorId) return comment;
            return {
              ...comment,
              id: `srv_${post.id}_${friendUid}`,
              text: "",
              thread: [
                {
                  id: first.messageId,
                  authorId: firstAuthorLocal,
                  text: first.text,
                  createdAt: first.createdAtMs ?? Date.now(),
                  reactions: mapCommentReactions(first.reactions),
                },
                ...(comment.thread ?? []),
              ],
            } as PostComment;
          })
        );
        const comments = chainResults.filter((x): x is PostComment => !!x);
        const commentSignature = (items: PostComment[]) =>
          items
            .map((comment) =>
              [
                comment.id,
                comment.authorId,
                comment.text,
                comment.createdAt,
                JSON.stringify(comment.reactions ?? {}),
                (comment.thread ?? [])
                  .map((entry) =>
                    [entry.id, entry.authorId, entry.text, entry.createdAt, JSON.stringify(entry.reactions ?? {})].join("|")
                  )
                  .join("||"),
              ].join("::")
            )
            .join("##");
        setPosts((current) =>
          current.map((candidate) => {
            if (candidate.id !== post.id) return candidate;
            const merged = mergeHydratedPostComments(candidate.comments, comments);
            const prevSig = commentSignature(candidate.comments ?? []);
            const nextSig = commentSignature(merged);
            if (prevSig === nextSig) return candidate;
            return { ...candidate, comments: merged };
          })
        );
        hydratedCommentPostAtRef.current[post.id] = Date.now();
      } finally {
        hydrateInFlightPostIdsRef.current.delete(post.id);
      }
    },
    [allFriends, backendUidToFriendId, getBackendSession, resolvePostOwnerBackendUid, setPosts]
  );

  const addCommentToPost = useCallback(
    (postId: string, rawText: string) => {
      const text = rawText.trim();
      if (!text) return;
      const post = posts.find((p) => p.id === postId);
      const session = getBackendSession();
      if (!post || !session) return;
      const postOwnerUid = resolvePostOwnerBackendUid(post, session.uid);
      if (!postOwnerUid || postOwnerUid === session.uid) return;
      const optimisticId = `opt_comment_${Date.now()}`;
      setPosts((current) =>
        current.map((candidate) => {
          if (candidate.id !== postId) return candidate;
          const optimistic: PostComment = {
            id: optimisticId,
            authorId: CURRENT_USER_ID,
            text,
            createdAt: Date.now(),
            reactions: {},
            thread: [],
            syncState: "posting",
          };
          return { ...candidate, comments: [...(candidate.comments ?? []), optimistic] };
        })
      );
      void callEmulatorFunction("createPrivatePostThreadMessage", {
        uid: session.uid,
        deviceId: session.deviceId,
        postId,
        postOwnerUid,
        friendUid: session.uid,
        text,
      })
        .then(() => {
          setPosts((current) =>
            current.map((candidate) => {
              if (candidate.id !== postId) return candidate;
              return {
                ...candidate,
                comments: (candidate.comments ?? []).map((c) =>
                  c.id === optimisticId ? { ...c, syncState: "posted" as const } : c
                ),
              };
            })
          );
          return hydratePrivateThreadForPost(post);
        })
        .catch(() => {
          setPosts((current) =>
            current.map((candidate) => {
              if (candidate.id !== postId) return candidate;
              return {
                ...candidate,
                comments: (candidate.comments ?? []).map((c) =>
                  c.id === optimisticId ? { ...c, syncState: "failed" as const } : c
                ),
              };
            })
          );
        });
      setCommentDraftByPostId((current) => ({ ...current, [postId]: "" }));
    },
    [getBackendSession, hydratePrivateThreadForPost, posts, resolvePostOwnerBackendUid, setCommentDraftByPostId, setPosts]
  );

  const addThreadReplyToComment = useCallback(
    (postId: string, commentId: string, rawText: string) => {
      const text = rawText.trim();
      if (!text) return;
      const post = posts.find((p) => p.id === postId);
      const session = getBackendSession();
      if (!post || !session) return;
      const comment = (post.comments ?? []).find((c) => c.id === commentId);
      if (!comment) return;
      const postOwnerUid = resolvePostOwnerBackendUid(post, session.uid);
      if (!postOwnerUid) return;
      const friendUid =
        post.authorId === CURRENT_USER_ID
          ? friendMap[comment.authorId]?.backendUid ?? null
          : session.uid;
      if (!friendUid) return;
      const optimisticId = `opt_thread_${Date.now()}`;
      setPosts((current) =>
        current.map((candidate) => {
          if (candidate.id !== postId) return candidate;
          return {
            ...candidate,
            comments: (candidate.comments ?? []).map((c) => {
              if (c.id !== commentId) return c;
              const entry = {
                id: optimisticId,
                authorId: CURRENT_USER_ID,
                text,
                createdAt: Date.now(),
                reactions: {} as Record<string, string>,
              };
              return { ...c, thread: [...(c.thread ?? []), entry] };
            }),
          };
        })
      );
      void callEmulatorFunction("createPrivatePostThreadMessage", {
        uid: session.uid,
        deviceId: session.deviceId,
        postId,
        postOwnerUid,
        friendUid,
        text,
      })
        .then(() => hydratePrivateThreadForPost(post))
        .catch(() => {
          setPosts((current) =>
            current.map((candidate) => {
              if (candidate.id !== postId) return candidate;
              return {
                ...candidate,
                comments: (candidate.comments ?? []).map((c) => {
                  if (c.id !== commentId) return c;
                  return {
                    ...c,
                    thread: (c.thread ?? []).filter((entry) => entry.id !== optimisticId),
                  };
                }),
              };
            })
          );
        });
      setThreadDraftByChainKey((current) => ({ ...current, [`${postId}:${commentId}`]: "" }));
    },
    [
      friendMap,
      getBackendSession,
      hydratePrivateThreadForPost,
      posts,
      resolvePostOwnerBackendUid,
      setPosts,
      setThreadDraftByChainKey,
    ]
  );

  const submitFullscreenPostComment = useCallback(() => {
    const post = fullScreenPost
      ? posts.find((p) => p.id === fullScreenPost.id) ?? fullScreenPost
      : null;
    if (!post) return;
    const draft = readComposerTextTrimmed(postCommentTextRef);
    if (!draft) return;
    if (postFullscreenThreadReplyKey) {
      const prefix = `${post.id}:`;
      if (!postFullscreenThreadReplyKey.startsWith(prefix)) return;
      const anchorCommentId = postFullscreenThreadReplyKey.slice(prefix.length);
      if (!anchorCommentId) return;
      addThreadReplyToComment(post.id, anchorCommentId, draft);
    } else {
      addCommentToPost(post.id, draft);
    }
    postCommentTextRef.current = "";
    setPostCommentInput("");
  }, [
    fullScreenPost,
    posts,
    postFullscreenThreadReplyKey,
    addCommentToPost,
    addThreadReplyToComment,
    postCommentTextRef,
    setPostCommentInput,
  ]);

  const patchPostCommentReactions = useCallback(
    (
      postId: string,
      messageId: string,
      emoji: string,
      options?: { threadParentId?: string }
    ): Post[] | null => {
      const session = getBackendSession();
      if (!session) return null;
      const post = posts.find((p) => p.id === postId);
      if (!post) return null;

      const patchEntry = <T extends { reactions?: Record<string, string> }>(entry: T): T => {
        const prev = entry.reactions ?? {};
        const mine = prev[CURRENT_USER_ID] ?? prev[session.uid];
        const nextEmoji = mine === emoji ? "" : emoji;
        const next = { ...prev };
        delete next[CURRENT_USER_ID];
        delete next[session.uid];
        if (nextEmoji) next[CURRENT_USER_ID] = nextEmoji;
        return { ...entry, reactions: next };
      };

      return posts.map((p) => {
        if (p.id !== postId) return p;
        return {
          ...p,
          comments: (p.comments ?? []).map((comment) => {
            if (options?.threadParentId) {
              if (comment.id !== options.threadParentId) return comment;
              return {
                ...comment,
                thread: (comment.thread ?? []).map((entry) =>
                  entry.id === messageId ? patchEntry(entry) : entry
                ),
              };
            }
            if (comment.id !== messageId) return comment;
            return patchEntry(comment);
          }),
        };
      });
    },
    [getBackendSession, posts]
  );

  const toggleCommentReaction = useCallback(
    (postId: string, commentId: string, emoji: string) => {
      const post = posts.find((p) => p.id === postId);
      const session = getBackendSession();
      if (!post || !session || demoOfflineMode) return;
      const comment = (post.comments ?? []).find((c) => c.id === commentId);
      if (!comment) return;
      const postOwnerUid = resolvePostOwnerBackendUid(post, session.uid);
      if (!postOwnerUid) return;
      const friendUid =
        post.authorId === CURRENT_USER_ID
          ? friendMap[comment.authorId]?.backendUid ?? null
          : session.uid;
      if (!friendUid || comment.id.startsWith("srv_")) return;
      const prevComments = post.comments ?? [];
      const nextPosts = patchPostCommentReactions(postId, commentId, emoji);
      if (nextPosts) setPosts(nextPosts);
      void callEmulatorFunction("togglePrivatePostThreadMessageReaction", {
        uid: session.uid,
        deviceId: session.deviceId,
        postId,
        postOwnerUid,
        friendUid,
        messageId: comment.id,
        emoji,
      })
        .then(() => hydratePrivateThreadForPost(post))
        .catch(() => {
          setPosts((current) =>
            current.map((p) => (p.id === postId ? { ...p, comments: prevComments } : p))
          );
        });
    },
    [
      demoOfflineMode,
      friendMap,
      getBackendSession,
      hydratePrivateThreadForPost,
      patchPostCommentReactions,
      posts,
      resolvePostOwnerBackendUid,
      setPosts,
    ]
  );

  const toggleThreadReaction = useCallback(
    (postId: string, commentId: string, threadId: string, emoji: string) => {
      const post = posts.find((p) => p.id === postId);
      const session = getBackendSession();
      if (!post || !session || demoOfflineMode) return;
      const comment = (post.comments ?? []).find((c) => c.id === commentId);
      if (!comment) return;
      const postOwnerUid = resolvePostOwnerBackendUid(post, session.uid);
      if (!postOwnerUid) return;
      const friendUid =
        post.authorId === CURRENT_USER_ID
          ? friendMap[comment.authorId]?.backendUid ?? null
          : session.uid;
      if (!friendUid) return;
      const prevComments = post.comments ?? [];
      const nextPosts = patchPostCommentReactions(postId, threadId, emoji, {
        threadParentId: commentId,
      });
      if (nextPosts) setPosts(nextPosts);
      void callEmulatorFunction("togglePrivatePostThreadMessageReaction", {
        uid: session.uid,
        deviceId: session.deviceId,
        postId,
        postOwnerUid,
        friendUid,
        messageId: threadId,
        emoji,
      })
        .then(() => hydratePrivateThreadForPost(post))
        .catch(() => {
          setPosts((current) =>
            current.map((p) => (p.id === postId ? { ...p, comments: prevComments } : p))
          );
        });
    },
    [
      demoOfflineMode,
      friendMap,
      getBackendSession,
      hydratePrivateThreadForPost,
      patchPostCommentReactions,
      posts,
      resolvePostOwnerBackendUid,
      setPosts,
    ]
  );

  const applyReactionToMessage = useCallback(
    (messageId: string, emoji: string) => {
      const target = messages.find((m) => m.id === messageId);
      const session = getBackendSession();
      if (!session) return;
      const chat = target ? chats.find((c) => c.id === target.chatId) : undefined;
      const prevEmoji = target
        ? getMyReactionEmoji(target.reactions, session.uid, backendUidToFriendId)
        : undefined;
      const nextEmoji = prevEmoji === emoji ? undefined : emoji;
      patchMessage(messageId, (message) => {
        const reactions = { ...(message.reactions ?? {}) };
        delete reactions[session.uid];
        delete reactions[CURRENT_USER_ID];
        if (nextEmoji) reactions[CURRENT_USER_ID] = nextEmoji;
        return { ...message, reactions };
      });
      setReactionPickerOpen(false);
      if (!target || !chat || demoOfflineMode) return;
      void callEmulatorFunction("updateMessageMetadata", {
        uid: session.uid,
        deviceId: session.deviceId,
        conversationId: resolveConversationId(chat),
        messageId: target.id,
        reactions: { [session.uid]: nextEmoji ?? "" },
      }).catch((err) =>
        logAppError("messages.reaction_metadata", err, {
          messageId: target.id,
          chatId: chat.id,
        })
      );
    },
    [
      demoOfflineMode,
      backendUidToFriendId,
      chats,
      getBackendSession,
      messages,
      resolveConversationId,
      patchMessage,
      setReactionPickerOpen,
    ]
  );

  const reactionPickerActiveEmoji = useMemo(() => {
    const session = getBackendSession();
    if (postReactionTargetId) {
      const post = posts.find((p) => p.id === postReactionTargetId);
      if (!post) return undefined;
      const rx = post.feedReactions ?? {};
      return rx[CURRENT_USER_ID] ?? (session ? rx[session.uid] : undefined);
    }
    if (commentReactionTarget) {
      const post = posts.find((p) => p.id === commentReactionTarget.postId);
      const comment = post?.comments?.find((c) => c.id === commentReactionTarget.commentId);
      if (!comment) return undefined;
      const entry = commentReactionTarget.threadEntryId
        ? (comment.thread ?? []).find((t) => t.id === commentReactionTarget.threadEntryId)
        : comment;
      if (!entry) return undefined;
      return getMyReactionEmoji(entry.reactions, session?.uid, backendUidToFriendId);
    }
    const messageId = reactionTargetMessageId ?? messageActionTargetId;
    if (!messageId) return undefined;
    const target = messages.find((m) => m.id === messageId);
    return getMyReactionEmoji(target?.reactions, session?.uid, backendUidToFriendId);
  }, [
    postReactionTargetId,
    commentReactionTarget,
    reactionTargetMessageId,
    messageActionTargetId,
    posts,
    messages,
    getBackendSession,
    backendUidToFriendId,
  ]);

  const applyReaction = (emoji: string) => {
    if (postReactionTargetId) {
      const post = posts.find((p) => p.id === postReactionTargetId);
      if (post) void togglePostReaction(post, emoji);
      setPostReactionTargetId(null);
      setReactionPickerOpen(false);
      setReactionTargetMessageId(null);
      return;
    }
    if (commentReactionTarget) {
      const { postId, commentId, threadEntryId } = commentReactionTarget;
      if (threadEntryId) {
        toggleThreadReaction(postId, commentId, threadEntryId, emoji);
      } else {
        toggleCommentReaction(postId, commentId, emoji);
      }
      setCommentReactionTarget(null);
      setReactionPickerOpen(false);
      setReactionTargetMessageId(null);
      return;
    }
    const messageId = reactionTargetMessageId ?? messageActionTargetId;
    if (!messageId) return;
    applyReactionToMessage(messageId, emoji);
    setReactionTargetMessageId(null);
    setReactionPickerOpen(false);
  };

  const removeActiveReaction = useCallback(() => {
    const emoji = reactionPickerActiveEmoji;
    if (!emoji) return;
    applyReaction(emoji);
  }, [reactionPickerActiveEmoji]);

  const openReactionPickerForMessage = useCallback(
    (messageId: string) => {
      setMessageActionTargetId(messageId);
      openReactionPickerForMessageBase(messageId);
    },
    [openReactionPickerForMessageBase, setMessageActionTargetId]
  );

  const openReactionPickerForPost = useCallback(
    (postId: string) => {
      setMessageActionTargetId(null);
      openReactionPickerForPostBase(postId);
    },
    [openReactionPickerForPostBase, setMessageActionTargetId]
  );

  const openReactionPickerForComment = useCallback(
    (postId: string, commentId: string, threadEntryId?: string) => {
      setMessageActionTargetId(null);
      openReactionPickerForCommentBase(postId, commentId, threadEntryId);
    },
    [openReactionPickerForCommentBase, setMessageActionTargetId]
  );

  useEffect(() => {
    if (!fullScreenPost) return;
    void hydratePrivateThreadForPost(fullScreenPost);
  }, [fullScreenPost, hydratePrivateThreadForPost]);

  /**
   * Push-based private-post-thread delivery while a post is open in
   * fullscreen. Replaces the manual `.then(() => hydratePrivateThreadForPost)`
   * dance for *remote* changes (the local-action callbacks still call it to
   * confirm the optimistic write).
   *
   * Subscribes to each thread doc's `messages` subcollection (one
   * subscription per friend pair when the viewer is the post owner; a
   * single subscription when the viewer is the friend). On any change we
   * re-run the existing aggregator so the rendered comment tree always
   * reflects server truth without a callable poll.
   */
  useEffect(() => {
    if (demoOfflineMode) return;
    if (!fullScreenPost) return;
    const session = getBackendSession();
    if (!session) return;
    const firebaseAuthUid = firebaseAuth.currentUser?.uid;
    if (!firebaseAuthUid) return;
    const postOwnerUid = resolvePostOwnerBackendUid(fullScreenPost, session.uid);
    if (!postOwnerUid) return;

    const watchFriendUids = new Set<string>();
    if (fullScreenPost.authorId === CURRENT_USER_ID) {
      for (const comment of fullScreenPost.comments ?? []) {
        const bu = friendMap[comment.authorId]?.backendUid?.trim();
        if (bu?.startsWith("u_") && bu !== session.uid) watchFriendUids.add(bu);
      }
      if (postFullscreenThreadReplyKey?.startsWith(`${fullScreenPost.id}:`)) {
        const anchorId = postFullscreenThreadReplyKey.slice(fullScreenPost.id.length + 1);
        const anchor = fullScreenPost.comments?.find((c) => c.id === anchorId);
        const bu = anchor ? friendMap[anchor.authorId]?.backendUid?.trim() : "";
        if (bu?.startsWith("u_") && bu !== session.uid) watchFriendUids.add(bu);
      }
    } else {
      watchFriendUids.add(session.uid);
    }
    if (watchFriendUids.size === 0) return;

    const buildThreadId = (friendUid: string) => {
      const pair =
        postOwnerUid < friendUid ? `${postOwnerUid}_${friendUid}` : `${friendUid}_${postOwnerUid}`;
      return `${fullScreenPost.id}__${pair}`;
    };
    const db = getFirestoreDb();
    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRehydrate = () => {
      if (cancelled) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (cancelled) return;
        void hydratePrivateThreadForPost(fullScreenPost);
      }, 80);
    };
    const unsubscribers = [...watchFriendUids].map((friendUid) => {
      const threadId = buildThreadId(friendUid);
      const q = firestoreQuery(
        collection(db, "privatePostThreads", threadId, "messages"),
        where("participantAuthUids", "array-contains", firebaseAuthUid)
      );
      return onSnapshot(
        q,
        (snap) => {
          if (cancelled) return;
          if (snap.docChanges().length > 0) scheduleRehydrate();
        },
        () => undefined
      );
    });
    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      for (const unsub of unsubscribers) unsub();
    };
  }, [
    demoOfflineMode,
    fullScreenPost,
    friendMap,
    postFullscreenThreadReplyKey,
    getBackendSession,
    hydratePrivateThreadForPost,
    resolvePostOwnerBackendUid,
  ]);

  const postsToHydrateComments = useMemo(() => {
    if (viewScreen === "myProfile") {
      return myProfilePosts.slice(0, 25);
    }
    if (viewScreen === "friendProfile") {
      return friendProfilePosts.slice(0, 25);
    }
    if (viewScreen === "home" && homeTab === "feed") {
      return [];
    }
    return [];
  }, [viewScreen, homeTab, myProfilePosts, friendProfilePosts]);

  const postsToHydrateCommentsKey = useMemo(
    () => postsToHydrateComments.map((p) => p.id).join("|"),
    [postsToHydrateComments]
  );

  useEffect(() => {
    if (demoOfflineMode) return;
    const session = getBackendSession();
    if (!session || !signedIn) return;
    if (appLifecycleState !== "active") return;
    if (postsToHydrateComments.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (let i = 0; i < postsToHydrateComments.length; i += 2) {
        if (cancelled) return;
        const batch = postsToHydrateComments.slice(i, i + 2);
        await Promise.all(batch.map((post) => hydratePrivateThreadForPost(post)));
        await yieldToUi();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    demoOfflineMode,
    signedIn,
    appLifecycleState,
    postsToHydrateCommentsKey,
    getBackendSession,
    hydratePrivateThreadForPost,
    postsToHydrateComments.length,
  ]);

  return {
    togglePostReaction,
    hydratePrivateThreadForPost,
    submitFullscreenPostComment,
    reactionPickerActiveEmoji,
    applyReaction,
    removeActiveReaction,
    openReactionPickerForMessage,
    openReactionPickerForPost,
    openReactionPickerForComment,
  };
}
