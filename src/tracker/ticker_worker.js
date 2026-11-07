/**
 * @file ticker_worker.js
 * @description Dedicated Background Web Worker Ticker for AeroTouch.
 * 
 * Web Workers run on a separate OS thread and are 100% exempt from Chrome's
 * background tab throttling, window occlusion throttling, and paint-cycle pauses.
 * Ticks consistently at 60 FPS (16ms) regardless of whether the companion window
 * is focused, hidden behind other windows, or minimized.
 */

let intervalId = null;

self.onmessage = function (e) {
  if (!e || !e.data) return;

  switch (e.data.command) {
    case 'start':
      if (intervalId) clearInterval(intervalId);
      const intervalMs = e.data.interval || 16;
      intervalId = setInterval(() => {
        self.postMessage({ type: 'tick', timestamp: performance.now() });
      }, intervalMs);
      break;

    case 'stop':
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      break;

    default:
      break;
  }
};

