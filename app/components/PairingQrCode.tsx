import { useMemo } from "react";
import { View } from "react-native";

import { pairingQrModules } from "../lib/pairingQrMatrix";

/**
 * Drawn as solid squares. react-native-qrcode-svg strokes a path, and
 * react-native-svg 15 leaves that path blank, so Show QR rendered nothing.
 */
export function PairingQrCode({ value, size }: { value: string; size: number }) {
  const modules = useMemo(() => pairingQrModules(value), [value]);
  if (!modules) return null;
  const count = modules.length;
  const cell = size / count;
  return (
    <View style={{ width: size, height: size, backgroundColor: "#FFFFFF" }}>
      {modules.map((row, y) =>
        row.map((dark, x) =>
          dark ? (
            <View
              key={`${x}-${y}`}
              style={{
                position: "absolute",
                left: x * cell,
                top: y * cell,
                width: cell,
                height: cell,
                backgroundColor: "#000000",
              }}
            />
          ) : null
        )
      )}
    </View>
  );
}
