import { useCallback, type MutableRefObject } from "react";
import { writeFriendKeyBundleCache } from "../lib/clientSyncCache";

/** Immediate local save of cached friend public keys. */
export function usePersistFriendKeyCache(params: {
  sessionEmailRef: MutableRefObject<string | null>;
  recipientKeyCacheRef: MutableRefObject<Record<string, string>>;
}) {
  const { sessionEmailRef, recipientKeyCacheRef } = params;
  return useCallback(() => {
    const email = sessionEmailRef.current?.trim().toLowerCase();
    if (!email) return;
    void writeFriendKeyBundleCache(email, { ...recipientKeyCacheRef.current });
  }, [sessionEmailRef, recipientKeyCacheRef]);
}
