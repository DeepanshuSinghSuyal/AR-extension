/**
 * @file tracker.js
 * @description AeroTouch Dedicated Tracker Controller.
 * Runs in a compact companion window. 100% offline, full hardware speed.
 * 
 * Performance & Background Anti-Throttling Architecture:
 * - Web Worker Ticker (ticker_worker.js) ticks at 60 FPS on an isolated thread,
 *   completely bypassing Chromium's background tab and window occlusion throttling.
 * - Silent Web Audio keepalive prevents OS and browser memory/CPU sleeps.
 * - requestVideoFrameCallback hardware sync when foregrounded.
 * - Zero lag, zero jitter, continuous 60 FPS tracking regardless of window focus.
 */

(async function () {
  'use strict';

  const video = document.getElementById('tracker-video');
  const canvas = document.getElementById('tracker-canvas');
  const ctx = canvas.getContext('2d');
  const labelStatus = document.getElementById('label-status');
  const labelGesture = document.getElementById('label-gesture');
  const btnMinimize = document.getElementById('btn-minimize');
  const btnSettings = document.getElementById('btn-settings');

  let handsModel = null;
  let mediaStream = null;
  let isRunning = false;
  let isProcessing = false;
  let lastFrameProcessedTime = performance.now();
  let tickerWorker = null;
  let audioKeepalive = null;
  let useWorkerTicker = false;

  // Settings
  const settings = {
    edgeMargin: 0.12,
    scrollSensitivity: 1.0
  };

  // 1-Euro Filter for (X, Y)
  let filterX = null;
  let filterY = null;
  if (typeof OneEuroFilter !== 'undefined') {
    filterX = new OneEuroFilter(1.2, 0.008);
    filterY = new OneEuroFilter(1.2, 0.008);
  }

  // Gesture State
  const gestureState = {
    // Middle + Thumb: Left Click & Double Click
    isMiddlePinching: false,
    lastLeftClickTime: 0,

    // Ring + Thumb: Right Click
    isRingPinching: false,
    lastRightClickTime: 0,

    // Index + Thumb: Air-Scroll
    isIndexPinching: false,
    isScrolling: false,
    scrollAnchorY: 0,
    lastScrollY: 0
  };

  // 3D Distance Helper
  function dist3D(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = (a.z || 0) - (b.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // Minimize Window Button
  if (btnMinimize) {
    btnMinimize.addEventListener('click', () => {
      chrome.windows.getCurrent((win) => {
        if (win && win.id) {
          chrome.windows.update(win.id, { state: 'minimized' });
        }
      });
    });
  }

  // Open Settings Button
  if (btnSettings) {
    btnSettings.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS' }).catch(() => {
        window.open(chrome.runtime.getURL('src/options/options.html'), '_blank');
      });
    });
  }

  // Silent Web Audio keepalive prevents Chrome from throttling background windows
  function startAudioKeepalive() {
    try {
      if (audioKeepalive) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioKeepalive = new AudioContextClass();
        const osc = audioKeepalive.createOscillator();
        const gain = audioKeepalive.createGain();
        gain.gain.value = 0.00001; // Silent / inaudible
        osc.connect(gain);
        gain.connect(audioKeepalive.destination);
        osc.start();
        if (audioKeepalive.state === 'suspended') {
          audioKeepalive.resume().catch(() => {});
        }
      }
    } catch (e) {}
  }

  // Dedicated Web Worker Ticker (Bypasses all Chrome background window throttling)
  function startWorkerTicker() {
    try {
      if (tickerWorker) {
        tickerWorker.terminate();
      }
      tickerWorker = new Worker(chrome.runtime.getURL('src/tracker/ticker_worker.js'));
      tickerWorker.onmessage = (e) => {
        if (e && e.data && e.data.type === 'tick') {
          if (isRunning && !isProcessing && video && video.readyState >= 2) {
            processCameraFrame();
          }
        }
      };
      tickerWorker.onerror = (err) => {
        console.warn('[AeroTouch Tracker] Worker ticker error, falling back to rVFC:', err);
        useWorkerTicker = false;
        scheduleNextFrame();
      };
      // 16ms = 60 FPS unthrottled
      tickerWorker.postMessage({ command: 'start', interval: 16 });
      useWorkerTicker = true;
      console.log('[AeroTouch Tracker] Web Worker 60 FPS background ticker started.');
    } catch (err) {
      console.warn('[AeroTouch Tracker] Worker ticker fallback to rVFC:', err);
      useWorkerTicker = false;
      scheduleNextFrame();
    }
  }

  function scheduleNextFrame() {
    if (!isRunning || useWorkerTicker) return;
    if ('requestVideoFrameCallback' in video) {
      video.requestVideoFrameCallback(processCameraFrame);
    } else {
      requestAnimationFrame(processCameraFrame);
    }
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
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // 1. Calculate 16:9 Screen Boundary Box
      const camAspect = w / h;
      const targetAspect = 16 / 9;

      let activeTop = 0;
      let activeBottom = h;
      let activeLeft = 0;
      let activeRight = w;

      if (camAspect < targetAspect) {
        // Camera is taller than 16:9 (e.g. 4:3)
        const activeH = w / targetAspect;
        activeTop = (h - activeH) / 2;
        activeBottom = activeTop + activeH;
      } else if (camAspect > targetAspect) {
        // Camera is wider than 16:9
        const activeW = h * targetAspect;
        activeLeft = (w - activeW) / 2;
        activeRight = activeLeft + activeW;
      }

      const activeBoxWidth = activeRight - activeLeft;
      const activeBoxHeight = activeBottom - activeTop;

      const marginPxX = activeBoxWidth * settings.edgeMargin;
      const marginPxY = activeBoxHeight * settings.edgeMargin;

      const boxLeft = activeLeft + marginPxX;
      const boxRight = activeRight - marginPxX;
      const boxTop = activeTop + marginPxY;
      const boxBottom = activeBottom - marginPxY;

      // Draw dashed 16:9 reach zone boundary
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(boxLeft, boxTop, boxRight - boxLeft, boxBottom - boxTop);

      // Corner accent brackets
      const bracketLen = 8;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      
      // Top-Left
      ctx.beginPath();
      ctx.moveTo(boxLeft, boxTop + bracketLen);
      ctx.lineTo(boxLeft, boxTop);
      ctx.lineTo(boxLeft + bracketLen, boxTop);
      ctx.stroke();

      // Top-Right
      ctx.beginPath();
      ctx.moveTo(boxRight - bracketLen, boxTop);
      ctx.lineTo(boxRight, boxTop);
      ctx.lineTo(boxRight, boxTop + bracketLen);
      ctx.stroke();

      // Bottom-Left
      ctx.beginPath();
      ctx.moveTo(boxLeft, boxBottom - bracketLen);
      ctx.lineTo(boxLeft, boxBottom);
      ctx.lineTo(boxLeft + bracketLen, boxBottom);
      ctx.stroke();

      // Bottom-Right
      ctx.beginPath();
      ctx.moveTo(boxRight - bracketLen, boxBottom);
      ctx.lineTo(boxRight, boxBottom);
      ctx.lineTo(boxRight, boxBottom - bracketLen);
      ctx.stroke();

      ctx.restore();

      // Check for hand landmarks
      if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        labelGesture.textContent = 'Show Hand';
        labelGesture.classList.remove('active');

        chrome.runtime.sendMessage({
          type: 'GESTURE_STREAM',
          data: {
            active: true,
            handDetected: false,
            handLost: true
          }
        }).catch(() => {});

        gestureState.isIndexPinching = false;
        gestureState.isMiddlePinching = false;
        gestureState.isRingPinching = false;
        gestureState.isScrolling = false;
        return;
      }

      const lm = results.multiHandLandmarks[0];

      // Hand scale invariant (Wrist to Middle MCP)
      const handScale = Math.max(0.08, dist3D(lm[0], lm[9]));

      // 2. Cursor Positioning: Landmark 8 (Index Fingertip)
      const rawX = 1.0 - lm[8].x; // Mirrored for screen control
      const rawY = lm[8].y;

      let adjustedX = rawX;
      let adjustedY = rawY;

      if (camAspect < targetAspect) {
        const activeHeightRatio = camAspect / targetAspect;
        const cropY = (1.0 - activeHeightRatio) / 2;
        adjustedY = (rawY - cropY) / activeHeightRatio;
      } else if (camAspect > targetAspect) {
        const activeWidthRatio = targetAspect / camAspect;
        const cropX = (1.0 - activeWidthRatio) / 2;
        adjustedX = (rawX - cropX) / activeWidthRatio;
      }

      let normX = (adjustedX - settings.edgeMargin) / (1.0 - 2 * settings.edgeMargin);
      let normY = (adjustedY - settings.edgeMargin) / (1.0 - 2 * settings.edgeMargin);

      normX = Math.max(0, Math.min(1, normX));
      normY = Math.max(0, Math.min(1, normY));

      // Filter with One-Euro Jitter Filter
      const smoothX = filterX ? filterX.filter(normX, now) : normX;
      const smoothY = filterY ? filterY.filter(normY, now) : normY;

      // 3. Pinch Distances
      const thumbTip = lm[4];
      const indexTip = lm[8];
      const middleTip = lm[12];
      const ringTip = lm[16];

      const thumbIndexDist = dist3D(thumbTip, indexTip) / handScale;
      const thumbMiddleDist = dist3D(thumbTip, middleTip) / handScale;
      const thumbRingDist = dist3D(thumbTip, ringTip) / handScale;

      const PINCH_THRESHOLD = 0.22;
      const PINCH_RELEASE = 0.28;

      let triggeredAction = null;
      let scrollDeltaY = 0;
      let currentGestureText = '👉 Pointing';

      // 4. Gesture Detection Logic

      // A. Middle Finger + Thumb (Primary Left Click & Rapid Double Click)
      if (thumbMiddleDist < PINCH_THRESHOLD) {
        if (!gestureState.isMiddlePinching) {
          gestureState.isMiddlePinching = true;
          const nowTime = Date.now();
          if (nowTime - gestureState.lastLeftClickTime < 350) {
            triggeredAction = 'ACTION_DOUBLE_CLICK';
            currentGestureText = '⚡ Double Click';
            gestureState.lastLeftClickTime = 0;
          } else {
            triggeredAction = 'ACTION_CLICK';
            currentGestureText = '👆 Left Click';
            gestureState.lastLeftClickTime = nowTime;
          }
        }
      } else if (thumbMiddleDist > PINCH_RELEASE) {
        gestureState.isMiddlePinching = false;
      }

      // B. Ring Finger + Thumb (Right Click / Context Menu)
      if (thumbRingDist < PINCH_THRESHOLD) {
        if (!gestureState.isRingPinching) {
          gestureState.isRingPinching = true;
          const nowTime = Date.now();
          if (nowTime - gestureState.lastRightClickTime > 300) {
            triggeredAction = 'ACTION_RIGHT_CLICK';
            currentGestureText = '👌 Right Click';
            gestureState.lastRightClickTime = nowTime;
          }
        }
      } else if (thumbRingDist > PINCH_RELEASE) {
        gestureState.isRingPinching = false;
      }

      // C. Index Finger + Thumb (Air Scroll Engine)
      if (thumbIndexDist < PINCH_THRESHOLD) {
        if (!gestureState.isIndexPinching) {
          gestureState.isIndexPinching = true;
          gestureState.scrollAnchorY = smoothY;
          gestureState.lastScrollY = smoothY;
          gestureState.isScrolling = true;
          currentGestureText = '📜 Air Scroll';
        } else {
          gestureState.isScrolling = true;
          const dy = (smoothY - gestureState.lastScrollY);
          gestureState.lastScrollY = smoothY;

          scrollDeltaY = dy * 1400 * settings.scrollSensitivity;
          triggeredAction = 'ACTION_SCROLL';
          currentGestureText = '📜 Air Scroll';
        }
      } else if (thumbIndexDist > PINCH_RELEASE) {
        gestureState.isIndexPinching = false;
        gestureState.isScrolling = false;
      }

      labelGesture.textContent = currentGestureText;
      if (triggeredAction || gestureState.isIndexPinching || gestureState.isMiddlePinching || gestureState.isRingPinching || gestureState.isScrolling) {
        labelGesture.classList.add('active');
      } else {
        labelGesture.classList.remove('active');
      }

      // 5. Draw Visual Reticle & Geometric Feedback on Canvas Viewfinder
      // Coordinates mirrored: (1.0 - lm[i].x) * w to match CSS scaleX(-1) on video
      const ptX = (1.0 - lm[8].x) * w;
      const ptY = lm[8].y * h;
      const thumbX = (1.0 - lm[4].x) * w;
      const thumbY = lm[4].y * h;
      const midX = (1.0 - lm[12].x) * w;
      const midY = lm[12].y * h;
      const ringX = (1.0 - lm[16].x) * w;
      const ringY = lm[16].y * h;

      ctx.save();

      // Middle + Thumb: Left Click Line & Indicator
      if (gestureState.isMiddlePinching) {
        ctx.beginPath();
        ctx.moveTo(midX, midY);
        ctx.lineTo(thumbX, thumbY);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(midX, midY, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }

      // Ring + Thumb: Right Click Line & Indicator
      if (gestureState.isRingPinching) {
        ctx.beginPath();
        ctx.moveTo(ringX, ringY);
        ctx.lineTo(thumbX, thumbY);
        ctx.strokeStyle = '#cbd5e1';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(ringX, ringY, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#cbd5e1';
        ctx.fill();
      }

      // Index + Thumb: Air-Scroll Line
      if (gestureState.isIndexPinching || gestureState.isScrolling) {
        ctx.beginPath();
        ctx.moveTo(ptX, ptY);
        ctx.lineTo(thumbX, thumbY);
        ctx.strokeStyle = 'rgba(52, 211, 153, 0.95)';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (!gestureState.isMiddlePinching && !gestureState.isRingPinching) {
        // Subtle resting sightline
        ctx.beginPath();
        ctx.moveTo(ptX, ptY);
        ctx.lineTo(thumbX, thumbY);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Outer circle on index fingertip (aiming reticle)
      const isAnyAction = gestureState.isIndexPinching || gestureState.isMiddlePinching || gestureState.isRingPinching;
      ctx.beginPath();
      ctx.arc(ptX, ptY, isAnyAction ? 11 : 16, 0, Math.PI * 2);
      ctx.strokeStyle = gestureState.isMiddlePinching ? '#ffffff' : (gestureState.isIndexPinching ? '#34d399' : 'rgba(255, 255, 255, 0.85)');
      ctx.lineWidth = 2;
      ctx.shadowColor = gestureState.isIndexPinching ? 'rgba(52, 211, 153, 0.8)' : 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 6;
      ctx.stroke();

      // Precision Core dot on index tip
      ctx.beginPath();
      ctx.arc(ptX, ptY, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();

      // 6. Broadcast Stream Packet to Background Service Worker
      chrome.runtime.sendMessage({
        type: 'GESTURE_STREAM',
        data: {
          active: true,
          handDetected: true,
          cursor: { x: smoothX, y: smoothY },
          action: triggeredAction,
          isPinching: gestureState.isIndexPinching || gestureState.isMiddlePinching || gestureState.isRingPinching,
          isScrolling: gestureState.isScrolling,
          scrollDeltaY: scrollDeltaY
        }
      }).catch(() => {});

    } catch (err) {
      console.error('[AeroTouch Tracker] Error in onHandsResults:', err);
    } finally {
      isProcessing = false;
    }
  }

  // Camera Frame Processing Loop
  async function processCameraFrame() {
    if (!isRunning) return;

    if (video.readyState >= 2 && !isProcessing && handsModel) {
      isProcessing = true;
      lastFrameProcessedTime = performance.now();
      try {
        await handsModel.send({ image: video });
      } catch (err) {
        console.warn('[AeroTouch Tracker] MediaPipe frame send error:', err);
      } finally {
        isProcessing = false;
      }
    }

    // Only self-schedule if worker ticker is NOT driving the loop
    if (!useWorkerTicker) {
      scheduleNextFrame();
    }
  }

  // Start Tracker
  async function startTracker() {
    try {
      labelStatus.textContent = 'Starting Camera...';

      if (!handsModel) {
        handsModel = initMediaPipe();
      }

      // Check stored preferences
      let preferredCameraId = null;
      try {
        const stored = await chrome.storage.local.get(['preferredCameraId', 'edgeMargin', 'scrollSensitivity']);
        if (stored) {
          if (typeof stored.edgeMargin === 'number') settings.edgeMargin = stored.edgeMargin;
          if (typeof stored.scrollSensitivity === 'number') settings.scrollSensitivity = stored.scrollSensitivity;
          if (stored.preferredCameraId) preferredCameraId = stored.preferredCameraId;
        }
      } catch (e) {}

      // Multi-tier camera acquisition strategy:
      let stream = null;
      if (preferredCameraId) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: preferredCameraId },
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 60, min: 30 }
            }
          });
        } catch (err) {
          console.warn('[AeroTouch Tracker] Preferred camera failed, falling back to default:', err);
        }
      }

      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 60, min: 30 }
            }
          });
        } catch (err) {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        }
      }

      mediaStream = stream;
      video.srcObject = mediaStream;

      if (video.readyState >= 2) {
        await video.play().catch(() => {});
      } else {
        await new Promise((resolve) => {
          const onReady = () => {
            video.removeEventListener('loadeddata', onReady);
            video.removeEventListener('canplay', onReady);
            video.play().then(resolve).catch(resolve);
          };
          video.addEventListener('loadeddata', onReady);
          video.addEventListener('canplay', onReady);
          setTimeout(onReady, 600);
        });
      }

      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      isRunning = true;
      labelStatus.textContent = 'Tracking Active';

      // Start anti-throttling Web Audio keepalive & Web Worker ticker
      startAudioKeepalive();
      startWorkerTicker();

      // Start hardware frame processing
      processCameraFrame();
      console.log('[AeroTouch Tracker] Running with unthrottled 60 FPS Web Worker ticker.');

    } catch (err) {
      console.error('[AeroTouch Tracker] Camera start failed:', err);
      labelStatus.textContent = 'Camera Error';
      labelGesture.textContent = err.name || 'Check Shutter';
    }
  }

  // Run immediately upon window launch
  startTracker();

  // Listen for settings updates
  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'UPDATE_SETTINGS') {
      if (typeof message.edgeMargin === 'number') settings.edgeMargin = message.edgeMargin;
      if (typeof message.scrollSensitivity === 'number') settings.scrollSensitivity = message.scrollSensitivity;
    }
  });

  // Clean up on window close
  window.addEventListener('beforeunload', () => {
    isRunning = false;
    if (tickerWorker) {
      tickerWorker.postMessage({ command: 'stop' });
      tickerWorker.terminate();
    }
    if (audioKeepalive) {
      audioKeepalive.close().catch(() => {});
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
    }
  });

})();
