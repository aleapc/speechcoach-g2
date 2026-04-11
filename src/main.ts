/**
 * Speech Coach — main entry point.
 * Detects environment: if running in G2 WebView (bridge exists), init glasses.
 * Otherwise, mount React settings panel for phone UI.
 */

import './telemetry'; // self-initializes error listeners
import { initGlasses, setupAudioCallback } from './glasses/index';

declare const bridge: unknown;

function isG2Environment(): boolean {
  return typeof bridge !== 'undefined' && bridge !== null;
}

function main(): void {
  if (isG2Environment()) {
    // Running on G2 glasses WebView
    setupAudioCallback();
    initGlasses();
  } else {
    // Running on phone — mount React settings panel
    import('./app').then(({ mountApp }) => {
      mountApp();
    });
  }
}

// Boot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
