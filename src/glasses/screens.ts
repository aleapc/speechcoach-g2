/**
 * Screen definitions for G2 display.
 * Each function returns TextBlock[] to pass to renderScreen().
 *
 * Display: 576x288 pixels
 */

import type { TextBlock } from './renderer';
import { state, type SessionRecord } from '../state';
import { t, getFeedbackText } from '../i18n';

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

  return [
    {
      id: 0, name: 'header',
      x: 0, y: 0, width: 576, height: 50,
      text: t('appName'),
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

export function liveDetailedScreen(): TextBlock[] {
  const timeStr = formatTime(state.elapsedSec);
  const wpm = state.currentWpm;
  const paceBar = buildPaceBar(wpm);
  const feedback = getFeedbackText(state.paceZone, wpm);

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
      x: 0, y: 110, width: 576, height: 40,
      text: `  ${paceBar}`,
    },
    {
      id: 3, name: 'feedback',
      x: 0, y: 165, width: 576, height: 50,
      text: `  "${feedback}"`,
    },
    {
      id: 4, name: 'hint',
      x: 0, y: 240, width: 576, height: 48,
      text: t('tapToStop'),
    },
  ];
}

// ── LIVE COACHING SCREEN (simple) ──

export function liveSimpleScreen(): TextBlock[] {
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
