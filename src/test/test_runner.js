/**
 * @file test_runner.js
 * @description Offline test suite runner for vision & gesture recognition engine.
 */

const assert = require('assert');
const { OneEuroFilter, PointSmoother, LowPassFilter } = require('../../lib/smooth_filter');
const ConfigManager = require('../core/config');
const GestureCatalog = require('../core/gestures');
const GestureDetector = require('../core/gesture_detector');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function test(description, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ ${description}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✗ ${description}`);
    console.error(`    Error: ${err.message}`);
    if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
  }
}

async function testAsync(description, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ ${description}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✗ ${description}`);
    console.error(`    Error: ${err.message}`);
  }
}

// Synthetic hand generator for MediaPipe landmarks
function createSyntheticHand(options = {}) {
  // Base wrist at (0.5, 0.8, 0.0)
  const wrist = { x: 0.5, y: 0.8, z: 0.0 };
  const landmarks = [];
  landmarks[0] = wrist;

  // Middle MCP at (0.5, 0.5, 0.0), scale = 0.3
  landmarks[9] = { x: 0.5, y: 0.5, z: 0.0 };
  landmarks[5] = { x: 0.45, y: 0.52, z: 0.0 }; // Index MCP
  landmarks[13] = { x: 0.55, y: 0.53, z: 0.0 }; // Ring MCP
  landmarks[17] = { x: 0.60, y: 0.56, z: 0.0 }; // Pinky MCP

  // Helper to build a finger: MCP -> PIP -> DIP -> TIP
  function buildFinger(mcpIdx, pipIdx, dipIdx, tipIdx, state, baseX, baseY) {
    const mcp = landmarks[mcpIdx];
    if (state === 'EXTENDED') {
      landmarks[pipIdx] = { x: baseX, y: baseY - 0.08, z: 0.0 };
      landmarks[dipIdx] = { x: baseX, y: baseY - 0.16, z: 0.0 };
      landmarks[tipIdx] = { x: baseX, y: baseY - 0.24, z: 0.0 };
    } else if (state === 'CURLED') {
      landmarks[pipIdx] = { x: baseX, y: baseY - 0.06, z: -0.04 };
      landmarks[dipIdx] = { x: baseX, y: baseY - 0.02, z: -0.06 };
      landmarks[tipIdx] = { x: baseX, y: baseY + 0.02, z: -0.04 };
    } else { // HALF_CURLED
      landmarks[pipIdx] = { x: baseX, y: baseY - 0.07, z: -0.02 };
      landmarks[dipIdx] = { x: baseX, y: baseY - 0.10, z: -0.04 };
      landmarks[tipIdx] = { x: baseX, y: baseY - 0.08, z: -0.05 };
    }
  }

  // Thumb build
  const thumbState = options.thumb || 'EXTENDED';
  landmarks[1] = { x: 0.42, y: 0.70, z: 0.0 }; // CMC
  landmarks[2] = { x: 0.38, y: 0.65, z: 0.0 }; // MCP
  if (thumbState === 'EXTENDED') {
    landmarks[3] = { x: 0.34, y: 0.58, z: 0.0 }; // IP
    landmarks[4] = { x: 0.30, y: 0.52, z: 0.0 }; // TIP
  } else if (thumbState === 'CURLED') {
    landmarks[3] = { x: 0.42, y: 0.60, z: -0.02 };
    landmarks[4] = { x: 0.46, y: 0.58, z: -0.03 };
  } else if (thumbState === 'PINCH_INDEX') {
    landmarks[3] = { x: 0.40, y: 0.32, z: 0.0 };
    landmarks[4] = { x: 0.45, y: 0.28, z: 0.0 }; // Touching index tip
  } else if (thumbState === 'PINCH_MIDDLE') {
    landmarks[3] = { x: 0.44, y: 0.32, z: 0.0 };
    landmarks[4] = { x: 0.50, y: 0.26, z: 0.0 }; // Touching middle tip
  } else if (thumbState === 'THUMBS_UP') {
    landmarks[3] = { x: 0.38, y: 0.55, z: 0.0 };
    landmarks[4] = { x: 0.38, y: 0.45, z: 0.0 }; // Pointing straight up
  } else if (thumbState === 'THUMBS_DOWN') {
    landmarks[2] = { x: 0.38, y: 0.65, z: 0.0 };
    landmarks[3] = { x: 0.38, y: 0.75, z: 0.0 };
    landmarks[4] = { x: 0.38, y: 0.85, z: 0.0 }; // Pointing straight down
  }

  // Build remaining fingers
  const indexState = options.index || 'EXTENDED';
  buildFinger(5, 6, 7, 8, indexState, 0.45, 0.52);
  if (options.pinchIndex) {
    landmarks[8] = { x: 0.45, y: 0.28, z: 0.0 };
  }

  const middleState = options.middle || 'EXTENDED';
  buildFinger(9, 10, 11, 12, middleState, 0.50, 0.50);
  if (options.pinchMiddle) {
    landmarks[12] = { x: 0.50, y: 0.26, z: 0.0 };
  }

  const ringState = options.ring || 'EXTENDED';
  buildFinger(13, 14, 15, 16, ringState, 0.55, 0.53);

  const pinkyState = options.pinky || 'EXTENDED';
  buildFinger(17, 18, 19, 20, pinkyState, 0.60, 0.56);

  return landmarks;
}

