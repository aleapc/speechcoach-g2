/**
 * Screen definitions for G2 display.
 * Each function returns TextBlock[] to pass to renderScreen().
 *
 * Display: 576x288 pixels
 */

import type { TextBlock, ImageBlock } from './renderer';
import { state, type SessionRecord } from '../state';
import { t, getFeedbackText } from '../i18n';
import { audioAnalyzer } from './audio';
import { renderVUMeter, normalizeRms } from './vumeter';
import {
  generateMascotPNG,
  poseForZone,
  CHAR_IMG_W,
  CHAR_IMG_H,
  type MascotPose,
} from './character';

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function buildPaceBar(wpm: number): string {
  const maxBlocks = 18;
  let filled: number;

  if (wpm === 0) {
    filled = 0;
  } else if (wpm < state.thresholds.slow) {
    filled = Math.max(2, Math.round((wpm / state.thresholds.slow) * 6));
  } else if (wpm <= state.thresholds.fast) {
    filled = Math.round(6 + ((wpm - state.thresholds.slow) / (state.thresholds.fast - state.thresholds.slow)) * 6);
  } else {
    filled = Math.min(maxBlocks, Math.round(12 + ((wpm - state.thresholds.fast) / 40) * 6));
  }

  filled = Math.max(0, Math.min(maxBlocks, filled));
  const zoneLabel = wpm === 0 ? '...' : state.paceZone === 'slow' ? 'SLOW' : state.paceZone === 'ok' ? 'OK' : 'FAST';
  return '\u2588'.repeat(filled) + '\u2591'.repeat(maxBlocks - filled) + '  ' + zoneLabel;
}

// ── HOME SCREEN ──

export function homeScreen(): TextBlock[] {
  const recentLines: string[] = [];
  if (state.sessions.length === 0) {
    recentLines.push(t('noSessions'));
  } else {
    for (let i = 0; i < Math.min(3, state.sessions.length); i++) {
      const s = state.sessions[i];
      recentLines.push(`${formatTime(s.durationSec)}  ${s.avgWpm} ${t('wpm')}`);
    }
  }

  // Battery line — empty until we get a reading from the SDK.
  let headerText = t('appName');
  if (typeof state.batteryLevel === 'number') {
    const bat = state.batteryLevel;
    const warn = bat < 15 ? `  ${t('lowBattery')}` : '';
    headerText = `${t('appName')}    ${t('battery')}: ${bat}%${warn}`;
  }

  return [
    {
      id: 0, name: 'header',
      x: 0, y: 0, width: 576, height: 50,
      text: headerText,
      isEventCapture: true,
    },
    {
      id: 1, name: 'action',
      x: 0, y: 60, width: 576, height: 50,
      text: `> ${t('tapToStart')}`,
    },
    {
      id: 2, name: 'history',
      x: 0, y: 130, width: 576, height: 158,
      text: `${t('recentSessions')}\n${recentLines.join('\n')}`,
    },
  ];
}

// ── LIVE COACHING SCREEN (detailed) ──

function calibratingScreen(): TextBlock[] {
  return [
    { id: 0, name: 'header', x: 0, y: 0, width: 576, height: 50, text: t('appName'), isEventCapture: true },
    { id: 1, name: 'calibrating', x: 0, y: 80, width: 576, height: 120, text: t('calibrating') },
    { id: 2, name: 'hint', x: 0, y: 220, width: 576, height: 68, text: t('calibratingHint') },
  ];
}

// Container IDs used by the mascot-based live screen. Stable so that
// textContainerUpgrade can target them for flicker-free updates.
export const LIVE_CONTAINER = {
  HEADER: 0,
  WPM: 1,
  VU: 2,
  ZONE: 3,
  MASCOT: 4,
} as const;

function zoneLabel(wpm: number): string {
  if (wpm === 0) return '...';
  return state.paceZone === 'slow' ? 'TOO SLOW' : state.paceZone === 'ok' ? 'GOOD' : 'TOO FAST';
}

/**
 * Text blocks for the live coaching screen when the mascot image is
 * also on-screen. The mascot occupies the left ~80px; text blocks live
 * on the right. Layout assumes CHAR_IMG_W = 72.
 */
export function liveMascotTextBlocks(): TextBlock[] {
  const timeStr = formatTime(state.elapsedSec);
  const wpm = state.currentWpm;
  const vu = renderVUMeter(normalizeRms(audioAnalyzer.getCurrentRms()), 20);
  const zone = zoneLabel(wpm);

  const textX = 8 + CHAR_IMG_W + 16; // ~96
  const textW = 576 - textX - 8;

  return [
    {
      id: LIVE_CONTAINER.HEADER, name: 'header',
      x: 0, y: 0, width: 576, height: 36,
      text: `${t('appName')}        ${timeStr}`,
      isEventCapture: true,
    },
    {
      id: LIVE_CONTAINER.WPM, name: 'wpm',
      x: textX, y: 48, width: textW, height: 70,
      text: `${wpm} ${t('wpm')}`,
    },
    {
      id: LIVE_CONTAINER.VU, name: 'vu',
      x: textX, y: 130, width: textW, height: 36,
      text: vu,
    },
    {
      id: LIVE_CONTAINER.ZONE, name: 'zone',
      x: textX, y: 180, width: textW, height: 40,
      text: zone,
    },
  ];
}

