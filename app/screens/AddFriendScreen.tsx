import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as ScreenCapture from "expo-screen-capture";
import LottieView from "lottie-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

import { HomeTopNavBar, type HomeNavBadges, type HomeNavHighlight } from "../components/HomeTopNavBar";
import {
  cancelInPersonPairingHardware,
} from "../../addFriend/inPersonPairingGateway";
import {
  readAddFriendNdefPayload,
  writeAddFriendNdefPayload,
} from "../../addFriend/nfc/handshake";
import {
  encodeNfcPairOfferNdefPayload,
  encodeQrPairOfferPayload,
  parseNfcPairOfferPlaintext,
  parseQrPairOfferPlaintext,
} from "../../addFriend/nfcPinTransport/pairOfferProtocol";

import type { Friend, InPersonPairingRole, ThemePalette } from "../domain/types";
import { logAppError, logAppEvent } from "../../telemetry";
import { ADD_FRIEND_HOLD_MS } from "../theme/preludeConstants";

/** Background link delay (no dedicated handshake UI). */
const ADD_FRIEND_HANDSHAKE_MS = 750;
/** Max time to wait for an NDEF read after the hold completes (native only). */
const ADD_FRIEND_PAIRING_SESSION_TIMEOUT_MS = 45000;
/** Peak opacity of the dark scrim over the friend photo during celebration (fades to 0). */
const ADD_FRIEND_OVERLAY_DIM_START = 0.62;
/** Dim + confetti + “now friends” title fade duration. */
const ADD_FRIEND_PROFILE_FADE_MS = 1500;
/** After the fade, keep the profile + name visible before returning to the button. */
const ADD_FRIEND_PROFILE_SOLO_MS = 1000;
/** After releasing before the handshake completes, ignore new presses until this elapses (hold retry gate). */
const ADD_FRIEND_PAIRING_RETRY_COOLDOWN_MS = 1000;
const ADD_FRIEND_PROTOCOL_MAX_ATTEMPTS = 3;
const ADD_FRIEND_PROTOCOL_RETRY_BASE_MS = 200;
const ADD_FRIEND_QR_VISIBLE_MS = 4_000;

/** `displayedProfileId` when hold completes with no pair result — shows failed pairing UI. */
const ADD_FRIEND_HANDSHAKE_FAILURE_ID = "__handshake_no_pair_failure__";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- bundled Lottie (from Downloads / project assets)
const ADD_FRIEND_CONFETTI_JSON = require("../../assets/confetti.json");


