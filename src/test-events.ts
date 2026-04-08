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

// ── Summary ──

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) {
  process.exit(1);
}
