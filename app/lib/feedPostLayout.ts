/**
 * Stable feed post media height — avoids layout jumps when images decode and
 * when opening fullscreen (same box size in both places).
 */
export function feedPostMediaHeight(windowWidth: number): number {
  return Math.round(windowWidth * 0.8);
}
