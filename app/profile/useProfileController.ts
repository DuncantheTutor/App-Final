import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { Friend } from "../domain/types";
import {
  readProfileCardCache,
  writeProfileCardCache,
  type CachedProfileCard,
} from "../lib/profileCardCache";
import { mergeProfilePictureUrl } from "../lib/profilePictureUrl";

export type FriendProfileCardView = {
  displayName: string;
  bio: string;
  profilePictureUrl: string;
  online: boolean;
};

export type ProfileController = {
  myProfilePictureUrl: string | null;
  setMyProfilePictureUrl: Dispatch<SetStateAction<string | null>>;
  myProfilePictureUrlRef: MutableRefObject<string | null>;
  myBio: string;
  setMyBio: Dispatch<SetStateAction<string>>;
  myBioTextEntryOpen: boolean;
  setMyBioTextEntryOpen: Dispatch<SetStateAction<boolean>>;
  myDisplayNameRef: MutableRefObject<string>;
  cachedProfileCards: Record<string, CachedProfileCard>;
  cachedProfileCardsRef: MutableRefObject<Record<string, CachedProfileCard>>;
  resetMyProfile: () => void;
  hydrateMyProfile: (next: {
    displayName?: string;
    bio?: string;
    profilePictureUrl?: string | null;
  }) => void;
  mergeRosterIntoCache: (friends: Friend[], email: string) => void;
  resolveFriendProfileCard: (
    friendId: string,
    friendMap: Record<string, Friend>
  ) => FriendProfileCardView | null;
  friendHasCachedProfile: (friendId: string, friendMap: Record<string, Friend>) => boolean;
};

/**
 * Sole owner of my-profile fields and persisted friend profile-card cache.
 * Auth restore and photo upload still live in MainApp; encrypted-profile
 * snapshots live in useEncryptedProfileSync.
 */
export function useProfileController(params: {
  signedIn: boolean;
  sessionEmailRef: MutableRefObject<string | null>;
}): ProfileController {
  const { signedIn, sessionEmailRef } = params;

  const [myProfilePictureUrl, setMyProfilePictureUrl] = useState<string | null>(null);
  const myProfilePictureUrlRef = useRef<string | null>(null);
  myProfilePictureUrlRef.current = myProfilePictureUrl;
  const [myBio, setMyBio] = useState("");
  const [myBioTextEntryOpen, setMyBioTextEntryOpen] = useState(true);
  const myDisplayNameRef = useRef("");
  const [cachedProfileCards, setCachedProfileCards] = useState<Record<string, CachedProfileCard>>(
    {}
  );
  const cachedProfileCardsRef = useRef<Record<string, CachedProfileCard>>({});
  cachedProfileCardsRef.current = cachedProfileCards;

  useEffect(() => {
    if (!signedIn) {
      setCachedProfileCards({});
      return;
    }
    const email = sessionEmailRef.current?.trim().toLowerCase();
    if (!email) return;
    let cancelled = false;
    void (async () => {
      const cards = await readProfileCardCache(email);
      if (!cancelled) setCachedProfileCards(cards);
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, sessionEmailRef]);

  const resetMyProfile = useCallback(() => {
    setMyBio("");
    setMyBioTextEntryOpen(true);
    setMyProfilePictureUrl(null);
    myDisplayNameRef.current = "";
    setCachedProfileCards({});
  }, []);

  const hydrateMyProfile = useCallback(
    (next: { displayName?: string; bio?: string; profilePictureUrl?: string | null }) => {
      if (typeof next.displayName === "string") myDisplayNameRef.current = next.displayName;
      if (typeof next.bio === "string") {
        setMyBio(next.bio);
        setMyBioTextEntryOpen(!next.bio.trim());
      }
      if (next.profilePictureUrl !== undefined) setMyProfilePictureUrl(next.profilePictureUrl);
    },
    []
  );

  const mergeRosterIntoCache = useCallback((friends: Friend[], email: string) => {
    const prior = cachedProfileCardsRef.current;
    let changed = false;
    const next = { ...prior };
    for (const friend of friends) {
      const name = friend.displayName?.trim();
      if (!name) continue;
      const existing = prior[friend.id];
      const card: CachedProfileCard = {
        friendId: friend.id,
        backendUid: friend.backendUid?.trim() || undefined,
        displayName: name,
        bio: friend.bio ?? "",
        profilePictureUrl: mergeProfilePictureUrl(
          friend.profilePictureUrl,
          existing?.profilePictureUrl
        ),
        updatedAt: Date.now(),
      };
      if (
        !existing ||
        existing.displayName !== card.displayName ||
        existing.bio !== card.bio ||
        existing.profilePictureUrl !== card.profilePictureUrl
      ) {
        next[friend.id] = card;
        changed = true;
      }
    }
    if (changed) {
      setCachedProfileCards(next);
      void writeProfileCardCache(email, next);
    }
  }, []);

  const resolveFriendProfileCard = useCallback(
    (friendId: string, friendMap: Record<string, Friend>): FriendProfileCardView | null => {
      const live = friendMap[friendId];
      if (live?.displayName?.trim()) {
        return {
          displayName: live.displayName,
          bio: live.bio ?? "",
          profilePictureUrl: live.profilePictureUrl ?? "",
          online: !!live.online,
        };
      }
      const cached = cachedProfileCards[friendId];
      if (cached?.displayName?.trim()) {
        return {
          displayName: cached.displayName,
          bio: cached.bio ?? "",
          profilePictureUrl: cached.profilePictureUrl ?? "",
          online: false,
        };
      }
      return null;
    },
    [cachedProfileCards]
  );

  const friendHasCachedProfile = useCallback(
    (friendId: string, friendMap: Record<string, Friend>): boolean =>
      Boolean(friendMap[friendId]?.displayName?.trim()) ||
      Boolean(cachedProfileCards[friendId]?.displayName?.trim()),
    [cachedProfileCards]
  );

  return {
    myProfilePictureUrl,
    setMyProfilePictureUrl,
    myProfilePictureUrlRef,
    myBio,
    setMyBio,
    myBioTextEntryOpen,
    setMyBioTextEntryOpen,
    myDisplayNameRef,
    cachedProfileCards,
    cachedProfileCardsRef,
    resetMyProfile,
    hydrateMyProfile,
    mergeRosterIntoCache,
    resolveFriendProfileCard,
    friendHasCachedProfile,
  };
}
