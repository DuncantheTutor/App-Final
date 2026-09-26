import { useCallback, useEffect } from "react";
import type { ViewState } from "../domain/types";
import { storageSetItem } from "../lib/encryptedLocalStorage";
import { lastHomeTabStorageKey, lastViewStorageKey } from "../lib/viewPersistence";
import type { HomeTab } from "./types";
import type { MutableRefObject } from "react";

/** Remember the last screen and home tab for this account. */
export function usePersistLastView(params: {
  signedIn: boolean;
  sessionEmailRef: MutableRefObject<string | null>;
  view: ViewState;
  homeTab: HomeTab;
}) {
  const { signedIn, sessionEmailRef, view, homeTab } = params;
  useEffect(() => {
    if (!signedIn) return;
    const email = sessionEmailRef.current?.trim().toLowerCase();
    if (!email) return;
    void storageSetItem(lastViewStorageKey(email), JSON.stringify(view)).catch(() => {
      /* ignore */
    });
    if (view.screen === "home") {
      void storageSetItem(lastHomeTabStorageKey(email), homeTab).catch(() => {
        /* ignore */
      });
    }
  }, [view, signedIn, homeTab, sessionEmailRef]);
}
