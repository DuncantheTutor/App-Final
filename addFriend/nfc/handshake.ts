import type { TagEvent } from "react-native-nfc-manager";
import { Platform } from "react-native";

const PREFIX = "APPV2|fh1|";

/** Legacy NFC Add Friend UI role (transmit vs receive). */
export type AddFriendNfcPairMode = "transmit" | "receive";

function decodeNdefPlaintext(
  Ndef: typeof import("react-native-nfc-manager").Ndef,
  tag: TagEvent | null
): string {
  if (!tag?.ndefMessage?.length) return "";
  const chunks: string[] = [];
  for (const record of tag.ndefMessage) {
    try {
      const payload = new Uint8Array(record.payload);
      if (Ndef.isType(record, Ndef.TNF_WELL_KNOWN, Ndef.RTD_TEXT)) {
        chunks.push(Ndef.text.decodePayload(payload));
      } else if (Ndef.isType(record, Ndef.TNF_WELL_KNOWN, Ndef.RTD_URI)) {
        chunks.push(Ndef.uri.decodePayload(payload));
      }
    } catch {
      /* skip record */
    }
  }
  return chunks.join("\n").trim();
}

/** Short Android delay after `cancelTechnologyRequest` so the next session can open without racing unregister. */
const NFC_CANCEL_DELAY_MS = 120;

async function readPlaintextFromActiveNfcSession(
  NfcManager: typeof import("react-native-nfc-manager").default,
  Ndef: typeof import("react-native-nfc-manager").Ndef
): Promise<string | null> {
  let tag = (await NfcManager.getTag()) as TagEvent | null;
  let plain = decodeNdefPlaintext(Ndef, tag).trim();
  if (plain) return plain;
  if (Platform.OS === "android") {
    try {
      const hydrated = (await NfcManager.ndefHandler.getNdefMessage()) as TagEvent | null;
      plain = decodeNdefPlaintext(Ndef, hydrated).trim();
    } catch {
      /* ignore */
    }
  }
  return plain || null;
}

/**
 * Reads one NFC text payload exchanged directly between phones for Add Friend pairing.
 * Web skips this (no NFC).
 */
export async function readAddFriendNdefChallenge(
  expectedChallenge: string,
  timeoutMs: number
): Promise<boolean> {
  const plain = await readAddFriendNdefPayload(timeoutMs);
  if (!plain) return false;
  const needle = `${PREFIX}${expectedChallenge}`.replace(/\s+/g, "");
  return plain.replace(/\s+/g, "").includes(needle);
}

/**
 * Reads raw NDEF plaintext payload once and returns decoded string.
 */
export async function readAddFriendNdefPayload(
  timeoutMs: number,
  pairMode: AddFriendNfcPairMode = "transmit"
): Promise<string | null> {
  if (Platform.OS === "web") return null;

  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
  const nativeNfc: any = require("react-native-nfc-manager");
  const NfcManager = nativeNfc.default;
  const { Ndef, NfcTech, NfcAdapter } = nativeNfc;
  /** Prefer NDEF first; on Android, also try lower-level tech some peers expose during tap. */
  const readTechs =
    Platform.OS === "android"
      ? ([NfcTech.Ndef, NfcTech.NfcA, NfcTech.IsoDep] as const)
      : ([NfcTech.Ndef] as const);

  try {
    await NfcManager.start();
    const supported = await NfcManager.isSupported();
    if (!supported) return null;
    const enabled = await NfcManager.isEnabled().catch(() => true);
    if (!enabled) return null;

    const readAlert =
      pairMode === "receive"
        ? "Receive: hold this phone near your friend’s device so it can read their pairing data."
        : "Transmit: hold phones together — this phone will read when your friend shares data.";

    /** Receive side uses Android reader mode so the peer can appear as a tag while the other phone writes. */
    const receiveReaderModeOpts =
      Platform.OS === "android" && pairMode === "receive" && typeof NfcAdapter === "object"
        ? {
            isReaderModeEnabled: true,
            readerModeFlags:
              NfcAdapter.FLAG_READER_NFC_A |
              NfcAdapter.FLAG_READER_NFC_B |
              NfcAdapter.FLAG_READER_NFC_F |
              NfcAdapter.FLAG_READER_NFC_V |
              NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS,
            readerModeDelay: 280,
          }
        : { isReaderModeEnabled: false };

    const readOnce = async (): Promise<string | null> => {
      await NfcManager.requestTechnology([...readTechs], {
        alertMessage: readAlert,
        ...receiveReaderModeOpts,
      });
      return readPlaintextFromActiveNfcSession(NfcManager, Ndef);
    };

    const result = await Promise.race([
      readOnce().catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return result;
  } catch {
    return null;
  } finally {
    try {
      await NfcManager.cancelTechnologyRequest({
        throwOnError: false,
        delayMsAndroid: NFC_CANCEL_DELAY_MS,
      });
    } catch {
      /* ignore */
    }
  }
}

export async function getAddFriendNfcAvailability(): Promise<"ready" | "unsupported" | "disabled"> {
  if (Platform.OS === "web") return "unsupported";
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RN = require("react-native-nfc-manager") as typeof import("react-native-nfc-manager");
    const NfcManager = RN.default;
    await NfcManager.start();
    const supported = await NfcManager.isSupported();
    if (!supported) return "unsupported";
    const enabled = await NfcManager.isEnabled().catch(() => true);
    if (!enabled) return "disabled";
    return "ready";
  } catch {
    return "unsupported";
  }
}

/** Writes one NFC text payload for phone-to-phone pairing. */
export async function writeAddFriendNdefPayload(
  payload: string,
  timeoutMs: number,
  pairMode: AddFriendNfcPairMode = "transmit"
): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RN = require("react-native-nfc-manager") as typeof import("react-native-nfc-manager");
    const NfcManager = RN.default;
    const { Ndef, NfcTech } = RN;
    await NfcManager.start();
    const supported = await NfcManager.isSupported();
    if (!supported) return false;
    const enabled = await NfcManager.isEnabled().catch(() => true);
    if (!enabled) return false;
    const writeAlert =
      pairMode === "receive"
        ? "Receive: keep phones together while this phone sends a pairing reply."
        : "Transmit: keep phones together — your friend’s phone should read this pairing data.";

    const writeOnce = async (): Promise<boolean> => {
      await NfcManager.requestTechnology(NfcTech.Ndef, {
        alertMessage: writeAlert,
        isReaderModeEnabled: false,
      });
      const bytes = Ndef.encodeMessage([Ndef.textRecord(payload)]);
      if (!bytes) return false;
      await NfcManager.ndefHandler.writeNdefMessage(bytes, { reconnectAfterWrite: true });
      return true;
    };
    const result = await Promise.race([
      writeOnce().catch(() => false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
    ]);
    return result;
  } catch {
    return false;
  } finally {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const NfcManager = require("react-native-nfc-manager").default;
      await NfcManager.cancelTechnologyRequest({
        throwOnError: false,
        delayMsAndroid: NFC_CANCEL_DELAY_MS,
      });
    } catch {
      /* ignore */
    }
  }
}

/** User cancelled the NFC wait — stops the native reader session. */
export async function cancelActiveNfcRequest(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const NfcManager = require("react-native-nfc-manager").default;
    await NfcManager.cancelTechnologyRequest({
      throwOnError: false,
      delayMsAndroid: NFC_CANCEL_DELAY_MS,
    });
  } catch {
    /* ignore */
  }
}
