import { Camera } from "expo-camera";
import { Alert } from "react-native";

export type PairingCameraGateReason = "denied";

export type PairingCameraGateResult =
  | { ok: true }
  | { ok: false; reason: PairingCameraGateReason };

const CAMERA_REQUIRED_MESSAGE =
  "Camera access is required to scan your friend's QR code. Allow camera when prompted, or enable it in your phone's settings for Erdos.";

export function pairingCameraGateMessage(_reason: PairingCameraGateReason = "denied"): string {
  return CAMERA_REQUIRED_MESSAGE;
}

function alertCameraRequiredForPairing(): void {
  Alert.alert("Camera required for Add Friend", CAMERA_REQUIRED_MESSAGE, [
    {
      text: "Try again",
      onPress: () => {
        void ensureCameraForPairing({ showAlerts: true });
      },
    },
    { text: "Cancel", style: "cancel" },
  ]);
}

/**
 * Ensures camera permission for Read QR scanning. Re-prompts when previously denied.
 */
export async function ensureCameraForPairing(options?: {
  showAlerts?: boolean;
}): Promise<PairingCameraGateResult> {
  const showAlerts = options?.showAlerts !== false;

  let perm = await Camera.getCameraPermissionsAsync();
  if (!perm.granted) {
    perm = await Camera.requestCameraPermissionsAsync();
  }
  if (!perm.granted) {
    if (showAlerts) alertCameraRequiredForPairing();
    return { ok: false, reason: "denied" };
  }

  return { ok: true };
}
