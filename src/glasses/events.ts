/**
 * G2 event handler — processes tap, double-tap, scroll events.
 *
 * Event format (from SDK):
 * {
 *   textEvent/listEvent: { containerID, containerName, eventType, ... },
 *   jsonData: { containerID, containerName, eventType, ... }
 * }
 *
 * eventType: 0=CLICK, 1=SCROLL_TOP, 2=SCROLL_BOTTOM, 3=DOUBLE_CLICK
 */

import {
  state,
  startSession,
  stopSession,
  goHome,
  toggleLiveView,
} from '../state';
import { renderCurrentScreen } from './index';
import { audioAnalyzer } from './audio';

declare const bridge: {
  audioControl(enable: boolean): void;
};

const EVENT_CLICK = 0;
const EVENT_SCROLL_TOP = 1;
const EVENT_SCROLL_BOTTOM = 2;
const EVENT_DOUBLE_CLICK = 3;

function normalizeEventType(raw: unknown): number {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') return parseInt(raw, 10) || 0;
  return -1;
}

function parseEventType(event: unknown): number {
  const e = event as Record<string, unknown>;
  // On real G2 hardware, taps arrive as sysEvent (not textEvent/listEvent).
  // Try every known sub-event key; first valid one wins.
  for (const key of ['textEvent', 'sysEvent', 'listEvent', 'jsonData']) {
    const sub = e[key] as Record<string, unknown> | undefined;
    if (sub && typeof sub === 'object') {
      const evtType = normalizeEventType(sub.eventType);
      if (evtType >= 0 && evtType <= 3) {
        return evtType;
      }
    }
  }
  return -1;
}

export function handleEvent(event: unknown): void {
  const eventType = parseEventType(event);
  if (eventType < 0) return;

  // Double-tap: always go home (works from any screen, even during loading)
  if (eventType === EVENT_DOUBLE_CLICK) {
    if (state.isCoaching) {
      stopCoaching();
    }
    if (state.screen !== 'home') {
      goHome();
      renderCurrentScreen();
    }
    return;
  }

  // Swipe up/down: toggle live view during coaching
  if (eventType === EVENT_SCROLL_TOP || eventType === EVENT_SCROLL_BOTTOM) {
    if (state.screen === 'live') {
      toggleLiveView();
      renderCurrentScreen();
    }
    return;
  }

  // Single tap: context-dependent
  if (eventType === EVENT_CLICK) {
    if (state.isLoading) return;

    switch (state.screen) {
      case 'home':
        startCoaching();
        break;
      case 'live':
        stopCoaching();
        break;
      case 'summary':
        goHome();
        renderCurrentScreen();
        break;
    }
  }
}

function startCoaching(): void {
  audioAnalyzer.reset();
  startSession();
  // Fire-and-forget: don't await inside event handler
  enableAudio(true);
  renderCurrentScreen();
}

function stopCoaching(): void {
  enableAudio(false);
  stopSession();
  renderCurrentScreen();
}

function enableAudio(enable: boolean): void {
  try {
    bridge.audioControl(enable);
  } catch {
    // Silently fail if bridge not available (e.g., testing)
  }
}