/** Only the text blocks that need a 300ms refresh (WPM, VU, zone). */
export function liveMascotUpgradeBlocks(): TextBlock[] {
  return liveMascotTextBlocks().filter(b =>
    b.id === LIVE_CONTAINER.WPM ||
    b.id === LIVE_CONTAINER.VU ||
    b.id === LIVE_CONTAINER.ZONE ||
    b.id === LIVE_CONTAINER.HEADER,
  );
}

/** Build the mascot image block for the current pace zone. */
export function liveMascotImageBlock(): ImageBlock | null {
  const isCal = audioAnalyzer.getCalibrationStatus().isCalibrated;
  const pose: MascotPose = poseForZone(state.paceZone, isCal);
  const data = generateMascotPNG(pose);
  if (!data) return null;
  const y = Math.floor((288 - CHAR_IMG_H) / 2);
  return {
    id: LIVE_CONTAINER.MASCOT,
    name: 'mascot',
    x: 8,
    y,
    width: CHAR_IMG_W,
    height: CHAR_IMG_H,
    data,
    key: pose,
  };
}

/**
 * Legacy text-only detailed screen (kept as fallback when mascot
 * image rendering is unavailable or during calibration).
 */
export function liveDetailedScreen(): TextBlock[] {
  if (!audioAnalyzer.getCalibrationStatus().isCalibrated) return calibratingScreen();
  const timeStr = formatTime(state.elapsedSec);
  const wpm = state.currentWpm;
  const paceBar = buildPaceBar(wpm);
  const feedback = getFeedbackText(state.paceZone, wpm);
  const vu = renderVUMeter(normalizeRms(audioAnalyzer.getCurrentRms()), 20);

  return [
    {
      id: 0, name: 'header',
      x: 0, y: 0, width: 576, height: 40,
      text: `${t('appName')}        ${timeStr}`,
      isEventCapture: true,
    },
    {
      id: 1, name: 'wpm',
      x: 0, y: 50, width: 576, height: 50,
      text: `  ${wpm} ${t('wpm')}`,
    },
    {
      id: 2, name: 'bar',
      x: 0, y: 110, width: 576, height: 36,
      text: `  ${paceBar}`,
    },
    {
      id: 3, name: 'vu',
      x: 0, y: 150, width: 576, height: 36,
      text: `  ${vu}`,
    },
    {
      id: 4, name: 'feedback',
      x: 0, y: 195, width: 576, height: 45,
      text: `  "${feedback}"`,
    },
    {
      id: 5, name: 'hint',
      x: 0, y: 248, width: 576, height: 40,
      text: t('tapToStop'),
    },
  ];
}

// ── LIVE COACHING SCREEN (simple) ──

export function liveSimpleScreen(): TextBlock[] {
  if (!audioAnalyzer.getCalibrationStatus().isCalibrated) return calibratingScreen();
  const timeStr = formatTime(state.elapsedSec);
  const wpm = state.currentWpm;
  const feedback = getFeedbackText(state.paceZone, wpm);

  return [
    {
      id: 0, name: 'main',
      x: 0, y: 0, width: 576, height: 144,
      text: `${wpm} ${t('wpm')}    ${timeStr}`,
      isEventCapture: true,
    },
    {
      id: 1, name: 'feedback',
      x: 0, y: 160, width: 576, height: 128,
      text: feedback,
    },
  ];
}

// ── SUMMARY SCREEN ──

export function summaryScreen(): TextBlock[] {
  const session: SessionRecord | undefined = state.sessions[0];
  if (!session) return homeScreen();

  const variation = session.maxWpm - session.minWpm;

  return [
    {
      id: 0, name: 'header',
      x: 0, y: 0, width: 576, height: 40,
      text: t('sessionComplete'),
      isEventCapture: true,
    },
    {
      id: 1, name: 'stats',
      x: 0, y: 50, width: 576, height: 180,
      text: [
        `${t('duration')}: ${formatTime(session.durationSec)}`,
        `${t('avgWpm')}: ${session.avgWpm}`,
        `${t('minWpm')}: ${session.minWpm}  ${t('maxWpm')}: ${session.maxWpm}`,
        `${t('variation')}: ${variation}`,
      ].join('\n'),
    },
    {
      id: 2, name: 'hint',
      x: 0, y: 240, width: 576, height: 48,
      text: t('doubleTapBack'),
    },
  ];
}

// ── Screen dispatcher ──

export function getCurrentScreenBlocks(): TextBlock[] {
  switch (state.screen) {
    case 'home':
      return homeScreen();
    case 'live':
      return state.liveView === 'detailed' ? liveDetailedScreen() : liveSimpleScreen();
    case 'summary':
      return summaryScreen();
  }
}
