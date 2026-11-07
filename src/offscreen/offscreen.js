/**
 * @file offscreen.js
 * @description Background Hand Tracking Engine for AeroTouch.
 * Runs inside Chrome Offscreen Document (USER_MEDIA).
 * 
 * Features:
 * - Direct camera acquisition without side panel or popup dependencies
 * - MediaPipe Hands offline execution
 * - True 16:9 Screen-to-Camera Mapping with Aspect Alignment & Active Margins
 * - Casiez One-Euro Jitter Filter
 * - Precision Gestures: Point cursor, Pinch click, Double tap, Middle pinch right-click, Air scroll
 */

(async function () {
  'use strict';

  const video = document.getElementById('tracker-video');
  let handsModel = null;
  let mediaStream = null;
  let isRunning = false;
  let isProcessing = false;

  // Configuration
  const currentSettings = {
    edgeMargin: 0.12,
    scrollSensitivity: 1.0
  };

  // 1-Euro Filter instance for (X, Y)
  let filterX = null;
  let filterY = null;

  if (typeof OneEuroFilter !== 'undefined') {
    filterX = new OneEuroFilter(1.2, 0.008);
    filterY = new OneEuroFilter(1.2, 0.008);
  }

  // Gesture State Tracking
  const gestureState = {
    // Pinch Click & Double Click
    isIndexPinching: false,
    indexPinchStartTime: 0,
    lastClickTime: 0,
    clickCount: 0,
    doubleClickTimer: null,

    // Middle Pinch (Right Click)
    isMiddlePinching: false,
    lastRightClickTime: 0,

    // Air Scrolling (Pinch & Move)
    isScrolling: false,
    scrollAnchorY: 0,
    lastScrollY: 0
  };

  // 3D Distance helper
  function dist3D(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = (a.z || 0) - (b.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // Initialize MediaPipe Hands 100% Offline
  function initMediaPipe() {
    const hands = new Hands({
      locateFile: (file) => chrome.runtime.getURL(`lib/mediapipe/${file}`)
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.65,
      minTrackingConfidence: 0.65
    });

    hands.onResults(onHandsResults);
    return hands;
  }

  // MediaPipe Results Processing
  function onHandsResults(results) {
    try {
      const now = performance.now();

      if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        // Hand lost: notify content script to gracefully fade cursor
        chrome.runtime.sendMessage({
          type: 'GESTURE_STREAM',
          data: { active: false, handLost: true }
        }).catch(() => {});
        gestureState.isIndexPinching = false;
        gestureState.isScrolling = false;
        return;
      }

      const lm = results.multiHandLandmarks[0];

      // 1. Hand scale invariant (distance between Wrist 0 and Middle MCP 9)
      const handScale = Math.max(0.08, dist3D(lm[0], lm[9]));

      // 2. Cursor Positioning: User points index finger (Landmark 8)
      // Mirror horizontally so moving hand right moves cursor right on screen
      const rawX = 1.0 - lm[8].x;
      const rawY = lm[8].y;

      // 16:9 Screen-to-Camera Aspect Alignment
      const camW = video.videoWidth || 640;
      const camH = video.videoHeight || 480;
      const camAspect = camW / camH;
      const targetAspect = 16 / 9;

      let adjustedY = rawY;
      if (camAspect < targetAspect) {
        // Camera is taller than 16:9 (e.g. 4:3), crop vertical bounds to match 16:9 active window
        const activeHeightRatio = camAspect / targetAspect;
        const cropY = (1.0 - activeHeightRatio) / 2;
        adjustedY = (rawY - cropY) / activeHeightRatio;
      }

      // Active tracking margin algorithm:
      // Enables comfortable edge-to-edge reach across full 16:9 screen
      const marginX = currentSettings.edgeMargin;
      const marginY = currentSettings.edgeMargin;

      let normX = (rawX - marginX) / (1.0 - 2 * marginX);
      let normY = (adjustedY - marginY) / (1.0 - 2 * marginY);

      normX = Math.max(0, Math.min(1, normX));
      normY = Math.max(0, Math.min(1, normY));

      // Stabilize with One-Euro Jitter Filter
      const smoothX = filterX ? filterX.filter(normX, now) : normX;
      const smoothY = filterY ? filterY.filter(normY, now) : normY;

      // 3. Pinch Distance Calculations (normalized by hand scale)
      const thumbTip = lm[4];
      const indexTip = lm[8];
      const middleTip = lm[12];

      const thumbIndexDist = dist3D(thumbTip, indexTip) / handScale;
      const thumbMiddleDist = dist3D(thumbTip, middleTip) / handScale;

      const PINCH_THRESHOLD = 0.22;
      const PINCH_RELEASE = 0.28;

      let triggeredAction = null;
      let scrollDeltaY = 0;

      // 4. Gesture Logic

      // A. Middle Pinch (Right Click): Thumb + Middle finger tap
      if (thumbMiddleDist < PINCH_THRESHOLD && thumbIndexDist > PINCH_RELEASE) {
        if (!gestureState.isMiddlePinching) {
          gestureState.isMiddlePinching = true;
          if (Date.now() - gestureState.lastRightClickTime > 400) {
            triggeredAction = 'ACTION_RIGHT_CLICK';
            gestureState.lastRightClickTime = Date.now();
          }
        }
      } else if (thumbMiddleDist > PINCH_RELEASE) {
        gestureState.isMiddlePinching = false;
      }

      // B. Index Pinch (Click, Double Click, or Air Scroll):
      if (thumbIndexDist < PINCH_THRESHOLD) {
        if (!gestureState.isIndexPinching) {
          // Pinch started
          gestureState.isIndexPinching = true;
          gestureState.indexPinchStartTime = Date.now();
          gestureState.scrollAnchorY = smoothY;
          gestureState.lastScrollY = smoothY;
          gestureState.isScrolling = false;
        } else {
          // Pinch is held: Check if user is hovering hand in the air to scroll!
          const heldDuration = Date.now() - gestureState.indexPinchStartTime;
          const moveDistY = smoothY - gestureState.scrollAnchorY;

          if (heldDuration > 130 && Math.abs(moveDistY) > 0.02) {
            // Air Scrolling Active
            gestureState.isScrolling = true;
            const dy = (smoothY - gestureState.lastScrollY);
            gestureState.lastScrollY = smoothY;

            // Fluid pixel scroll speed scaled by sensitivity
            scrollDeltaY = dy * 1400 * currentSettings.scrollSensitivity;
            triggeredAction = 'ACTION_SCROLL';
          }
        }
      } else if (thumbIndexDist > PINCH_RELEASE) {
        if (gestureState.isIndexPinching) {
          const pinchDuration = Date.now() - gestureState.indexPinchStartTime;
          gestureState.isIndexPinching = false;

          // If it was a quick tap without scrolling -> Left Click or Double Click
          if (!gestureState.isScrolling && pinchDuration < 300) {
            const nowTime = Date.now();
            if (nowTime - gestureState.lastClickTime < 350) {
              // Double Click
              triggeredAction = 'ACTION_DOUBLE_CLICK';
              gestureState.lastClickTime = 0;
            } else {
              // Single Click
              triggeredAction = 'ACTION_CLICK';
              gestureState.lastClickTime = nowTime;
            }
          }
          gestureState.isScrolling = false;
        }
      }

      // 5. Broadcast Packet to Background -> Active Tab
      const packet = {
        active: true,
        cursor: {
          x: smoothX,
          y: smoothY
        },
        action: triggeredAction,
        isPinching: gestureState.isIndexPinching,
        isScrolling: gestureState.isScrolling,
        scrollDeltaY: scrollDeltaY,
        timestamp: now
      };

      chrome.runtime.sendMessage({
        type: 'GESTURE_STREAM',
        data: packet
      }).catch(() => {});

    } catch (err) {
      console.error('[AeroTouch Offscreen] onHandsResults error:', err);
    } finally {
      isProcessing = false;
    }
  }

  // Camera Frame Loop
  async function cameraLoop() {
    if (!isRunning) return;

    if (video.readyState >= 2 && !isProcessing && handsModel) {
      isProcessing = true;
      try {
        await handsModel.send({ image: video });
      } catch (err) {
        isProcessing = false;
      }
    }

    requestAnimationFrame(cameraLoop);
  }

  // Start Tracker
  async function startTracker() {
    try {
      if (!handsModel) {
        handsModel = initMediaPipe();
      }

      // Check for preferred camera or custom calibration in storage
      let constraints = { video: true };
      try {
        const stored = await chrome.storage.local.get(['preferredCameraId', 'edgeMargin', 'scrollSensitivity']);
        if (stored) {
          if (typeof stored.edgeMargin === 'number') currentSettings.edgeMargin = stored.edgeMargin;
          if (typeof stored.scrollSensitivity === 'number') currentSettings.scrollSensitivity = stored.scrollSensitivity;
          if (stored.preferredCameraId) {
            constraints = { video: { deviceId: { exact: stored.preferredCameraId } } };
          }
        }
      } catch (e) {}

      try {
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (devErr) {
        // Fallback to generic video
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      video.srcObject = mediaStream;

      await new Promise((resolve) => {
        video.onloadedmetadata = () => {
          video.play().then(resolve).catch(resolve);
        };
      });

      isRunning = true;
      requestAnimationFrame(cameraLoop);
      console.log('[AeroTouch Offscreen] Camera started successfully.');
    } catch (err) {
      console.error('[AeroTouch Offscreen] Camera start failed:', err);
      chrome.runtime.sendMessage({
        type: 'TRACKER_ERROR',
        error: err.name || err.message
      }).catch(() => {});
    }
  }

  // Stop Tracker
  function stopTracker() {
    isRunning = false;
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
    video.srcObject = null;
    console.log('[AeroTouch Offscreen] Camera stopped.');
  }

  // Listen for control commands from background service worker
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return;

    if (message.type === 'START_TRACKING') {
      startTracker();
      sendResponse({ success: true });
    } else if (message.type === 'STOP_TRACKING') {
      stopTracker();
      sendResponse({ success: true });
    } else if (message.type === 'UPDATE_SETTINGS') {
      if (typeof message.edgeMargin === 'number') currentSettings.edgeMargin = message.edgeMargin;
      if (typeof message.scrollSensitivity === 'number') currentSettings.scrollSensitivity = message.scrollSensitivity;
      sendResponse({ success: true });
    }
    return true;
  });

  // Start immediately upon offscreen document creation
  startTracker();
})();
