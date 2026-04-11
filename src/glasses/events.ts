/**
 * G2 event handler — processes tap, double-tap, scroll, and lifecycle events.
 *
 * Event format (from SDK):
 * {
 *   textEvent/listEvent: { containerID, containerName, eventType, ... },
 *   sysEvent: { eventType, ... },
 *   jsonData: { containerID, containerName, eventType, ... }
 * }
 *
 * eventType (OsEventTypeList):
 *   0=CLICK, 1=SCROLL_TOP, 2=SCROLL_BOTTOM, 3=DOUBLE_CLICK,
 *   4=FOREGROUND_ENTER, 5=FOREGROUND_EXIT,
 *   6=ABNORMAL_EXIT, 7=SYSTEM_EXIT, 8=IMU_DATA_REPORT
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
  audioControl(enable: boolean): Promise<boolean> | void;
  shutDownPageContainer(exitMode?: number): Promise<boolean> | void;
};

const EVENT_CLICK = 0;
const EVENT_SCROLL_TOP = 1;
const EVENT_SCROLL_BOTTOM = 2;
const EVENT_DOUBLE_CLICK = 3;
const EVENT_FOREGROUND_ENTER = 4;
const EVENT_FOREGROUND_EXIT = 5;

// Triple-tap: three CLICK events within this window trigger shutdown.
const TRIPLE_TAP_WINDOW_MS = 700;
let tapTimestamps: number[] = [];

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
      // Accept the full OsEventTypeList range (0..8).
      if (evtType >= 0 && evtType <= 8) {
        return evtType;
      }
    }
  }
  return -1;
}

export function handleEvent(event: unknown): void {
  const eventType = parseEventType(event);
  if (eventType < 0) return;

  // Lifecycle: glasses app enters/exits foreground.
  if (eventType === EVENT_FOREGROUND_EXIT) {
    handleForegroundExit();
    return;
  }
  if (eventType === EVENT_FOREGROUND_ENTER) {
    handleForegroundEnter();
    return;
  }

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

  // Single tap: context-dependent (and triple-tap detection)
  if (eventType === EVENT_CLICK) {
    if (registerTapAndCheckTriple()) {
      gracefulShutdown();
      return;
    }

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

function registerTapAndCheckTriple(): boolean {
  const now = Date.now();
  tapTimestamps.push(now);
  // Keep only taps within the rolling window
  tapTimestamps = tapTimestamps.filter(t => now - t <= TRIPLE_TAP_WINDOW_MS);
  if (tapTimestamps.length >= 3) {
    tapTimestamps = [];
    return true;
  }
  return false;
}

function handleForegroundExit(): void {
  state.isForeground = false;
  // Stop any active coaching and release the mic immediately to save battery.
  if (state.isCoaching) {
    try {
      stopSession();
    } catch {
      // ignore
    }
  }
  enableAudio(false);
  // Persist state so FOREGROUND_ENTER can restore it.
  void saveLifecycleState();
}

function handleForegroundEnter(): void {
  state.isForeground = true;
  // Do NOT auto-resume coaching — user must explicitly tap to start again.
  void restoreLifecycleState().finally(() => {
    try {
      renderCurrentScreen();
    } catch {
      // ignore
    }
  });
}

async function saveLifecycleState(): Promise<void> {
  try {
    const b = (globalThis as unknown as { bridge?: { setLocalStorage?: (k: string, v: string) => Promise<void> } }).bridge;
    if (!b || !b.setLocalStorage) return;
    await b.setLocalStorage('speechcoach_lifecycle', JSON.stringify({
      screen: state.screen,
      liveView: state.liveView,
      savedAt: Date.now(),
    }));
  } catch {
    // ignore
  }
}

async function restoreLifecycleState(): Promise<void> {
  try {
    const b = (globalThis as unknown as { bridge?: { getLocalStorage?: (k: string) => Promise<string | null> } }).bridge;
    if (!b || !b.getLocalStorage) return;
    const raw = await b.getLocalStorage('speechcoach_lifecycle');
    if (!raw) return;
    const parsed = JSON.parse(raw) as { screen?: string; liveView?: string };
    // Only restore liveView preference — always land on home so the user
    // must explicitly re-start a coaching session.
    if (parsed.liveView === 'detailed' || parsed.liveView === 'simple') {
      state.liveView = parsed.liveView;
    }
    state.screen = 'home';
    state.isCoaching = false;
  } catch {
    // ignore
  }
}

export function gracefulShutdown(): void {
  // Ensure mic is off before exiting to save battery.
  try {
    if (state.isCoaching) {
      stopSession();
    }
  } catch {
    // ignore
  }
  enableAudio(false);
  try {
    const r = bridge.shutDownPageContainer(0);
    if (r && typeof (r as Promise<unknown>).then === 'function') {
      void (r as Promise<unknown>);
    }
  } catch {
    // Silently fail if bridge not available (e.g., testing)
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
    const r = bridge.audioControl(enable);
    if (r && typeof (r as Promise<unknown>).then === 'function') {
      void (r as Promise<unknown>);
    }
  } catch {
    // Silently fail if bridge not available (e.g., testing)
  }
}

// Exposed so that other modules (index.ts) can call startCoaching on launch.
export function autoStartCoaching(): void {
  if (state.isCoaching) return;
  if (state.isLoading) return;
  startCoaching();
}
