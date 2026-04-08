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

interface G2Event {
  textEvent?: { containerID: number; containerName: string; eventType: number };
  listEvent?: { containerID: number; containerName: string; currentSelectItemIndex: number; eventType: number };
  jsonData?: { containerID: number; containerName: string; eventType: number; currentSelectItemIndex?: number };
}

const EVENT_CLICK = 0;
const EVENT_SCROLL_TOP = 1;
const EVENT_SCROLL_BOTTOM = 2;
const EVENT_DOUBLE_CLICK = 3;

export function handleEvent(event: G2Event): void {
  const data = event.jsonData ?? event.textEvent ?? event.listEvent;
  if (!data) return;

  const eventType = data.eventType;

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
