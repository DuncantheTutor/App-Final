/** Darken a `#RRGGBB` accent for fills/borders (multiplies RGB channels). */
export function multiplyHexColor(hex: string, factor: number): string {
  const raw = hex.trim().replace("#", "");
  if (raw.length !== 6) return hex;
  const r = Math.min(255, Math.round(parseInt(raw.slice(0, 2), 16) * factor));
  const g = Math.min(255, Math.round(parseInt(raw.slice(2, 4), 16) * factor));
  const b = Math.min(255, Math.round(parseInt(raw.slice(4, 6), 16) * factor));
  return `#${[r, g, b]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Blend `#RRGGBB` toward white for a lighter accent tint (e.g. switch tracks on accent screens). */
export function blendAccentTowardWhite(hex: string, t: number): string {
  const raw = hex.trim().replace("#", "");
  if (raw.length !== 6) return hex;
  const clampT = Math.min(1, Math.max(0, t));
  const blend = (c: number) => Math.round(c + (255 - c) * clampT);
  const r = blend(parseInt(raw.slice(0, 2), 16));
  const g = blend(parseInt(raw.slice(2, 4), 16));
  const b = blend(parseInt(raw.slice(4, 6), 16));
  return `#${[r, g, b]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
}
