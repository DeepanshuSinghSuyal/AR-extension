/**
 * @file sidepanel.js
 * @description AeroTouch Side Panel - Central Offline Camera & Tracking Hub.
 * Initializes MediaPipe Hands 100% offline from local extension files,
 * captures camera frames, classifies hand gestures via GestureDetector,
 * renders neon skeletal overlays, and streams gesture events to active tabs.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const videoEl = document.getElementById('webcam-video');
  const canvasEl = document.getElementById('tracking-canvas');
  const ctx = canvasEl.getContext('2d');
  const cameraOverlay = document.getElementById('camera-overlay');
  const btnStartCamera = document.getElementById('btn-start-camera');
  const btnToggleTracking = document.getElementById('btn-toggle-tracking');
  const statusIndicator = document.getElementById('status-indicator');
  const hudOverlay = document.getElementById('hud-overlay');

  // Metrics
  const metricFps = document.getElementById('metric-fps');
  const metricHand = document.getElementById('metric-hand');
  const metricConf = document.getElementById('metric-conf');

  // Gesture Card
  const gestureIcon = document.getElementById('gesture-icon');
  const gestureName = document.getElementById('gesture-name');
  const actionName = document.getElementById('action-name');
  const pinchPercent = document.getElementById('pinch-percent');
  const pinchBar = document.getElementById('pinch-bar');

  // Controls
  const cameraSelect = document.getElementById('camera-select');
  const toggleMirror = document.getElementById('toggle-mirror');
  const toggleSkeleton = document.getElementById('toggle-skeleton');
  const toggleSound = document.getElementById('toggle-sound');
  const toggleCursor = document.getElementById('toggle-cursor');

  // Sliders
  const sliderSens = document.getElementById('slider-sensitivity');
  const valSens = document.getElementById('val-sensitivity');
  const sliderSmoothing = document.getElementById('slider-smoothing');
  const valSmoothing = document.getElementById('val-smoothing');
  const sliderPinch = document.getElementById('slider-pinch');
  const valPinch = document.getElementById('val-pinch');
  const sliderScroll = document.getElementById('slider-scroll');
  const valScroll = document.getElementById('val-scroll');

  // Footers
  const btnOpenOptions = document.getElementById('btn-open-options');
  const btnOpenTest = document.getElementById('btn-open-test');

  // State
  let isCameraRunning = false;
  let isTrackingActive = true;
  let mediaStream = null;
  let handsModel = null;
  let gestureDetector = null;
  let backgroundPort = null;
  let lastFrameTime = performance.now();
  let frameCount = 0;
  let fps = 0;
  let lastFpsUpdate = performance.now();
  let isProcessingFrame = false;
  let audioContext = null;

  // Configuration
  let config = {};
  if (typeof ConfigManager !== 'undefined') {
    config = await ConfigManager.get();
  } else if (chrome && chrome.storage && chrome.storage.local) {
    const res = await chrome.storage.local.get('ar_extension_config');
    config = res.ar_extension_config || {};
  }

  // Initialize GestureDetector
  if (typeof GestureDetector !== 'undefined') {
    gestureDetector = new GestureDetector(config);
  }

  // Sync inputs with config
  if (config.camera) {
    toggleMirror.checked = config.camera.mirror !== false;
  }
  if (config.tracking) {
    sliderSens.value = config.tracking.sensitivityX || 1.4;
    valSens.textContent = `${sliderSens.value}x`;
    sliderSmoothing.value = config.tracking.smoothingBeta || 0.007;
    valSmoothing.textContent = sliderSmoothing.value <= 0.005 ? 'Silky' : 'Responsive';
  }
  if (config.gestures) {
    sliderPinch.value = config.gestures.pinchThreshold || 0.055;
    valPinch.textContent = sliderPinch.value;
    sliderScroll.value = config.gestures.scrollSpeed || 25;
    valScroll.textContent = sliderScroll.value;
  }
  if (config.ui) {
    toggleCursor.checked = config.ui.showCursor !== false;
    toggleSound.checked = config.ui.playSound !== false;
  }

  // Connect to Background Worker Port
  function connectBackgroundPort() {
    try {
      if (chrome && chrome.runtime && chrome.runtime.connect) {
        backgroundPort = chrome.runtime.connect({ name: 'aerotouch-stream' });
        backgroundPort.onDisconnect.addListener(() => {
          console.warn('[SidePanel] Stream port disconnected. Reconnecting...');
          setTimeout(connectBackgroundPort, 1000);
        });
      }
    } catch (e) {
      console.warn('[SidePanel] Port connection not available:', e);
    }
  }
  connectBackgroundPort();

  // Send gesture packet to background & active tab
  function sendGesturePacket(packet) {
    if (!isTrackingActive) return;

    // Direct Port (Lowest Latency 60fps)
    if (backgroundPort) {
      try {
        backgroundPort.postMessage({ type: 'GESTURE_EVENT', data: packet });
      } catch (e) {
        // Fallback to one-shot message
        sendOneShotMessage(packet);
      }
    } else {
      sendOneShotMessage(packet);
    }
  }

  function sendOneShotMessage(packet) {
    if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: 'GESTURE_EVENT', data: packet }).catch(() => {});
    }
  }

  // Offline Web Audio Synthesizer
  function playSyntheticClick(pitch = 880, duration = 0.04) {
    if (!toggleSound.checked) return;
    try {
      if (!audioContext) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioCtx();
      }
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(pitch, audioContext.currentTime);
      osc.frequency.exponentialRampToValueAtTime(pitch * 0.4, audioContext.currentTime + duration);

      gain.gain.setValueAtTime(0.08, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);

      osc.connect(gain);
      gain.connect(audioContext.destination);

      osc.start();
      osc.stop(audioContext.currentTime + duration);
    } catch (err) {
      // Audio not permitted or not supported
    }
  }

  // Initialize MediaPipe Hands 100% OFFLINE
  function initMediaPipe() {
    if (typeof Hands === 'undefined') {
      console.error('[SidePanel] Hands library not loaded!');
      return null;
    }

    const hands = new Hands({
      locateFile: (file) => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
          return chrome.runtime.getURL(`lib/mediapipe/${file}`);
        }
        return `../../lib/mediapipe/${file}`;
      }
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

  // Skeleton connection pairs
  const SKELETON_CONNECTIONS = [
    // Palm
    [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8],       // Index
    [5, 9], [9, 10], [10, 11], [11, 12],   // Middle
    [9, 13], [13, 14], [14, 15], [15, 16], // Ring
    [13, 17], [17, 18], [18, 19], [19, 20],// Pinky
    [0, 17]                                // Wrist to Pinky base
  ];

  // Draw real-time hand overlay
  function renderOverlay(landmarks, packet) {
    const w = canvasEl.width;
    const h = canvasEl.height;

    if (!toggleSkeleton.checked) return;

    ctx.save();

    // 1. Draw glowing skeleton bones
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#00f0ff';
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.75)';

    SKELETON_CONNECTIONS.forEach(([i, j]) => {
      const p1 = landmarks[i];
      const p2 = landmarks[j];
      if (p1 && p2) {
        ctx.beginPath();
        ctx.moveTo(p1.x * w, p1.y * h);
        ctx.lineTo(p2.x * w, p2.y * h);
        ctx.stroke();
      }
    });

    // 2. Draw Joints
    landmarks.forEach((p, idx) => {
      const x = p.x * w;
      const y = p.y * h;
      const isTip = [4, 8, 12, 16, 20].includes(idx);

      ctx.beginPath();
      if (isTip) {
        ctx.arc(x, y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 12;
      } else {
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fillStyle = '#00f0ff';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 6;
      }
      ctx.fill();
    });

    // 3. Pinch indicator line between Thumb Tip (4) and Index Tip (8)
    if (packet && packet.pinchProgress > 0.1) {
      const t = landmarks[4];
      const idx = landmarks[8];
      if (t && idx) {
        ctx.beginPath();
        ctx.moveTo(t.x * w, t.y * h);
        ctx.lineTo(idx.x * w, idx.y * h);
        ctx.lineWidth = 3 + packet.pinchProgress * 3;
        ctx.strokeStyle = packet.isPinching ? '#10b981' : `rgba(168, 85, 247, ${packet.pinchProgress})`;
        ctx.shadowColor = packet.isPinching ? '#10b981' : '#a855f7';
        ctx.shadowBlur = 14;
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  let lastActionTriggered = null;

  // MediaPipe Results Callback
  function onHandsResults(results) {
    // Canvas dimensions
    if (canvasEl.width !== videoEl.videoWidth || canvasEl.height !== videoEl.videoHeight) {
      canvasEl.width = videoEl.videoWidth || 640;
      canvasEl.height = videoEl.videoHeight || 480;
    }

    const w = canvasEl.width;
    const h = canvasEl.height;

    // Draw Video Frame
    ctx.save();
    if (toggleMirror.checked) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(results.image, 0, 0, w, h);
    ctx.restore();

    // Check for detected hand
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = results.multiHandLandmarks[0];
      const handedness = results.multiHandedness && results.multiHandedness[0] ? results.multiHandedness[0].label : 'Right';
      const score = results.multiHandedness && results.multiHandedness[0] ? Math.round(results.multiHandedness[0].score * 100) : 95;

      // Classify gesture via GestureDetector
      let packet = null;
      if (gestureDetector) {
        packet = gestureDetector.detect(landmarks, {
          width: window.innerWidth || 1920,
          height: window.innerHeight || 1080,
          timestamp: performance.now(),
          handedness: handedness
        });
      }

      // Render Skeleton
      renderOverlay(landmarks, packet);

      // Update HUD & UI
      metricHand.textContent = handedness;
      metricConf.textContent = `${score}%`;

      if (packet) {
        // Icon & names
        const gDef = (typeof GestureCatalog !== 'undefined' && GestureCatalog.GESTURES) ? GestureCatalog.GESTURES[packet.gesture] : null;
        const aDef = (typeof GestureCatalog !== 'undefined' && GestureCatalog.ACTIONS) ? GestureCatalog.ACTIONS[packet.action] : null;

        gestureIcon.textContent = gDef ? gDef.icon : '✋';
        gestureName.textContent = gDef ? gDef.label : packet.gesture;
        actionName.textContent = aDef ? aDef.label : packet.action;

        // Pinch charge bar
        const pct = Math.round((packet.pinchProgress || 0) * 100);
        pinchPercent.textContent = `${pct}%`;
        pinchBar.style.width = `${pct}%`;

        // Pulse animation on click
        if (packet.isPinching) {
          gestureIcon.classList.add('pulse');
          if (lastActionTriggered !== 'PINCH') {
            playSyntheticClick(1200, 0.05);
            lastActionTriggered = 'PINCH';
          }
        } else {
          gestureIcon.classList.remove('pulse');
          if (lastActionTriggered === 'PINCH') {
            lastActionTriggered = null;
          }
        }

        // Send to active tab
        sendGesturePacket(packet);
      }
    } else {
      // No hand in view
      metricHand.textContent = 'None';
      metricConf.textContent = '0%';
      gestureName.textContent = 'Searching for hand...';
      actionName.textContent = 'Idle';
      pinchPercent.textContent = '0%';
      pinchBar.style.width = '0%';
      gestureIcon.textContent = '✋';
      gestureIcon.classList.remove('pulse');

      if (gestureDetector && gestureDetector.reset) {
        gestureDetector.reset();
      }

      // Notify content script that hand is lost
      sendGesturePacket({ gesture: 'NONE', action: 'ACTION_NONE', handLost: true });
    }

    // FPS Calculation
    frameCount++;
    const now = performance.now();
    if (now - lastFpsUpdate >= 1000) {
      fps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
      metricFps.textContent = fps;
      frameCount = 0;
      lastFpsUpdate = now;
    }

    isProcessingFrame = false;
  }

  // Camera Frame Loop
  async function processCameraLoop() {
    if (!isCameraRunning) return;

    if (videoEl.readyState >= 2 && !isProcessingFrame && handsModel) {
      isProcessingFrame = true;
      try {
        await handsModel.send({ image: videoEl });
      } catch (err) {
        console.warn('[SidePanel] Error processing frame:', err);
        isProcessingFrame = false;
      }
    }

    requestAnimationFrame(processCameraLoop);
  }

  // Robust multi-tier camera acquisition
  async function getRobustUserMedia(preferredDeviceId) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (window.location.protocol === 'file:') {
        throw new Error('Webcam is blocked on file:// URLs by Chrome security. Please use the extension or run "npm start" for http://localhost:3000.');
      }
      throw new Error('navigator.mediaDevices.getUserMedia is not supported in this browser.');
    }

    const attempts = [];
    if (preferredDeviceId) {
      attempts.push({ video: { deviceId: { exact: preferredDeviceId } } });
    }
    attempts.push({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } });
    attempts.push({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
    attempts.push({ video: { facingMode: 'user' } });
    attempts.push({ video: true });

    let lastErr = null;
    for (const c of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(c);
        if (stream && stream.getVideoTracks().length > 0) {
          return stream;
        }
      } catch (err) {
        lastErr = err;
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          throw new Error('Camera permission denied. Please click the camera / tune icon in your address bar and set Camera to "Allow". Also verify Windows Settings > Privacy & security > Camera is turned ON.');
        }
        if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          throw new Error('Camera is currently in use by another application (Zoom, Teams, Discord, Skype, OBS, or Windows Camera app) or hardware camera shutter is closed.');
        }
      }
    }

    if (lastErr && (lastErr.name === 'NotFoundError' || lastErr.name === 'DevicesNotFoundError')) {
      throw new Error('No webcam detected. Please check if your laptop camera has a physical privacy slider (shutter switch) or a function key camera toggle (e.g. Fn+F6/F8/F10).');
    }

    throw lastErr || new Error('Failed to access camera.');
  }

  // Start Camera
  async function startCamera() {
    try {
      btnStartCamera.disabled = true;
      btnStartCamera.textContent = 'Starting AI Model...';

      // 1. Initialize MediaPipe
      if (!handsModel) {
        handsModel = initMediaPipe();
      }

      // 2. Request Camera Stream with robust fallback
      mediaStream = await getRobustUserMedia(cameraSelect.value);
      videoEl.srcObject = mediaStream;

      await new Promise((resolve) => {
        videoEl.onloadedmetadata = () => {
          videoEl.play();
          resolve();
        };
      });

      // Update UI state
      isCameraRunning = true;
      cameraOverlay.style.display = 'none';
      hudOverlay.style.display = 'flex';
      statusIndicator.className = 'status-dot status-active';
      statusIndicator.title = 'Tracking Active';

      // Enumerate cameras
      await populateCameraDevices();

      // Start loop
      requestAnimationFrame(processCameraLoop);
      console.log('[SidePanel] Camera & MediaPipe running 100% offline.');
    } catch (err) {
      console.error('[SidePanel] Failed to start camera:', err);
      const noteEl = document.querySelector('.overlay-note');
      if (noteEl) {
        noteEl.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 8px; align-items: center; margin-top: 6px;">
            <span style="color: #ef4444; font-weight: 600;">⚠️ ${err.message}</span>
            <button id="btn-fix-permission" class="btn btn-secondary" style="font-size: 11px; padding: 6px 12px; background: rgba(0, 240, 255, 0.2); border-color: #00f0ff; color: #00f0ff;">
              🔑 Click to Grant Camera Permission in Tab
            </button>
          </div>
        `;
        const fixBtn = document.getElementById('btn-fix-permission');
        if (fixBtn) {
          fixBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('src/permission/permission.html') });
          });
        }
      } else {
        alert(`Camera Error: ${err.message}`);
      }
      btnStartCamera.disabled = false;
      btnStartCamera.textContent = 'Retry Start Camera';
    }
  }

  // Stop Camera
  function stopCamera() {
    isCameraRunning = false;
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }
    videoEl.srcObject = null;
    cameraOverlay.style.display = 'flex';
    hudOverlay.style.display = 'none';
    btnStartCamera.disabled = false;
    btnStartCamera.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg> Start Camera`;
    statusIndicator.className = 'status-dot status-inactive';
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  }

  // Enumerate cameras
  async function populateCameraDevices() {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        if (videoDevices.length > 0) {
          const currentVal = cameraSelect.value;
          cameraSelect.innerHTML = '<option value="">Default Webcam</option>';
          videoDevices.forEach((dev, idx) => {
            const opt = document.createElement('option');
            opt.value = dev.deviceId;
            opt.textContent = dev.label || `Camera ${idx + 1}`;
            if (dev.deviceId === currentVal) opt.selected = true;
            cameraSelect.appendChild(opt);
          });
        }
      }
    } catch (e) {
      console.warn('Enumerate devices error:', e);
    }
  }

  // Event Listeners
  btnStartCamera.addEventListener('click', startCamera);

  btnToggleTracking.addEventListener('click', () => {
    isTrackingActive = !isTrackingActive;
    if (isTrackingActive) {
      btnToggleTracking.textContent = 'Pause';
      btnToggleTracking.className = 'btn-sm btn-outline';
      statusIndicator.className = 'status-dot status-active';
    } else {
      btnToggleTracking.textContent = 'Resume';
      btnToggleTracking.className = 'btn-sm btn-primary';
      statusIndicator.className = 'status-dot status-paused';
      sendGesturePacket({ gesture: 'NONE', action: 'ACTION_NONE', paused: true });
    }
  });

  cameraSelect.addEventListener('change', () => {
    if (isCameraRunning) {
      stopCamera();
      startCamera();
    }
  });

  // Sliders dynamic updates to gestureDetector
  function updateDetectorConfig() {
    if (gestureDetector && gestureDetector.updateConfig) {
      gestureDetector.updateConfig({
        tracking: {
          sensitivityX: parseFloat(sliderSens.value),
          sensitivityY: parseFloat(sliderSens.value),
          smoothingBeta: parseFloat(sliderSmoothing.value)
        },
        gestures: {
          pinchThreshold: parseFloat(sliderPinch.value),
          scrollSpeed: parseInt(sliderScroll.value, 10)
        }
      });
    }
  }

  sliderSens.addEventListener('input', () => {
    valSens.textContent = `${sliderSens.value}x`;
    updateDetectorConfig();
  });

  sliderSmoothing.addEventListener('input', () => {
    valSmoothing.textContent = sliderSmoothing.value <= 0.005 ? 'Silky' : 'Responsive';
    updateDetectorConfig();
  });

  sliderPinch.addEventListener('input', () => {
    valPinch.textContent = sliderPinch.value;
    updateDetectorConfig();
  });

  sliderScroll.addEventListener('input', () => {
    valScroll.textContent = sliderScroll.value;
    updateDetectorConfig();
  });

  // Footer Actions
  btnOpenOptions.addEventListener('click', () => {
    if (chrome && chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html') });
    }
  });

  btnOpenTest.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/test/gesture_test.html') });
  });

  // Auto-start camera if previously active or requested
  if (config.autoStartCamera) {
    startCamera();
  }
});

