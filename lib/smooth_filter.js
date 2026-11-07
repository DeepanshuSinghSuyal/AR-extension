/**
 * @file smooth_filter.js
 * @description Ultra-smooth offline cursor and landmark stabilization filter engine.
 * Implements the 1€ Filter (One Euro Filter) by Casiez, Roussel, and Vogel (CHI 2012)
 * and PointSmoother combining dual filters, continuous deadzone, viewport scaling,
 * and Exponential Moving Average (EMA) fallback.
 * 
 * 100% offline, zero external dependencies.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    root.LowPassFilter = exports.LowPassFilter;
    root.OneEuroFilter = exports.OneEuroFilter;
    root.PointSmoother = exports.PointSmoother;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  /**
   * First-order low-pass filter used as building block for 1€ Filter.
   */
  class LowPassFilter {
    /**
     * @param {number} [alpha=0.5] - Smoothing factor between 0 and 1.
     * @param {number} [initVal=0] - Initial value.
     */
    constructor(alpha = 0.5, initVal = 0) {
      this.alpha = Math.max(0, Math.min(1, Number(alpha) || 0.5));
      this.s = Number(initVal) || 0;
      this.initialized = false;
    }

    /**
     * Updates alpha factor.
     * @param {number} alpha
     */
    setAlpha(alpha) {
      this.alpha = Math.max(0, Math.min(1, Number(alpha) || 0));
    }

    /**
     * Filters input value using current alpha.
     * @param {number} val
     * @returns {number} Filtered value
     */
    filter(val) {
      if (!this.initialized) {
        this.s = val;
        this.initialized = true;
        return val;
      }
      this.s = this.alpha * val + (1.0 - this.alpha) * this.s;
      return this.s;
    }

    /**
     * Filters input value using explicitly supplied alpha.
     * @param {number} val
     * @param {number} alpha
     * @returns {number} Filtered value
     */
    filterWithAlpha(val, alpha) {
      this.setAlpha(alpha);
      return this.filter(val);
    }

    /**
     * Returns whether the filter has received at least one sample.
     * @returns {boolean}
     */
    hasLastRawValue() {
      return this.initialized;
    }

    /**
     * Returns last filtered output.
     * @returns {number}
     */
    last() {
      return this.s;
    }

    /**
     * Resets filter state.
     */
    reset() {
      this.initialized = false;
      this.s = 0;
    }
  }

  /**
   * One Euro Filter (Casiez, Roussel, Vogel - CHI 2012)
   * Dynamically adjusts cutoff frequency based on movement speed:
   * at low speeds it prioritizes jitter reduction (minCutoff);
   * at high speeds it reduces latency (beta).
   */
  class OneEuroFilter {
    /**
     * @param {object|number} [options=1.0] - minCutoff or config object
     * @param {number} [options.freq=30] - Sampling rate in Hz
     * @param {number} [options.minCutoff=1.0] - Minimum cutoff frequency in Hz
     * @param {number} [options.beta=0.007] - Speed coefficient
     * @param {number} [options.dCutoff=1.0] - Derivative cutoff frequency in Hz
     * @param {number} [beta=0.007] - Speed coefficient if positional args used
     * @param {number} [dCutoff=1.0] - Derivative cutoff if positional args used
     * @param {number} [freq=30] - Sampling rate if positional args used
     */
    constructor(options = {}, beta = 0.007, dCutoff = 1.0, freq = 30) {
      if (typeof options === 'number') {
        this.minCutoff = Math.max(0.0001, options);
        this.beta = Math.max(0, beta);
        this.dCutoff = Math.max(0.0001, dCutoff);
        this.freq = Math.max(1, freq);
      } else {
        const opts = options || {};
        this.minCutoff = Math.max(0.0001, Number(opts.minCutoff !== undefined ? opts.minCutoff : 1.0));
        this.beta = Math.max(0, Number(opts.beta !== undefined ? opts.beta : 0.007));
        this.dCutoff = Math.max(0.0001, Number(opts.dCutoff !== undefined ? opts.dCutoff : 1.0));
        this.freq = Math.max(1, Number(opts.freq !== undefined ? opts.freq : 30));
      }

      this.xFilter = new LowPassFilter();
      this.dxFilter = new LowPassFilter();
      this.lastTime = null;
      this.lastRawValue = null;
    }

    /**
     * Computes smoothing factor alpha for a given cutoff frequency and sample period.
     * @param {number} rate - Sampling frequency in Hz (1/dt)
     * @param {number} cutoff - Cutoff frequency in Hz
     * @returns {number} alpha in [0, 1]
     */
    _computeAlpha(rate, cutoff) {
      if (cutoff <= 0 || rate <= 0) return 1.0;
      const tau = 1.0 / (2.0 * Math.PI * cutoff);
      const te = 1.0 / rate;
      return 1.0 / (1.0 + tau / te);
    }

    /**
     * Filters single input value.
     * @param {number} val - Raw input value
     * @param {number} [timestamp] - Timestamp in milliseconds or seconds (performance.now())
     * @returns {number} Filtered value
     */
    filter(val, timestamp) {
      if (val === null || val === undefined || Number.isNaN(val)) {
        return this.xFilter.last();
      }

      const now = timestamp !== undefined ? Number(timestamp) : (typeof performance !== 'undefined' ? performance.now() : Date.now());

      // First sample initialization
      if (this.lastTime === null || !this.xFilter.hasLastRawValue()) {
        this.lastTime = now;
        this.lastRawValue = val;
        this.dxFilter.filterWithAlpha(0, 1.0);
        return this.xFilter.filterWithAlpha(val, 1.0);
      }

      // Calculate sample duration dt in seconds
      let dt = (now - this.lastTime);
      // Auto-detect milliseconds vs seconds: if delta > 1.0, it is in milliseconds
      if (dt > 1.0) {
        dt = dt / 1000.0;
      }

      // Safety guard against paused tabs, background throttles, or zero/negative time steps
      if (dt <= 0 || dt > 1.0) {
        dt = 1.0 / this.freq;
      }

      this.lastTime = now;
      const rate = 1.0 / dt;

      // Estimate derivative (instantaneous velocity)
      const rawDx = (val - this.lastRawValue) * rate;
      this.lastRawValue = val;

      // Filter derivative using fixed dCutoff
      const alphaDx = this._computeAlpha(rate, this.dCutoff);
      const filteredDx = this.dxFilter.filterWithAlpha(rawDx, alphaDx);

      // Dynamically compute signal cutoff frequency based on movement speed
      const dynamicCutoff = this.minCutoff + this.beta * Math.abs(filteredDx);

      // Filter input signal with dynamic cutoff
      const alphaX = this._computeAlpha(rate, dynamicCutoff);
      return this.xFilter.filterWithAlpha(val, alphaX);
    }

    /**
     * Returns last filtered value.
     * @returns {number}
     */
    last() {
      return this.xFilter.last();
    }

    /**
     * Resets filter state and timestamps.
     */
    reset() {
      this.xFilter.reset();
      this.dxFilter.reset();
      this.lastTime = null;
      this.lastRawValue = null;
    }

    /**
     * Updates dynamic parameters.
     * @param {object} params
     * @param {number} [params.minCutoff]
     * @param {number} [params.beta]
     * @param {number} [params.dCutoff]
     * @param {number} [params.freq]
     */
    setParameters(params = {}) {
      if (params.minCutoff !== undefined) this.minCutoff = Math.max(0.0001, Number(params.minCutoff));
      if (params.beta !== undefined) this.beta = Math.max(0, Number(params.beta));
      if (params.dCutoff !== undefined) this.dCutoff = Math.max(0.0001, Number(params.dCutoff));
      if (params.freq !== undefined) this.freq = Math.max(1, Number(params.freq));
    }
  }

  /**
   * PointSmoother
   * Coordinates 2D point smoothing combining dual OneEuroFilters for (x, y),
   * sensitivity viewport scaling, continuous quadratic deadzone to eliminate micro-tremors,
   * and an Exponential Moving Average (EMA) fallback when timestamps are anomalous.
   */
  class PointSmoother {
    /**
     * @param {object} [options={}]
     * @param {number} [options.minCutoff=1.0] - Minimum cutoff frequency in Hz
     * @param {number} [options.beta=0.007] - Speed coefficient
     * @param {number} [options.dCutoff=1.0] - Derivative cutoff frequency in Hz
     * @param {number} [options.deadzone=0.015] - Deadzone threshold radius in normalized units
     * @param {number} [options.sensitivityX=1.4] - Horizontal sensitivity multiplier
     * @param {number} [options.sensitivityY=1.4] - Vertical sensitivity multiplier
     * @param {number} [options.viewportWidth] - Target viewport width in pixels
     * @param {number} [options.viewportHeight] - Target viewport height in pixels
     * @param {boolean} [options.useEmaFallback=true] - Whether to use EMA fallback on anomalous dt
     * @param {number} [options.emaAlpha=0.35] - EMA smoothing factor
     */
    constructor(options = {}) {
      this.options = Object.assign({
        minCutoff: 1.0,
        beta: 0.007,
        dCutoff: 1.0,
        deadzone: 0.015,
        sensitivityX: 1.4,
        sensitivityY: 1.4,
        viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1920,
        viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 1080,
        useEmaFallback: true,
        emaAlpha: 0.35
      }, options);

      this.filterX = new OneEuroFilter({
        minCutoff: this.options.minCutoff,
        beta: this.options.beta,
        dCutoff: this.options.dCutoff
      });

      this.filterY = new OneEuroFilter({
        minCutoff: this.options.minCutoff,
        beta: this.options.beta,
        dCutoff: this.options.dCutoff
      });

      // EMA fallback state
      this.emaX = null;
      this.emaY = null;

      // Last stabilized raw point for deadzone calculations
      this.deadzoneAnchorX = null;
      this.deadzoneAnchorY = null;

      // Last smoothed point
      this.lastSmoothedX = null;
      this.lastSmoothedY = null;
      this.lastTimestamp = null;

      // Instantaneous velocity (units / sec)
      this.vx = 0;
      this.vy = 0;
    }

    /**
     * Applies continuous quadratic deadzone to eliminate micro-tremors
     * without introducing abrupt discontinuity or snapping.
     * @private
     * @param {number} rawX - Normalized x
     * @param {number} rawY - Normalized y
     * @returns {{x: number, y: number}} Deadzone-attenuated coordinates
     */
    _applyDeadzone(rawX, rawY) {
      if (this.deadzoneAnchorX === null || this.deadzoneAnchorY === null) {
        this.deadzoneAnchorX = rawX;
        this.deadzoneAnchorY = rawY;
        return { x: rawX, y: rawY };
      }

      const dx = rawX - this.deadzoneAnchorX;
      const dy = rawY - this.deadzoneAnchorY;
      const distance = Math.hypot(dx, dy);
      const threshold = Math.max(0, this.options.deadzone);

      if (threshold <= 0 || distance <= 0.00001) {
        return { x: rawX, y: rawY };
      }

      if (distance < threshold) {
        // Continuous quadratic transition: factor approaches 0 near center, 1 at boundary
        const factor = Math.pow(distance / threshold, 2);
        return {
          x: this.deadzoneAnchorX + dx * factor,
          y: this.deadzoneAnchorY + dy * factor
        };
      }

      // Beyond deadzone: slide anchor toward current point to keep deadzone relative
      const excess = distance - threshold;
      const angle = Math.atan2(dy, dx);
      this.deadzoneAnchorX += Math.cos(angle) * excess;
      this.deadzoneAnchorY += Math.sin(angle) * excess;

      return { x: rawX, y: rawY };
    }

    /**
     * Applies sensitivity scaling around the center (0.5, 0.5) and clamps to [0, 1].
     * @private
     * @param {number} x - Normalized x in [0, 1]
     * @param {number} y - Normalized y in [0, 1]
     * @returns {{x: number, y: number}} Scaled normalized coordinates
     */
    _applySensitivity(x, y) {
      const sx = this.options.sensitivityX || 1.0;
      const sy = this.options.sensitivityY || 1.0;

      const scaledX = Math.max(0, Math.min(1, (x - 0.5) * sx + 0.5));
      const scaledY = Math.max(0, Math.min(1, (y - 0.5) * sy + 0.5));

      return { x: scaledX, y: scaledY };
    }

    /**
     * Applies Exponential Moving Average (EMA) filter fallback.
     * @private
     * @param {number} x
     * @param {number} y
     * @returns {{x: number, y: number}}
     */
    _applyEmaFallback(x, y) {
      const alpha = Math.max(0, Math.min(1, this.options.emaAlpha || 0.35));
      if (this.emaX === null || this.emaY === null) {
        this.emaX = x;
        this.emaY = y;
      } else {
        this.emaX = alpha * x + (1.0 - alpha) * this.emaX;
        this.emaY = alpha * y + (1.0 - alpha) * this.emaY;
      }
      return { x: this.emaX, y: this.emaY };
    }

    /**
     * Smooths an incoming (rawX, rawY) point.
     * @param {number} rawX - Normalized X coordinate in [0, 1]
     * @param {number} rawY - Normalized Y coordinate in [0, 1]
     * @param {number} [timestamp] - Milliseconds or seconds (performance.now())
     * @returns {{
     *   x: number,
     *   y: number,
     *   rawX: number,
     *   rawY: number,
     *   screenX: number,
     *   screenY: number,
     *   vx: number,
     *   vy: number
     * }} Smoothed point with normalized and viewport pixel coordinates
     */
    smooth(rawX, rawY, timestamp) {
      if (Number.isNaN(rawX) || Number.isNaN(rawY)) {
        return {
          x: this.lastSmoothedX || 0.5,
          y: this.lastSmoothedY || 0.5,
          rawX: 0.5,
          rawY: 0.5,
          screenX: (this.lastSmoothedX || 0.5) * this.options.viewportWidth,
          screenY: (this.lastSmoothedY || 0.5) * this.options.viewportHeight,
          vx: 0,
          vy: 0
        };
      }

      const now = timestamp !== undefined ? Number(timestamp) : (typeof performance !== 'undefined' ? performance.now() : Date.now());

      // 1. Deadzone attenuation (on normalized coordinates)
      const afterDeadzone = this._applyDeadzone(rawX, rawY);

      // 2. Sensitivity mapping
      const afterSensitivity = this._applySensitivity(afterDeadzone.x, afterDeadzone.y);

      // 3. Time step verification for EMA fallback
      let useFallback = false;
      if (this.lastTimestamp !== null) {
        let dt = now - this.lastTimestamp;
        if (dt > 1.0) dt = dt / 1000.0; // convert to seconds
        if (dt <= 0 || dt > 0.4) {
          // Large gap or abnormal clock -> trigger EMA fallback and reset 1€ history
          useFallback = this.options.useEmaFallback;
        }
      }

      let filteredX, filteredY;
      if (useFallback) {
        const ema = this._applyEmaFallback(afterSensitivity.x, afterSensitivity.y);
        filteredX = ema.x;
        filteredY = ema.y;
        this.filterX.reset();
        this.filterY.reset();
      } else {
        filteredX = this.filterX.filter(afterSensitivity.x, now);
        filteredY = this.filterY.filter(afterSensitivity.y, now);
        // Sync EMA state
        this.emaX = filteredX;
        this.emaY = filteredY;
      }

      // 4. Calculate velocity
      if (this.lastTimestamp !== null && this.lastSmoothedX !== null) {
        let dtSec = (now - this.lastTimestamp);
        if (dtSec > 1.0) dtSec = dtSec / 1000.0;
        if (dtSec > 0.001) {
          this.vx = (filteredX - this.lastSmoothedX) / dtSec;
          this.vy = (filteredY - this.lastSmoothedY) / dtSec;
        }
      }

      this.lastSmoothedX = filteredX;
      this.lastSmoothedY = filteredY;
      this.lastTimestamp = now;

      const screenX = Math.round(filteredX * this.options.viewportWidth);
      const screenY = Math.round(filteredY * this.options.viewportHeight);

      return {
        x: filteredX,
        y: filteredY,
        rawX,
        rawY,
        screenX,
        screenY,
        vx: this.vx,
        vy: this.vy
      };
    }

    /**
     * Resets internal filters and deadzone anchors.
     * Call when hand exits camera frame or tracking is re-acquired.
     */
    reset() {
      this.filterX.reset();
      this.filterY.reset();
      this.emaX = null;
      this.emaY = null;
      this.deadzoneAnchorX = null;
      this.deadzoneAnchorY = null;
      this.lastSmoothedX = null;
      this.lastSmoothedY = null;
      this.lastTimestamp = null;
      this.vx = 0;
      this.vy = 0;
    }

    /**
     * Updates configuration settings.
     * @param {object} params
     */
    setParams(params = {}) {
      Object.assign(this.options, params);

      this.filterX.setParameters({
        minCutoff: this.options.minCutoff,
        beta: this.options.beta,
        dCutoff: this.options.dCutoff
      });

      this.filterY.setParameters({
        minCutoff: this.options.minCutoff,
        beta: this.options.beta,
        dCutoff: this.options.dCutoff
      });
    }

    /**
     * Updates viewport dimensions dynamically (e.g. on window resize).
     * @param {number} width
     * @param {number} height
     */
    setViewport(width, height) {
      if (width > 0) this.options.viewportWidth = width;
      if (height > 0) this.options.viewportHeight = height;
    }
  }

  return {
    LowPassFilter,
    OneEuroFilter,
    PointSmoother
  };
});
