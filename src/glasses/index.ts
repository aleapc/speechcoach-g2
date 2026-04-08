/**
 * Glasses module entry — wires up events, audio, and rendering loop.
 */

import { renderScreen } from './renderer';
import { getCurrentScreenBlocks } from './screens';
import { handleEvent } from './events';
import { audioAnalyzer } from './audio';
import { state, updateElapsed, updateWpm } from '../state';

declare const bridge: {
  onEvenHubEvent(callback: (event: unknown) => void): void;
  audioControl(enable: boolean): void;
  getLocalStorage(key: string): Promise<string | null>;
  setLocalStorage(key: string, value: string): Promise<void>;
};

let updateInterval: ReturnType<typeof setInterval> | null = null;

export function renderCurrentScreen(): void {
  const blocks = getCurrentScreenBlocks();
  renderScreen(blocks);
}

export function initGlasses(): void {
  // Register event handler (fire-and-forget, no await)
  bridge.onEvenHubEvent((event: unknown) => {
    handleEvent(event as Parameters<typeof handleEvent>[0]);
  });

  // Load saved settings
  loadSettings().then(() => {
    renderCurrentScreen();
  });

  // Start update loop (1Hz for timer + WPM)
  updateInterval = setInterval(() => {
    if (state.isCoaching) {
      updateElapsed();
      const wpm = audioAnalyzer.getWpm();
      updateWpm(wpm);
      renderCurrentScreen();
    }
  }, 1000);
}

export function setupAudioCallback(): void {
  // Audio data callback — called by the bridge when mic data is available
  // This is set up via bridge.audioControl(true) in events.ts
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).audioEvent = (data: ArrayBuffer) => {
      if (state.isCoaching) {
        audioAnalyzer.feedPcmData(data);
      }
    };
  }
}

async function loadSettings(): Promise<void> {
  try {
    const settingsStr = await bridge.getLocalStorage('speechcoach_settings');
    if (settingsStr) {
      const settings = JSON.parse(settingsStr);
      if (settings.thresholds) {
        state.thresholds.slow = settings.thresholds.slow ?? 100;
        state.thresholds.fast = settings.thresholds.fast ?? 160;
      }
      if (settings.language) {
        state.language = settings.language;
      }
    }

    const historyStr = await bridge.getLocalStorage('speechcoach_history');
    if (historyStr) {
      state.sessions = JSON.parse(historyStr);
    }
  } catch {
    // Use defaults on error
  }
}

export async function saveSettings(): Promise<void> {
  try {
    await bridge.setLocalStorage('speechcoach_settings', JSON.stringify({
      thresholds: state.thresholds,
      language: state.language,
    }));
  } catch {
    // Silently fail
  }
}

export async function saveHistory(): Promise<void> {
  try {
    await bridge.setLocalStorage('speechcoach_history', JSON.stringify(state.sessions));
  } catch {
    // Silently fail
  }
}

export function cleanup(): void {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

// Re-export for convenience
export { handleEvent } from './events';
export { audioAnalyzer } from './audio';