async function runAllTests() {
  console.log('====================================================');
  console.log('Running Offline Vision & Gesture Recognition Tests');
  console.log('====================================================\n');

  console.log('1. OneEuroFilter & PointSmoother Tests');
  test('OneEuroFilter initializes with default cutoff and beta', () => {
    const filter = new OneEuroFilter();
    assert.strictEqual(filter.minCutoff, 1.0);
    assert.strictEqual(filter.beta, 0.007);
    assert.strictEqual(filter.dCutoff, 1.0);
  });

  test('OneEuroFilter dampens high-frequency jitter at low speed', () => {
    const filter = new OneEuroFilter({ minCutoff: 1.0, beta: 0.007 });
    let t = 1000;
    // Base signal around 10.0 with +/- 0.5 noise
    let filtered;
    for (let i = 0; i < 20; i++) {
      const noisy = 10.0 + (i % 2 === 0 ? 0.5 : -0.5);
      filtered = filter.filter(noisy, t);
      t += 33.3; // ~30 fps
    }
    // Filtered value should be very close to 10.0 (jitter attenuated)
    assert(Math.abs(filtered - 10.0) < 0.25, `Expected jitter attenuated near 10, got ${filtered}`);
  });

  test('OneEuroFilter increases cutoff during fast movement to prevent lag', () => {
    const filter = new OneEuroFilter({ minCutoff: 1.0, beta: 0.1 });
    let t = 1000;
    filter.filter(0, t);
    t += 33.3;
    // Sudden leap to 100
    const fastFiltered = filter.filter(100, t);
    // At high speed with beta=0.1, it should aggressively follow the leap
    assert(fastFiltered > 20, `Filter should adapt quickly on high velocity, got ${fastFiltered}`);
  });

  test('PointSmoother dampens micro-tremors via continuous deadzone', () => {
    const smoother = new PointSmoother({ deadzone: 0.02, sensitivityX: 1.0, sensitivityY: 1.0 });
    let t = 1000;
    const p1 = smoother.smooth(0.500, 0.500, t);
    t += 33.3;
    // Tiny jitter 0.005 (well within deadzone of 0.02)
    const p2 = smoother.smooth(0.505, 0.500, t);
    // Due to quadratic deadzone, movement is heavily dampened
    assert(Math.abs(p2.x - p1.x) < 0.002, `Tremor should be dampened: ${p2.x} vs ${p1.x}`);
  });

  test('PointSmoother handles viewport scaling properly', () => {
    const smoother = new PointSmoother({ viewportWidth: 1920, viewportHeight: 1080, sensitivityX: 1.0, sensitivityY: 1.0 });
    const res = smoother.smooth(0.5, 0.5, 1000);
    assert.strictEqual(res.screenX, 960);
    assert.strictEqual(res.screenY, 540);
  });

  test('PointSmoother handles EMA fallback on anomalous timestamp gap', () => {
    const smoother = new PointSmoother({ useEmaFallback: true });
    smoother.smooth(0.5, 0.5, 1000);
    // Huge gap of 2 seconds (e.g. background tab)
    const res = smoother.smooth(0.7, 0.7, 3000);
    assert(!Number.isNaN(res.x));
    assert(!Number.isNaN(res.y));
  });

  console.log('\n2. ConfigManager Tests');
  test('DEFAULT_CONFIG contains all required sections and bindings', () => {
    assert(ConfigManager.DEFAULT_CONFIG.camera);
    assert(ConfigManager.DEFAULT_CONFIG.tracking);
    assert(ConfigManager.DEFAULT_CONFIG.gestures);
    assert(ConfigManager.DEFAULT_CONFIG.gestureBindings);
    assert(ConfigManager.DEFAULT_CONFIG.ui);

    assert.strictEqual(ConfigManager.DEFAULT_CONFIG.gestureBindings.PINCH, 'ACTION_CLICK');
    assert.strictEqual(ConfigManager.DEFAULT_CONFIG.gestureBindings.VICTORY_PEACE, 'ACTION_SCROLL');
    assert.strictEqual(ConfigManager.DEFAULT_CONFIG.gestureBindings.OK_SIGN, 'ACTION_TOGGLE_ZOOM_LENS');
  });

  test('deepMerge preserves nested default values', () => {
    const partial = {
      tracking: {
        sensitivityX: 2.0
      }
    };
    const merged = ConfigManager.deepMerge(ConfigManager.DEFAULT_CONFIG, partial);
    assert.strictEqual(merged.tracking.sensitivityX, 2.0);
    // SensitivityY should be preserved from DEFAULT_CONFIG
    assert.strictEqual(merged.tracking.sensitivityY, 1.4);
    assert.strictEqual(merged.camera.width, 640);
  });

  await testAsync('loadConfig and saveConfig work gracefully in standalone environments', async () => {
    const cfg = await ConfigManager.loadConfig();
    assert.strictEqual(typeof cfg, 'object');
    await ConfigManager.saveConfig({ ui: { cursorTheme: 'laser-green' } });
    const updated = ConfigManager.getConfig();
    assert.strictEqual(updated.ui.cursorTheme, 'laser-green');
    await ConfigManager.resetConfig();
    const reset = ConfigManager.getConfig();
    assert.strictEqual(reset.ui.cursorTheme, 'laser-cyan');
  });

  console.log('\n3. GestureCatalog Tests');
  test('Catalog exposes all 12+ gestures and actions', () => {
    const gestures = GestureCatalog.getAllGestures();
    assert(gestures.length >= 13);
    assert(GestureCatalog.isValidGesture('PINCH'));
    assert(GestureCatalog.isValidGesture('DOUBLE_PINCH'));
    assert(GestureCatalog.isValidGesture('VICTORY_PEACE'));
    assert(GestureCatalog.isValidGesture('OK_SIGN'));

    const actions = GestureCatalog.getAllActions();
    assert(actions.length >= 14);
    assert(GestureCatalog.isValidAction('ACTION_CLICK'));
    assert(GestureCatalog.isValidAction('ACTION_SCROLL'));
    assert(GestureCatalog.isValidAction('ACTION_TOGGLE_ZOOM_LENS'));
  });

  test('Action categorization partitions correctly', () => {
    const pointerActions = GestureCatalog.getActionsByCategory('POINTER');
    assert(pointerActions.some(a => a.id === 'ACTION_CLICK'));
    assert(pointerActions.some(a => a.id === 'ACTION_DOUBLE_CLICK'));
    assert(pointerActions.some(a => a.id === 'ACTION_RIGHT_CLICK'));

    const navActions = GestureCatalog.getActionsByCategory('NAVIGATION');
    assert(navActions.some(a => a.id === 'ACTION_SCROLL'));

    const zoomActions = GestureCatalog.getActionsByCategory('ZOOM');
    assert(zoomActions.some(a => a.id === 'ACTION_TOGGLE_ZOOM_LENS'));
  });

  console.log('\n4. GestureDetector High-Precision Tests');
  test('Detector handles empty / invalid landmarks without throwing', () => {
    const detector = new GestureDetector();
    const res = detector.processLandmarks(null);
    assert.strictEqual(res.gesture, 'NONE');
    assert.strictEqual(res.action, 'ACTION_NONE');
    assert.strictEqual(res.confidence, 0.0);
  });

  test('Detector correctly classifies OPEN_PALM gesture', () => {
    const detector = new GestureDetector();
    const hand = createSyntheticHand({
      thumb: 'EXTENDED',
      index: 'EXTENDED',
      middle: 'EXTENDED',
      ring: 'EXTENDED',
      pinky: 'EXTENDED'
    });
    // Run two frames for debouncing
    detector.processLandmarks(hand, { timestamp: 1000 });
    const packet = detector.processLandmarks(hand, { timestamp: 1033 });
    assert.strictEqual(packet.gesture, 'OPEN_PALM');
    assert.strictEqual(packet.action, 'ACTION_HOVER');
    assert.strictEqual(packet.fingerStates.index, 'EXTENDED');
    assert.strictEqual(packet.fingerStates.pinky, 'EXTENDED');
  });

  test('Detector correctly classifies FIST gesture', () => {
    const detector = new GestureDetector();
    const hand = createSyntheticHand({
      thumb: 'CURLED',
      index: 'CURLED',
      middle: 'CURLED',
      ring: 'CURLED',
      pinky: 'CURLED'
    });
    detector.processLandmarks(hand, { timestamp: 1000 });
    const packet = detector.processLandmarks(hand, { timestamp: 1033 });
    assert.strictEqual(packet.gesture, 'FIST');
    assert.strictEqual(packet.action, 'ACTION_DRAG');
  });

  test('Detector correctly classifies POINT gesture', () => {
    const detector = new GestureDetector();
    const hand = createSyntheticHand({
      thumb: 'CURLED',
      index: 'EXTENDED',
      middle: 'CURLED',
      ring: 'CURLED',
      pinky: 'CURLED'
    });
    detector.processLandmarks(hand, { timestamp: 1000 });
    const packet = detector.processLandmarks(hand, { timestamp: 1033 });
    assert.strictEqual(packet.gesture, 'POINT');
    assert.strictEqual(packet.action, 'ACTION_MOVE_POINTER');
  });

  test('Detector recognizes PINCH immediately (0 latency) with visual progress indicator', () => {
    const detector = new GestureDetector();
    const handApproaching = createSyntheticHand({
      thumb: 'EXTENDED',
      index: 'EXTENDED',
      middle: 'CURLED',
      ring: 'CURLED',
      pinky: 'CURLED'
    });
    // Slightly closer: thumb tip near index tip
    handApproaching[4] = { x: 0.43, y: 0.31, z: 0.0 };
    handApproaching[8] = { x: 0.45, y: 0.28, z: 0.0 };
    const prepPacket = detector.processLandmarks(handApproaching, { timestamp: 1000 });
    assert(prepPacket.pinchProgress > 0.0, `Pinch progress should be > 0: ${prepPacket.pinchProgress}`);

    // Touching pinch
    const handPinch = createSyntheticHand({
      thumb: 'PINCH_INDEX',
      pinchIndex: true,
      middle: 'CURLED',
      ring: 'CURLED',
      pinky: 'CURLED'
    });
    const pinchPacket = detector.processLandmarks(handPinch, { timestamp: 1033 });
    assert.strictEqual(pinchPacket.gesture, 'PINCH');
    assert.strictEqual(pinchPacket.action, 'ACTION_CLICK');
    assert.strictEqual(pinchPacket.isPinching, true);
    assert.strictEqual(pinchPacket.pinchProgress, 1.0);
  });

  test('Detector tracks DOUBLE_PINCH timing within 350ms window', () => {
    const detector = new GestureDetector();
    const handPinch = createSyntheticHand({
      thumb: 'PINCH_INDEX',
      pinchIndex: true,
      middle: 'CURLED',
      ring: 'CURLED',
      pinky: 'CURLED'
    });
    const handRelease = createSyntheticHand({
      thumb: 'EXTENDED',
      index: 'EXTENDED',
      middle: 'CURLED',
      ring: 'CURLED',
      pinky: 'CURLED'
    });

    // Pinch 1: press at t=1000
    const p1 = detector.processLandmarks(handPinch, { timestamp: 1000 });
    assert.strictEqual(p1.gesture, 'PINCH');

    // Pinch 1: release at t=1100
    detector.processLandmarks(handRelease, { timestamp: 1100 });

    // Pinch 2: press at t=1250 (150ms after release -> within 350ms window)
    const p2 = detector.processLandmarks(handPinch, { timestamp: 1250 });
    assert.strictEqual(p2.gesture, 'DOUBLE_PINCH');
    assert.strictEqual(p2.action, 'ACTION_DOUBLE_CLICK');
  });

  test('Detector recognizes PINCH_MIDDLE (Right Click)', () => {
    const detector = new GestureDetector();
    const hand = createSyntheticHand({
      thumb: 'PINCH_MIDDLE',
      pinchMiddle: true,
      index: 'EXTENDED', // index finger free
      ring: 'CURLED',
      pinky: 'CURLED'
    });
    const packet = detector.processLandmarks(hand, { timestamp: 1000 });
    assert.strictEqual(packet.gesture, 'PINCH_MIDDLE');
    assert.strictEqual(packet.action, 'ACTION_RIGHT_CLICK');
  });

  test('Detector recognizes VICTORY_PEACE and calculates scroll deltas', () => {
    const detector = new GestureDetector();
    const hand1 = createSyntheticHand({
      thumb: 'CURLED',
      index: 'EXTENDED',
      middle: 'EXTENDED',
      ring: 'CURLED',
      pinky: 'CURLED'
    });
    detector.processLandmarks(hand1, { timestamp: 1000 });
    detector.processLandmarks(hand1, { timestamp: 1033 });

    // Move hand down by 0.1
    const hand2 = createSyntheticHand({
      thumb: 'CURLED',
      index: 'EXTENDED',
      middle: 'EXTENDED',
      ring: 'CURLED',
      pinky: 'CURLED'
    });
    hand2.forEach(pt => pt.y += 0.1);

    const packet2 = detector.processLandmarks(hand2, { timestamp: 1066 });
    assert.strictEqual(packet2.gesture, 'VICTORY_PEACE');
    assert.strictEqual(packet2.action, 'ACTION_SCROLL');
    assert(packet2.scrollDelta.dy > 0, `Scroll delta dy should be positive, got ${packet2.scrollDelta.dy}`);
  });

  test('Detector recognizes THUMBS_UP and THUMBS_DOWN', () => {
    const detector = new GestureDetector();
    const thumbsUpHand = createSyntheticHand({
      thumb: 'THUMBS_UP',
      index: 'CURLED',
      middle: 'CURLED',
      ring: 'CURLED',
      pinky: 'CURLED'
    });
    detector.processLandmarks(thumbsUpHand, { timestamp: 1000 });
    const packetUp = detector.processLandmarks(thumbsUpHand, { timestamp: 1033 });
    assert.strictEqual(packetUp.gesture, 'THUMBS_UP');
    assert.strictEqual(packetUp.action, 'ACTION_SCROLL_UP');

    const thumbsDownHand = createSyntheticHand({
      thumb: 'THUMBS_DOWN',
      index: 'CURLED',
      middle: 'CURLED',
      ring: 'CURLED',
      pinky: 'CURLED'
    });
    detector.processLandmarks(thumbsDownHand, { timestamp: 1100 });
    const packetDown = detector.processLandmarks(thumbsDownHand, { timestamp: 1133 });
    assert.strictEqual(packetDown.gesture, 'THUMBS_DOWN');
    assert.strictEqual(packetDown.action, 'ACTION_SCROLL_DOWN');
  });

  test('Detector recognizes OK_SIGN with extended middle, ring, pinky', () => {
    const detector = new GestureDetector();
    const okHand = createSyntheticHand({
      thumb: 'PINCH_INDEX',
      pinchIndex: true,
      middle: 'EXTENDED',
      ring: 'EXTENDED',
      pinky: 'EXTENDED'
    });
    detector.processLandmarks(okHand, { timestamp: 1000 });
    const packet = detector.processLandmarks(okHand, { timestamp: 1033 });
    assert.strictEqual(packet.gesture, 'OK_SIGN');
    assert.strictEqual(packet.action, 'ACTION_TOGGLE_ZOOM_LENS');
  });

  test('Detector recognizes ROCK_ON (Index & Pinky extended)', () => {
    const detector = new GestureDetector();
    const rockHand = createSyntheticHand({
      thumb: 'CURLED',
      index: 'EXTENDED',
      middle: 'CURLED',
      ring: 'CURLED',
      pinky: 'EXTENDED'
    });
    detector.processLandmarks(rockHand, { timestamp: 1000 });
    const packet = detector.processLandmarks(rockHand, { timestamp: 1033 });
    assert.strictEqual(packet.gesture, 'ROCK_ON');
    assert.strictEqual(packet.action, 'ACTION_TAB_NEXT');
  });

  test('Detector recognizes THREE_FINGERS and calculates zoomDelta', () => {
    const detector = new GestureDetector();
    const threeHand1 = createSyntheticHand({
      thumb: 'EXTENDED',
      index: 'EXTENDED',
      middle: 'EXTENDED',
      ring: 'CURLED',
      pinky: 'CURLED'
    });
    detector.processLandmarks(threeHand1, { timestamp: 1000 });
    detector.processLandmarks(threeHand1, { timestamp: 1033 });

    // Move hand upward (smaller Y) to zoom in
    const threeHand2 = createSyntheticHand({
      thumb: 'EXTENDED',
      index: 'EXTENDED',
      middle: 'EXTENDED',
      ring: 'CURLED',
      pinky: 'CURLED'
    });
    threeHand2.forEach(pt => pt.y -= 0.08);

    const packet2 = detector.processLandmarks(threeHand2, { timestamp: 1066 });
    assert.strictEqual(packet2.gesture, 'THREE_FINGERS');
    assert.strictEqual(packet2.action, 'ACTION_ZOOM');
    assert(packet2.zoomDelta > 0, `Zoom delta should be positive on upward motion, got ${packet2.zoomDelta}`);
  });

  test('Detector outputs standardized packet matching exact specification', () => {
    const detector = new GestureDetector();
    const hand = createSyntheticHand();
    const packet = detector.processLandmarks(hand, { timestamp: 1000, hand: 'Left' });

    assert('gesture' in packet);
    assert('action' in packet);
    assert('cursor' in packet);
    assert('x' in packet.cursor);
    assert('y' in packet.cursor);
    assert('rawX' in packet.cursor);
    assert('rawY' in packet.cursor);
    assert('pinchProgress' in packet);
    assert('pinchDistance' in packet);
    assert('isPinching' in packet);
    assert('scrollDelta' in packet);
    assert('dx' in packet.scrollDelta);
    assert('dy' in packet.scrollDelta);
    assert('zoomDelta' in packet);
    assert('confidence' in packet);
    assert.strictEqual(packet.hand, 'Left');
  });

  console.log('\n====================================================');
  console.log(`Test Results: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
  console.log('====================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
