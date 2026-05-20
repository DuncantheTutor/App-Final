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

import {
  cancelInPersonPairingHardware,
} from "../../addFriend/inPersonPairingGateway";
import {
  readAddFriendNdefPayload,
  writeAddFriendNdefPayload,
} from "../../addFriend/nfc/handshake";
import { encodeNfcPinPairNdefPayload, parsePinFromNfcPairPlaintext } from "../../addFriend/nfcPinTransport/pinPairProtocol";

import type { Friend, InPersonPairingRole, ThemePalette } from "../domain/types";
import {
  multiplyHexColor,
  blendAccentTowardWhite,
} from "../lib/colorMath";
import { logAppError, logAppEvent } from "../../telemetry";
import { ADD_FRIEND_DUAL_CONFIRM_TIMEOUT_MS, ADD_FRIEND_HOLD_MS } from "../theme/preludeConstants";

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
  navHighlight: {
    settings: boolean;
    chats: boolean;
    feed: boolean;
    myProfile: boolean;
    friendsList: boolean;
    addFriend: boolean;
  };
  styles: Record<string, object>;
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
  /** Joiner: after confirming, wait until issuer performs their explicit confirm. */
  onPairingAwaitIssuerFinalConfirm: (pin: string) => Promise<Friend | null>;
  /** Issuer: explicit confirm that finalizes friendship after scanner confirmed. */
  onPairingFinalizePinOffer: (pin: string) => Promise<Friend | null>;
  /** Read QR flow: request/confirm foreground location permission for GPS proximity path. */
  onEnsurePairingLocationPermission: () => Promise<boolean>;
  /** Issuer cancel: release server PIN reservation (issuer anytime; scanner too after phase 1). */
  onPairingCancelPinOffer: (pin: string) => Promise<void>;
  /** Poll while on dual-confirm UI; false when session was deleted (other user cancelled). */
  onPairingPollOfferStillPresent: (pin: string) => Promise<boolean>;
}) {
  const {
    theme,
    isDarkMode,
    safeTop,
    bottomInset,
    navHighlight,
    styles,
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
    onPairingAwaitIssuerFinalConfirm,
    onPairingFinalizePinOffer,
    onEnsurePairingLocationPermission,
    onPairingCancelPinOffer,
    onPairingPollOfferStillPresent,
  } = props;
  const onAccentLabel = isDarkMode ? "rgba(0,0,0,0.90)" : "rgba(255,255,255,0.96)";
  const onAccentMuted = isDarkMode ? "rgba(0,0,0,0.58)" : "rgba(255,255,255,0.72)";
  const onAccentActivePill = isDarkMode ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.22)";
  const switchTrackOff = isDarkMode
    ? multiplyHexColor(theme.accent, 0.42)
    : blendAccentTowardWhite(theme.accent, 0.38);
  const switchTrackOn = isDarkMode
    ? multiplyHexColor(theme.accent, 0.58)
    : blendAccentTowardWhite(theme.accent, 0.52);
  const switchThumbSolid = isDarkMode ? "#111111" : "#FFFFFF";
  const { height: windowHeight, width: screenWidth } = useWindowDimensions();
  type Phase = "idle" | "handshake" | "awaitPairing" | "confirmFriend" | "profileOverlay" | "profileSolo";
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
  const [scannerBusy, setScannerBusy] = useState(false);
  const scannerBusyRef = useRef(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  /** Active 4-digit PIN for issuer (never shown in UI); used for cancel + poll. */
  const hostActivePinRef = useRef<string | null>(null);
  const qrHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qrVoidingForScreenshotRef = useRef(false);
  const hostAwaitSessionRef = useRef(0);
  const qrScanAttemptSeqRef = useRef(0);
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

  useEffect(() => {
    if (inPersonPairingRole === "join" && !cameraPermission?.granted) {
      void requestCameraPermission();
    }
    if (inPersonPairingRole === "join") {
      setActiveQrPayload(null);
    }
  }, [inPersonPairingRole, cameraPermission?.granted, requestCameraPermission]);

  /** Prompt for GPS when Add Friend opens so scanning is never the first moment we ask. */
  useEffect(() => {
    void onEnsurePairingLocationPermission();
  }, [onEnsurePairingLocationPermission]);

  const issuerAwaitingRedeemRef = useRef(false);
  const [issuerAwaitingRedeem, setIssuerAwaitingRedeem] = useState(false);

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const dimOpacity = useRef(new Animated.Value(0)).current;
  const friendAddedOpacity = useRef(new Animated.Value(0)).current;

  const isHandshakeFailureCelebration = displayedProfileId === ADD_FRIEND_HANDSHAKE_FAILURE_ID;

  const profileFriend = useMemo(
    () => (isHandshakeFailureCelebration ? null : displayedProfileFriend),
    [displayedProfileFriend, isHandshakeFailureCelebration]
  );

  const buttonSize = Math.min(screenWidth - 20, screenWidth * 0.94);
  const addFriendButtonFill = multiplyHexColor(theme.accent, 0.8);
  const addFriendButtonBorder = isDarkMode ? multiplyHexColor(theme.accent, 0.62) : "rgba(255,255,255,0.95)";
  const addFriendButtonChrome = {
    backgroundColor: addFriendButtonFill,
    borderWidth: 2,
    borderColor: addFriendButtonBorder,
  };
  const addFriendButtonLabelColor = isDarkMode ? "#111111" : "rgba(255,255,255,0.96)";

  const stopHoldLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pressStartRef.current = null;
  }, []);

  const runAfterHandshake = useCallback(() => {
    const fid = displayedProfileFriend?.id ?? "";
    if (fid) {
      void (async () => {
        try {
          const { sound } = await Audio.Sound.createAsync(
            {
              uri: "https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3",
            },
            { shouldPlay: true, volume: 0.65 }
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
  }, [dimOpacity, friendAddedOpacity, displayedProfileFriend]);

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

  const parseQrPayloadPin = useCallback((raw: string): string | null => {
    const t = raw.trim();
    if (!t) return null;
    if (/^\d{4}$/.test(t)) return t;
    const m = t.match(/^AFQR1\|(\d{4})$/i);
    return m?.[1] ?? null;
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
      setPairingStatusLabel("Location access is required for in-person pairing.");
      setPhase("idle");
      return;
    }

    setPairingStatusLabel("QR: preparing…");
    setPhase("awaitPairing");
    const stale = hostActivePinRef.current;
    hostActivePinRef.current = null;
    if (stale) await onPairingCancelPinOffer(stale).catch(() => {});
    clearQrHideTimer();

    const pin = await onPairingRegisterPinWithRetry();
    if (!pin) {
      issuerAwaitingRedeemRef.current = false;
      setIssuerAwaitingRedeem(false);
      setPhase("idle");
      setPairingStatusLabel("QR: could not reserve a code. Check network and try again.");
      return;
    }

    const sessionId = Date.now();
    hostAwaitSessionRef.current = sessionId;
    hostActivePinRef.current = pin;
    setActiveQrPayload(`AFQR1|${pin}`);
    setPairingStatusLabel("QR visible. Ask your friend to scan now.");
    setPhase("idle");
    issuerAwaitingRedeemRef.current = true;
    setIssuerAwaitingRedeem(true);
    qrHideTimerRef.current = setTimeout(() => {
      setActiveQrPayload(null);
      setPairingStatusLabel("QR hidden. Waiting for your friend to confirm…");
      qrHideTimerRef.current = null;
    }, ADD_FRIEND_QR_VISIBLE_MS);

    const friend = await onPairingAwaitPinRedeem(pin);
    issuerAwaitingRedeemRef.current = false;
    setIssuerAwaitingRedeem(false);
    if (hostAwaitSessionRef.current !== sessionId) return;
    hostActivePinRef.current = null;
    if (friend) {
      setActiveQrPayload(null);
      clearQrHideTimer();
      setPendingVerifiedFriend(friend);
      setPendingVerifiedPin(pin);
      setPendingVerifiedSource("share");
      setPairingStatusLabel("QR verified. Confirm this friend.");
      setPhase("confirmFriend");
      return;
    }
    setPhase("idle");
    setPairingStatusLabel("Pairing: no one confirmed before this offer expired. Tap Show QR Code to try again.");
  }, [
    pairingBackendReady,
    onPairingCancelPinOffer,
    clearQrHideTimer,
    onPairingRegisterPinWithRetry,
    onPairingAwaitPinRedeem,
    onEnsurePairingLocationPermission,
  ]);

  const onPressShowQrCode = useCallback(() => {
    void beginPresenterQrOffer().catch((err) => {
      issuerAwaitingRedeemRef.current = false;
      setIssuerAwaitingRedeem(false);
      const reason = summarizeHandshakeError(err);
      const detail = err instanceof Error ? err.message.trim() : String(err ?? "");
      setPhase("idle");
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
      if (scannerBusyRef.current) {
        logAppEvent("pairing.qr.scan.ignored", { reason: "busy_lock", payloadFingerprint, phase });
        return;
      }
      if (phase !== "idle") {
        logAppEvent("pairing.qr.scan.ignored", { reason: "wrong_phase", payloadFingerprint, phase });
        return;
      }
      scannerBusyRef.current = true;
      qrScanAttemptSeqRef.current += 1;
      const scanAttemptId = `scan-${Date.now()}-${qrScanAttemptSeqRef.current}`;
      logAppEvent("pairing.qr.scan.lock_acquired", { scanAttemptId, payloadFingerprint });
      const pin = parseQrPayloadPin(result.data ?? "");
      if (!pin) {
        logAppEvent("pairing.qr.scan.ignored", { reason: "invalid_payload", scanAttemptId, payloadFingerprint });
        setPairingStatusLabel("QR scan: invalid code. Ask your friend to tap Show QR Code and try again.");
        scannerBusyRef.current = false;
        logAppEvent("pairing.qr.scan.lock_released", { scanAttemptId, reason: "invalid_payload" });
        return;
      }
      setScannerBusy(true);
      setPairingStatusLabel("QR scan: processing…");
      logAppEvent("pairing.qr.scan.ui_processing", { scanAttemptId });
      void (async () => {
        try {
          setPhase("awaitPairing");
          setPairingStatusLabel("Verifying QR and proximity…");
          logAppEvent("pairing.qr.scan.proximity.start", { scanAttemptId });
          const scannedFriend = await onPairingConfirmPinRead(pin);
          if (!scannedFriend) {
            setPairingStatusLabel("Add friend failed");
            setPhase("idle");
            logAppEvent("pairing.qr.scan.proximity.miss", { scanAttemptId });
            return;
          }
          logAppEvent("pairing.qr.scan.proximity.ok", { scanAttemptId });
          setPendingVerifiedFriend(scannedFriend);
          setPendingVerifiedPin(pin);
          setPendingVerifiedSource("join");
          setPairingStatusLabel("QR verified. Confirm this friend.");
          setPhase("confirmFriend");
        } catch (err) {
          const reason = summarizeHandshakeError(err);
          const detail = err instanceof Error ? err.message.trim() : String(err ?? "");
          setPairingStatusLabel(
            detail && detail.length < 180 ? `Add friend failed: ${detail}` : `Add friend failed (${reason}).`
          );
          setPhase("idle");
          logAppEvent("pairing.qr.scan.failed", { scanAttemptId, stage: "exception", reason });
        } finally {
          scannerBusyRef.current = false;
          setScannerBusy(false);
          logAppEvent("pairing.qr.scan.lock_released", { scanAttemptId, phaseAfter: phase });
        }
      })();
    },
    [
      inPersonPairingRole,
      scannerBusy,
      phase,
      parseQrPayloadPin,
      qrPayloadFingerprint,
      onPairingConfirmPinRead,
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
      try {
        setPhase("awaitPairing");
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
        runAfterHandshake();
      } catch (err) {
        const reason = summarizeHandshakeError(err);
        const detail = err instanceof Error ? err.message.trim() : String(err ?? "");
        setPairingStatusLabel(
          detail && detail.length < 180 ? `Add friend failed: ${detail}` : `Add friend failed (${reason}).`
        );
        logAppError("pairing.confirm.finalize", err, { reason });
        setPhase("idle");
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
    try {
      setPhase("awaitPairing");
      setPairingStatusLabel("Waiting for your friend to confirm…");
      logAppEvent("pairing.qr.scan.confirm.start", { pinFingerprint: `${pin.length}` });
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
      runAfterHandshake();
    } catch (err) {
      const reason = summarizeHandshakeError(err);
      const detail = err instanceof Error ? err.message.trim() : String(err ?? "");
      setPairingStatusLabel(
        detail && detail.length < 180 ? `Add friend failed: ${detail}` : `Add friend failed (${reason}).`
      );
      setPhase("idle");
    }
  }, [
    onPairingAwaitIssuerFinalConfirm,
    onPairingFinalizePinOffer,
    pendingVerifiedFriend,
    pendingVerifiedPin,
    pendingVerifiedSource,
    runAfterHandshake,
    summarizeHandshakeError,
  ]);

  useEffect(() => {
    if (phase !== "confirmFriend") return;
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
  }, [phase, pendingVerifiedPin, onPairingPollOfferStillPresent]);

  /** Neither Confirm nor Cancel within window → abort pairing (same outcome as explicit cancel). */
  useEffect(() => {
    if (phase !== "confirmFriend") return;
    const pin = pendingVerifiedPin?.trim() ?? "";
    if (!pin) return;
    const id = setTimeout(() => {
      void onPairingCancelPinOffer(pin).catch(() => {});
      setPendingVerifiedFriend(null);
      setPendingVerifiedPin(null);
      setPendingVerifiedSource(null);
      setPairingStatusLabel("Add friend cancelled");
      setPhase("idle");
    }, ADD_FRIEND_DUAL_CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [phase, pendingVerifiedPin, onPairingCancelPinOffer]);

  const cancelVerifiedFriend = useCallback(() => {
    const pin = pendingVerifiedPin?.trim() ?? "";
    if (pin) void onPairingCancelPinOffer(pin).catch(() => {});
    setPendingVerifiedFriend(null);
    setPendingVerifiedPin(null);
    setPendingVerifiedSource(null);
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
          const ndefPayload = encodeNfcPinPairNdefPayload(pin);
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
        const pin = plain ? parsePinFromNfcPairPlaintext(plain) : null;
        if (!pin) {
          setPairingStatusLabel("Pairing: could not read a valid 4-digit code. Try Join again, Receive side first.");
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
    if (phase !== "idle" || ritualDoneRef.current || issuerAwaitingRedeemRef.current) return;
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
  const showPairingWait = phase === "awaitPairing";
  const showFriendConfirm = phase === "confirmFriend" && !!pendingVerifiedFriend;
  const cancelPairingHandshake = useCallback(async () => {
    pairingHandshakeCancelledRef.current = true;
    await cancelInPersonPairingHardware();
    const p = hostActivePinRef.current;
    hostActivePinRef.current = null;
    if (p) await onPairingCancelPinOffer(p).catch(() => {});
    setPairingStatusLabel("Pairing: cancelled.");
    ritualDoneRef.current = false;
    setDisplayedProfileId(null);
    setDisplayedProfileFriend(null);
    setPendingVerifiedFriend(null);
    setPendingVerifiedPin(null);
    setPendingVerifiedSource(null);
    setPhase("idle");
  }, [onPairingCancelPinOffer]);

  return (
    <View
      style={[
        styles.addFriendRoot as object,
        { paddingTop: safeTop, paddingBottom: bottomInset, backgroundColor: theme.accent },
      ]}
    >
      <View style={[styles.homeTopBar as object, { marginBottom: 10 }]}>
        <View style={styles.homeTopLeftIcons as object}>
          <Pressable
            onPress={onOpenSettings}
            style={[
              styles.iconButton as object,
              navHighlight.settings ? { backgroundColor: onAccentActivePill } : null,
            ]}
            accessibilityLabel="Settings"
          >
            <Ionicons name={navHighlight.settings ? "settings" : "settings-outline"} size={22} color={onAccentLabel} />
          </Pressable>
          <Pressable
            onPress={onOpenMyProfile}
            style={[
              styles.iconButton as object,
              navHighlight.myProfile ? { backgroundColor: onAccentActivePill } : null,
            ]}
            accessibilityLabel="My profile"
          >
            <Ionicons
              name={navHighlight.myProfile ? "person-circle" : "person-circle-outline"}
              size={24}
              color={onAccentLabel}
            />
          </Pressable>
          <Pressable
            onPress={onOpenFriendsList}
            style={[
              styles.iconButton as object,
              navHighlight.friendsList ? { backgroundColor: onAccentActivePill } : null,
            ]}
            accessibilityLabel="Friends list"
          >
            <Ionicons
              name={navHighlight.friendsList ? "people" : "people-outline"}
              size={22}
              color={onAccentLabel}
            />
          </Pressable>
          <Pressable
            onPress={onOpenHomeChats}
            style={[
              styles.iconButton as object,
              navHighlight.chats ? { backgroundColor: onAccentActivePill } : null,
            ]}
            accessibilityLabel="Open chats"
          >
            <Ionicons
              name={navHighlight.chats ? "chatbubbles" : "chatbubbles-outline"}
              size={21}
              color={onAccentLabel}
            />
          </Pressable>
          <Pressable
            onPress={onOpenHomeFeed}
            style={[
              styles.iconButton as object,
              navHighlight.feed ? { backgroundColor: onAccentActivePill } : null,
            ]}
            accessibilityLabel="Open feed"
          >
            <Ionicons
              name={navHighlight.feed ? "newspaper" : "newspaper-outline"}
              size={21}
              color={onAccentLabel}
            />
          </Pressable>
          <Pressable
            onPress={onOpenAddFriend}
            style={[
              styles.iconButton as object,
              navHighlight.addFriend ? { backgroundColor: onAccentActivePill } : null,
            ]}
            accessibilityLabel="Add friend"
          >
            <Ionicons
              name={navHighlight.addFriend ? "person-add" : "person-add-outline"}
              size={22}
              color={onAccentLabel}
            />
          </Pressable>
        </View>
        <Pressable onPress={onLogout} style={styles.iconButton as object} accessibilityLabel="Logout">
          <Ionicons name="log-out-outline" size={22} color={onAccentLabel} />
        </Pressable>
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
            color={inPersonPairingRole === "share" ? onAccentLabel : onAccentMuted}
          />
          <Text
            style={{
              color: inPersonPairingRole === "share" ? onAccentLabel : onAccentMuted,
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
            void onEnsurePairingLocationPermission();
            setInPersonPairingRole(v ? "join" : "share");
          }}
          disabled={phase !== "idle"}
          trackColor={{ false: switchTrackOff, true: switchTrackOn }}
          thumbColor={switchThumbSolid}
          ios_backgroundColor={switchTrackOff}
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
            color={inPersonPairingRole === "join" ? onAccentLabel : onAccentMuted}
          />
          <Text
            style={{
              color: inPersonPairingRole === "join" ? onAccentLabel : onAccentMuted,
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
              { width: screenWidth, flex: 1, backgroundColor: theme.accent },
            ]}
            pointerEvents="none"
          >
            <View
              style={[
                styles.addFriendProfileImageOnlyWrap as object,
                {
                  backgroundColor: theme.accent,
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
                        { backgroundColor: theme.accent },
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
                            { color: onAccentLabel },
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
                                color: profileFriend ? onAccentLabel : isDarkMode ? "rgba(0,0,0,0.88)" : "#7A1515",
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

        {showPairingWait ? (
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 24,
            }}
          >
            <ActivityIndicator size="large" color={onAccentLabel} />
            <Text
              style={{
                marginTop: 18,
                color: onAccentLabel,
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
                color: onAccentMuted,
                fontSize: 13,
                textAlign: "center",
                lineHeight: 19,
              }}
            >
              Keep this screen open while we verify your QR add-friend request.
            </Text>
            <Text
              style={{
                marginTop: 10,
                color: onAccentMuted,
                fontSize: 12,
                textAlign: "center",
              }}
            >
              {pairingStatusLabel}
            </Text>
            <Pressable
              onPress={() => void cancelPairingHandshake()}
              style={{
                marginTop: 22,
                paddingVertical: 12,
                paddingHorizontal: 22,
                borderRadius: 12,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: onAccentMuted,
                backgroundColor: isDarkMode ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.2)",
              }}
              accessibilityRole="button"
              accessibilityLabel="Cancel pairing"
            >
              <Text style={{ color: onAccentLabel, fontSize: 16, fontWeight: "500" }}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}

        {showFriendConfirm ? (
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 24,
              gap: 16,
            }}
          >
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
                  <Ionicons name="person-circle-outline" size={96} color={onAccentMuted} />
                </View>
              )}
            </View>
            <Text style={{ color: onAccentLabel, fontSize: 22, fontWeight: "700", textAlign: "center" }}>
              {pendingVerifiedFriend?.displayName ?? "Friend"}
            </Text>
            <Text style={{ color: onAccentMuted, fontSize: 14, textAlign: "center" }}>
              Do you still want to add this person as a friend?
            </Text>
            <View style={{ width: "100%", maxWidth: 420, flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={cancelVerifiedFriend}
                style={{
                  flex: 1,
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: addFriendButtonBorder,
                  paddingVertical: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: onAccentLabel, fontSize: 16, fontWeight: "600" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void confirmVerifiedFriend()}
                style={{
                  flex: 1,
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: addFriendButtonBorder,
                  backgroundColor: addFriendButtonFill,
                  paddingVertical: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: addFriendButtonLabelColor, fontSize: 16, fontWeight: "700" }}>Confirm</Text>
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
              {activeQrPayload ? (
                <View
                  style={{
                    borderRadius: 18,
                    padding: 14,
                    backgroundColor: isDarkMode ? "rgba(0,0,0,0.16)" : "rgba(255,255,255,0.28)",
                    borderWidth: 2,
                    borderColor: isDarkMode ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.7)",
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
              disabled={pairingHoldCooldown || phase !== "idle" || issuerAwaitingRedeem}
              style={{
                width: "100%",
                maxWidth: 420,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: addFriendButtonBorder,
                backgroundColor: addFriendButtonFill,
                paddingVertical: 13,
                alignItems: "center",
                opacity: pairingHoldCooldown || phase !== "idle" || issuerAwaitingRedeem ? 0.45 : 1,
              }}
            >
              <Text style={{ color: addFriendButtonLabelColor, fontSize: 16, fontWeight: "700" }}>
                Show QR Code
              </Text>
            </Pressable>
          </View>
        ) : null}
        {showMainButton && inPersonPairingRole === "join" ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 18 }}>
            {!cameraPermission?.granted ? (
              <View
                style={{
                  width: "100%",
                  borderRadius: 18,
                  padding: 18,
                  backgroundColor: isDarkMode ? "rgba(0,0,0,0.16)" : "rgba(255,255,255,0.28)",
                  borderWidth: 1,
                  borderColor: isDarkMode ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.64)",
                  alignItems: "center",
                }}
              >
                <Ionicons name="camera-outline" size={34} color={onAccentLabel} />
                <Text style={{ marginTop: 10, color: onAccentLabel, fontSize: 16, fontWeight: "600" }}>
                  Camera access needed
                </Text>
                <Text
                  style={{
                    marginTop: 8,
                    color: onAccentMuted,
                    textAlign: "center",
                    fontSize: 13,
                    lineHeight: 18,
                  }}
                >
                  Allow camera access to read your friend&apos;s QR code.
                </Text>
                <Pressable
                  onPress={() => void requestCameraPermission()}
                  style={{
                    marginTop: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 12,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: onAccentMuted,
                  }}
                >
                  <Text style={{ color: onAccentLabel, fontSize: 15, fontWeight: "600" }}>Allow camera</Text>
                </Pressable>
              </View>
            ) : (
              <View
                style={{
                  width: "100%",
                  maxWidth: 420,
                  aspectRatio: 0.82,
                  borderRadius: 22,
                  overflow: "hidden",
                  borderWidth: 2,
                  borderColor: addFriendButtonBorder,
                  backgroundColor: isDarkMode ? "#0B0B0B" : "#111111",
                }}
              >
                <CameraView
                  style={{ flex: 1 }}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={scannerBusy ? undefined : onQrScanned}
                />
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    inset: 0,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(0,0,0,0.2)",
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
                  {scannerBusy ? (
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
                        Processing scan...
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            )}
            <Text
              style={{
                marginTop: 8,
                color: onAccentMuted,
                fontSize: 12,
                textAlign: "center",
                paddingHorizontal: 12,
              }}
            >
              {pairingStatusLabel}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
