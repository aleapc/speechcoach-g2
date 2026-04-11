/**
 * Speech Coach G2 — pixel-art mascot renderer.
 *
 * Adapted from breakmate-g2 / fabioglimb/even-toolkit: 12×16 sprites
 * scaled 6× to 72×96, encoded as 4-bit indexed PNG via upng-js for the
 * glasses' 16-level greyscale display.
 *
 * Poses:
 *   - idle           : neutral, mouth closed (waiting)
 *   - listening      : hand near ear, calibrating
 *   - speaking_slow  : mouth slightly open, small speech puff
 *   - speaking_fast  : mouth wide open, bigger puff
 */

import UPNG from 'upng-js';

export type MascotPose = 'idle' | 'listening' | 'speaking_slow' | 'speaking_fast';

// 12 cols × 16 rows. Characters map to greyscale via COLORS below.
//  .  transparent/black
//  o  dark outline
//  H  hair / hat
//  s  face/skin
//  e  eyes
//  m  closed mouth
//  M  open mouth
//  W  open-wide mouth
//  r  shirt
//  p  collar/tie
//  b  hand
//  k  speech puff highlight
const SPRITES: Record<MascotPose, string[]> = {
  idle: [
    '....oooo....',
    '...oHHHHo...',
    '..oHHHHHHo..',
    '..ossssssho.',
    '..osseesso..',
    '..osssssso..',
    '..osssssso..',
    '...osmmso...',
    '....oooo....',
    '...orrrro...',
    '..orrrrrro..',
    '..orrpprro..',
    '..orrpprro..',
    '..orrrrrro..',
    '..oo....oo..',
    '..oo....oo..',
  ],
  listening: [
    '....oooo....',
    '...oHHHHo...',
    '..oHHHHHHob.',
    '..osssssobb.',
    '..ossee.obb.',
    '..osssss.ob.',
    '..osssssso..',
    '...osmmso...',
    '....oooo....',
    '...orrrro...',
    '..orrrrrro..',
    '..orrpprro..',
    '..orrpprro..',
    '..orrrrrro..',
    '..oo....oo..',
    '..oo....oo..',
  ],
  speaking_slow: [
    '....oooo..k.',
    '...oHHHHo...',
    '..oHHHHHHok.',
    '..ossssssho.',
    '..osseesso.k',
    '..osssssso..',
    '..osssssso.k',
    '...osMMso...',
    '....oooo....',
    '...orrrro...',
    '..orrrrrro..',
    '..orrpprro..',
    '..orrpprro..',
    '..orrrrrro..',
    '..oo....oo..',
    '..oo....oo..',
  ],
  speaking_fast: [
    '....oooo.kk.',
    '...oHHHHokk.',
    '..oHHHHHHokk',
    '..ossssssh.k',
    '..osseesso.k',
    '..ossssssokk',
    '...osWWWso.k',
    '...osWWWso..',
    '....oooo.k..',
    '...orrrro...',
    '..orrrrrro..',
    '..orrpprro..',
    '..orrpprro..',
    '..orrrrrro..',
    '..oo....oo..',
    '..oo....oo..',
  ],
};

// 16-level quantized greys (0, 17, 34, ..., 255)
const COLORS: Record<string, number> = {
  '.': 0,
  'o': 34,   // outline
  'H': 119,  // hair
  's': 204,  // skin
  'e': 34,   // eyes
  'm': 51,   // mouth closed
  'M': 85,   // mouth open
  'W': 136,  // mouth open wide
  'r': 102,  // shirt
  'p': 68,   // collar
  'b': 187,  // hand
  'k': 255,  // speech puff highlight
};

const SPRITE_W = 12;
const SPRITE_H = 16;
const SCALE = 6;
export const CHAR_IMG_W = SPRITE_W * SCALE; // 72
export const CHAR_IMG_H = SPRITE_H * SCALE; // 96

function quantize(grey: number): number {
  const idx = Math.min(15, Math.round(grey / 17));
  return idx * 17;
}

/**
 * Build a 4-bit indexed PNG for a mascot pose, returned as number[]
 * (the format the bridge's updateImageRawData prefers).
 */
export function generateMascotPNG(pose: MascotPose): number[] | null {
  try {
    const rows = SPRITES[pose] ?? SPRITES.idle;
    const rgba = new Uint8Array(CHAR_IMG_W * CHAR_IMG_H * 4);

    for (let row = 0; row < SPRITE_H; row++) {
      const line = rows[row] ?? '';
      for (let col = 0; col < SPRITE_W; col++) {
        const ch = line[col] ?? '.';
        const grey = quantize(COLORS[ch] ?? 0);
        for (let dy = 0; dy < SCALE; dy++) {
          for (let dx = 0; dx < SCALE; dx++) {
            const px = col * SCALE + dx;
            const py = row * SCALE + dy;
            const idx = (py * CHAR_IMG_W + px) * 4;
            rgba[idx] = grey;
            rgba[idx + 1] = grey;
            rgba[idx + 2] = grey;
            rgba[idx + 3] = 255;
          }
        }
      }
    }

    const pngBuffer = UPNG.encode([rgba.buffer], CHAR_IMG_W, CHAR_IMG_H, 16);
    const pngBytes = new Uint8Array(pngBuffer);
    const out: number[] = new Array(pngBytes.length);
    for (let i = 0; i < pngBytes.length; i++) out[i] = pngBytes[i];
    return out;
  } catch (e) {
    console.error('generateMascotPNG failed:', e);
    return null;
  }
}

/** Pick a mascot pose for the current WPM pace zone. */
export function poseForZone(zone: 'slow' | 'ok' | 'fast', isCalibrated: boolean): MascotPose {
  if (!isCalibrated) return 'listening';
  if (zone === 'slow') return 'idle';
  if (zone === 'fast') return 'speaking_fast';
  return 'speaking_slow';
}
