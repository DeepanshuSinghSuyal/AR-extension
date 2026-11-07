/**
 * @file gesture_detector.js
 * @description High precision, 100% offline hand gesture recognition engine.
 * Analyzes 21 MediaPipe 3D landmarks, computes hand scale invariants,
 * evaluates finger joint angles and extension states, detects micro-pinches with hysteresis,
 * tracks double-pinch timing, calculates continuous scroll/zoom deltas,
 * and outputs stabilized cursor packets via PointSmoother.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['../../lib/smooth_filter', './config', './gestures'], factory);
  } else if (typeof module === 'object' && module.exports) {
    const SmoothFilter = require('../../lib/smooth_filter');
    const ConfigManager = require('./config');
    const GestureCatalog = require('./gestures');
    module.exports = factory(SmoothFilter, ConfigManager, GestureCatalog);
  } else {
    root.GestureDetector = factory(
      { PointSmoother: root.PointSmoother, OneEuroFilter: root.OneEuroFilter },
      root.ConfigManager,
      root.GestureCatalog
    );
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (SmoothFilter, ConfigManager, GestureCatalog) {
  'use strict';

  const PointSmoother = SmoothFilter ? SmoothFilter.PointSmoother : null;
  const DEFAULT_CONFIG = ConfigManager ? ConfigManager.DEFAULT_CONFIG : {};
  const GESTURES = GestureCatalog ? GestureCatalog.GESTURES : {};
  const ACTIONS = GestureCatalog ? GestureCatalog.ACTIONS : {};

  /**
   * Finger joint extension states.
   */
  const FINGER_STATES = Object.freeze({
    EXTENDED: 'EXTENDED',
    HALF_CURLED: 'HALF_CURLED',
    CURLED: 'CURLED'
  });

  /**
   * MediaPipe 21 landmark indices reference:
   * 0: Wrist
   * Thumb:  1: CMC, 2: MCP, 3: IP, 4: TIP
   * Index:  5: MCP, 6: PIP, 7: DIP, 8: TIP
   * Middle: 9: MCP, 10: PIP, 11: DIP, 12: TIP
   * Ring:   13: MCP, 14: PIP, 15: DIP, 16: TIP
   * Pinky:  17: MCP, 18: PIP, 19: DIP, 20: TIP
   */
  const LM = Object.freeze({
    WRIST: 0,
    THUMB_CMC: 1,
    THUMB_MCP: 2,
    THUMB_IP: 3,
    THUMB_TIP: 4,
    INDEX_MCP: 5,
    INDEX_PIP: 6,
    INDEX_DIP: 7,
    INDEX_TIP: 8,
    MIDDLE_MCP: 9,
    MIDDLE_PIP: 10,
    MIDDLE_DIP: 11,
    MIDDLE_TIP: 12,
    RING_MCP: 13,
    RING_PIP: 14,
    RING_DIP: 15,
    RING_TIP: 16,
    PINKY_MCP: 17,
    PINKY_PIP: 18,
    PINKY_DIP: 19,
    PINKY_TIP: 20
  });

  /**
   * High precision gesture detector.
   */
  class GestureDetector {
    /**
     * @param {object} [customConfig={}] - Optional configuration overrides
     */
    constructor(customConfig = {}) {
      // Merge config with defaults
      this.config = this._mergeConfig(customConfig);

      // Initialize cursor smoother
      if (PointSmoother) {
        this.smoother = new PointSmoother({
          minCutoff: this.config.tracking.smoothingMinCutoff,
          beta: this.config.tracking.smoothingBeta,
          deadzone: this.config.tracking.deadzone,
          sensitivityX: this.config.tracking.sensitivityX,
          sensitivityY: this.config.tracking.sensitivityY
        });
      } else {
        this.smoother = null;
      }

      // Pinch state machine with hysteresis
      this.isPinching = false;
      this.isMiddlePinching = false;
      this.lastPinchReleaseTime = 0;
      this.waitingForSecondPinch = false;
      this.doublePinchTriggeredUntil = 0;

      // Gesture debounce / stabilization state
      this.currentGesture = 'NONE';
      this.candidateGesture = 'NONE';
      this.candidateFrames = 0;
      this.debounceFramesRequired = 2; // Fast 2-frame debouncing

      // Position tracking for scroll & zoom deltas
      this.prevScrollX = null;
      this.prevScrollY = null;
      this.prevZoomY = null;
      this.lastTimestamp = 0;

      // Tracking loss grace counter
      this.lostTrackingFrames = 0;
      this.maxLostTrackingFrames = 6;
    }

    /**
     * Deep config merger.
     * @private
     */
    _mergeConfig(custom) {
      const base = DEFAULT_CONFIG && ConfigManager ? ConfigManager.deepClone(DEFAULT_CONFIG) : {
        camera: { width: 640, height: 480, frameRate: 30, mirror: true },
        tracking: { sensitivityX: 1.4, sensitivityY: 1.4, smoothingMinCutoff: 1.0, smoothingBeta: 0.007, deadzone: 0.015 },
        gestures: { pinchThreshold: 0.055, pinchReleaseThreshold: 0.075, scrollDeadzone: 0.03, scrollSpeed: 25, zoomSpeed: 0.05, dwellTimeMs: 800 },
        gestureBindings: {
          PINCH: 'ACTION_CLICK',
          DOUBLE_PINCH: 'ACTION_DOUBLE_CLICK',
          PINCH_MIDDLE: 'ACTION_RIGHT_CLICK',
          POINT: 'ACTION_MOVE_POINTER',
          VICTORY_PEACE: 'ACTION_SCROLL',
          OPEN_PALM: 'ACTION_HOVER',
          FIST: 'ACTION_DRAG',
          THUMBS_UP: 'ACTION_SCROLL_UP',
          THUMBS_DOWN: 'ACTION_SCROLL_DOWN',
          OK_SIGN: 'ACTION_TOGGLE_ZOOM_LENS',
          THREE_FINGERS: 'ACTION_ZOOM',
          ROCK_ON: 'ACTION_TAB_NEXT'
        },
        ui: { showCursor: true, cursorTheme: 'laser-cyan', showHud: true, showSkeleton: true, playSound: true }
      };

      if (!custom) return base;
      if (ConfigManager && ConfigManager.deepMerge) {
        return ConfigManager.deepMerge(base, custom);
      }
      return Object.assign({}, base, custom);
    }

    /**
     * Updates configuration dynamically.
     * @param {object} newConfig
     */
    updateConfig(newConfig) {
      this.config = this._mergeConfig(newConfig);
      if (this.smoother) {
        this.smoother.setParams({
          minCutoff: this.config.tracking.smoothingMinCutoff,
          beta: this.config.tracking.smoothingBeta,
          deadzone: this.config.tracking.deadzone,
          sensitivityX: this.config.tracking.sensitivityX,
          sensitivityY: this.config.tracking.sensitivityY
        });
      }
    }

    /**
     * Updates target viewport dimensions for cursor mapping.
     * @param {number} width
     * @param {number} height
     */
    setViewport(width, height) {
      if (this.smoother) {
        this.smoother.setViewport(width, height);
      }
    }

    /**
     * Computes 3D Euclidean distance between two landmark points.
     * @private
     * @param {{x: number, y: number, z: number}} a
     * @param {{x: number, y: number, z: number}} b
     * @returns {number}
     */
    _dist3D(a, b) {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dz = (a.z || 0) - (b.z || 0);
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Computes interior joint angle in degrees at vertex B formed by line segments AB and BC.
     * @private
     * @param {{x: number, y: number, z: number}} a
     * @param {{x: number, y: number, z: number}} b - Joint vertex
     * @param {{x: number, y: number, z: number}} c
     * @returns {number} Interior angle in degrees [0, 180]
     */
    _jointAngle(a, b, c) {
      const v1x = a.x - b.x;
      const v1y = a.y - b.y;
      const v1z = (a.z || 0) - (b.z || 0);

      const v2x = c.x - b.x;
      const v2y = c.y - b.y;
      const v2z = (c.z || 0) - (b.z || 0);

      const mag1 = Math.sqrt(v1x * v1x + v1y * v1y + v1z * v1z);
      const mag2 = Math.sqrt(v2x * v2x + v2y * v2y + v2z * v2z);

      if (mag1 < 0.00001 || mag2 < 0.00001) return 180.0;

      const dot = (v1x * v2x + v1y * v2y + v1z * v2z) / (mag1 * mag2);
      const clampedDot = Math.max(-1.0, Math.min(1.0, dot));
      return (Math.acos(clampedDot) * 180.0) / Math.PI;
    }

    /**
     * Calculates hand scale invariant: 3D distance between wrist (0) and middle MCP (9).
     * @private
     * @param {Array<{x: number, y: number, z: number}>} landmarks
     * @returns {number} Scale factor
     */
    _computeHandScale(landmarks) {
      const wrist = landmarks[LM.WRIST];
      const middleMcp = landmarks[LM.MIDDLE_MCP];
      let scale = this._dist3D(wrist, middleMcp);

      if (scale < 0.01) {
        // Fallback to wrist -> index MCP
        const indexMcp = landmarks[LM.INDEX_MCP];
        scale = this._dist3D(wrist, indexMcp);
      }

      return Math.max(0.01, scale);
    }

    /**
     * Evaluates extension state for fingers (Index, Middle, Ring, Pinky).
     * @private
     * @param {Array<{x: number, y: number, z: number}>} landmarks
     * @param {number} mcpIdx
     * @param {number} pipIdx
     * @param {number} dipIdx
     * @param {number} tipIdx
     * @param {number} scale
     * @returns {string} EXTENDED | HALF_CURLED | CURLED
     */
    _classifyFinger(landmarks, mcpIdx, pipIdx, dipIdx, tipIdx, scale) {
      const wrist = landmarks[LM.WRIST];
      const mcp = landmarks[mcpIdx];
      const pip = landmarks[pipIdx];
      const dip = landmarks[dipIdx];
      const tip = landmarks[tipIdx];

      // Joint interior angles
      const pipAngle = this._jointAngle(mcp, pip, dip);
      const dipAngle = this._jointAngle(pip, dip, tip);

      // Distance ratios
      const distTipWrist = this._dist3D(tip, wrist);
      const distPipWrist = this._dist3D(pip, wrist);
      const distRatioWrist = distPipWrist > 0.001 ? (distTipWrist / distPipWrist) : 1.0;

      // Normalized tip-to-MCP distance
      const normTipMcp = this._dist3D(tip, mcp) / scale;

      // Straight finger has high angles (>135°) and tip is extended away from wrist and MCP
      const isAngleExtended = pipAngle > 135 && dipAngle > 125;
      const isDistanceExtended = distRatioWrist > 1.10 && normTipMcp > 0.65;

      if (isAngleExtended && isDistanceExtended) {
        return FINGER_STATES.EXTENDED;
      }

      // Curled finger has acute angle (<115°) or folded tip
      const isAngleCurled = pipAngle < 115 || dipAngle < 110;
      const isDistanceCurled = distRatioWrist < 0.98 || normTipMcp < 0.50;

      if (isAngleCurled || isDistanceCurled) {
        return FINGER_STATES.CURLED;
      }

      return FINGER_STATES.HALF_CURLED;
    }

    /**
     * Evaluates extension state for Thumb.
     * Thumb exhibits unique biomechanics moving across opposition planes.
     * @private
     * @param {Array<{x: number, y: number, z: number}>} landmarks
     * @param {number} scale
     * @returns {string} EXTENDED | HALF_CURLED | CURLED
     */
    _classifyThumb(landmarks, scale) {
      const wrist = landmarks[LM.WRIST];
      const mcp = landmarks[LM.THUMB_MCP];
      const ip = landmarks[LM.THUMB_IP];
      const tip = landmarks[LM.THUMB_TIP];
      const pinkyMcp = landmarks[LM.PINKY_MCP];
      const indexMcp = landmarks[LM.INDEX_MCP];

      // IP joint interior angle
      const ipAngle = this._jointAngle(mcp, ip, tip);

      // Distances normalized by hand scale
      const distTipWrist = this._dist3D(tip, wrist) / scale;
      const distToPinkyMcp = this._dist3D(tip, pinkyMcp) / scale;
      const distToIndexMcp = this._dist3D(tip, indexMcp) / scale;

      // Thumb extended:
      // 1. Spreading out laterally: distToPinkyMcp > 0.7 && distToIndexMcp > 0.4
      // 2. Pointing straight up (Thumbs up): ipAngle > 130 && distTipWrist > 1.0 && distToPinkyMcp > 0.65
      // 3. Pointing straight down (Thumbs down): ipAngle > 130 && distToPinkyMcp > 0.7 && distToIndexMcp > 0.4
      const isSpreadExtended = (distToPinkyMcp > 0.70 && distToIndexMcp > 0.40);
      const isThumbsUpExtended = (ipAngle > 130 && distTipWrist > 1.0 && distToPinkyMcp > 0.65);
      const isThumbsDownExtended = (ipAngle > 130 && distToPinkyMcp > 0.70 && distToIndexMcp > 0.40);

      if (isSpreadExtended || isThumbsUpExtended || isThumbsDownExtended) {
        return FINGER_STATES.EXTENDED;
      }

      // Thumb curled:
      // Folded across palm or tucked close into index MCP with acute angle
      if (distToPinkyMcp < 0.55 && distTipWrist < 0.95) {
        return FINGER_STATES.CURLED;
      }
      if (ipAngle < 112 && distToIndexMcp < 0.38) {
        return FINGER_STATES.CURLED;
      }

      return FINGER_STATES.HALF_CURLED;
    }

    /**
     * Detects pinch status with Schmitt-trigger hysteresis and double-pinch timing.
     * @private
     * @param {number} normPinchDist - Normalized thumb-index distance
     * @param {number} timestamp - Current timestamp in ms
     * @returns {{ isPinching: boolean, isDoublePinch: boolean }}
     */
    _evaluatePinchHysteresis(normPinchDist, timestamp) {
      const threshold = this.config.gestures.pinchThreshold;
      const releaseThreshold = this.config.gestures.pinchReleaseThreshold;

      const wasPinching = this.isPinching;
      let isDoublePinch = false;

      // Hysteresis: separate touch and release thresholds
      if (!this.isPinching) {
        if (normPinchDist <= threshold) {
          this.isPinching = true;

          // Double pinch evaluation window (350ms)
          if (this.waitingForSecondPinch && (timestamp - this.lastPinchReleaseTime) <= 350) {
            isDoublePinch = true;
            this.waitingForSecondPinch = false;
            this.doublePinchTriggeredUntil = timestamp + 250;
          } else {
            this.waitingForSecondPinch = false;
          }
        }
      } else {
        if (normPinchDist > releaseThreshold) {
          this.isPinching = false;
          this.lastPinchReleaseTime = timestamp;
          this.waitingForSecondPinch = true;
        }
      }

      // Check if double pinch event is still within active display window
      if (timestamp < this.doublePinchTriggeredUntil) {
        isDoublePinch = true;
      }

      // Expire double pinch waiting flag if window exceeded
      if (this.waitingForSecondPinch && (timestamp - this.lastPinchReleaseTime) > 350) {
        this.waitingForSecondPinch = false;
      }

      return {
        isPinching: this.isPinching,
        isDoublePinch
      };
    }

    /**
     * Detects pinch between thumb and middle finger with hysteresis.
     * @private
     * @param {number} normMiddlePinchDist
     * @param {number} normIndexPinchDist
     * @returns {boolean}
     */
    _evaluateMiddlePinch(normMiddlePinchDist, normIndexPinchDist) {
      const threshold = this.config.gestures.pinchThreshold;
      const releaseThreshold = this.config.gestures.pinchReleaseThreshold;

      if (!this.isMiddlePinching) {
        // Only trigger if middle is pinching and index is NOT pinching
        if (normMiddlePinchDist <= threshold && normIndexPinchDist > releaseThreshold) {
          this.isMiddlePinching = true;
        }
      } else {
        if (normMiddlePinchDist > releaseThreshold || normIndexPinchDist <= threshold) {
          this.isMiddlePinching = false;
        }
      }

      return this.isMiddlePinching;
    }

    /**
     * Computes pinch progress indicator in [0.0, 1.0].
     * 1.0 = fully pinched, 0.0 = fingers separated.
     * @private
     * @param {number} pinchDist
     * @returns {number}
     */
    _computePinchProgress(pinchDist) {
      const threshold = this.config.gestures.pinchThreshold;
      const releaseThreshold = this.config.gestures.pinchReleaseThreshold;
      const maxDistance = releaseThreshold * 2.2;

      if (pinchDist <= threshold) return 1.0;
      if (pinchDist >= maxDistance) return 0.0;

      const progress = (maxDistance - pinchDist) / (maxDistance - threshold);
      return Math.max(0.0, Math.min(1.0, progress));
    }

    /**
     * Determines raw cursor origin point from landmarks.
     * Chooses index tip or thumb-index midpoint during pinch prep to prevent jump.
     * @private
     * @param {Array<{x: number, y: number, z: number}>} landmarks
     * @param {number} pinchDist
     * @param {boolean} isMiddlePinching
     * @returns {{x: number, y: number}}
     */
    _getRawCursorPosition(landmarks, pinchDist, isMiddlePinching) {
      const releaseThreshold = this.config.gestures.pinchReleaseThreshold;

      if (isMiddlePinching) {
        return {
          x: (landmarks[LM.THUMB_TIP].x + landmarks[LM.MIDDLE_TIP].x) / 2.0,
          y: (landmarks[LM.THUMB_TIP].y + landmarks[LM.MIDDLE_TIP].y) / 2.0
        };
      }

      // If pinching or approaching pinch, use midpoint between thumb and index tip
      if (this.isPinching || pinchDist < releaseThreshold * 1.5) {
        return {
          x: (landmarks[LM.THUMB_TIP].x + landmarks[LM.INDEX_TIP].x) / 2.0,
          y: (landmarks[LM.THUMB_TIP].y + landmarks[LM.INDEX_TIP].y) / 2.0
        };
      }

      // Otherwise default to index fingertip
      return {
        x: landmarks[LM.INDEX_TIP].x,
        y: landmarks[LM.INDEX_TIP].y
      };
    }

    /**
     * Evaluates continuous scrolling delta for VICTORY_PEACE gesture.
     * @private
     * @param {{x: number, y: number}} currentPos
     * @returns {{dx: number, dy: number}}
     */
    _computeScrollDelta(currentPos) {
      if (this.prevScrollX === null || this.prevScrollY === null) {
        this.prevScrollX = currentPos.x;
        this.prevScrollY = currentPos.y;
        return { dx: 0, dy: 0 };
      }

      const rawDx = currentPos.x - this.prevScrollX;
      const rawDy = currentPos.y - this.prevScrollY;

      this.prevScrollX = currentPos.x;
      this.prevScrollY = currentPos.y;

      const deadzone = this.config.gestures.scrollDeadzone || 0.03;
      const speed = this.config.gestures.scrollSpeed || 25;

      let dx = 0;
      let dy = 0;

      if (Math.abs(rawDx) > deadzone) {
        const excessX = rawDx - Math.sign(rawDx) * deadzone;
        dx = Math.round(excessX * speed * 100);
      }

      if (Math.abs(rawDy) > deadzone) {
        const excessY = rawDy - Math.sign(rawDy) * deadzone;
        dy = Math.round(excessY * speed * 100);
      }

      return { dx, dy };
    }

    /**
     * Evaluates continuous zoom delta for THREE_FINGERS gesture.
     * @private
     * @param {number} currentY
     * @returns {number}
     */
    _computeZoomDelta(currentY) {
      if (this.prevZoomY === null) {
        this.prevZoomY = currentY;
        return 0;
      }

      const rawDy = this.prevZoomY - currentY; // Upward hand movement = zoom in
      this.prevZoomY = currentY;

      const deadzone = this.config.gestures.scrollDeadzone || 0.03;
      const zoomSpeed = this.config.gestures.zoomSpeed || 0.05;

      if (Math.abs(rawDy) > deadzone) {
        const excess = rawDy - Math.sign(rawDy) * deadzone;
        return Number((excess * zoomSpeed * 10).toFixed(4));
      }

      return 0;
    }

    /**
     * Classifies raw hand gesture based on finger states and relative geometry.
     * @private
     * @param {Array<{x: number, y: number, z: number}>} landmarks
     * @param {object} fingerStates
     * @param {number} normPinchDist
     * @param {number} normMiddlePinchDist
     * @param {number} scale
     * @param {boolean} isDoublePinch
     * @returns {string} Gesture ID
     */
    _classifyGesture(landmarks, fingerStates, normPinchDist, normMiddlePinchDist, scale, isDoublePinch) {
      const { thumb, index, middle, ring, pinky } = fingerStates;

      // 1. Double Pinch has highest priority during active window
      if (isDoublePinch) {
        return 'DOUBLE_PINCH';
      }

      // 2. Middle Pinch (Right Click)
      if (this.isMiddlePinching) {
        return 'PINCH_MIDDLE';
      }

      // 3. OK Sign: Thumb and index touch, while middle, ring, and pinky are all EXTENDED
      if (normPinchDist <= this.config.gestures.pinchReleaseThreshold * 1.3 &&
          middle === FINGER_STATES.EXTENDED &&
          ring === FINGER_STATES.EXTENDED &&
          pinky === FINGER_STATES.EXTENDED) {
        return 'OK_SIGN';
      }

      // 4. Primary Pinch: Thumb and index touch
      if (this.isPinching) {
        return 'PINCH';
      }

      // 5. Thumbs Up / Down: Thumb extended, all other fingers curled
      if (thumb === FINGER_STATES.EXTENDED &&
          index === FINGER_STATES.CURLED &&
          middle === FINGER_STATES.CURLED &&
          ring === FINGER_STATES.CURLED &&
          pinky === FINGER_STATES.CURLED) {

        const thumbTip = landmarks[LM.THUMB_TIP];
        const thumbMcp = landmarks[LM.THUMB_MCP];
        const wrist = landmarks[LM.WRIST];

        const deltaY = thumbTip.y - thumbMcp.y;
        const deltaX = Math.abs(thumbTip.x - thumbMcp.x);

        // Screen Y is downwards: smaller Y means higher in air
        if (deltaY < -0.06 * scale && deltaX < Math.abs(deltaY) * 1.3) {
          return 'THUMBS_UP';
        }

        if (deltaY > 0.06 * scale && deltaX < Math.abs(deltaY) * 1.3) {
          return 'THUMBS_DOWN';
        }
      }

      // 6. Point: Index extended, other fingers curled
      if (index === FINGER_STATES.EXTENDED &&
          middle === FINGER_STATES.CURLED &&
          ring === FINGER_STATES.CURLED &&
          pinky === FINGER_STATES.CURLED) {
        return 'POINT';
      }

      // 7. Three Fingers (Zoom): Thumb, Index, Middle extended OR Index, Middle, Ring extended
      const isThreeFingersA = (thumb === FINGER_STATES.EXTENDED && index === FINGER_STATES.EXTENDED && middle === FINGER_STATES.EXTENDED && ring === FINGER_STATES.CURLED && pinky === FINGER_STATES.CURLED);
      const isThreeFingersB = (index === FINGER_STATES.EXTENDED && middle === FINGER_STATES.EXTENDED && ring === FINGER_STATES.EXTENDED && pinky === FINGER_STATES.CURLED);

      if (isThreeFingersA || isThreeFingersB) {
        return 'THREE_FINGERS';
      }

      // 8. Victory / Peace: Index & Middle extended and separated, ring & pinky curled, thumb tucked
      if (index === FINGER_STATES.EXTENDED &&
          middle === FINGER_STATES.EXTENDED &&
          ring === FINGER_STATES.CURLED &&
          pinky === FINGER_STATES.CURLED &&
          thumb !== FINGER_STATES.EXTENDED) {

        const distTips = this._dist3D(landmarks[LM.INDEX_TIP], landmarks[LM.MIDDLE_TIP]) / scale;
        if (distTips > 0.12) {
          return 'VICTORY_PEACE';
        }
      }

      // 9. Rock On: Index and Pinky extended, middle and ring curled
      if (index === FINGER_STATES.EXTENDED &&
          pinky === FINGER_STATES.EXTENDED &&
          middle === FINGER_STATES.CURLED &&
          ring === FINGER_STATES.CURLED) {
        return 'ROCK_ON';
      }

      // 10. Open Palm: All 5 fingers extended
      if (thumb === FINGER_STATES.EXTENDED &&
          index === FINGER_STATES.EXTENDED &&
          middle === FINGER_STATES.EXTENDED &&
          ring === FINGER_STATES.EXTENDED &&
          pinky === FINGER_STATES.EXTENDED) {
        return 'OPEN_PALM';
      }

      // 11. Fist: All 5 fingers curled
      if (thumb === FINGER_STATES.CURLED &&
          index === FINGER_STATES.CURLED &&
          middle === FINGER_STATES.CURLED &&
          ring === FINGER_STATES.CURLED &&
          pinky === FINGER_STATES.CURLED) {
        return 'FIST';
      }

      return 'NONE';
    }

    /**
     * Debounces gesture transitions to eliminate rapid flickering.
     * Clicks (PINCH, DOUBLE_PINCH, PINCH_MIDDLE) bypass debouncing for zero-latency response.
     * @private
     * @param {string} rawGesture
     * @returns {string} Stabilized gesture ID
     */
    _applyDebounce(rawGesture) {
      // Zero latency for pinch actions
      if (rawGesture === 'PINCH' || rawGesture === 'DOUBLE_PINCH' || rawGesture === 'PINCH_MIDDLE') {
        this.currentGesture = rawGesture;
        this.candidateGesture = rawGesture;
        this.candidateFrames = 0;
        return this.currentGesture;
      }

      if (rawGesture === this.candidateGesture) {
        this.candidateFrames++;
        if (this.candidateFrames >= this.debounceFramesRequired) {
          this.currentGesture = rawGesture;
        }
      } else {
        this.candidateGesture = rawGesture;
        this.candidateFrames = 1;
      }

      return this.currentGesture;
    }

    /**
     * Resets detector states (e.g. when hand exits frame).
     */
    reset() {
      if (this.smoother) {
        this.smoother.reset();
      }
      this.isPinching = false;
      this.isMiddlePinching = false;
      this.lastPinchReleaseTime = 0;
      this.waitingForSecondPinch = false;
      this.doublePinchTriggeredUntil = 0;
      this.currentGesture = 'NONE';
      this.candidateGesture = 'NONE';
      this.candidateFrames = 0;
      this.prevScrollX = null;
      this.prevScrollY = null;
      this.prevZoomY = null;
      this.lostTrackingFrames = 0;
    }

    /**
     * Core detection method: Processes single frame of 21 MediaPipe hand landmarks.
     * @param {Array<{x: number, y: number, z: number}>|object} landmarks - 21 MediaPipe landmarks or results packet
     * @param {object} [options={}] - Additional metadata
     * @param {string} [options.hand='Right'] - Handedness ('Left' | 'Right')
     * @param {number} [options.confidence=1.0] - Landmark confidence score
     * @param {number} [options.timestamp] - Current timestamp in ms (performance.now())
     * @returns {object} Standardized gesture packet:
     *   {
     *     gesture: string,
     *     action: string,
     *     cursor: { x: number, y: number, rawX: number, rawY: number },
     *     pinchProgress: number,
     *     pinchDistance: number,
     *     isPinching: boolean,
     *     scrollDelta: { dx: number, dy: number },
     *     zoomDelta: number,
     *     confidence: number,
     *     hand: 'Left' | 'Right'
     *   }
     */
    detect(landmarks, options = {}) {
      return this.processLandmarks(landmarks, options);
    }

    processLandmarks(landmarks, options = {}) {
      const now = options.timestamp !== undefined ? Number(options.timestamp) : (typeof performance !== 'undefined' ? performance.now() : Date.now());
      this.lastTimestamp = now;

      // Extract landmarks array if wrapped in MediaPipe results object
      let lms = landmarks;
      let handLabel = options.hand || 'Right';
      let confidence = options.confidence !== undefined ? options.confidence : 1.0;

      if (landmarks && landmarks.multiHandLandmarks) {
        if (landmarks.multiHandLandmarks.length > 0) {
          lms = landmarks.multiHandLandmarks[0];
          if (landmarks.multiHandedness && landmarks.multiHandedness[0]) {
            handLabel = landmarks.multiHandedness[0].label || handLabel;
            confidence = landmarks.multiHandedness[0].score !== undefined ? landmarks.multiHandedness[0].score : confidence;
          }
        } else {
          lms = null;
        }
      }

      // Handle lost tracking / hand outside frame
      if (!lms || !Array.isArray(lms) || lms.length < 21) {
        this.lostTrackingFrames++;
        if (this.lostTrackingFrames > this.maxLostTrackingFrames) {
          this.reset();
        }

        return {
          gesture: 'NONE',
          action: 'ACTION_NONE',
          cursor: {
            x: 0.5,
            y: 0.5,
            rawX: 0.5,
            rawY: 0.5
          },
          pinchProgress: 0.0,
          pinchDistance: 1.0,
          isPinching: false,
          scrollDelta: { dx: 0, dy: 0 },
          zoomDelta: 0.0,
          confidence: 0.0,
          hand: handLabel
        };
      }

      this.lostTrackingFrames = 0;

      // 1. Compute Hand Scale Invariant
      const scale = this._computeHandScale(lms);

      // 2. Evaluate Finger Extension States
      const fingerStates = {
        thumb: this._classifyThumb(lms, scale),
        index: this._classifyFinger(lms, LM.INDEX_MCP, LM.INDEX_PIP, LM.INDEX_DIP, LM.INDEX_TIP, scale),
        middle: this._classifyFinger(lms, LM.MIDDLE_MCP, LM.MIDDLE_PIP, LM.MIDDLE_DIP, LM.MIDDLE_TIP, scale),
        ring: this._classifyFinger(lms, LM.RING_MCP, LM.RING_PIP, LM.RING_DIP, LM.RING_TIP, scale),
        pinky: this._classifyFinger(lms, LM.PINKY_MCP, LM.PINKY_PIP, LM.PINKY_DIP, LM.PINKY_TIP, scale)
      };

      // 3. Normalized Pinch Distances
      const normPinchDist = this._dist3D(lms[LM.THUMB_TIP], lms[LM.INDEX_TIP]) / scale;
      const normMiddlePinchDist = this._dist3D(lms[LM.THUMB_TIP], lms[LM.MIDDLE_TIP]) / scale;

      // 4. Pinch Evaluation & Progress
      const pinchResult = this._evaluatePinchHysteresis(normPinchDist, now);
      const isMiddlePinching = this._evaluateMiddlePinch(normMiddlePinchDist, normPinchDist);
      const pinchProgress = this._computePinchProgress(normPinchDist);

      // 5. Raw Cursor Coordinates
      let rawCursor = this._getRawCursorPosition(lms, normPinchDist, isMiddlePinching);

      // Mirror X if requested by camera mirror setting
      if (this.config.camera && this.config.camera.mirror) {
        rawCursor.x = 1.0 - rawCursor.x;
      }

      // 6. Smooth Cursor with PointSmoother
      let smoothedCursor;
      if (this.smoother) {
        smoothedCursor = this.smoother.smooth(rawCursor.x, rawCursor.y, now);
      } else {
        smoothedCursor = {
          x: rawCursor.x,
          y: rawCursor.y,
          rawX: rawCursor.x,
          rawY: rawCursor.y
        };
      }

      // 7. Gesture Classification
      const rawGesture = this._classifyGesture(
        lms,
        fingerStates,
        normPinchDist,
        normMiddlePinchDist,
        scale,
        pinchResult.isDoublePinch
      );

      // 8. Debounce / Hysteresis
      const stabilizedGesture = this._applyDebounce(rawGesture);

      // 9. Map Action from Gesture Bindings
      const action = (this.config.gestureBindings && this.config.gestureBindings[stabilizedGesture]) || 'ACTION_NONE';

      // 10. Continuous Navigation Deltas (Scroll & Zoom)
      let scrollDelta = { dx: 0, dy: 0 };
      let zoomDelta = 0.0;

      if (stabilizedGesture === 'VICTORY_PEACE') {
        const scrollAnchor = {
          x: (lms[LM.INDEX_MCP].x + lms[LM.MIDDLE_MCP].x) / 2.0,
          y: (lms[LM.INDEX_MCP].y + lms[LM.MIDDLE_MCP].y) / 2.0
        };
        if (this.config.camera && this.config.camera.mirror) {
          scrollAnchor.x = 1.0 - scrollAnchor.x;
        }
        scrollDelta = this._computeScrollDelta(scrollAnchor);
      } else {
        this.prevScrollX = null;
        this.prevScrollY = null;
      }

      if (stabilizedGesture === 'THREE_FINGERS') {
        const zoomY = lms[LM.MIDDLE_MCP].y;
        zoomDelta = this._computeZoomDelta(zoomY);
      } else {
        this.prevZoomY = null;
      }

      // 11. Emits standardized gesture packet
      return {
        gesture: stabilizedGesture,
        action: action,
        cursor: {
          x: smoothedCursor.x,
          y: smoothedCursor.y,
          rawX: smoothedCursor.rawX,
          rawY: smoothedCursor.rawY
        },
        pinchProgress: Number(pinchProgress.toFixed(3)),
        pinchDistance: Number(normPinchDist.toFixed(4)),
        isPinching: this.isPinching,
        scrollDelta: scrollDelta,
        zoomDelta: zoomDelta,
        confidence: Number(confidence.toFixed(3)),
        hand: handLabel,
        // Detailed metrics for debug/HUD visualization
        fingerStates: fingerStates,
        timestamp: now
      };
    }
  }

  GestureDetector.FINGER_STATES = FINGER_STATES;
  GestureDetector.LM = LM;

  return GestureDetector;
});