export function AddFriendScreen(props: {
  theme: ThemePalette;
  isDarkMode: boolean;
  safeTop: number;
  bottomInset: number;
  navHighlight: HomeNavHighlight;
  navBadges?: HomeNavBadges;
  styles: Record<string, object>;
  onOpenCreatePost: () => void;
  onOpenSettings: () => void;
  onOpenMyProfile: () => void;
  onOpenFriendsList: () => void;
  onOpenAddFriend: () => void;
  onOpenHomeChats: () => void;
  onOpenHomeFeed: () => void;
  onLogout: () => void;
  /** False until device session is claimed — pairing callables need uid + deviceId. */
  pairingBackendReady: boolean;
  /** Register a random 4-digit PIN until server accepts (reserves offer server-side). Returns PIN or null. */
  onPairingRegisterPinWithRetry: () => Promise<string | null>;
  /** Issuer: poll until joiner confirms with same PIN, then hydrate joiner profile. */
  onPairingAwaitPinRedeem: (pin: string) => Promise<Friend | null>;
  /** Joiner: QR scan — validates PIN + proximity (`confirmNfcPinPairOffer`), returns hydrated issuer for dual-confirm UI. */
  onPairingConfirmPinRead: (pin: string) => Promise<Friend | null>;
  /** Joiner: explicit dual-confirm tap (`confirmRedeemerNfcPinPairOffer`) after phase 1 scan. */
  onPairingConfirmRedeemerDualConfirm: (pin: string) => Promise<boolean>;
  /** Joiner: after redeemer confirm, wait until issuer finalizes friendship. */
  onPairingAwaitIssuerFinalConfirm: (pin: string) => Promise<Friend | null>;
  /** Issuer: explicit confirm that finalizes friendship after scanner confirmed. */
  onPairingFinalizePinOffer: (pin: string) => Promise<Friend | null>;
  /** Requires precise (fine/full) foreground location; re-prompts if approximate-only. */
  onEnsurePairingLocationPermission: (options?: { showAlerts?: boolean }) => Promise<boolean>;
  /** Requires camera for Read QR; re-prompts when denied. */
  onEnsurePairingCameraPermission: (options?: { showAlerts?: boolean }) => Promise<boolean>;
  /** Issuer cancel: release server PIN reservation (issuer anytime; scanner too after phase 1). */
  onPairingCancelPinOffer: (pin: string) => Promise<void>;
  /** Poll while on dual-confirm UI; false when session was deleted (other user cancelled). */
  onPairingPollOfferStillPresent: (pin: string) => Promise<boolean>;
  /** Server pairing phase for idle-timeout (neither side tapped Confirm yet). */
  onPairingGetOfferStatus: (
    pin: string
  ) => Promise<"pending" | "awaiting_redeemer_confirm" | "awaiting_issuer_confirm" | "joined" | "gone">;
  /** Parent registers this to cancel PIN / background work when leaving the screen (Android back, etc.). */
  onRegisterPairingAbort?: (abort: () => void) => void;
}) {
  const {
    theme,
    isDarkMode,
    safeTop,
    bottomInset,
    navHighlight,
    navBadges,
    styles,
    onOpenCreatePost,
    onOpenSettings,
    onOpenMyProfile,
    onOpenFriendsList,
    onOpenAddFriend,
    onOpenHomeChats,
    onOpenHomeFeed,
    onLogout,
    pairingBackendReady,
    onPairingRegisterPinWithRetry,
    onPairingAwaitPinRedeem,
    onPairingConfirmPinRead,
    onPairingConfirmRedeemerDualConfirm,
    onPairingAwaitIssuerFinalConfirm,
    onPairingFinalizePinOffer,
    onEnsurePairingLocationPermission,
    onEnsurePairingCameraPermission,
    onPairingCancelPinOffer,
    onPairingPollOfferStillPresent,
    onPairingGetOfferStatus,
    onRegisterPairingAbort,
  } = props;
  const iconColor = theme.accent;
  const textColor = theme.text;
  const mutedColor = theme.subtleText;
  /** Dark mode: light neutral rail on black; light mode uses muted accent wash. */
  const switchTrackMutedHex = isDarkMode ? "rgba(255,255,255,0.32)" : `${theme.accent}1F`;
  const switchTrackMuted = useMemo(
    () => ({ false: switchTrackMutedHex, true: switchTrackMutedHex }),
    [switchTrackMutedHex]
  );
  const { height: windowHeight, width: screenWidth } = useWindowDimensions();
  type Phase =
    | "idle"
    | "handshake"
    | "authenticating"
    | "awaitPairing"
    | "confirmFriend"
    | "profileOverlay"
    | "profileSolo";
  const [phase, setPhase] = useState<Phase>("idle");
  /** Friend shown in the post-ritual profile. */
  const [displayedProfileId, setDisplayedProfileId] = useState<string | null>(null);
  const [displayedProfileFriend, setDisplayedProfileFriend] = useState<Friend | null>(null);
  /** True while `ADD_FRIEND_PAIRING_RETRY_COOLDOWN_MS` runs after an aborted hold (drives muted button). */
  const [pairingHoldCooldown, setPairingHoldCooldown] = useState(false);
  const [inPersonPairingRole, setInPersonPairingRole] = useState<InPersonPairingRole>("share");
  const [pairingStatusLabel, setPairingStatusLabel] = useState("");
  const [pendingVerifiedFriend, setPendingVerifiedFriend] = useState<Friend | null>(null);
  const [pendingVerifiedPin, setPendingVerifiedPin] = useState<string | null>(null);
  const [pendingVerifiedSource, setPendingVerifiedSource] = useState<"share" | "join" | null>(null);
  const [activeQrPayload, setActiveQrPayload] = useState<string | null>(null);
  const [qrPreparing, setQrPreparing] = useState(false);
  const [presenterSessionBusy, setPresenterSessionBusy] = useState(false);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const [scannerBusy, setScannerBusy] = useState(false);
  const scannerBusyRef = useRef(false);
  /** After a valid read: keep camera frame visible, stop further barcode events (like a normal QR app). */
  const [qrScanFrozen, setQrScanFrozen] = useState(false);
  const qrScanFrozenRef = useRef(false);
  const [cameraPermission, , refreshCameraPermission] = useCameraPermissions();
  /** Active 4-digit PIN for issuer (never shown in UI); used for cancel + poll. */
  const hostActivePinRef = useRef<string | null>(null);
  const qrHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qrVoidingForScreenshotRef = useRef(false);
  const hostAwaitSessionRef = useRef(0);
  const qrScanAttemptSeqRef = useRef(0);
  /** Ignores stale scan async completions when the camera fires duplicate QR reads. */
  const qrScanGenerationRef = useRef(0);
  const pressStartRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const pairingHoldCooldownUntilRef = useRef(0);
  const pairingHoldCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ritualDoneRef = useRef(false);
  const pairingHandshakeCancelledRef = useRef(false);
  const lastSuccessfulHandshakeRoleRef = useRef<"initiator" | "responder" | null>(null);

  useEffect(() => {
    return () => {
      if (pairingHoldCooldownTimerRef.current != null) {
        clearTimeout(pairingHoldCooldownTimerRef.current);
        pairingHoldCooldownTimerRef.current = null;
      }
      if (qrHideTimerRef.current != null) {
        clearTimeout(qrHideTimerRef.current);
        qrHideTimerRef.current = null;
      }
    };
  }, []);

  /** Warm-check precise location when Add Friend opens (no alert until Show/Read QR). */
  useEffect(() => {
    void (async () => {
      const ok = await onEnsurePairingLocationPermission({ showAlerts: false });
      if (!ok) {
        setPairingStatusLabel(
          "Turn on Precise location in your phone settings before Show QR or Read QR."
        );
      }
    })();
  }, [onEnsurePairingLocationPermission]);

  /** Warm-check camera for Read QR (no alert until user switches to scan). */
  useEffect(() => {
    void (async () => {
      const ok = await onEnsurePairingCameraPermission({ showAlerts: false });
      await refreshCameraPermission();
      if (!ok) {
        setPairingStatusLabel((prev) =>
          prev.trim()
            ? prev
            : "Allow camera access before Read QR, or tap Try again on the scanner."
        );
      }
    })();
  }, [onEnsurePairingCameraPermission, refreshCameraPermission]);

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const dimOpacity = useRef(new Animated.Value(0)).current;
  const friendAddedOpacity = useRef(new Animated.Value(0)).current;

  const isHandshakeFailureCelebration = displayedProfileId === ADD_FRIEND_HANDSHAKE_FAILURE_ID;

  const profileFriend = useMemo(
    () => (isHandshakeFailureCelebration ? null : displayedProfileFriend),
    [displayedProfileFriend, isHandshakeFailureCelebration]
  );

  const buttonSize = Math.min(screenWidth - 20, screenWidth * 0.94);
  const outlineButtonStyle = {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.divider,
    backgroundColor: theme.background,
  } as const;

  const stopHoldLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pressStartRef.current = null;
  }, []);

  const runAfterHandshake = useCallback((opts?: { success?: boolean }) => {
    if (opts?.success) {
      // Celebratory haptic — a short happy "ta-da" buzz pattern. iOS/Android both
      // accept an alternating [wait, vibrate, …] pattern in ms.
      try {
        Vibration.vibrate([0, 45, 70, 45, 70, 120]);
      } catch {
        // ignore — vibration is best-effort
      }
      void (async () => {
        try {
          // Allow the chime to sound even when the ringer is on silent (iOS).
          await Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            shouldDuckAndroid: true,
          }).catch(() => undefined);
          const { sound } = await Audio.Sound.createAsync(
            {
              uri: "https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3",
            },
            { shouldPlay: true, volume: 0.7 }
          );
          sound.setOnPlaybackStatusUpdate((status) => {
            if (status.isLoaded && status.didJustFinish) {
              void sound.unloadAsync();
            }
          });
        } catch {
          // ignore
        }
      })();
    }

    setPhase("profileOverlay");
    dimOpacity.setValue(ADD_FRIEND_OVERLAY_DIM_START);
    friendAddedOpacity.setValue(1);
    Animated.parallel([
      Animated.timing(dimOpacity, {
        toValue: 0,
        duration: ADD_FRIEND_PROFILE_FADE_MS,
        useNativeDriver: true,
      }),
      Animated.timing(friendAddedOpacity, {
        toValue: 0,
        duration: ADD_FRIEND_PROFILE_FADE_MS,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setPhase("profileSolo");
      setTimeout(() => {
        ritualDoneRef.current = false;
        setDisplayedProfileId(null);
        setDisplayedProfileFriend(null);
        setPhase("idle");
      }, ADD_FRIEND_PROFILE_SOLO_MS);
    });
  }, [dimOpacity, friendAddedOpacity]);

  const summarizeHandshakeError = useCallback((err: unknown): string => {
    const raw = err instanceof Error ? err.message : String(err ?? "");
    const lower = raw.toLowerCase();
    if (lower.includes("unauthenticated")) return "auth-required";
    if (lower.includes("permission-denied")) return "permission-denied";
    if (lower.includes("deadline-exceeded") || lower.includes("expired")) return "session-expired";
    if (lower.includes("not-found")) return "session-not-found";
    if (lower.includes("failed-precondition")) return "state-conflict";
    if (lower.includes("invalid-argument")) return "invalid-payload";
    return "unknown";
  }, []);

  const clearQrHideTimer = useCallback(() => {
    if (qrHideTimerRef.current != null) {
      clearTimeout(qrHideTimerRef.current);
      qrHideTimerRef.current = null;
    }
  }, []);

  const pendingVerifiedPinRef = useRef(pendingVerifiedPin);
  pendingVerifiedPinRef.current = pendingVerifiedPin;

  const abortPairingSession = useCallback(
    async (opts?: {
      markHandshakeCancelled?: boolean;
      cancelServerOffer?: boolean;
      invalidateQrScan?: boolean;
    }) => {
    const markHandshakeCancelled = opts?.markHandshakeCancelled !== false;
    const cancelServerOffer = opts?.cancelServerOffer !== false;
    const invalidateQrScan = opts?.invalidateQrScan !== false;
    hostAwaitSessionRef.current = 0;
    if (invalidateQrScan) qrScanGenerationRef.current += 1;
    qrScanFrozenRef.current = false;
    setQrScanFrozen(false);
    if (markHandshakeCancelled) pairingHandshakeCancelledRef.current = true;
    clearQrHideTimer();
    setActiveQrPayload(null);
    setQrPreparing(false);
    setPresenterSessionBusy(false);
    setConfirmSubmitting(false);
    scannerBusyRef.current = false;
    setScannerBusy(false);
    const pin = hostActivePinRef.current ?? pendingVerifiedPinRef.current?.trim() ?? "";
    hostActivePinRef.current = null;
    if (cancelServerOffer && pin) await onPairingCancelPinOffer(pin).catch(() => {});
    await cancelInPersonPairingHardware().catch(() => {});
    setPendingVerifiedFriend(null);
    setPendingVerifiedPin(null);
    setPendingVerifiedSource(null);
    ritualDoneRef.current = false;
    setDisplayedProfileId(null);
    setDisplayedProfileFriend(null);
    setPhase("idle");
    setPairingStatusLabel("");
  },
    [clearQrHideTimer, onPairingCancelPinOffer]
  );

  const abortPairingSessionRef = useRef(abortPairingSession);
  abortPairingSessionRef.current = abortPairingSession;

  useEffect(() => {
    onRegisterPairingAbort?.(() => {
      void abortPairingSessionRef.current();
    });
    return () => {
      onRegisterPairingAbort?.(() => {});
    };
  }, [onRegisterPairingAbort]);

  useEffect(() => {
    return () => {
      void abortPairingSessionRef.current();
    };
  }, []);

  const retryPairingCameraPermission = useCallback(async (): Promise<boolean> => {
    const ok = await onEnsurePairingCameraPermission({ showAlerts: true });
    await refreshCameraPermission();
    if (!ok) {
      setPairingStatusLabel(
        "Camera access is required to scan QR codes. Allow camera when prompted, or enable it in your phone settings for Erdos."
      );
    } else {
      setPairingStatusLabel("Ready to scan.");
    }
    return ok;
  }, [onEnsurePairingCameraPermission, refreshCameraPermission]);

  const voidActiveQrFromScreenshot = useCallback(async () => {
    if (!activeQrPayload || qrVoidingForScreenshotRef.current) return;
    qrVoidingForScreenshotRef.current = true;
    try {
      const pin = hostActivePinRef.current;
      hostActivePinRef.current = null;
      setActiveQrPayload(null);
      clearQrHideTimer();
      if (pin) await onPairingCancelPinOffer(pin).catch(() => {});
      setPairingStatusLabel("Screenshot detected, QR code voided.");
      Alert.alert("Screenshot detected, QR code voided");
      logAppEvent("pairing.qr.screenshot_voided", { hadPin: !!pin });
    } finally {
      qrVoidingForScreenshotRef.current = false;
    }
  }, [activeQrPayload, clearQrHideTimer, onPairingCancelPinOffer]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = ScreenCapture.addScreenshotListener(() => {
      void voidActiveQrFromScreenshot();
    });
    return () => {
      sub.remove();
    };
  }, [voidActiveQrFromScreenshot]);

  const parseQrPayloadOffer = useCallback((raw: string): string | null => {
    return parseQrPairOfferPlaintext(raw);
  }, []);

  const buildQrDisplayPayload = useCallback((offerCode: string): string => {
    const encoded = encodeQrPairOfferPayload(offerCode);
    if (encoded) return encoded;
    const t = offerCode.trim().replace(/\s+/g, "").toLowerCase();
    if (/^\d{4}$/.test(t)) return `AFQR1|${t}`;
    if (/^[0-9a-f]{32}$/i.test(t)) return `AFQR2|${t}`;
    return "";
  }, []);

  const qrPayloadFingerprint = useCallback((raw: string): string => {
    const t = raw.trim();
    if (!t) return "empty";
    let checksum = 0;
    for (let i = 0; i < t.length; i += 1) checksum = (checksum + t.charCodeAt(i)) % 9973;
    return `${t.length}:${checksum}`;
  }, []);

  const beginPresenterQrOffer = useCallback(async () => {
    pairingHandshakeCancelledRef.current = false;
    if (!pairingBackendReady) {
      setPairingStatusLabel("Account session is not ready yet. Wait a few seconds after sign-in, then try again.");
      return;
    }
    const hasLocation = await onEnsurePairingLocationPermission();
    if (!hasLocation) {
      setPairingStatusLabel(
        "Precise location is required. Enable Precise location for Erdos in your phone settings, then try again."
      );
      return;
    }

    const sessionId = Date.now();
    hostAwaitSessionRef.current = sessionId;
    const stale = hostActivePinRef.current;
    hostActivePinRef.current = null;
    if (stale) await onPairingCancelPinOffer(stale).catch(() => {});
    clearQrHideTimer();
    setActiveQrPayload(null);

    setQrPreparing(true);
    setPairingStatusLabel("QR: preparing…");
    let pin: string | null = null;
    try {
      pin = await onPairingRegisterPinWithRetry();
    } finally {
      setQrPreparing(false);
    }
    if (hostAwaitSessionRef.current !== sessionId) {
      setPairingStatusLabel("QR: cancelled.");
      return;
    }
    if (!pin) {
      setPairingStatusLabel("QR: could not reserve a code. Check network and try again.");
      return;
    }

    const qrPayload = buildQrDisplayPayload(pin);
    if (!qrPayload) {
      setPairingStatusLabel("QR: invalid pairing code from server. Deploy latest Cloud Functions and try again.");
      return;
    }

    hostActivePinRef.current = pin;
    setPresenterSessionBusy(true);
    setActiveQrPayload(qrPayload);
    setPairingStatusLabel("QR visible. Ask your friend to scan now.");
    qrHideTimerRef.current = setTimeout(() => {
      setActiveQrPayload(null);
      setPairingStatusLabel("QR hidden. Waiting for your friend to scan…");
      qrHideTimerRef.current = null;
    }, ADD_FRIEND_QR_VISIBLE_MS);

    void (async () => {
      const friend = await onPairingAwaitPinRedeem(pin);
      if (hostAwaitSessionRef.current !== sessionId) return;
      if (friend) {
        setActiveQrPayload(null);
        clearQrHideTimer();
        setPresenterSessionBusy(false);
        hostActivePinRef.current = null;
        setPendingVerifiedFriend(friend);
        setPendingVerifiedPin(pin);
        setPendingVerifiedSource("share");
        setPairingStatusLabel("QR verified. Confirm this friend.");
        setPhase("confirmFriend");
        return;
      }
      setPairingStatusLabel("Still waiting for a scan, or tap Show QR Code again.");
      /* Keep hostActivePinRef so flipping to Read QR can call cancelNfcPinPairOffer. */
      setPresenterSessionBusy(false);
    })();
  }, [
    pairingBackendReady,
    onPairingCancelPinOffer,
    clearQrHideTimer,
    onPairingRegisterPinWithRetry,
    onPairingAwaitPinRedeem,
    onEnsurePairingLocationPermission,
    buildQrDisplayPayload,
  ]);

  const onPressShowQrCode = useCallback(() => {
    void beginPresenterQrOffer().catch((err) => {
      setQrPreparing(false);
      const reason = summarizeHandshakeError(err);
      const detail = err instanceof Error ? err.message.trim() : String(err ?? "");
      setPairingStatusLabel(detail && detail.length < 220 ? `QR: ${detail}` : `QR: error (${reason}).`);
      setActiveQrPayload(null);
    });
  }, [beginPresenterQrOffer, summarizeHandshakeError]);

  const onQrScanned = useCallback(
    (result: BarcodeScanningResult) => {
      const payloadFingerprint = qrPayloadFingerprint(result.data ?? "");
      logAppEvent("pairing.qr.scan.callback", {
        phase,
        role: inPersonPairingRole,
        scannerBusyRef: scannerBusyRef.current,
        scannerBusyState: scannerBusy,
        payloadFingerprint,
      });
      if (inPersonPairingRole !== "join") {
        logAppEvent("pairing.qr.scan.ignored", { reason: "wrong_role", payloadFingerprint, phase });
        return;
      }
      if (scannerBusyRef.current || qrScanFrozenRef.current) {
        logAppEvent("pairing.qr.scan.ignored", {
          reason: qrScanFrozenRef.current ? "frozen" : "busy_lock",
          payloadFingerprint,
          phase,
        });
        return;
      }
      if (phase !== "idle") {
        logAppEvent("pairing.qr.scan.ignored", { reason: "wrong_phase", payloadFingerprint, phase });
        return;
      }
      scannerBusyRef.current = true;
      pairingHandshakeCancelledRef.current = false;
      qrScanAttemptSeqRef.current += 1;
      const scanGeneration = qrScanGenerationRef.current + 1;
      qrScanGenerationRef.current = scanGeneration;
      const scanAttemptId = `scan-${Date.now()}-${qrScanAttemptSeqRef.current}`;
      logAppEvent("pairing.qr.scan.lock_acquired", { scanAttemptId, payloadFingerprint });
      const pin = parseQrPayloadOffer(result.data ?? "");
      if (!pin) {
        logAppEvent("pairing.qr.scan.ignored", { reason: "invalid_payload", scanAttemptId, payloadFingerprint });
        setPairingStatusLabel("QR scan: invalid code. Ask your friend to tap Show QR Code and try again.");
        scannerBusyRef.current = false;
        logAppEvent("pairing.qr.scan.lock_released", { scanAttemptId, reason: "invalid_payload" });
        return;
      }
      scannerBusyRef.current = true;
      setScannerBusy(true);
      setPairingStatusLabel("");
      setPhase("authenticating");
      logAppEvent("pairing.qr.scan.ui_processing", { scanAttemptId });
      void (async () => {
        const isStaleScan = () => qrScanGenerationRef.current !== scanGeneration;
        const releaseScanLock = () => {
          scannerBusyRef.current = false;
          setScannerBusy(false);
        };
        const revertScanUiUnlessConfirmed = () => {
          setPhase((current) => (current === "confirmFriend" ? current : "idle"));
          releaseScanLock();
        };
        try {
          const hasCamera = await onEnsurePairingCameraPermission();
          await refreshCameraPermission();
          if (!hasCamera) {
            setPairingStatusLabel(
              "Camera access is required. Allow camera when prompted, or enable it in your phone settings for Erdos."
            );
            revertScanUiUnlessConfirmed();
            logAppEvent("pairing.qr.scan.camera_denied", { scanAttemptId });
            return;
          }
          const hasPreciseLocation = await onEnsurePairingLocationPermission();
          if (!hasPreciseLocation) {
            setPairingStatusLabel(
              "Precise location is required. Enable Precise location for Erdos in your phone settings, then scan again."
            );
            revertScanUiUnlessConfirmed();
            logAppEvent("pairing.qr.scan.precise_location_denied", { scanAttemptId });
            return;
          }
          logAppEvent("pairing.qr.scan.proximity.start", { scanAttemptId });
          const scannedFriend = await onPairingConfirmPinRead(pin);
          if (isStaleScan() || pairingHandshakeCancelledRef.current) {
            logAppEvent("pairing.qr.scan.cancelled", { scanAttemptId, stale: isStaleScan() });
            setPhase((current) => (current === "confirmFriend" ? current : "idle"));
            releaseScanLock();
            return;
          }
          if (!scannedFriend) {
            setPairingStatusLabel("Add friend failed");
            revertScanUiUnlessConfirmed();
            logAppEvent("pairing.qr.scan.proximity.miss", { scanAttemptId });
            return;
          }
          logAppEvent("pairing.qr.scan.proximity.ok", { scanAttemptId });
          setPendingVerifiedFriend(scannedFriend);
          setPendingVerifiedPin(pin);
          setPendingVerifiedSource("join");
          setPairingStatusLabel("");
          setPhase("confirmFriend");
          releaseScanLock();
        } catch (err) {
          if (isStaleScan()) {
            setPhase((current) => (current === "confirmFriend" ? current : "idle"));
            releaseScanLock();
            return;
          }
          const reason = summarizeHandshakeError(err);
          const detail = err instanceof Error ? err.message.trim() : String(err ?? "");
          setPairingStatusLabel(
            detail && detail.length < 180 ? `Add friend failed: ${detail}` : `Add friend failed (${reason}).`
          );
          revertScanUiUnlessConfirmed();
          logAppEvent("pairing.qr.scan.failed", { scanAttemptId, stage: "exception", reason });
        } finally {
          logAppEvent("pairing.qr.scan.lock_released", { scanAttemptId, stale: isStaleScan() });
        }
      })();
    },
    [
      inPersonPairingRole,
      scannerBusy,
      phase,
      parseQrPayloadOffer,
      qrPayloadFingerprint,
      onPairingConfirmPinRead,
      onEnsurePairingCameraPermission,
      onEnsurePairingLocationPermission,
      refreshCameraPermission,
      summarizeHandshakeError,
    ]
  );

  const confirmVerifiedFriend = useCallback(async () => {
    if (!pendingVerifiedFriend || !pendingVerifiedSource) return;
    if (pendingVerifiedSource === "share") {
      const pin = pendingVerifiedPin?.trim() ?? "";
      if (!pin) {
        setPairingStatusLabel("Add friend failed");
        setPendingVerifiedFriend(null);
        setPendingVerifiedSource(null);
        setPhase("idle");
        return;
      }
      setConfirmSubmitting(true);
      setPairingStatusLabel("Confirming…");
      try {
        setPairingStatusLabel("Waiting for your friend to confirm…");
        const friend = await onPairingFinalizePinOffer(pin);
        if (!friend) {
          setPairingStatusLabel("Add friend failed");
          setPhase("idle");
          return;
        }
        setDisplayedProfileId(friend.id);
        setDisplayedProfileFriend(friend);
        setPendingVerifiedFriend(null);
        setPendingVerifiedPin(null);
        setPendingVerifiedSource(null);
        setPairingStatusLabel("Pairing: friend added.");
        runAfterHandshake({ success: true });
      } catch (err) {
        const reason = summarizeHandshakeError(err);
        const detail = err instanceof Error ? err.message.trim() : String(err ?? "");
        setPairingStatusLabel(
          detail && detail.length < 180 ? `Add friend failed: ${detail}` : `Add friend failed (${reason}).`
        );
        logAppError("pairing.confirm.finalize", err, { reason });
        setPhase("idle");
      } finally {
        setConfirmSubmitting(false);
      }
      return;
    }
    const pin = pendingVerifiedPin?.trim() ?? "";
    if (!pin) {
      setPairingStatusLabel("QR scan: missing verification code. Scan again.");
      setPendingVerifiedFriend(null);
      setPendingVerifiedSource(null);
      setPhase("idle");
      return;
    }
    setConfirmSubmitting(true);
    setPairingStatusLabel("Confirming…");
    try {
      logAppEvent("pairing.qr.scan.confirm.start", { pinFingerprint: `${pin.length}` });
      const redeemerOk = await onPairingConfirmRedeemerDualConfirm(pin);
      if (!redeemerOk) {
        setPairingStatusLabel("Add friend failed");
        setPhase("idle");
        return;
      }
      setPairingStatusLabel("Waiting for your friend to confirm…");
      const friend = await onPairingAwaitIssuerFinalConfirm(pin);
      if (!friend) {
        setPairingStatusLabel("Add friend failed");
        setPhase("idle");
        return;
      }
      setDisplayedProfileId(friend.id);
      setDisplayedProfileFriend(friend);
      setPairingStatusLabel("Pairing: friend added.");
      logAppEvent("pairing.qr.scan.confirm.ok", { friendId: friend.id });
      setPendingVerifiedFriend(null);
      setPendingVerifiedPin(null);
      setPendingVerifiedSource(null);
      runAfterHandshake({ success: true });
    } catch (err) {
      const reason = summarizeHandshakeError(err);
      const detail = err instanceof Error ? err.message.trim() : String(err ?? "");
      setPairingStatusLabel(
        detail && detail.length < 180 ? `Add friend failed: ${detail}` : `Add friend failed (${reason}).`
      );
      setPhase("idle");
    } finally {
      setConfirmSubmitting(false);
    }
  }, [
    onPairingConfirmRedeemerDualConfirm,
    onPairingAwaitIssuerFinalConfirm,
    onPairingFinalizePinOffer,
    pendingVerifiedFriend,
    pendingVerifiedPin,
    pendingVerifiedSource,
    runAfterHandshake,
    summarizeHandshakeError,
  ]);

  /** Neither side tapped Confirm/Cancel: auto-cancel after 45s if server still awaiting first confirm. */
  useEffect(() => {
    if (phase !== "confirmFriend") return;
    if (confirmSubmitting) return;
    const pin = pendingVerifiedPin?.trim() ?? "";
    if (!pin) return;

    const timer = setTimeout(() => {
      void (async () => {
        const activePin = pendingVerifiedPinRef.current?.trim() ?? "";
        if (!activePin) return;
        try {
          const status = await onPairingGetOfferStatus(activePin);
          if (status !== "awaiting_redeemer_confirm") return;
          await onPairingCancelPinOffer(activePin).catch(() => {});
          setPendingVerifiedFriend(null);
          setPendingVerifiedPin(null);
          setPendingVerifiedSource(null);
          setConfirmSubmitting(false);
          setPairingStatusLabel("Add friend timed out");
          setPhase("idle");
        } catch {
          /* ignore transient status errors */
        }
      })();
    }, ADD_FRIEND_PAIRING_SESSION_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [phase, confirmSubmitting, pendingVerifiedPin, onPairingGetOfferStatus, onPairingCancelPinOffer]);

  /** Issuer only: detect remote cancel. Joiner must not poll — a false "gone" races host finalize. */
  useEffect(() => {
    if (phase !== "confirmFriend") return;
    if (pendingVerifiedSource !== "share") return;
    if (confirmSubmitting) return;
    const pin = pendingVerifiedPin?.trim() ?? "";
    if (!pin) return;
    const tick = async () => {
      try {
        const ok = await onPairingPollOfferStillPresent(pin);
        if (!ok) {
          setPendingVerifiedFriend(null);
          setPendingVerifiedPin(null);
          setPendingVerifiedSource(null);
          setPairingStatusLabel("Add friend cancelled");
          setPhase("idle");
        }
      } catch {
        /* ignore transient poll errors */
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 2800);
    return () => clearInterval(id);
  }, [phase, pendingVerifiedPin, pendingVerifiedSource, confirmSubmitting, onPairingPollOfferStillPresent]);

  const cancelVerifiedFriend = useCallback(() => {
    hostAwaitSessionRef.current = 0;
    const pin = pendingVerifiedPin?.trim() ?? "";
    if (pin) void onPairingCancelPinOffer(pin).catch(() => {});
    setPendingVerifiedFriend(null);
    setPendingVerifiedPin(null);
    setPendingVerifiedSource(null);
    setConfirmSubmitting(false);
    setPairingStatusLabel("Add friend cancelled");
    setPhase("idle");
  }, [onPairingCancelPinOffer, pendingVerifiedPin]);

  const runInPersonPairingThenCelebrate = useCallback(
    async () => {
      const nfcAttemptId = `nfc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      pairingHandshakeCancelledRef.current = false;
      logAppEvent("pairing.in_person.start", { role: inPersonPairingRole });
      logAppEvent("pairing.nfc.pin.attempt.start", { nfcAttemptId, role: inPersonPairingRole });
      if (Platform.OS === "web") {
        logAppEvent("pairing.nfc.pin.attempt.failed", { nfcAttemptId, stage: "unsupported_web" });
        setPairingStatusLabel("In-person pairing is not available on web.");
        setDisplayedProfileId(ADD_FRIEND_HANDSHAKE_FAILURE_ID);
        setDisplayedProfileFriend(null);
        runAfterHandshake();
        return;
      }

      if (!pairingBackendReady) {
        logAppEvent("pairing.nfc.pin.attempt.failed", { nfcAttemptId, stage: "backend_not_ready" });
        setPairingStatusLabel(
          "Account session is not ready yet. Wait a few seconds after sign-in, then hold Add Friend+ again."
        );
        setDisplayedProfileId(ADD_FRIEND_HANDSHAKE_FAILURE_ID);
        setDisplayedProfileFriend(null);
        runAfterHandshake();
        return;
      }

      if (inPersonPairingRole === "share") {
        setPhase("awaitPairing");
        setPairingStatusLabel("Pairing: preparing…");
        hostActivePinRef.current = null;
        try {
          logAppEvent("pairing.nfc.pin.register.start", { nfcAttemptId });
          const pin = await onPairingRegisterPinWithRetry();
          logAppEvent("pairing.nfc.pin.register.result", { nfcAttemptId, ok: !!pin });
          if (pairingHandshakeCancelledRef.current) {
            logAppEvent("pairing.nfc.pin.attempt.cancelled", { nfcAttemptId, stage: "after_register" });
            ritualDoneRef.current = false;
            setPhase("idle");
            return;
          }
          if (!pin) {
            setPairingStatusLabel("Pairing: could not reserve a session. Check network and try again.");
            setDisplayedProfileId(ADD_FRIEND_HANDSHAKE_FAILURE_ID);
            setDisplayedProfileFriend(null);
            runAfterHandshake();
            return;
          }
          hostActivePinRef.current = pin;
          setPairingStatusLabel(
            "Ask your friend to choose Join and hold their phone. Then hold both phones together while this phone sends the pairing signal."
          );
          const ndefPayload = encodeNfcPairOfferNdefPayload(pin);
          logAppEvent("pairing.nfc.pin.write.start", {
            nfcAttemptId,
            payloadLen: ndefPayload.length,
          });
          const written = await writeAddFriendNdefPayload(ndefPayload, ADD_FRIEND_PAIRING_SESSION_TIMEOUT_MS);
          logAppEvent("pairing.nfc.pin.write.result", { nfcAttemptId, written });
          if (pairingHandshakeCancelledRef.current) {
            logAppEvent("pairing.nfc.pin.attempt.cancelled", { nfcAttemptId, stage: "after_write" });
            await onPairingCancelPinOffer(pin).catch(() => {});
            hostActivePinRef.current = null;
            ritualDoneRef.current = false;
            setPhase("idle");
            return;
          }
          if (!written) {
            await onPairingCancelPinOffer(pin).catch(() => {});
            hostActivePinRef.current = null;
            setPairingStatusLabel("Pairing: NFC send failed. Turn NFC on, try again, and keep phones close.");
            setDisplayedProfileId(ADD_FRIEND_HANDSHAKE_FAILURE_ID);
            setDisplayedProfileFriend(null);
            runAfterHandshake();
            return;
          }
          setPairingStatusLabel("Pairing: waiting for your friend to confirm…");
          logAppEvent("pairing.nfc.pin.await_redeem.start", { nfcAttemptId });
          const friend = await onPairingAwaitPinRedeem(pin);
          logAppEvent("pairing.nfc.pin.await_redeem.result", {
            nfcAttemptId,
            accepted: !!friend,
            friendId: friend?.id ?? null,
          });
          if (pairingHandshakeCancelledRef.current) {
            logAppEvent("pairing.nfc.pin.attempt.cancelled", { nfcAttemptId, stage: "after_await_redeem" });
            await onPairingCancelPinOffer(pin).catch(() => {});
            ritualDoneRef.current = false;
            setPhase("idle");
            hostActivePinRef.current = null;
            return;
          }
          hostActivePinRef.current = null;
          if (friend) {
            logAppEvent("pairing.in_person.accepted", { friendId: friend.id });
            logAppEvent("pairing.nfc.pin.attempt.ok", { nfcAttemptId, friendId: friend.id });
            setPendingVerifiedFriend(friend);
            setPendingVerifiedPin(pin);
            setPendingVerifiedSource("share");
            setPairingStatusLabel("QR verified. Confirm this friend.");
            setPhase("confirmFriend");
            lastSuccessfulHandshakeRoleRef.current = "initiator";
            return;
          } else {
            logAppEvent("pairing.in_person.failed", { reason: "share_timeout" });
            logAppEvent("pairing.nfc.pin.attempt.failed", { nfcAttemptId, stage: "share_timeout" });
            await onPairingCancelPinOffer(pin).catch(() => {});
            setPairingStatusLabel("Add friend failed");
            setDisplayedProfileId(ADD_FRIEND_HANDSHAKE_FAILURE_ID);
            setDisplayedProfileFriend(null);
          }
        } catch (err) {
          const reason = summarizeHandshakeError(err);
          logAppError("pairing.in_person.share", err, { reason });
          logAppEvent("pairing.nfc.pin.attempt.failed", { nfcAttemptId, stage: "share_exception", reason });
          const detail = err instanceof Error ? err.message.trim() : String(err ?? "");
          setPairingStatusLabel(detail && detail.length < 240 ? `Add friend failed: ${detail}` : `Add friend failed (${reason}).`);
          setDisplayedProfileId(ADD_FRIEND_HANDSHAKE_FAILURE_ID);
          setDisplayedProfileFriend(null);
          const p = hostActivePinRef.current;
          hostActivePinRef.current = null;
          if (p) await onPairingCancelPinOffer(p).catch(() => {});
        }
        runAfterHandshake();
        return;
      }

      /* join */
      setPhase("awaitPairing");
      setPairingStatusLabel("Pairing: hold near your friend’s phone (they choose Share first)…");
      try {
        logAppEvent("pairing.nfc.pin.read.start", { nfcAttemptId });
        const plain = await readAddFriendNdefPayload(ADD_FRIEND_PAIRING_SESSION_TIMEOUT_MS, "receive");
        logAppEvent("pairing.nfc.pin.read.result", {
          nfcAttemptId,
          hasPayload: !!plain,
          payloadLen: plain?.length ?? 0,
        });
        if (pairingHandshakeCancelledRef.current) {
          logAppEvent("pairing.nfc.pin.attempt.cancelled", { nfcAttemptId, stage: "after_read" });
          ritualDoneRef.current = false;
          setPhase("idle");
          return;
        }
        const pin = plain ? parseNfcPairOfferPlaintext(plain) : null;
        if (!pin) {
          setPairingStatusLabel("Pairing: could not read a valid pairing code. Try Join again, Receive side first.");
          setDisplayedProfileId(ADD_FRIEND_HANDSHAKE_FAILURE_ID);
          setDisplayedProfileFriend(null);
          runAfterHandshake();
          return;
        }
        setPairingStatusLabel("Pairing: confirming…");
        logAppEvent("pairing.nfc.pin.confirm.start", { nfcAttemptId });
        const friend = await onPairingConfirmPinRead(pin);
        logAppEvent("pairing.nfc.pin.confirm.result", {
          nfcAttemptId,
          accepted: !!friend,
          friendId: friend?.id ?? null,
        });
        if (pairingHandshakeCancelledRef.current) {
          logAppEvent("pairing.nfc.pin.attempt.cancelled", { nfcAttemptId, stage: "after_confirm" });
          ritualDoneRef.current = false;
          setPhase("idle");
          return;
        }
        if (friend) {
          logAppEvent("pairing.in_person.join.accepted", { friendId: friend.id });
          logAppEvent("pairing.nfc.pin.attempt.ok", { nfcAttemptId, friendId: friend.id });
          setPendingVerifiedFriend(friend);
          setPendingVerifiedPin(pin);
          setPendingVerifiedSource("join");
          setPairingStatusLabel("Verified. Confirm this friend.");
          setPhase("confirmFriend");
          lastSuccessfulHandshakeRoleRef.current = "responder";
          ritualDoneRef.current = false;
          return;
        } else {
          logAppEvent("pairing.in_person.join.failed", { reason: "rejected" });
          logAppEvent("pairing.nfc.pin.attempt.failed", { nfcAttemptId, stage: "join_rejected" });
          setDisplayedProfileId(ADD_FRIEND_HANDSHAKE_FAILURE_ID);
          setDisplayedProfileFriend(null);
          runAfterHandshake();
        }
      } catch (err) {
        const reason = summarizeHandshakeError(err);
        logAppError("pairing.in_person.join", err, { reason });
        logAppEvent("pairing.nfc.pin.attempt.failed", { nfcAttemptId, stage: "join_exception", reason });
        setPairingStatusLabel(`Pairing: join failed (${reason}).`);
        setDisplayedProfileId(ADD_FRIEND_HANDSHAKE_FAILURE_ID);
        setDisplayedProfileFriend(null);
        runAfterHandshake();
      }
    },
    [
      inPersonPairingRole,
      pairingBackendReady,
      onPairingRegisterPinWithRetry,
      onPairingAwaitPinRedeem,
      onPairingConfirmPinRead,
      onPairingCancelPinOffer,
      runAfterHandshake,
      summarizeHandshakeError,
    ]
  );

  const tickHold = useCallback(() => {
    const start = pressStartRef.current;
    if (start == null) return;
    const elapsed = Date.now() - start;
    const local = Math.min(1, elapsed / ADD_FRIEND_HOLD_MS);
    if (local >= 1) {
      if (ritualDoneRef.current) return;
      ritualDoneRef.current = true;
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      pressStartRef.current = null;
      if (Platform.OS === "android") {
        Vibration.vibrate(60);
      } else {
        Vibration.vibrate();
      }
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 7,
        useNativeDriver: true,
      }).start();
      setPhase("handshake");
      setTimeout(() => {
        if (Platform.OS === "web") {
          setDisplayedProfileFriend(null);
          setDisplayedProfileId(ADD_FRIEND_HANDSHAKE_FAILURE_ID);
          runAfterHandshake();
        } else {
          void runInPersonPairingThenCelebrate();
        }
      }, ADD_FRIEND_HANDSHAKE_MS);
      return;
    }
    rafRef.current = requestAnimationFrame(tickHold);
  }, [runAfterHandshake, runInPersonPairingThenCelebrate, scaleAnim]);

  const onPressIn = () => {
    if (phase !== "idle" || ritualDoneRef.current) return;
    if (Date.now() < pairingHoldCooldownUntilRef.current) return;
    Animated.spring(scaleAnim, {
      toValue: 0.94,
      friction: 6,
      useNativeDriver: true,
    }).start();
    pressStartRef.current = Date.now();
    rafRef.current = requestAnimationFrame(tickHold);
  };

  const onPressOut = () => {
    if (phase !== "idle") return;
    const holdHadStarted = pressStartRef.current != null;
    const completedOrPendingRitual = ritualDoneRef.current;
    stopHoldLoop();
    if (!completedOrPendingRitual) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        useNativeDriver: true,
      }).start();
    }
    if (holdHadStarted && !completedOrPendingRitual) {
      if (pairingHoldCooldownTimerRef.current != null) {
        clearTimeout(pairingHoldCooldownTimerRef.current);
        pairingHoldCooldownTimerRef.current = null;
      }
      pairingHoldCooldownUntilRef.current = Date.now() + ADD_FRIEND_PAIRING_RETRY_COOLDOWN_MS;
      setPairingHoldCooldown(true);
      pairingHoldCooldownTimerRef.current = setTimeout(() => {
        pairingHoldCooldownUntilRef.current = 0;
        setPairingHoldCooldown(false);
        pairingHoldCooldownTimerRef.current = null;
      }, ADD_FRIEND_PAIRING_RETRY_COOLDOWN_MS);
    }
  };

  const showProfileLayer = phase === "profileOverlay" || phase === "profileSolo";
  const showDimAndLabel = phase === "profileOverlay";
  const showMainButton = phase === "idle" || phase === "handshake";
  const showAuthenticating = phase === "authenticating";
  const showPairingWait = phase === "awaitPairing";
  /** Do not gate on the QR toggle — host may flip to Read QR while waiting; issuer must still see Confirm. */
  const showFriendConfirm =
    phase === "confirmFriend" &&
    !!pendingVerifiedFriend &&
    (pendingVerifiedSource === "share" || pendingVerifiedSource === "join");
  const cancelPairingHandshake = useCallback(async () => {
    await abortPairingSession();
    setPairingStatusLabel("Pairing: cancelled.");
  }, [abortPairingSession]);

  return (
    <View
      style={[
        styles.addFriendRoot as object,
        { paddingTop: safeTop, paddingBottom: bottomInset, backgroundColor: theme.background },
      ]}
    >
      <View style={{ marginBottom: 10 }}>
        <HomeTopNavBar
          theme={theme}
          styles={styles}
          highlight={navHighlight}
          badges={navBadges}
          onOpenCreatePost={onOpenCreatePost}
          onOpenSettings={onOpenSettings}
          onOpenMyProfile={onOpenMyProfile}
          onOpenFriendsList={onOpenFriendsList}
          onOpenHomeChats={onOpenHomeChats}
          onOpenHomeFeed={onOpenHomeFeed}
          onOpenAddFriend={onOpenAddFriend}
          onLogout={onLogout}
        />
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 14,
          paddingVertical: 8,
          marginBottom: 6,
          gap: 10,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Ionicons
            name="qr-code-outline"
            size={20}
            color={inPersonPairingRole === "share" ? iconColor : mutedColor}
          />
          <Text
            style={{
              color: inPersonPairingRole === "share" ? textColor : mutedColor,
              fontSize: 14,
              fontWeight: "600",
            }}
          >
            Show QR
          </Text>
        </View>
        <Switch
          accessibilityLabel="Add Friend: show QR or read QR"
          value={inPersonPairingRole === "join"}
          onValueChange={(v) => {
            if (phase !== "idle" || qrPreparing || scannerBusy) return;
            if (v) {
              void (async () => {
                const camOk = await onEnsurePairingCameraPermission({ showAlerts: true });
                await refreshCameraPermission();
                const locOk = await onEnsurePairingLocationPermission({ showAlerts: true });
                if (!camOk) {
                  setPairingStatusLabel(
                    "Camera access is required for Read QR. Allow camera when prompted, or enable it in your phone settings for Erdos."
                  );
                  return;
                }
                if (!locOk) {
                  setPairingStatusLabel(
                    "Precise location is required for Read QR. Enable Precise location for Erdos in your phone settings."
                  );
                  return;
                }
                const hadHostPin = !!hostActivePinRef.current;
                if (hadHostPin) {
                  await abortPairingSession();
                }
                pairingHandshakeCancelledRef.current = false;
                setInPersonPairingRole("join");
                setPairingStatusLabel("Ready to scan.");
              })();
              return;
            }
            pairingHandshakeCancelledRef.current = false;
            setInPersonPairingRole("share");
            setPairingStatusLabel("");
          }}
          disabled={phase !== "idle" || qrPreparing || scannerBusy || qrScanFrozen}
          trackColor={switchTrackMuted}
          thumbColor={iconColor}
          ios_backgroundColor={switchTrackMutedHex}
        />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Ionicons
            name="scan-outline"
            size={20}
            color={inPersonPairingRole === "join" ? iconColor : mutedColor}
          />
          <Text
            style={{
              color: inPersonPairingRole === "join" ? textColor : mutedColor,
              fontSize: 14,
              fontWeight: "600",
            }}
          >
            Read QR
          </Text>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        {showProfileLayer && displayedProfileId && (profileFriend || isHandshakeFailureCelebration) ? (
          <View
            style={[
              styles.addFriendProfileFullScreen as object,
              styles.addFriendProfileBleed as object,
              { width: screenWidth, flex: 1, backgroundColor: theme.background },
            ]}
            pointerEvents="none"
          >
            <View
              style={[
                styles.addFriendProfileImageOnlyWrap as object,
                {
                  backgroundColor: theme.background,
                  width: screenWidth,
                  flex: 1,
                  minHeight: 0,
                  position: "relative",
                },
              ]}
            >
              {(() => {
                const safeH = Math.max(1, windowHeight);
                const photoFrameH = Math.min(
                  Math.round(screenWidth * 0.92),
                  Math.round(safeH * 0.56)
                );
                const celebrationTitle = profileFriend
                  ? `You're now friends with\n${profileFriend.displayName}!`
                  : isHandshakeFailureCelebration
                    ? "Handshake failed"
                    : "";
                const soloSubtitle = profileFriend
                  ? profileFriend.displayName
                  : isHandshakeFailureCelebration
                    ? "No friend was added. Use Show QR on one phone and Read QR on the other, then scan again."
                    : "";
                return (
                  <>
                    <View
                      collapsable={false}
                      style={[
                        StyleSheet.absoluteFillObject,
                        styles.addFriendCelebrationBase as object,
                        { backgroundColor: theme.background },
                      ]}
                    >
                      <View style={styles.addFriendCelebrationHeroInner as object}>
                        <View
                          style={[
                            styles.addFriendCelebrationPhotoFrame as object,
                            {
                              height: photoFrameH,
                              backgroundColor: theme.background,
                            },
                          ]}
                        >
                          {profileFriend ? (
                            <Image
                              source={{ uri: profileFriend.profilePictureUrl }}
                              style={{
                                width: "100%",
                                height: photoFrameH,
                              }}
                              resizeMode="cover"
                            />
                          ) : (
                            <View
                              style={{
                                width: "100%",
                                height: photoFrameH,
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Ionicons
                                name="close-circle"
                                size={Math.min(140, photoFrameH * 0.45)}
                                color={theme.danger}
                              />
                            </View>
                          )}
                        </View>
                        <Text
                          style={[
                            styles.addFriendProfileSoloName as object,
                            styles.addFriendCelebrationNameOnAccent as object,
                            { color: mutedColor },
                          ]}
                          numberOfLines={3}
                        >
                          {soloSubtitle}
                        </Text>
                      </View>
                    </View>
                    {showDimAndLabel ? (
                      <>
                        <Animated.View
                          pointerEvents="none"
                          style={[
                            StyleSheet.absoluteFillObject,
                            styles.addFriendCelebrationDim as object,
                            { backgroundColor: "#000000", opacity: dimOpacity },
                          ]}
                        />
                        {profileFriend ? (
                          <Animated.View
                            pointerEvents="none"
                            style={[
                              StyleSheet.absoluteFillObject,
                              styles.addFriendCelebrationLottieWrap as object,
                              { opacity: friendAddedOpacity },
                            ]}
                          >
                            <LottieView
                              source={ADD_FRIEND_CONFETTI_JSON}
                              autoPlay
                              loop={false}
                              resizeMode="cover"
                              style={StyleSheet.absoluteFillObject}
                            />
                          </Animated.View>
                        ) : null}
                        <Animated.View
                          pointerEvents="none"
                          style={[
                            StyleSheet.absoluteFillObject,
                            styles.addFriendCelebrationTitleWrap as object,
                            {
                              justifyContent: "center",
                              alignItems: "center",
                              paddingHorizontal: 20,
                            },
                          ]}
                        >
                          <Animated.Text
                            style={[
                              styles.addFriendNowFriendsTitle as object,
                              {
                                color: profileFriend ? textColor : theme.danger,
                                opacity: friendAddedOpacity,
                              },
                            ]}
                          >
                            {celebrationTitle}
                          </Animated.Text>
                        </Animated.View>
                      </>
                    ) : null}
                  </>
                );
              })()}
            </View>
          </View>
        ) : null}

        {showAuthenticating ? (
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 24,
              backgroundColor: theme.background,
            }}
          >
            <ActivityIndicator size="large" color={iconColor} />
            <Text
              style={{
                marginTop: 18,
                color: textColor,
                fontSize: 18,
                fontWeight: "600",
                textAlign: "center",
              }}
            >
              Authenticating
            </Text>
            <Pressable
              onPress={() => void cancelPairingHandshake()}
              style={{
                marginTop: 28,
                paddingVertical: 12,
                paddingHorizontal: 22,
                ...outlineButtonStyle,
              }}
              accessibilityRole="button"
              accessibilityLabel="Cancel pairing"
            >
              <Text style={{ color: textColor, fontSize: 16, fontWeight: "500" }}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}

        {showPairingWait ? (
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 24,
            }}
          >
            <ActivityIndicator size="large" color={iconColor} />
            <Text
              style={{
                marginTop: 18,
                color: textColor,
                fontSize: 18,
                fontWeight: "600",
                textAlign: "center",
              }}
            >
              Add friend
            </Text>
            <Text
              style={{
                marginTop: 10,
                color: mutedColor,
                fontSize: 13,
                textAlign: "center",
                lineHeight: 19,
              }}
            >
              Keep this screen open while we verify your QR add-friend request.
            </Text>
            {pairingStatusLabel ? (
              <Text
                style={{
                  marginTop: 12,
                  color: textColor,
                  fontSize: 14,
                  textAlign: "center",
                  lineHeight: 20,
                  paddingHorizontal: 8,
                }}
              >
                {pairingStatusLabel}
              </Text>
            ) : null}
            <Pressable
              onPress={() => void cancelPairingHandshake()}
              style={{
                marginTop: 22,
                paddingVertical: 12,
                paddingHorizontal: 22,
                ...outlineButtonStyle,
              }}
              accessibilityRole="button"
              accessibilityLabel="Cancel pairing"
            >
              <Text style={{ color: textColor, fontSize: 16, fontWeight: "500" }}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}

        {showFriendConfirm ? (
          <View
            style={{
              ...StyleSheet.absoluteFillObject,
              zIndex: 6,
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 24,
              gap: 16,
              backgroundColor: theme.background,
            }}
          >
            {confirmSubmitting ? (
              <View
                style={{
                  ...StyleSheet.absoluteFillObject,
                  zIndex: 4,
                  backgroundColor: isDarkMode ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.72)",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                }}
              >
                <ActivityIndicator size="large" color={iconColor} />
                <Text style={{ color: mutedColor, fontSize: 14, textAlign: "center" }}>
                  {pairingStatusLabel || "Finishing add friend…"}
                </Text>
              </View>
            ) : null}
            <View
              style={[
                styles.addFriendCelebrationPhotoFrame as object,
                {
                  height: Math.min(Math.round(screenWidth * 0.92), Math.round(windowHeight * 0.56)),
                  width: "100%",
                  maxWidth: 420,
                  backgroundColor: theme.background,
                },
              ]}
            >
              {pendingVerifiedFriend?.profilePictureUrl ? (
                <Image
                  source={{ uri: pendingVerifiedFriend.profilePictureUrl }}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="cover"
                />
              ) : (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="person-circle-outline" size={96} color={iconColor} />
                </View>
              )}
            </View>
            <Text style={{ color: textColor, fontSize: 22, fontWeight: "700", textAlign: "center" }}>
              {pendingVerifiedFriend?.displayName ?? "Friend"}
            </Text>
            <Text style={{ color: mutedColor, fontSize: 14, textAlign: "center" }}>
              {`Confirm adding ${pendingVerifiedFriend?.displayName?.trim() || "this person"} as friend?`}
            </Text>
            <View style={{ width: "100%", maxWidth: 420, flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={cancelVerifiedFriend}
                disabled={confirmSubmitting}
                style={[
                  outlineButtonStyle,
                  { flex: 1, paddingVertical: 12, alignItems: "center", opacity: confirmSubmitting ? 0.45 : 1 },
                ]}
              >
                <Text style={{ color: textColor, fontSize: 16, fontWeight: "600" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void confirmVerifiedFriend()}
                disabled={confirmSubmitting}
                style={[styles.primaryButton as object, { flex: 1, opacity: confirmSubmitting ? 0.45 : 1 }]}
              >
                <Text style={styles.primaryButtonText as object}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {showMainButton && inPersonPairingRole === "share" ? (
          <View
            style={{
              flex: 1,
              paddingHorizontal: 18,
              paddingBottom: 18,
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", width: "100%" }}>
              {qrPreparing ? (
                <ActivityIndicator size="large" color={iconColor} />
              ) : activeQrPayload ? (
                <View
                  style={{
                    borderRadius: 12,
                    padding: 14,
                    backgroundColor: theme.background,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: theme.divider,
                  }}
                >
                  <View style={{ backgroundColor: "#FFFFFF", padding: 10, borderRadius: 12 }}>
                    <QRCode value={activeQrPayload} size={Math.min(220, screenWidth * 0.56)} />
                  </View>
                </View>
              ) : null}
            </View>
            <Pressable
              onPress={onPressShowQrCode}
              disabled={pairingHoldCooldown || qrPreparing}
              style={[
                styles.primaryButton as object,
                {
                  width: "100%",
                  maxWidth: 420,
                  opacity: pairingHoldCooldown || qrPreparing ? 0.45 : 1,
                },
              ]}
            >
              <Text style={styles.primaryButtonText as object}>
                {qrPreparing ? "Preparing…" : "Show QR Code"}
              </Text>
            </Pressable>
          </View>
        ) : null}
        {showMainButton && inPersonPairingRole === "join" ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 18 }}>
            {pairingStatusLabel ? (
              <Text
                style={{
                  marginBottom: 10,
                  color: mutedColor,
                  fontSize: 13,
                  textAlign: "center",
                  lineHeight: 18,
                  paddingHorizontal: 6,
                }}
              >
                {pairingStatusLabel}
              </Text>
            ) : null}
            {!cameraPermission?.granted ? (
              <View
                style={{
                  width: "100%",
                  borderRadius: 12,
                  padding: 18,
                  backgroundColor: theme.background,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: theme.divider,
                  alignItems: "center",
                }}
              >
                <Ionicons name="camera-outline" size={34} color={iconColor} />
                <Text style={{ marginTop: 10, color: textColor, fontSize: 16, fontWeight: "600" }}>
                  Camera access required
                </Text>
                <Text
                  style={{
                    marginTop: 8,
                    color: mutedColor,
                    textAlign: "center",
                    fontSize: 13,
                    lineHeight: 18,
                  }}
                >
                  Allow camera when prompted, or enable camera for Erdos in your phone settings, then tap Try
                  again.
                </Text>
                <Pressable
                  onPress={() => void retryPairingCameraPermission()}
                  style={[styles.primaryButton as object, { marginTop: 14 }]}
                >
                  <Text style={styles.primaryButtonText as object}>Try again</Text>
                </Pressable>
              </View>
            ) : (
              <View
                style={{
                  width: "100%",
                  maxWidth: 420,
                  aspectRatio: 0.82,
                  borderRadius: 12,
                  overflow: "hidden",
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: theme.divider,
                  backgroundColor: "#000000",
                }}
              >
                <CameraView
                  style={{ flex: 1 }}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={scannerBusy || qrScanFrozen ? undefined : onQrScanned}
                />
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    inset: 0,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: qrScanFrozen ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.2)",
                  }}
                >
                  <View
                    style={{
                      width: "72%",
                      aspectRatio: 1,
                      borderRadius: 16,
                      borderWidth: 3,
                      borderColor: isDarkMode ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.96)",
                      backgroundColor: "transparent",
                    }}
                  />
                  {scannerBusy || qrScanFrozen ? (
                    <View
                      style={{
                        marginTop: 18,
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 999,
                        backgroundColor: "rgba(0,0,0,0.58)",
                      }}
                    >
                      <Text
                        style={{
                          color: "#FFFFFF",
                          fontSize: 13,
                          fontWeight: "700",
                          letterSpacing: 0.2,
                        }}
                      >
                        {qrScanFrozen ? "Processing scan…" : "Processing scan..."}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}
