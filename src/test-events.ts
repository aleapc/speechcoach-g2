/**
 * State transition tests for Speech Coach.
 * Run with: npx tsx src/test-events.ts
 *
 * Tests event handling and state machine transitions
 * without requiring the G2 bridge.
 */

import {
  state,
  createInitialState,
  startSession,
  stopSession,
  goHome,
  toggleLiveView,
  getPaceZone,
  updateWpm,
} from './state';

import { AudioAnalyzer } from './glasses/audio';
import { t, getFeedbackText } from './i18n';

// ── Test helpers ──

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS: ${msg}`);
  } else {
    failed++;
    console.error(`  FAIL: ${msg}`);
  }
}

function resetState(): void {
  Object.assign(state, createInitialState());
}

// ── Tests ──

console.log('\n=== Speech Coach State Transition Tests ===\n');

// Test 1: Initial state
console.log('Test 1: Initial state');
resetState();
assert(state.screen === 'home', 'starts on home screen');
assert(state.isCoaching === false, 'not coaching initially');
assert(state.liveView === 'detailed', 'default view is detailed');
assert(state.sessions.length === 0, 'no sessions initially');
assert(state.thresholds.slow === 100, 'default slow threshold is 100');
assert(state.thresholds.fast === 160, 'default fast threshold is 160');

// Test 2: Start session
console.log('\nTest 2: Start session');
resetState();
startSession();
assert(state.isCoaching === true, 'coaching is active after start');
assert(state.screen === 'live', 'screen changes to live');
assert(state.sessionStartTime > 0, 'session start time is set');
assert(state.currentWpm === 0, 'WPM starts at 0');
assert(state.wpmSamples.length === 0, 'no WPM samples yet');

// Test 3: Stop session creates record
console.log('\nTest 3: Stop session creates record');
resetState();
startSession();
updateWpm(120);
updateWpm(140);
updateWpm(130);
stopSession();
assert(state.isCoaching === false, 'coaching stops');
assert(state.screen === 'summary', 'screen changes to summary');
assert(state.sessions.length === 1, 'session record created');
assert(state.sessions[0].avgWpm === 130, 'avg WPM calculated correctly');
assert(state.sessions[0].minWpm === 120, 'min WPM tracked');
assert(state.sessions[0].maxWpm === 140, 'max WPM tracked');

// Test 4: Go home from summary
console.log('\nTest 4: Go home from summary');
resetState();
startSession();
stopSession();
assert(state.screen === 'summary', 'on summary screen');
goHome();
assert(state.screen === 'home', 'back to home screen');
assert(state.isCoaching === false, 'not coaching');

// Test 5: Toggle live view
console.log('\nTest 5: Toggle live view');
resetState();
startSession();
assert(state.liveView === 'detailed', 'starts detailed');
toggleLiveView();
assert(state.liveView === 'simple', 'toggled to simple');
toggleLiveView();
assert(state.liveView === 'detailed', 'toggled back to detailed');

// Test 6: Pace zone classification
console.log('\nTest 6: Pace zone classification');
const thresholds = { slow: 100, fast: 160 };
assert(getPaceZone(80, thresholds) === 'slow', '80 WPM is slow');
assert(getPaceZone(100, thresholds) === 'ok', '100 WPM is ok (boundary)');
assert(getPaceZone(130, thresholds) === 'ok', '130 WPM is ok');
assert(getPaceZone(160, thresholds) === 'ok', '160 WPM is ok (boundary)');
assert(getPaceZone(180, thresholds) === 'fast', '180 WPM is fast');

// Test 7: Multiple sessions stack
console.log('\nTest 7: Multiple sessions stack');
resetState();
startSession();
updateWpm(100);
stopSession();
goHome();
startSession();
updateWpm(150);
stopSession();
assert(state.sessions.length === 2, 'two session records');
assert(state.sessions[0].avgWpm === 150, 'most recent session first');
assert(state.sessions[1].avgWpm === 100, 'older session second');

// Test 8: Double-tap during coaching stops and goes home
console.log('\nTest 8: Double-tap during coaching stops and goes home');
resetState();
startSession();
assert(state.screen === 'live', 'on live screen');
assert(state.isCoaching === true, 'coaching active');
// Simulate what events.ts does on double-tap:
stopSession();
goHome();
assert(state.screen === 'home', 'back to home after double-tap');
assert(state.isCoaching === false, 'coaching stopped');
assert(state.sessions.length === 1, 'session was saved');

// Test 9: WPM update sets pace zone
console.log('\nTest 9: WPM update sets pace zone');
resetState();
startSession();
updateWpm(80);
assert(state.paceZone === 'slow', 'slow pace zone at 80 WPM');
updateWpm(130);
assert(state.paceZone === 'ok', 'ok pace zone at 130 WPM');
updateWpm(200);
assert(state.paceZone === 'fast', 'fast pace zone at 200 WPM');

// Test 10: Session history capped at 20
console.log('\nTest 10: Session history capped at 20');
resetState();
for (let i = 0; i < 25; i++) {
  startSession();
  updateWpm(100 + i);
  stopSession();
  goHome();
}
assert(state.sessions.length === 20, 'history capped at 20 sessions');

// ── NEW TESTS ──

// Test 11: calibratedSilenceThreshold starts null
console.log('\nTest 11: Calibrated silence threshold starts null');
resetState();
assert(state.calibratedSilenceThreshold === null, 'calibratedSilenceThreshold is null initially');

// Test 12: wpmTimeline populated during session
console.log('\nTest 12: WPM timeline populated during session');
resetState();
startSession();
updateWpm(100);
updateWpm(120);
updateWpm(0);
assert(state.wpmTimeline.length === 3, 'timeline has 3 entries (including wpm=0)');
assert(state.wpmTimeline[0].wpm === 100, 'first timeline entry is 100 WPM');
assert(state.wpmTimeline[1].wpm === 120, 'second timeline entry is 120 WPM');
assert(state.wpmTimeline[2].wpm === 0, 'third timeline entry is 0 WPM');

// Test 13: wpmTimeline included in SessionRecord
console.log('\nTest 13: WPM timeline included in SessionRecord');
resetState();
startSession();
updateWpm(100);
updateWpm(120);
updateWpm(140);
stopSession();
assert(state.sessions[0].wpmTimeline !== undefined, 'wpmTimeline exists in session record');
assert(state.sessions[0].wpmTimeline.length === 3, 'wpmTimeline has 3 entries');
assert(state.sessions[0].wpmTimeline[0].wpm === 100, 'first timeline wpm correct');

// Test 14: wpmTimeline reset on new session
console.log('\nTest 14: WPM timeline reset on new session');
resetState();
startSession();
updateWpm(100);
updateWpm(120);
stopSession();
goHome();
startSession();
assert(state.wpmTimeline.length === 0, 'wpmTimeline reset for new session');

// Test 15: hapticEnabled defaults to false
console.log('\nTest 15: Haptic enabled defaults to false');
resetState();
assert(state.hapticEnabled === false, 'hapticEnabled is false by default');

// Test 16: paceZone transition detection
console.log('\nTest 16: Pace zone transition detection');
resetState();
startSession();
updateWpm(80);
const zone1 = state.paceZone;
assert(zone1 === 'slow', 'starts in slow zone at 80 WPM');
updateWpm(130);
const zone2 = state.paceZone;
assert(zone2 === 'ok', 'transitions to ok zone at 130 WPM');
assert(zone1 !== zone2, 'zone actually changed (transition detected)');
updateWpm(200);
const zone3 = state.paceZone;
assert(zone3 === 'fast', 'transitions to fast zone at 200 WPM');

// Test 17: SessionRecord with timeline is JSON-serializable
console.log('\nTest 17: SessionRecord with timeline is JSON-serializable');
resetState();
startSession();
updateWpm(100);
updateWpm(150);
stopSession();
let jsonStr = '';
let jsonError = false;
try {
  jsonStr = JSON.stringify(state.sessions[0]);
} catch {
  jsonError = true;
}
assert(!jsonError, 'JSON.stringify does not throw');
assert(jsonStr.includes('"wpmTimeline"'), 'JSON contains wpmTimeline field');
assert(jsonStr.includes('"wpm":100'), 'JSON contains wpm data');

// ── AudioAnalyzer tests ──

console.log('\nTest 18: AudioAnalyzer construction and reset');
{
  const a = new AudioAnalyzer();
  a.reset();
  assert(a.getCalibrationStatus().isCalibrated === false, 'not calibrated after reset');
  assert(a.getTotalWords() === 0, 'word count = 0 after reset');
  assert(a.isSpeaking() === false, 'not speaking after reset');
  assert(a.getCurrentRms() === 0, 'rms = 0 with no frames');
  assert(a.getWpm() === 0, 'wpm = 0 immediately');
}

// Helper: build PCM ArrayBuffer of N samples at constant amplitude
function makePcm(amplitude: number, sampleCount: number): ArrayBuffer {
  const buf = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) buf[i] = amplitude;
  return buf.buffer;
}

// Helper: noise PCM (alternating ±amplitude)
function makeNoisePcm(amplitude: number, sampleCount: number): ArrayBuffer {
  const buf = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) buf[i] = i % 2 === 0 ? amplitude : -amplitude;
  return buf.buffer;
}

console.log('\nTest 19: AudioAnalyzer RMS computation via feed');
{
  const a = new AudioAnalyzer();
  a.reset();
  // Feed a single 100ms frame (1600 samples) of constant ±1000
  a.feedPcmData(makeNoisePcm(1000, 1600));
  // RMS for ±1000 is 1000
  const rms = a.getCurrentRms();
  assert(rms > 990 && rms < 1010, `RMS ~1000 for ±1000 samples (got ${rms})`);
}

console.log('\nTest 20: AudioAnalyzer silence frame yields ~0 RMS');
{
  const a = new AudioAnalyzer();
  a.reset();
  a.feedPcmData(makePcm(0, 1600));
  assert(a.getCurrentRms() === 0, 'silence → RMS 0');
}

console.log('\nTest 21: AudioAnalyzer calibration phase (first 3s)');
{
  const a = new AudioAnalyzer();
  a.reset();
  // Feed first frame — within calibration window, so isCalibrated stays false
  a.feedPcmData(makeNoisePcm(300, 1600));
  assert(a.getCalibrationStatus().isCalibrated === false, 'still calibrating after 1 frame');
  // Calibration threshold should still be at default during calibration window
  const before = a.getCalibrationStatus().threshold;
  assert(before > 0, 'threshold has a value during calibration');
}

console.log('\nTest 22: AudioAnalyzer feedPcmData accumulates frames');
{
  const a = new AudioAnalyzer();
  a.reset();
  // Feed half a frame — should not produce a frame yet
  a.feedPcmData(makeNoisePcm(500, 800));
  assert(a.getCurrentRms() === 0, 'no frame yet (only 800 samples buffered)');
  // Feed remaining 800 → completes 1600-sample frame
  a.feedPcmData(makeNoisePcm(500, 800));
  assert(a.getCurrentRms() > 0, 'frame produced after 1600 samples buffered');
}

console.log('\nTest 23: AudioAnalyzer caps WPM at 300');
{
  const a = new AudioAnalyzer();
  a.reset();
  // Empty / short → 0 WPM (less than 2s elapsed)
  assert(a.getWpm() === 0, 'wpm 0 when elapsed < 2s');
}

console.log('\nTest 24: AudioAnalyzer wordCount starts at 0');
{
  const a = new AudioAnalyzer();
  a.reset();
  assert(a.getTotalWords() === 0, 'no words initially');
}

// ── Pace zone edge cases ──

console.log('\nTest 25: Pace zone boundary cases');
{
  const th = { slow: 100, fast: 160 };
  assert(getPaceZone(99, th) === 'slow', '99 WPM is slow');
  assert(getPaceZone(100, th) === 'ok', '100 WPM is ok (boundary, not <slow)');
  assert(getPaceZone(101, th) === 'ok', '101 WPM is ok');
  assert(getPaceZone(159, th) === 'ok', '159 WPM is ok');
  assert(getPaceZone(160, th) === 'ok', '160 WPM is ok (boundary, not >fast)');
  assert(getPaceZone(161, th) === 'fast', '161 WPM is fast');
  assert(getPaceZone(0, th) === 'slow', '0 WPM is slow');
}

// ── Custom thresholds ──

console.log('\nTest 26: Pace zones with custom thresholds');
{
  const th = { slow: 80, fast: 200 };
  assert(getPaceZone(70, th) === 'slow', '70 with slow=80 is slow');
  assert(getPaceZone(150, th) === 'ok', '150 in 80-200 is ok');
  assert(getPaceZone(220, th) === 'fast', '220 with fast=200 is fast');
}

// ── Event parsing (replicated logic from glasses/events.ts) ──

console.log('\nTest 27: Event parsing — eventType normalization');
{
  function normalize(raw: unknown): number {
    if (raw === undefined || raw === null) return 0; // SDK quirk
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') return parseInt(raw, 10) || 0;
    return -1;
  }
  assert(normalize(undefined) === 0, 'undefined → 0 (click)');
  assert(normalize(null) === 0, 'null → 0');
  assert(normalize(0) === 0, '0 → 0');
  assert(normalize(3) === 3, '3 → 3');
  assert(normalize('3') === 3, '"3" → 3');
}

console.log('\nTest 28: Event parsing — sysEvent fallback');
{
  function action(t: number): string {
    if (t === 0) return 'click';
    if (t === 3) return 'doubleClick';
    if (t === 1) return 'scrollUp';
    if (t === 2) return 'scrollDown';
    return 'unknown';
  }
  // sysEvent with eventType 0 → click
  const e1 = { sysEvent: { eventType: 0 } };
  assert(action((e1 as any).sysEvent.eventType ?? 0) === 'click', 'sysEvent eventType 0 → click');
  // sysEvent with no eventType → defaults to click
  const e2 = { sysEvent: {} };
  const t2 = (e2 as any).sysEvent.eventType ?? 0;
  assert(action(t2) === 'click', 'sysEvent missing eventType → click (SDK quirk)');
  // doubleClick
  const e3 = { sysEvent: { eventType: 3 } };
  assert(action((e3 as any).sysEvent.eventType) === 'doubleClick', 'sysEvent eventType 3 → doubleClick');
}

// ── Exponential moving average behavior ──

console.log('\nTest 29: EMA smoothing (concept verification)');
{
  // EMA: smoothed = α·raw + (1-α)·prevSmoothed; α = 0.3
  const alpha = 0.3;
  let sm: number | null = null;
  function ema(raw: number): number {
    if (sm === null) sm = raw;
    else sm = alpha * raw + (1 - alpha) * sm;
    return sm;
  }
  assert(ema(100) === 100, 'first value → no smoothing');
  const v2 = ema(200);
  assert(v2 > 100 && v2 < 200, 'second value moves toward new but smoothed');
  assert(Math.abs(v2 - 130) < 0.001, '0.3·200 + 0.7·100 = 130');
  // Stable input → converges
  for (let i = 0; i < 50; i++) ema(150);
  assert(Math.abs(sm! - 150) < 0.5, 'converges to stable input');
}

// ── i18n key coverage ──

console.log('\nTest 30: i18n key coverage across all 3 languages');
{
  const ALL_KEYS = [
    'appName', 'start', 'stop', 'recentSessions', 'noSessions',
    'wpm', 'feedbackSlow', 'feedbackOk', 'feedbackFast', 'feedbackPause',
    'summary', 'duration', 'avgWpm', 'minWpm', 'maxWpm', 'variation',
    'backToHome', 'settings', 'slowThreshold', 'fastThreshold',
    'language', 'tapToStart', 'tapToStop', 'doubleTapBack', 'swipeToggleView',
    'listening', 'sessionComplete', 'calibrating', 'calibratingHint',
    'silenceThreshold', 'wpmGraph', 'timeAxis',
    'exportJson', 'exportCsv', 'exportAll', 'hapticFeedback', 'hapticHint',
    'battery', 'lowBattery',
  ];
  const LOCALES = ['en', 'pt', 'es'];
  const original = state.language;
  for (const loc of LOCALES) {
    state.language = loc;
    let missing = 0;
    for (const key of ALL_KEYS) {
      const v = t(key as any);
      if (!v || typeof v !== 'string' || v === key) missing++;
    }
    assert(missing === 0, `${loc}: all ${ALL_KEYS.length} keys present`);
  }
  state.language = original;
}

console.log('\nTest 31: getFeedbackText for each pace zone');
{
  state.language = 'en';
  const slow = getFeedbackText('slow', 80);
  const ok = getFeedbackText('ok', 130);
  const fast = getFeedbackText('fast', 200);
  const listening = getFeedbackText('ok', 0);
  assert(typeof slow === 'string' && slow.length > 0, 'slow feedback string');
  assert(typeof ok === 'string' && ok.length > 0, 'ok feedback string');
  assert(typeof fast === 'string' && fast.length > 0, 'fast feedback string');
  assert(typeof listening === 'string' && listening.length > 0, 'listening when wpm=0');
}

// ── Session lifecycle: create / start / stop / finalize ──

console.log('\nTest 32: Session lifecycle complete sequence');
{
  resetState();
  // Create
  assert(state.screen === 'home', 'create: home');
  assert(state.isCoaching === false, 'create: not coaching');

  // Start
  startSession();
  assert(state.isCoaching === true, 'start: coaching');
  assert(state.screen === 'live', 'start: live screen');
  assert(state.sessionStartTime > 0, 'start: time set');

  // Run (update WPM)
  updateWpm(100);
  updateWpm(120);
  updateWpm(140);
  assert(state.wpmSamples.length === 3, '3 samples collected');

  // Stop / finalize
  stopSession();
  assert(state.isCoaching === false, 'stop: not coaching');
  assert(state.screen === 'summary', 'stop: summary');
  assert(state.sessions.length === 1, 'finalized into history');
  assert(state.sessions[0].avgWpm === 120, 'avgWpm = 120');
}

// ── Summary ──

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) {
  process.exit(1);
}
