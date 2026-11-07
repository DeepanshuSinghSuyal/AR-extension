/**
 * @file options.js
 * @description Controller for AeroTouch Settings & Live Calibration Studio.
 * Handles webcam input selection, 16:9 aspect calibration, live canvas monitor,
 * and the interactive test sandbox.
 */

document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  // Elements
  const selectCamera = document.getElementById('select-camera');
  const sliderEdgeMargin = document.getElementById('setting-edge-margin');
  const labelEdgeMargin = document.getElementById('label-edge-margin');
  const sliderSpeed = document.getElementById('setting-speed');
  const labelSpeed = document.getElementById('label-speed');
  const sliderScrollSens = document.getElementById('setting-scroll-sens');
  const labelScrollSens = document.getElementById('label-scroll-sens');
  const toggleAudio = document.getElementById('toggle-audio');
  const btnSave = document.getElementById('btn-save');
  const saveStatus = document.getElementById('save-status');

  // Monitor elements
  const monitorVideo = document.getElementById('monitor-video');
  const monitorCanvas = document.getElementById('monitor-canvas');
  const camStatusLabel = document.getElementById('cam-status-label');
  const canvasCtx = monitorCanvas ? monitorCanvas.getContext('2d') : null;

  // Sandbox elements
  const testBtnClick = document.getElementById('test-btn-click');
  const testBtnDblClick = document.getElementById('test-btn-dblclick');
  const testBtnRightClick = document.getElementById('test-btn-rightclick');
  const testScrollArea = document.getElementById('test-scroll-area');
  const testEventLog = document.getElementById('test-event-log');

  let mediaStream = null;
  let handsModel = null;
  let isMonitorRunning = false;
  let clickCount = 0;

  // Helper: Logger
  function logEvent(msg) {
    if (!testEventLog) return;
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.textContent = `[${time}] ${msg}`;
    testEventLog.prepend(entry);
    // Keep max 20 entries
    while (testEventLog.children.length > 20) {
      testEventLog.removeChild(testEventLog.lastChild);
    }
  }

  // 1. Load preferences from chrome.storage
  async function loadSettings() {
    try {
      const stored = await chrome.storage.local.get([
        'preferredCameraId',
        'edgeMargin',
        'cursorSpeed',
        'scrollSensitivity',
        'enableAudioFeedback'
      ]);

      if (stored) {
        if (typeof stored.edgeMargin === 'number') {
          sliderEdgeMargin.value = stored.edgeMargin;
          labelEdgeMargin.textContent = `${Math.round(stored.edgeMargin * 100)}%`;
        }
        if (typeof stored.cursorSpeed === 'number') {
          sliderSpeed.value = stored.cursorSpeed;
          labelSpeed.textContent = `${stored.cursorSpeed.toFixed(1)}x`;
        }
        if (typeof stored.scrollSensitivity === 'number') {
          sliderScrollSens.value = stored.scrollSensitivity;
          labelScrollSens.textContent = `${stored.scrollSensitivity.toFixed(1)}x`;
        }
        if (typeof stored.enableAudioFeedback === 'boolean') {
          toggleAudio.checked = stored.enableAudioFeedback;
        }
        if (stored.preferredCameraId) {
          selectCamera.value = stored.preferredCameraId;
        }
      }
    } catch (e) {
      console.warn('[Options] Failed to load settings:', e);
    }
  }

  // 2. Enumerate Cameras
  async function enumerateCameras() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');

      selectCamera.innerHTML = '<option value="">Default Front Camera</option>';
      videoDevices.forEach((dev, idx) => {
        const opt = document.createElement('option');
        opt.value = dev.deviceId;
        opt.textContent = dev.label || `Camera ${idx + 1}`;
        selectCamera.appendChild(opt);
      });

      const stored = await chrome.storage.local.get('preferredCameraId');
      if (stored && stored.preferredCameraId) {
        selectCamera.value = stored.preferredCameraId;
      }
    } catch (e) {
      console.warn('[Options] Error enumerating cameras:', e);
    }
  }

  // 3. Save Settings
  async function saveSettings() {
    const settings = {
      preferredCameraId: selectCamera.value || '',
      edgeMargin: parseFloat(sliderEdgeMargin.value),
      cursorSpeed: parseFloat(sliderSpeed.value),
      scrollSensitivity: parseFloat(sliderScrollSens.value),
      enableAudioFeedback: toggleAudio.checked
    };

    try {
      await chrome.storage.local.set(settings);

      // Broadcast update to offscreen tracker and tabs
      chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        edgeMargin: settings.edgeMargin,
        scrollSensitivity: settings.scrollSensitivity
      }).catch(() => {});

      saveStatus.classList.add('visible');
      setTimeout(() => {
        saveStatus.classList.remove('visible');
      }, 2000);

      logEvent('Settings saved successfully.');
    } catch (e) {
      console.error('[Options] Failed to save settings:', e);
    }
  }

  // Slider event listeners
  sliderEdgeMargin.addEventListener('input', () => {
    labelEdgeMargin.textContent = `${Math.round(sliderEdgeMargin.value * 100)}%`;
  });

  sliderSpeed.addEventListener('input', () => {
    labelSpeed.textContent = `${parseFloat(sliderSpeed.value).toFixed(1)}x`;
  });

  sliderScrollSens.addEventListener('input', () => {
    labelScrollSens.textContent = `${parseFloat(sliderScrollSens.value).toFixed(1)}x`;
  });

  btnSave.addEventListener('click', saveSettings);
  selectCamera.addEventListener('change', () => {
    startMonitorCamera();
    saveSettings();
  });

  // 4. Live Camera Monitor
  async function startMonitorCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }

    try {
      const preferredId = selectCamera.value;
      const constraints = {
        video: preferredId ? { deviceId: { exact: preferredId } } : true
      };

      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      monitorVideo.srcObject = mediaStream;

      await new Promise(resolve => {
        monitorVideo.onloadedmetadata = () => {
          monitorVideo.play().then(resolve).catch(resolve);
        };
      });

      // Setup canvas dimensions to match video
      monitorCanvas.width = monitorVideo.videoWidth || 640;
      monitorCanvas.height = monitorVideo.videoHeight || 480;

      if (!handsModel && typeof Hands !== 'undefined') {
        handsModel = new Hands({
          locateFile: (file) => chrome.runtime.getURL(`lib/mediapipe/${file}`)
        });

        handsModel.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.65,
          minTrackingConfidence: 0.65
        });

        handsModel.onResults(onMonitorHandsResults);
      }

      isMonitorRunning = true;
      requestAnimationFrame(monitorLoop);
      camStatusLabel.textContent = 'Webcam Active (Tracking Ready)';

    } catch (err) {
      console.warn('[Options Monitor] Could not start monitor camera:', err);
      camStatusLabel.textContent = 'Camera Inactive';
    }
  }

  async function monitorLoop() {
    if (!isMonitorRunning) return;

    if (monitorVideo.readyState >= 2 && handsModel) {
      try {
        await handsModel.send({ image: monitorVideo });
      } catch (e) {}
    }

    requestAnimationFrame(monitorLoop);
  }

  function onMonitorHandsResults(results) {
    if (!canvasCtx) return;

    const w = monitorCanvas.width;
    const h = monitorCanvas.height;
    canvasCtx.clearRect(0, 0, w, h);

    // 1. Draw 16:9 Active Tracking Boundary Box
    const camAspect = w / h;
    const targetAspect = 16 / 9;

    let activeTop = 0;
    let activeBottom = h;
    if (camAspect < targetAspect) {
      const activeH = w / targetAspect;
      activeTop = (h - activeH) / 2;
      activeBottom = activeTop + activeH;
    }

    const marginRatio = parseFloat(sliderEdgeMargin.value) || 0.12;
    const marginPxX = w * marginRatio;
    const marginPxY = (activeBottom - activeTop) * marginRatio;

    const boxLeft = marginPxX;
    const boxRight = w - marginPxX;
    const boxTop = activeTop + marginPxY;
    const boxBottom = activeBottom - marginPxY;

    // Draw active 16:9 screen boundary
    canvasCtx.save();
    canvasCtx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    canvasCtx.lineWidth = 1.5;
    canvasCtx.setLineDash([6, 6]);
    canvasCtx.strokeRect(boxLeft, boxTop, boxRight - boxLeft, boxBottom - boxTop);

    // Label corner: "16:9 Screen Boundary"
    canvasCtx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    canvasCtx.font = '11px -apple-system, sans-serif';
    canvasCtx.fillText('16:9 Screen Reach Zone', boxLeft + 8, boxTop + 16);
    canvasCtx.restore();

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      return;
    }

    const lm = results.multiHandLandmarks[0];

    // Helper: 3D distance
    function dist3D(a, b) {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return Math.sqrt(dx * dx + dy * dy);
    }

    const handScale = Math.max(0.08, dist3D(lm[0], lm[9]));
    const thumbIndexDist = dist3D(lm[4], lm[8]) / handScale;
    const thumbMiddleDist = dist3D(lm[4], lm[12]) / handScale;
    const thumbRingDist = dist3D(lm[4], lm[16]) / handScale;

    const isIndexPinching = thumbIndexDist < 0.22;
    const isMiddlePinching = thumbMiddleDist < 0.22;
    const isRingPinching = thumbRingDist < 0.22;
    const isAnyPinch = isIndexPinching || isMiddlePinching || isRingPinching;

    // Index fingertip (reticle position)
    const ptX = lm[8].x * w;
    const ptY = lm[8].y * h;
    const thumbX = lm[4].x * w;
    const thumbY = lm[4].y * h;
    const midX = lm[12].x * w;
    const midY = lm[12].y * h;
    const ringX = lm[16].x * w;
    const ringY = lm[16].y * h;

    // Draw pointer tracking reticle
    canvasCtx.save();

    // Middle + Thumb Line (Left Click)
    if (isMiddlePinching) {
      canvasCtx.beginPath();
      canvasCtx.moveTo(midX, midY);
      canvasCtx.lineTo(thumbX, thumbY);
      canvasCtx.strokeStyle = '#ffffff';
      canvasCtx.lineWidth = 2.5;
      canvasCtx.stroke();
    }

    // Ring + Thumb Line (Right Click)
    if (isRingPinching) {
      canvasCtx.beginPath();
      canvasCtx.moveTo(ringX, ringY);
      canvasCtx.lineTo(thumbX, thumbY);
      canvasCtx.strokeStyle = '#cbd5e1';
      canvasCtx.setLineDash([4, 4]);
      canvasCtx.lineWidth = 2;
      canvasCtx.stroke();
      canvasCtx.setLineDash([]);
    }

    // Index + Thumb Line (Air Scroll)
    canvasCtx.beginPath();
    canvasCtx.moveTo(ptX, ptY);
    canvasCtx.lineTo(thumbX, thumbY);
    canvasCtx.strokeStyle = isIndexPinching ? 'rgba(52, 211, 153, 0.9)' : 'rgba(255, 255, 255, 0.25)';
    canvasCtx.lineWidth = isIndexPinching ? 2 : 1.5;
    canvasCtx.stroke();

    // Aiming Reticle on Index Tip
    canvasCtx.beginPath();
    canvasCtx.arc(ptX, ptY, isAnyPinch ? 11 : 16, 0, Math.PI * 2);
    canvasCtx.strokeStyle = isMiddlePinching ? '#ffffff' : (isIndexPinching ? '#34d399' : 'rgba(255, 255, 255, 0.7)');
    canvasCtx.lineWidth = 2;
    canvasCtx.stroke();

    canvasCtx.beginPath();
    canvasCtx.arc(ptX, ptY, 4, 0, Math.PI * 2);
    canvasCtx.fillStyle = '#ffffff';
    canvasCtx.fill();

    canvasCtx.restore();
  }

  // 5. Interactive Test Sandbox Handlers
  testBtnClick.addEventListener('click', () => {
    clickCount++;
    testBtnClick.classList.add('active');
    setTimeout(() => testBtnClick.classList.remove('active'), 200);
    testBtnClick.textContent = `Pinch Clicked (${clickCount})`;
    logEvent(`Primary Left Click registered (Count: ${clickCount})`);
  });

  testBtnDblClick.addEventListener('dblclick', () => {
    testBtnDblClick.classList.add('active');
    setTimeout(() => testBtnDblClick.classList.remove('active'), 250);
    logEvent('Double Click registered successfully!');
  });

  testBtnRightClick.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    testBtnRightClick.classList.add('active');
    setTimeout(() => testBtnRightClick.classList.remove('active'), 250);
    logEvent('Right Click (Context Menu) registered!');
  });

  if (testScrollArea) {
    testScrollArea.addEventListener('scroll', () => {
      // Log periodically
      if (!testScrollArea._lastLogged || Date.now() - testScrollArea._lastLogged > 1200) {
        testScrollArea._lastLogged = Date.now();
        logEvent(`Scroll container scrolled to position: ${Math.round(testScrollArea.scrollTop)}px`);
      }
    });
  }

  // Run initialization
  await loadSettings();
  await enumerateCameras();
  startMonitorCamera();
});
