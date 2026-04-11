/**
 * VU meter rendering — turns a normalized 0..1 audio level into a
 * Unicode block bar for text-based live display.
 */

const FULL = '\u2588'; // █
const EMPTY = '\u2591'; // ░

/**
 * Render a VU meter bar of the given width.
 * @param level   normalized audio level in [0, 1]
 * @param width   number of blocks in the bar (default 20)
 */
export function renderVUMeter(level: number, width = 20): string {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0));
  const filled = Math.round(clamped * width);
  const bar = FULL.repeat(filled) + EMPTY.repeat(width - filled);
  return `[${bar}]`;
}

/**
 * Normalize a raw RMS (0..32768 for 16-bit audio) into a 0..1 level,
 * using a perceptual log compression so quiet-but-audible speech
 * still fills a reasonable portion of the meter.
 *
 * Calibrated so that:
 *   rms ≈ 200  → ~0.1 (silent room)
 *   rms ≈ 1500 → ~0.5 (normal speech)
 *   rms ≈ 6000 → ~0.9 (loud speech)
 */
export function normalizeRms(rms: number): number {
  if (!Number.isFinite(rms) || rms <= 1) return 0;
  // log-scale compression: map rms to 0..1 using log10
  const MIN_LOG = Math.log10(50);   // floor
  const MAX_LOG = Math.log10(8000); // ceiling
  const v = (Math.log10(rms) - MIN_LOG) / (MAX_LOG - MIN_LOG);
  return Math.max(0, Math.min(1, v));
}
