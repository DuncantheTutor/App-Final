import QRCode from "qrcode";

/** Dark modules for a pairing QR, row-major. Null when the payload cannot be encoded. */
export function pairingQrModules(value: string): boolean[][] | null {
  const text = value.trim();
  if (!text) return null;
  try {
    const created = QRCode.create(text, { errorCorrectionLevel: "M" });
    const size = created.modules.size;
    if (!Number.isFinite(size) || size < 21) return null;
    const rows: boolean[][] = [];
    for (let row = 0; row < size; row += 1) {
      const line: boolean[] = [];
      for (let col = 0; col < size; col += 1) {
        line.push(created.modules.data[row * size + col] === 1);
      }
      rows.push(line);
    }
    return rows;
  } catch {
    return null;
  }
}
