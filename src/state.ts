export type Screen = 'home' | 'live' | 'summary';
export type LiveView = 'detailed' | 'simple';
export type PaceZone = 'slow' | 'ok' | 'fast';

export interface WpmTimelinePoint {
  sec: number;
  wpm: number;
}

export interface SessionRecord {
  id: string;
  date: string;
  durationSec: number;
  avgWpm: number;
  minWpm: number;
  maxWpm: number;
  wpmTimeline: WpmTimelinePoint[];
}

export interface WpmThresholds {
  slow: number;  // below this = slow (default 100)
  fast: number;  // above this = fast (default 160)
}

export interface AppState {
  screen: Screen;
  liveView: LiveView;
  isCoaching: boolean;
  isLoading: boolean;

  // Live session data
  sessionStartTime: number;
  elapsedSec: number;
  currentWpm: number;
  paceZone: PaceZone;
  wpmSamples: number[];
  wpmTimeline: WpmTimelinePoint[];

  // Session history
  sessions: SessionRecord[];

  // Settings
  thresholds: WpmThresholds;
  language: string;
  hapticEnabled: boolean;

  // Calibration
  calibratedSilenceThreshold: number | null;
}

const DEFAULT_THRESHOLDS: WpmThresholds = { slow: 100, fast: 160 };

export function createInitialState(): AppState {
  return {
    screen: 'home',
    liveView: 'detailed',
    isCoaching: false,
    isLoading: false,

    sessionStartTime: 0,
    elapsedSec: 0,
    currentWpm: 0,
    paceZone: 'ok',
    wpmSamples: [],
    wpmTimeline: [],

    sessions: [],

    thresholds: { ...DEFAULT_THRESHOLDS },
    language: detectLanguage(),
    hapticEnabled: false,

    calibratedSilenceThreshold: null,
  };
}

function detectLanguage(): string {
  const lang = (typeof navigator !== 'undefined' ? navigator.language : 'en').slice(0, 2).toLowerCase();
  if (['pt', 'es', 'en'].includes(lang)) return lang;
  return 'en';
}

// Singleton state
export const state: AppState = createInitialState();

export function getPaceZone(wpm: number, thresholds: WpmThresholds): PaceZone {
  if (wpm < thresholds.slow) return 'slow';
  if (wpm > thresholds.fast) return 'fast';
  return 'ok';
}

export function startSession(): void {
  state.isCoaching = true;
  state.screen = 'live';
  state.sessionStartTime = Date.now();
  state.elapsedSec = 0;
  state.currentWpm = 0;
  state.paceZone = 'ok';
  state.wpmSamples = [];
  state.wpmTimeline = [];
  state.calibratedSilenceThreshold = null;
}

export function stopSession(): void {
  state.isCoaching = false;

  const avgWpm = state.wpmSamples.length > 0
    ? Math.round(state.wpmSamples.reduce((a, b) => a + b, 0) / state.wpmSamples.length)
    : 0;
  const minWpm = state.wpmSamples.length > 0 ? Math.min(...state.wpmSamples) : 0;
  const maxWpm = state.wpmSamples.length > 0 ? Math.max(...state.wpmSamples) : 0;

  const record: SessionRecord = {
    id: Date.now().toString(36),
    date: new Date().toISOString(),
    durationSec: state.elapsedSec,
    avgWpm,
    minWpm,
    maxWpm,
    wpmTimeline: [...state.wpmTimeline],
  };

  state.sessions.unshift(record);
  if (state.sessions.length > 20) state.sessions.pop();

  state.screen = 'summary';
}

export function updateElapsed(): void {
  if (state.isCoaching && state.sessionStartTime > 0) {
    state.elapsedSec = Math.floor((Date.now() - state.sessionStartTime) / 1000);
  }
}

export function updateWpm(wpm: number): void {
  state.currentWpm = wpm;
  state.paceZone = getPaceZone(wpm, state.thresholds);
  if (wpm > 0) {
    state.wpmSamples.push(wpm);
  }
  state.wpmTimeline.push({ sec: state.elapsedSec, wpm });
}

export function goHome(): void {
  state.screen = 'home';
  state.isCoaching = false;
}

export function toggleLiveView(): void {
  state.liveView = state.liveView === 'detailed' ? 'simple' : 'detailed';
}
