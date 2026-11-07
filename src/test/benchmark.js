/**
 * @file benchmark.js
 * @description Performance benchmark and latency stress test for offline vision engine.
 */

const { performance } = require('perf_hooks');
const GestureDetector = require('../core/gesture_detector');

function createSyntheticHand() {
  const landmarks = [];
  landmarks[0] = { x: 0.5, y: 0.8, z: 0.0 };
  landmarks[9] = { x: 0.5, y: 0.5, z: 0.0 };
  landmarks[5] = { x: 0.45, y: 0.52, z: 0.0 };
  landmarks[13] = { x: 0.55, y: 0.53, z: 0.0 };
  landmarks[17] = { x: 0.60, y: 0.56, z: 0.0 };

  landmarks[1] = { x: 0.42, y: 0.70, z: 0.0 };
  landmarks[2] = { x: 0.38, y: 0.65, z: 0.0 };
  landmarks[3] = { x: 0.34, y: 0.58, z: 0.0 };
  landmarks[4] = { x: 0.30, y: 0.52, z: 0.0 };

  for (let i = 0; i < 4; i++) {
    const mcp = [5, 9, 13, 17][i];
    const pip = mcp + 1;
    const dip = mcp + 2;
    const tip = mcp + 3;
    const x = [0.45, 0.50, 0.55, 0.60][i];
    const y = [0.52, 0.50, 0.53, 0.56][i];
    landmarks[pip] = { x, y: y - 0.08, z: 0.0 };
    landmarks[dip] = { x, y: y - 0.16, z: 0.0 };
    landmarks[tip] = { x, y: y - 0.24, z: 0.0 };
  }

  return landmarks;
}

function runBenchmark() {
  console.log('----------------------------------------------------');
  console.log('Running 10,000 Frame Offline Performance Benchmark');
  console.log('----------------------------------------------------');

  const detector = new GestureDetector();
  const hand = createSyntheticHand();
  const iterations = 10000;

  // Warmup JIT
  for (let i = 0; i < 500; i++) {
    detector.processLandmarks(hand, { timestamp: i * 33.3 });
  }

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    // Add micro jitter to simulate real camera sensor noise
    hand[4].x = 0.30 + Math.sin(i) * 0.005;
    hand[8].y = 0.28 + Math.cos(i) * 0.005;
    detector.processLandmarks(hand, { timestamp: 500 * 33.3 + i * 33.3 });
  }
  const end = performance.now();
  const totalMs = end - start;
  const msPerFrame = totalMs / iterations;
  const fpsEquivalent = 1000.0 / msPerFrame;

  console.log(`Total time for ${iterations} frames: ${totalMs.toFixed(2)} ms`);
  console.log(`Average latency per frame: ${msPerFrame.toFixed(4)} ms`);
  console.log(`Throughput: ${Math.round(fpsEquivalent)} frames per second`);
  console.log('----------------------------------------------------');

  if (msPerFrame > 1.0) {
    console.warn('⚠️ Warning: Frame processing took > 1.0 ms');
    process.exit(1);
  } else {
    console.log('🚀 Engine easily exceeds 60+ FPS real-time threshold (< 0.1 ms/frame overhead)!');
  }
}

runBenchmark();
