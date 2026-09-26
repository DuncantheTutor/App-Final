import { useEffect, useMemo, useState } from "react";
import type { ColorThemeId, ThemePalette } from "../domain/types";
import { storageGetItem, storageSetItem } from "../lib/encryptedLocalStorage";
import { setUserHapticsEnabled, useHapticSettings } from "../lib/haptics";
import {
  APPEARANCE_PREFS_STORAGE_KEY,
  DARK_THEME_GREEN,
  DARK_THEME_ORANGE,
  DARK_THEME_PINK,
  LIGHT_THEME_GREEN,
  LIGHT_THEME_ORANGE,
  LIGHT_THEME_PINK,
} from "./preludeConstants";

/** Dark mode, accent colour, and the saved haptics preference. */
export function useAppearancePrefs() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [colorThemeId, setColorThemeId] = useState<ColorThemeId>("green");
  const [prefsHydrated, setPrefsHydrated] = useState(false);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const hapticSettings = useHapticSettings();

  useEffect(() => {
    let cancelled = false;
    void storageGetItem(APPEARANCE_PREFS_STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (raw) {
          try {
            const o = JSON.parse(raw) as {
              isDarkMode?: unknown;
              colorThemeId?: unknown;
              hapticsEnabled?: unknown;
            };
            if (typeof o.isDarkMode === "boolean") setIsDarkMode(o.isDarkMode);
            if (o.colorThemeId === "green" || o.colorThemeId === "pink" || o.colorThemeId === "orange") {
              setColorThemeId(o.colorThemeId);
            }
            if (typeof o.hapticsEnabled === "boolean") setUserHapticsEnabled(o.hapticsEnabled);
          } catch {
            /* ignore */
          }
        }
        setPrefsHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setPrefsHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!prefsHydrated) return;
    void storageSetItem(
      APPEARANCE_PREFS_STORAGE_KEY,
      JSON.stringify({
        isDarkMode,
        colorThemeId,
        hapticsEnabled: hapticSettings.userEnabled,
      })
    ).catch(() => {});
  }, [isDarkMode, colorThemeId, hapticSettings.userEnabled, prefsHydrated]);

  const theme: ThemePalette = useMemo(() => {
    if (colorThemeId === "pink") {
      return isDarkMode ? DARK_THEME_PINK : LIGHT_THEME_PINK;
    }
    if (colorThemeId === "orange") {
      return isDarkMode ? DARK_THEME_ORANGE : LIGHT_THEME_ORANGE;
    }
    return isDarkMode ? DARK_THEME_GREEN : LIGHT_THEME_GREEN;
  }, [isDarkMode, colorThemeId]);

  return {
    isDarkMode,
    setIsDarkMode,
    colorThemeId,
    setColorThemeId,
    themePickerOpen,
    setThemePickerOpen,
    hapticSettings,
    theme,
  };
}
