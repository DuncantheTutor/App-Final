import { useCallback, useEffect, useMemo, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { backendUidForFriendId } from "../../backendBridge";
import type { Chat, Friend, ViewState } from "../domain/types";
import {
  applyPresenceToFriends,
  dedupeFriendsByBackendUid,
  friendsForFriendsList,
  mergeFriendsCatalog,
} from "../lib/mergeFriendsCatalog";
import { resolveParticipantDisplay } from "../lib/participantDisplay";
import { normalizeChatMemberIds } from "../lib/resolveChatMemberBackendUid";
import { viewAfterLeavingFriendProfile } from "../shell/routes";
import { CURRENT_USER_ID, DEMO_OFFLINE_MODE, FRIENDS } from "../theme/preludeConstants";

type ProfileCardResolver = (friendId: string, friendMap: Record<string, Friend>) => unknown;

/** Roster, presence, visible friends, and the uid maps chats and profiles read. */
export function useFriendIdentityMaps(params: {
  signedIn: boolean;
  sessionEmailRef: MutableRefObject<string | null>;
  addedFriendsFromRitual: Friend[];
  setAddedFriendsFromRitual: Dispatch<SetStateAction<Friend[]>>;
  serverAcceptedFriendBackendUids: ReadonlySet<string>;
  presenceOnlineByBackendUid: Record<string, boolean>;
  initialServerSyncDone: boolean;
  identityLockedChatIds: string[];
  friendLinksState: Record<string, string[]>;
  unfriendedIds: string[];
  view: ViewState;
  setView: Dispatch<SetStateAction<ViewState>>;
  applyChats: (updater: (current: Chat[]) => Chat[]) => void;
  mergeRosterIntoCache: (friends: Friend[], email: string) => void;
  resolveFriendProfileCardFromMaps: ProfileCardResolver;
}) {
  const {
    signedIn,
    sessionEmailRef,
    addedFriendsFromRitual,
    setAddedFriendsFromRitual,
    serverAcceptedFriendBackendUids,
    presenceOnlineByBackendUid,
    initialServerSyncDone,
    identityLockedChatIds,
    friendLinksState,
    unfriendedIds,
    view,
    setView,
    applyChats,
    mergeRosterIntoCache,
    resolveFriendProfileCardFromMaps,
  } = params;

  useEffect(() => {
    if (!signedIn) return;
    setAddedFriendsFromRitual((prev) => {
      const next = dedupeFriendsByBackendUid(prev);
      if (next.length === prev.length && next.every((f, i) => f === prev[i])) return prev;
      return next;
    });
  }, [signedIn, setAddedFriendsFromRitual]);

  const presenceFriendUidMap = useMemo(() => {
    const out: Record<string, string> = {};
    for (const friend of addedFriendsFromRitual) {
      const bu = friend.backendUid?.trim();
      if (bu?.startsWith("u_")) out[friend.id] = bu;
    }
    for (const uid of serverAcceptedFriendBackendUids) {
      if (!uid.startsWith("u_")) continue;
      out[backendUidForFriendId(uid)] = uid;
    }
    return out;
  }, [addedFriendsFromRitual, serverAcceptedFriendBackendUids]);

  const allFriends = useMemo(
    () =>
      applyPresenceToFriends(
        mergeFriendsCatalog(DEMO_OFFLINE_MODE ? FRIENDS : [], addedFriendsFromRitual),
        presenceOnlineByBackendUid,
        presenceFriendUidMap
      ),
    [addedFriendsFromRitual, presenceOnlineByBackendUid, presenceFriendUidMap]
  );

  const friendMap = useMemo(() => {
    const acc: Record<string, Friend> = {};
    for (const f of allFriends) {
      acc[f.id] = f;
      const bu = f.backendUid?.trim();
      if (bu?.startsWith("u_")) acc[bu] = f;
    }
    return acc;
  }, [allFriends]);

  const friendMapRef = useRef(friendMap);
  friendMapRef.current = friendMap;

  const resolveFriendProfileCard = useCallback(
    (friendId: string) => resolveFriendProfileCardFromMaps(friendId, friendMap),
    [friendMap, resolveFriendProfileCardFromMaps]
  );

  useEffect(() => {
    if (!signedIn) return;
    const email = sessionEmailRef.current?.trim().toLowerCase();
    if (!email) return;
    mergeRosterIntoCache(allFriends, email);
  }, [allFriends, signedIn, mergeRosterIntoCache, sessionEmailRef]);

  const serverFriendUidsForDisplay = useMemo(() => {
    if (DEMO_OFFLINE_MODE) return null;
    if (!initialServerSyncDone) return null;
    return serverAcceptedFriendBackendUids;
  }, [initialServerSyncDone, serverAcceptedFriendBackendUids]);

  const identityLockedChatIdsSet = useMemo(
    () => new Set(identityLockedChatIds),
    [identityLockedChatIds]
  );
  const localAcceptedFriendIds = useMemo(
    () => new Set(friendLinksState[CURRENT_USER_ID] ?? []),
    [friendLinksState]
  );

  const visibleFriends = useMemo(
    () => friendsForFriendsList(allFriends, unfriendedIds),
    [allFriends, unfriendedIds]
  );
  const visibleFriendIds = useMemo(() => visibleFriends.map((f) => f.id), [visibleFriends]);
  const demoActiveInboundFriendIds = useMemo(
    () => (DEMO_OFFLINE_MODE ? visibleFriendIds.slice(0, 5) : []),
    [visibleFriendIds]
  );

  const friendIdToBackendUid = useMemo(() => {
    const out: Record<string, string> = {};
    for (const friend of allFriends) {
      const bu = friend.backendUid?.trim();
      if (bu?.startsWith("u_")) out[friend.id] = bu;
    }
    return out;
  }, [allFriends]);

  const resolveChatMemberFriendId = useCallback(
    (memberId: string) => {
      if (friendMap[memberId]) return memberId;
      const trimmed = memberId.trim();
      if (trimmed.startsWith("u_")) {
        return friendIdToBackendUid[trimmed] ?? (friendMap[trimmed] ? trimmed : memberId);
      }
      return memberId;
    },
    [friendMap, friendIdToBackendUid]
  );

  const resolvePd = useCallback(
    (friendId: string, chatId?: string) =>
      resolveParticipantDisplay(
        resolveChatMemberFriendId(friendId),
        friendMap,
        unfriendedIds,
        serverFriendUidsForDisplay,
        {
          chatId,
          identityLockedChatIds: identityLockedChatIdsSet,
          localAcceptedFriendIds,
        }
      ),
    [
      friendMap,
      unfriendedIds,
      serverFriendUidsForDisplay,
      identityLockedChatIdsSet,
      localAcceptedFriendIds,
      resolveChatMemberFriendId,
    ]
  );

  useEffect(() => {
    if (view.screen !== "friendProfile") return;
    if (resolvePd(view.friendId).canOpenProfile) return;
    setView(viewAfterLeavingFriendProfile(view));
  }, [view, resolvePd, setView]);

  const backendUidToFriendId = useMemo(() => {
    const out: Record<string, string> = {};
    for (const friend of allFriends) {
      const bu = friend.backendUid?.trim();
      if (bu?.startsWith("u_")) out[bu] = friend.id;
    }
    return out;
  }, [allFriends]);

  const friendIdToBackendUidRef = useRef(friendIdToBackendUid);
  friendIdToBackendUidRef.current = friendIdToBackendUid;

  useEffect(() => {
    if (!signedIn) return;
    applyChats((current) => {
      let changed = false;
      const next = current.map((chat) => {
        const memberIds = normalizeChatMemberIds(chat.memberIds, friendMap, backendUidToFriendId);
        if (memberIds.length === chat.memberIds.length && memberIds.every((id, i) => id === chat.memberIds[i])) {
          return chat;
        }
        changed = true;
        return { ...chat, memberIds };
      });
      return changed ? next : current;
    });
  }, [signedIn, friendMap, backendUidToFriendId, applyChats]);

  return {
    allFriends,
    friendMap,
    friendMapRef,
    resolveFriendProfileCard,
    serverFriendUidsForDisplay,
    identityLockedChatIdsSet,
    localAcceptedFriendIds,
    visibleFriends,
    visibleFriendIds,
    demoActiveInboundFriendIds,
    friendIdToBackendUid,
    friendIdToBackendUidRef,
    resolveChatMemberFriendId,
    resolvePd,
    backendUidToFriendId,
  };
}
