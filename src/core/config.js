/**
 * @file config.js
 * @description Centralized configuration and persistent settings manager for the AR extension.
 * Operates 100% offline with zero cloud API dependencies.
 * Automatically synchronizes with chrome.storage.local, falling back to localStorage
 * when running in standalone browser environments or test harnesses.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ConfigManager = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const STORAGE_KEY = 'ar_extension_config';

  /**
   * Default configuration specification.
   */
  const DEFAULT_CONFIG = Object.freeze({
    camera: {
      width: 640,
      height: 480,
      frameRate: 30,
      mirror: true
    },
    tracking: {
      sensitivityX: 1.4,
      sensitivityY: 1.4,
      smoothingMinCutoff: 1.0,
      smoothingBeta: 0.007,
      deadzone: 0.015
    },
    gestures: {
      pinchThreshold: 0.055,
      pinchReleaseThreshold: 0.075,
      scrollDeadzone: 0.03,
      scrollSpeed: 25,
      zoomSpeed: 0.05,
      dwellTimeMs: 800
    },
    gestureBindings: {
      PINCH: 'ACTION_CLICK',
      DOUBLE_PINCH: 'ACTION_DOUBLE_CLICK',
      PINCH_MIDDLE: 'ACTION_RIGHT_CLICK',
      PINCH_RING: 'ACTION_RIGHT_CLICK',
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
    ui: {
      showCursor: true,
      cursorTheme: 'laser-cyan',
      showHud: true,
      showSkeleton: true,
      playSound: true
    }
  });

  /**
   * Deep clone helper to prevent object mutation.
   * @param {*} obj
   * @returns {*}
   */
  function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(deepClone);
    }
    const copy = {};
    for (const key of Object.keys(obj)) {
      copy[key] = deepClone(obj[key]);
    }
    return copy;
  }

  /**
   * Deeply merges target object with source object.
   * Ensures missing nested keys in source are populated from target defaults.
   * @param {object} target - Default object
   * @param {object} source - User provided overrides
   * @returns {object} Merged object
   */
  function deepMerge(target, source) {
    const output = deepClone(target);
    if (!source || typeof source !== 'object') {
      return output;
    }
    for (const key of Object.keys(source)) {
      if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
          output[key] = deepMerge(target[key], source[key]);
        } else {
          output[key] = deepClone(source[key]);
        }
      } else if (source[key] !== undefined) {
        output[key] = source[key];
      }
    }
    return output;
  }

  // Active in-memory cache
  let cachedConfig = deepClone(DEFAULT_CONFIG);

  /**
   * Checks if chrome.storage.local API is available in current environment.
   * @returns {boolean}
   */
  function isChromeStorageAvailable() {
    return (
      typeof chrome !== 'undefined' &&
      chrome.storage &&
      chrome.storage.local &&
      typeof chrome.storage.local.get === 'function' &&
      typeof chrome.storage.local.set === 'function'
    );
  }

  /**
   * Loads configuration from persistent storage.
   * Prioritizes chrome.storage.local, falls back to localStorage, then defaults.
   * @returns {Promise<object>} Resolves to fully merged configuration object
   */
  async function loadConfig() {
    try {
      if (isChromeStorageAvailable()) {
        const stored = await new Promise((resolve) => {
          chrome.storage.local.get([STORAGE_KEY], (result) => {
            if (chrome.runtime && chrome.runtime.lastError) {
              console.warn('[Config] Chrome storage read warning:', chrome.runtime.lastError);
              resolve(null);
            } else {
              resolve(result ? result[STORAGE_KEY] : null);
            }
          });
        });
        cachedConfig = deepMerge(DEFAULT_CONFIG, stored || {});
        return deepClone(cachedConfig);
      }

      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          cachedConfig = deepMerge(DEFAULT_CONFIG, parsed || {});
          return deepClone(cachedConfig);
        }
      }
    } catch (err) {
      console.warn('[Config] Error reading persistent storage, falling back to defaults:', err);
    }

    cachedConfig = deepClone(DEFAULT_CONFIG);
    return deepClone(cachedConfig);
  }

  /**
   * Saves updated configuration to persistent storage.
   * @param {object} newConfig - Partial or full configuration update
   * @returns {Promise<object>} Resolves to updated full configuration
   */
  async function saveConfig(newConfig) {
    cachedConfig = deepMerge(cachedConfig, newConfig || {});
    const configToPersist = deepClone(cachedConfig);

    try {
      if (isChromeStorageAvailable()) {
        await new Promise((resolve, reject) => {
          chrome.storage.local.set({ [STORAGE_KEY]: configToPersist }, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        });
        return deepClone(cachedConfig);
      }

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(configToPersist));
        return deepClone(cachedConfig);
      }
    } catch (err) {
      console.error('[Config] Error saving configuration to storage:', err);
    }

    return deepClone(cachedConfig);
  }

  /**
   * Resets all configuration settings back to factory defaults.
   * @returns {Promise<object>} Resolves to reset default configuration
   */
  async function resetConfig() {
    cachedConfig = deepClone(DEFAULT_CONFIG);
    return saveConfig(DEFAULT_CONFIG);
  }

  /**
   * Synchronously returns the currently cached configuration.
   * @returns {object}
   */
  function getConfig() {
    return deepClone(cachedConfig);
  }

  /**
   * Registers a listener callback invoked whenever configuration changes in storage.
   * Supports both chrome.storage.onChanged and window storage events.
   * @param {function(newConfig: object, oldConfig: object): void} callback
   * @returns {function(): void} Unsubscribe function
   */
  function onConfigChanged(callback) {
    if (typeof callback !== 'function') return () => {};

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      const listener = (changes, areaName) => {
        if (areaName === 'local' && changes[STORAGE_KEY]) {
          const oldVal = deepMerge(DEFAULT_CONFIG, changes[STORAGE_KEY].oldValue || {});
          const newVal = deepMerge(DEFAULT_CONFIG, changes[STORAGE_KEY].newValue || {});
          cachedConfig = deepClone(newVal);
          callback(newVal, oldVal);
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      const listener = (event) => {
        if (event.key === STORAGE_KEY) {
          const oldVal = event.oldValue ? deepMerge(DEFAULT_CONFIG, JSON.parse(event.oldValue)) : deepClone(DEFAULT_CONFIG);
          const newVal = event.newValue ? deepMerge(DEFAULT_CONFIG, JSON.parse(event.newValue)) : deepClone(DEFAULT_CONFIG);
          cachedConfig = deepClone(newVal);
          callback(newVal, oldVal);
        }
      };
      window.addEventListener('storage', listener);
      return () => window.removeEventListener('storage', listener);
    }

    return () => {};
  }

  return {
    DEFAULT_CONFIG,
    STORAGE_KEY,
    loadConfig,
    saveConfig,
    resetConfig,
    getConfig,
    get: loadConfig,
    set: saveConfig,
    update: saveConfig,
    reset: resetConfig,
    onConfigChanged,
    deepClone,
    deepMerge
  };
});
