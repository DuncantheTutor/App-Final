/**
 * Splits monolithic ./App.tsx into modular app/* files.
 * Run: node scripts/refactor-split-app.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function sliceLines(lines, start1, end1Inclusive) {
  return lines.slice(start1 - 1, end1Inclusive).join("\n");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function write(file, contents) {
  ensureDir(path.dirname(file));
  const body = contents.endsWith("\n") ? contents : contents + "\n";
  fs.writeFileSync(file, body, "utf8");
}

function addExportKeywords(tsSource) {
  return tsSource.split("\n").map((line) => {
    if (/^async function /.test(line)) return `export ${line}`;
    if (/^function /.test(line)) return `export ${line}`;
    // Top-level const only (column 0)
    if (/^const /.test(line)) return `export ${line}`;
    return line;
  }).join("\n");
}

function extractExportedNames(prefixedSrc) {
  const names = new Set();
  for (const line of prefixedSrc.split("\n")) {
    let m = line.match(/^export const ([A-Za-z0-9_]+)/);
    if (m) names.add(m[1]);
    m = line.match(/^export function ([A-Za-z0-9_]+)/);
    if (m) names.add(m[1]);
    m = line.match(/^export async function ([A-Za-z0-9_]+)/);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}

function main() {
  const appTsx = path.join(root, "App.tsx");
  const backup = path.join(root, "App.tsx.monolithic.backup");

  const raw = fs.readFileSync(appTsx, "utf8");
  const lines = raw.split(/\r?\n/);

  const domainDir = path.join(root, "app", "domain");
  const themeDir = path.join(root, "app", "theme");
  const stylesDir = path.join(root, "app", "styles");
  const screensDir = path.join(root, "app", "screens");
  const libDir = path.join(root, "app", "lib");
  [domainDir, themeDir, stylesDir, screensDir, libDir].forEach(ensureDir);

  /** domain/types.ts */
  const typesBlock = [
    sliceLines(lines, 75, 239),
    "",
    `export type MockSessionClaimResult = "claimed" | "already-owned" | "locked" | "error";`,
    "",
    sliceLines(lines, 1448, 1459),
    "",
    sliceLines(lines, 1599, 1608),
  ]
    .join("\n")
    .replace(/^type /gm, "export type ");
  write(path.join(domainDir, "types.ts"), `${typesBlock}\n`);

  /** lib/colorMath.ts */
  write(
    path.join(libDir, "colorMath.ts"),
    `${sliceLines(lines, 362, 386)}\n`
  );

  /** lib/viewPersistence.ts — boot + routing parse helpers only */
  write(
    path.join(libDir, "viewPersistence.ts"),
    `${sliceLines(lines, 241, 284)}\n`
  );

  /**
   * preludeConstants: seed data + themes + mocks + pairing timing constants shared with legacy App.tsx ordering.
   * Excludes MockAuthAccount (in types.ts), excludes confetti (AddFriendScreen), excludes AddFriendScreen + main App().
   */
  /** Through ADD_FRIEND_QR_VISIBLE_MS; confetti + failure-id live in AddFriendScreen only. */
  const preludePieces = [
    sliceLines(lines, 342, 1268),
    sliceLines(lines, 1269, 1369),
    /** Skip inline `type MockAuthAccount` / `MockSessionClaimResult` — use domain/types.ts only. */
    sliceLines(lines, 1372, 1446),
    /** Omit closing `};` of MockAuthAccount (original ~1459–1460) — start at demo ID block. */
    sliceLines(lines, 1462, 1591),
  ];

  let preludeTs = preludePieces.join("\n\n");
  preludeTs = `import type {\n  Chat,\n  Friend,\n  Message,\n  MockAuthAccount,\n  MockSessionClaimResult,\n  Post,\n  SavedBroadcastGroup,\n  ThemePalette,\n} from "../domain/types";\n\n${preludeTs}\n`;

  preludeTs = addExportKeywords(preludeTs);

  /** Fix duplicate exports if accidentally double-prefixed */
  preludeTs = preludeTs.replace(/^export export /gm, "export ");

  write(path.join(themeDir, "preludeConstants.ts"), preludeTs);

  /** AddFriendScreen */
  const addFriendImports = `import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as ExpoLocation from "expo-location";
import LottieView from "lottie-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  Vibration,
} from "react-native";
import QRCode from "react-native-qrcode-svg";

import {
  cancelInPersonPairingHardware,
} from "../../addFriend/inPersonPairingGateway";
import {
  readAddFriendNdefPayload,
  writeAddFriendNdefPayload,
} from "../../addFriend/nfc/handshake";
import { encodeNfcPinPairNdefPayload, parsePinFromNfcPairPlaintext } from "../../addFriend/nfcPinTransport/pinPairProtocol";

import type { Friend, ThemePalette } from "../domain/types";
import {
  multiplyHexColor,
  blendAccentTowardWhite,
} from "../lib/colorMath";

`;

  const friendOnlyConstants = `${sliceLines(lines, 1577, 1591)}

/** \`displayedProfileId\` when hold completes with no pair result — shows failed pairing UI. */
const ADD_FRIEND_HANDSHAKE_FAILURE_ID = "__handshake_no_pair_failure__";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- bundled Lottie (from Downloads / project assets)
const ADD_FRIEND_CONFETTI_JSON = require("../../assets/confetti.json");
`;

  const addFriendBody = sliceLines(lines, 1610, 2994).replace(/^function AddFriendScreen/, "export function AddFriendScreen");

  write(
    path.join(screensDir, "AddFriendScreen.tsx"),
    `${addFriendImports}${friendOnlyConstants}\n\n${addFriendBody}\n`
  );

  /** makeStyles */
  let makeStylesBlock = sliceLines(lines, 10466, 12401).replace(/^const makeStyles\s*=\s*/, "export const makeStyles = ");
  makeStylesBlock = `import { Platform, StyleSheet } from "react-native";
import type { ThemePalette } from "../domain/types";
import {
  CHAT_BUBBLE_BODY_SIZE,
  CHAT_HEADER_SIDE_RAIL_WIDTH,
  CHAT_XH,
  CHAT_XH_HALF,
  ONLINE_GREEN,
  ONLINE_STRIP_EDGE_PAD,
  ONLINE_VISIBLE_SLOTS,
} from "../theme/preludeConstants";

${makeStylesBlock}
`;
  write(path.join(stylesDir, "makeAppStyles.ts"), makeStylesBlock);

  /** Main app body — inner function retains all legacy logic */
  let mainSlice = sliceLines(lines, 2996, 10464)
    .replace(/^\s*export default function App\(\)\s*\{/, "function MainAppInner() {");

  /** Export prelude names for wildcard import ergonomics — prefer explicit barrel */
  const preludeExportNames = extractExportedNames(fs.readFileSync(path.join(themeDir, "preludeConstants.ts"), "utf8"));

  const preludeImportLines = preludeExportNames.join(",\n  ");
  const mainHeader = `import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as NavigationBar from "expo-navigation-bar";
import { Audio, ResizeMode, Video } from "expo-av";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as ExpoLocation from "expo-location";
import * as ExpoNetwork from "expo-network";
import * as VideoThumbnails from "expo-video-thumbnails";
import Constants from "expo-constants";
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Image,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StatusBar as RNStatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  Vibration,
  View,
  type ScrollView,
} from "react-native";

import { FlatListUntilScroll, ScrollViewUntilScroll } from "../ScrollUntilScroll";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  PhotoEditorModal,
  type PhotoEditorResult,
  type VideoTextOverlayData,
} from "../PhotoEditorModal";
import LottieView from "lottie-react-native";

import {
  backendUidForEmail,
  backendUidForFriendId,
  callEmulatorFunction,
  getOrCreateBackendDeviceId,
} from "../backendBridge";
import { logAppError, logAppEvent, setTelemetryContext } from "../telemetry";
import {
  hasReadSmsPermission,
  requestReadSmsPermissionIfNeeded,
  startAndroidOtpAssist,
} from "../otpSmsAssist";
import { firebaseAuth } from "../firebaseAuthClient";
import {
  decryptPayloadForRecipient,
  ensureLocalKeyBundle,
  encryptPayloadForRecipients,
} from "../e2eeCrypto";

import type {
  Chat,
  ColorThemeId,
  EncryptedSyncChannelState,
  Friend,
  FriendsListRestore,
  Message,
  PendingDraft,
  Post,
  SavedBroadcastGroup,
  ThemePalette,
  ViewState,
} from "./domain/types";
import {
  APP_BOOT_SPLASH_MIN_MS,
  PLACEHOLDER_APP_PRODUCT_NAME,
  lastHomeTabStorageKey,
  lastViewStorageKey,
  parseFriendsListRestorePayload,
  parsePendingDraftPayload,
  parseStoredViewState,
} from "./lib/viewPersistence";
import { makeStyles } from "./styles/makeAppStyles";
import { AddFriendScreen } from "./screens/AddFriendScreen";
import {
  ${preludeImportLines}
} from "./theme/preludeConstants";
`;

  const mainFile = `${mainHeader}

${mainSlice}

export default function MainApp() {
  return <MainAppInner />;
}
`;

  write(path.join(root, "app", "MainApp.tsx"), mainFile);

  if (!fs.existsSync(backup)) {
    fs.copyFileSync(appTsx, backup);
  }
  fs.unlinkSync(appTsx);
  write(
    path.join(root, "App.tsx"),
    `/**\n * Thin entry — implementation lives under ./app/ (see ./app/App.tsx).\n */\nexport { default } from "./app/App";\n`
  );

  console.log(`Split complete. preludeConstants exports ${preludeExportNames.length} symbols.`);
}

main();
