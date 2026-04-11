/**
 * Glasses module entry — wires up events, audio, and rendering loop.
 */

import {
  renderScreen,
  renderScreenWithImage,
  renderTextUpgrade,
  getLastImageKey,
} from './renderer';
import {
  getCurrentScreenBlocks,
  liveMascotImageBlock,
  liveMascotTextBlocks,
  liveMascotUpgradeBlocks,
} from './screens';
import { handleEvent, autoStartCoaching } from './events';
import { audioAnalyzer } from './audio';
import { state, updateElapsed, updateWpm, stopSession } from '../state';

interface DeviceInfoLike {
  isWearing?: boolean;
  batteryLevel?: number;
}
interface DeviceStatusLike {
  isWearing?: boolean;
  batteryLevel?: number;
}
type LaunchSourceLike = 'appMenu' | 'glassesMenu' | string;

declare const bridge: {
  onEvenHubEvent(callback: (event: unknown) => void): void;
  audioControl(enable: boolean): Promise<boolean> | void;
  getLocalStorage(key: string): Promise<string | null>;
  setLocalStorage(key: string, value: string): Promise<void>;
  callEvenApp(method: string, params: string): void;
  getDeviceInfo?(): Promise<DeviceInfoLike | null>;
  onDeviceStatusChanged?(callback: (status: DeviceStatusLike) => void): () => void;
  onLaunchSource?(callback: (source: LaunchSourceLike) => void): () => void;
};

let updateInterval: ReturnType<typeof setInterval> | null = null;
let vuInterval: ReturnType<typeof setInterval> | null = null;

function isMascotLiveView(): boolean {
  return (
    state.screen === 'live' &&
    state.liveView === 'detailed' &&
    state.isCoaching &&
    audioAnalyzer.getCalibrationStatus().isCalibrated
  );
}

/** Full rebuild with the mascot image for the current pace zone. */
function renderLiveMascot(): void {
  const image = liveMascotImageBlock();
  if (!image) {
    // Fallback: regular text-only rebuild.
    renderScreen(getCurrentScreenBlocks());
    return;
  }
  // Fire-and-forget — the image flow is async but we don't need to await.
  void renderScreenWithImage(image, liveMascotTextBlocks());
}

/** Flicker-free text upgrades for WPM / VU / zone at ~300ms. */
function upgradeLiveText(): void {
  const blocks = liveMascotUpgradeBlocks();
  for (const b of blocks) {
    renderTextUpgrade(b.id, b.name, b.text);
  }
}

export function renderCurrentScreen(): void {
  if (isMascotLiveView()) {
    renderLiveMascot();
    return;
  }
  const blocks = getCurrentScreenBlocks();
  renderScreen(blocks);
}

function stopVuLoop(): void {
  if (vuInterval) {
    clearInterval(vuInterval);
    vuInterval = null;
  }
}

function startVuLoop(): void {
  stopVuLoop();
  vuInterval = setInterval(() => {
    if (!state.isCoaching) {
      stopVuLoop();
      return;
    }
    if (!isMascotLiveView()) return;
    // Only upgrade once the initial mascot image rebuild has landed.
    if (!getLastImageKey()) return;
    upgradeLiveText();
  }, 300);
}

function triggerHaptic(): void {
  if (!state.hapticEnabled) return;
  try {
    bridge.callEvenApp('vibrate', JSON.stringify({ pattern: 'short', intensity: 1 }));
  } catch {
    // Ring not connected or method unsupported
  }
}

export function initGlasses(): void {
  // Guard against double-init: clear any existing interval
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }

  // Register event handler (fire-and-forget, no await)
  bridge.onEvenHubEvent((event: unknown) => {
    handleEvent(event as Parameters<typeof handleEvent>[0]);
  });

  // Device info + status listener (battery, wearing)
  initDeviceInfo();

  // Launch source differentiation (auto-start if launched from glasses menu)
  initLaunchSource();

  // Load saved settings
  loadSettings().then(() => {
    renderCurrentScreen();
  });

  // Start update loop (1Hz for timer + WPM)
  updateInterval = setInterval(() => {
    if (!state.isCoaching) {
      stopVuLoop();
      return;
    }

    updateElapsed();

    const prevZone = state.paceZone;
    const wpm = audioAnalyzer.getWpm();
    updateWpm(wpm);

    // Haptic on zone transition
    if (state.paceZone !== prevZone) {
      triggerHaptic();
    }

    // Sync calibration status to state
    const cal = audioAnalyzer.getCalibrationStatus();
    if (cal.isCalibrated) {
      state.calibratedSilenceThreshold = cal.threshold;
    }

    if (isMascotLiveView()) {
      // Only rebuild (with the image) when the pose would change —
      // otherwise rely on the 300ms text upgrade loop.
      const image = liveMascotImageBlock();
      if (image && image.key !== getLastImageKey()) {
        void renderScreenWithImage(image, liveMascotTextBlocks());
      }
      if (!vuInterval) startVuLoop();
    } else {
      stopVuLoop();
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
      if (settings.hapticEnabled !== undefined) {
        state.hapticEnabled = settings.hapticEnabled;
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
      hapticEnabled: state.hapticEnabled,
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
  stopVuLoop();
}

function initDeviceInfo(): void {
  // Initial fetch
  try {
    if (typeof bridge.getDeviceInfo === 'function') {
      void bridge.getDeviceInfo().then((info) => {
        if (!info) return;
        if (typeof info.batteryLevel === 'number') {
          state.batteryLevel = info.batteryLevel;
        }
        if (typeof info.isWearing === 'boolean') {
          state.isWearing = info.isWearing;
        }
        // Re-render home so the battery line shows immediately.
        if (state.screen === 'home') renderCurrentScreen();
      }).catch(() => {
        // ignore
      });
    }
  } catch {
    // ignore
  }

  // Status listener
  try {
    if (typeof bridge.onDeviceStatusChanged === 'function') {
      bridge.onDeviceStatusChanged((status) => {
        let changed = false;
        if (typeof status.batteryLevel === 'number' && status.batteryLevel !== state.batteryLevel) {
          state.batteryLevel = status.batteryLevel;
          changed = true;
        }
        if (typeof status.isWearing === 'boolean' && status.isWearing !== state.isWearing) {
          state.isWearing = status.isWearing;
          changed = true;
        }

        // If glasses are removed during coaching, stop coaching.
        if (status.isWearing === false && state.isCoaching) {
          try {
            bridge.audioControl(false);
          } catch {
            // ignore
          }
          stopSession();
          renderCurrentScreen();
          return;
        }

        if (changed && state.screen === 'home') {
          renderCurrentScreen();
        }
      });
    }
  } catch {
    // ignore
  }
}

function initLaunchSource(): void {
  try {
    if (typeof bridge.onLaunchSource === 'function') {
      bridge.onLaunchSource((source) => {
        if (source === 'glassesMenu') {
          state.launchedFromGlassesMenu = true;
          // Auto-start coaching immediately on launch from glasses menu.
          // Wait briefly for settings/render to land, then start.
          setTimeout(() => {
            try {
              autoStartCoaching();
            } catch {
              // ignore
            }
          }, 150);
        }
      });
    }
  } catch {
    // ignore
  }
}

// Re-export for convenience
export { handleEvent } from './events';
export { audioAnalyzer } from './audio';
