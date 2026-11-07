/**
 * @file gestures.js
 * @description Catalog of supported AR gesture IDs, human-readable descriptors, icons,
 * and mapped action primitives categorized into Pointer, Navigation, Zoom, and System actions.
 * Zero external network calls.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GestureCatalog = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  /**
   * Action category definitions.
   */
  const ACTION_CATEGORIES = Object.freeze({
    POINTER: {
      id: 'POINTER',
      label: 'Cursor & Clicking',
      description: 'Pointer movement, clicking, and dragging interactions'
    },
    NAVIGATION: {
      id: 'NAVIGATION',
      label: 'Navigation & Scrolling',
      description: 'Page scrolling, history navigation, and tab switching'
    },
    ZOOM: {
      id: 'ZOOM',
      label: 'Zoom & Magnification',
      description: 'Page zoom and interactive AR magnifying lens'
    },
    SYSTEM: {
      id: 'SYSTEM',
      label: 'System & Controls',
      description: 'HUD visibility, pausing, and extension toggles'
    }
  });

  /**
   * Complete dictionary of gesture definitions.
   */
  const GESTURES = Object.freeze({
    PINCH: {
      id: 'PINCH',
      label: 'Pinch',
      shortLabel: 'Pinch',
      description: 'Thumb tip and index fingertip touching together',
      icon: '🤏',
      svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 11V6a2 2 0 0 0-4 0v4"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-16 0"/><path d="M6 14l-2 2a3 3 0 0 0 4 4l6-1"/></svg>'
    },
    DOUBLE_PINCH: {
      id: 'DOUBLE_PINCH',
      label: 'Double Pinch',
      shortLabel: '2x Pinch',
      description: 'Quick double tap with thumb and index fingertip within 350ms',
      icon: '⚡',
      svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>'
    },
    PINCH_MIDDLE: {
      id: 'PINCH_MIDDLE',
      label: 'Middle Pinch',
      shortLabel: 'Mid Pinch',
      description: 'Thumb tip and middle fingertip touching together',
      icon: '👆',
      svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M3 12h3m12 0h3M12 3v3m0 12v3"/></svg>'
    },
    PINCH_RING: {
      id: 'PINCH_RING',
      label: 'Ring Pinch',
      shortLabel: 'Ring Pinch',
      description: 'Thumb tip and ring fingertip touching together',
      icon: '👌',
      svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>'
    },
    POINT: {
      id: 'POINT',
      label: 'Point',
      shortLabel: 'Point',
      description: 'Index finger extended straight, other fingers curled',
      icon: '👉',
      svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12h14"/><path d="m13 8 4 4-4 4"/></svg>'
    },
    VICTORY_PEACE: {
      id: 'VICTORY_PEACE',
      label: 'Peace / Victory',
      shortLabel: 'Peace',
      description: 'Index and middle fingers extended in a V-shape, ring and pinky curled',
      icon: '✌️',
      svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 13V5a2 2 0 0 1 4 0v7"/><path d="M11 12V3a2 2 0 0 1 4 0v9"/><path d="M15 11a2 2 0 0 1 4 0v4a7 7 0 0 1-14 0v-2a2 2 0 0 1 4 0"/></svg>'
    },
    OPEN_PALM: {
      id: 'OPEN_PALM',
      label: 'Open Palm',
      shortLabel: 'Palm',
      description: 'All five fingers extended open facing the camera',
      icon: '✋',
      svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V3a2 2 0 0 0-4 0v9"/><path d="M6 12V7a2 2 0 0 0-4 0v8a8 8 0 0 0 16 0v-4a2 2 0 0 0-4 0"/></svg>'
    },
    FIST: {
      id: 'FIST',
      label: 'Fist',
      shortLabel: 'Fist',
      description: 'All fingers curled tightly into a closed fist',
      icon: '✊',
      svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M8 12h8m-4-4v8"/></svg>'
    },
    THUMBS_UP: {
      id: 'THUMBS_UP',
      label: 'Thumbs Up',
      shortLabel: 'Thumb Up',
      description: 'Thumb pointing upward, all other fingers curled',
      icon: '👍',
      svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.3a2 2 0 0 0 2-1.7l1.4-9A2 2 0 0 0 19.7 9H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>'
    },
    THUMBS_DOWN: {
      id: 'THUMBS_DOWN',
      label: 'Thumbs Down',
      shortLabel: 'Thumb Down',
      description: 'Thumb pointing downward, all other fingers curled',
      icon: '👎',
      svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.7a2 2 0 0 0-2 1.7l-1.4 9A2 2 0 0 0 4.3 15H10z"/><path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"/></svg>'
    },
    OK_SIGN: {
      id: 'OK_SIGN',
      label: 'OK Sign',
      shortLabel: 'OK',
      description: 'Thumb and index tips touching in a ring, middle, ring, pinky extended',
      icon: '👌',
      svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="9" r="4"/><path d="M13 9h8m-8 4h8m-8 4h6"/></svg>'
    },
    THREE_FINGERS: {
      id: 'THREE_FINGERS',
      label: 'Three Fingers',
      shortLabel: '3-Fingers',
      description: 'Three fingers extended (Thumb, Index, Middle or Index, Middle, Ring)',
      icon: '🤟',
      svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 14V4a2 2 0 0 1 4 0v10"/><path d="M12 12V2a2 2 0 0 1 4 0v11"/><path d="M16 13V5a2 2 0 0 1 4 0v8a7 7 0 0 1-14 0v-3a2 2 0 0 1 4 0"/></svg>'
    },
    ROCK_ON: {
      id: 'ROCK_ON',
      label: 'Rock On',
      shortLabel: 'Rock',
      description: 'Index and pinky extended, middle and ring curled',
      icon: '🤘',
      svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 14V5a2 2 0 0 1 4 0v8"/><path d="M18 13V4a2 2 0 0 0-4 0v9"/><path d="M10 13v-2a2 2 0 0 1 4 0v2"/><path d="M6 14a6 6 0 0 0 12 0v-1"/></svg>'
    },
    NONE: {
      id: 'NONE',
      label: 'None / Resting',
      shortLabel: 'Idle',
      description: 'No gesture recognized or hand is resting',
      icon: '⚪',
      svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>'
    }
  });

  /**
   * Complete dictionary of action definitions.
   */
  const ACTIONS = Object.freeze({
    ACTION_CLICK: {
      id: 'ACTION_CLICK',
      label: 'Primary Click',
      category: 'POINTER',
      description: 'Dispatches primary left mouse click at the cursor position'
    },
    ACTION_DOUBLE_CLICK: {
      id: 'ACTION_DOUBLE_CLICK',
      label: 'Double Click',
      category: 'POINTER',
      description: 'Dispatches rapid double click at the cursor position'
    },
    ACTION_RIGHT_CLICK: {
      id: 'ACTION_RIGHT_CLICK',
      label: 'Right Click (Context Menu)',
      category: 'POINTER',
      description: 'Opens contextual menu at the cursor position'
    },
    ACTION_MOVE_POINTER: {
      id: 'ACTION_MOVE_POINTER',
      label: 'Move Pointer',
      category: 'POINTER',
      description: 'Updates smoothed on-screen cursor position'
    },
    ACTION_HOVER: {
      id: 'ACTION_HOVER',
      label: 'Hover Pointer',
      category: 'POINTER',
      description: 'Hovers over elements without clicking to trigger CSS hover effects'
    },
    ACTION_DRAG: {
      id: 'ACTION_DRAG',
      label: 'Click & Drag',
      category: 'POINTER',
      description: 'Holds mouse button down while moving cursor to drag items or select text'
    },
    ACTION_SCROLL: {
      id: 'ACTION_SCROLL',
      label: 'Continuous Scroll',
      category: 'NAVIGATION',
      description: 'Smoothly scrolls the active page in any direction following hand movement'
    },
    ACTION_SCROLL_UP: {
      id: 'ACTION_SCROLL_UP',
      label: 'Scroll Up (Step)',
      category: 'NAVIGATION',
      description: 'Scrolls page upwards by a fixed page step'
    },
    ACTION_SCROLL_DOWN: {
      id: 'ACTION_SCROLL_DOWN',
      label: 'Scroll Down (Step)',
      category: 'NAVIGATION',
      description: 'Scrolls page downwards by a fixed page step'
    },
    ACTION_TAB_NEXT: {
      id: 'ACTION_TAB_NEXT',
      label: 'Next Tab',
      category: 'NAVIGATION',
      description: 'Switches to the next browser tab to the right'
    },
    ACTION_TAB_PREV: {
      id: 'ACTION_TAB_PREV',
      label: 'Previous Tab',
      category: 'NAVIGATION',
      description: 'Switches to the previous browser tab to the left'
    },
    ACTION_PAGE_BACK: {
      id: 'ACTION_PAGE_BACK',
      label: 'Go Back',
      category: 'NAVIGATION',
      description: 'Navigates back one step in browser history'
    },
    ACTION_PAGE_FORWARD: {
      id: 'ACTION_PAGE_FORWARD',
      label: 'Go Forward',
      category: 'NAVIGATION',
      description: 'Navigates forward one step in browser history'
    },
    ACTION_ZOOM: {
      id: 'ACTION_ZOOM',
      label: 'Dynamic Zoom',
      category: 'ZOOM',
      description: 'Zooms web page in or out based on hand motion'
    },
    ACTION_TOGGLE_ZOOM_LENS: {
      id: 'ACTION_TOGGLE_ZOOM_LENS',
      label: 'Toggle Zoom Lens',
      category: 'ZOOM',
      description: 'Toggles circular interactive AR magnifying loupe on screen'
    },
    ACTION_NONE: {
      id: 'ACTION_NONE',
      label: 'No Action',
      category: 'SYSTEM',
      description: 'Does nothing (ignores gesture)'
    }
  });

  /**
   * Retrieves gesture definition by ID.
   * @param {string} gestureId
   * @returns {object} Gesture definition object or fallback to NONE
   */
  function getGestureById(gestureId) {
    return GESTURES[gestureId] || GESTURES.NONE;
  }

  /**
   * Retrieves action definition by ID.
   * @param {string} actionId
   * @returns {object} Action definition object or fallback to ACTION_NONE
   */
  function getActionById(actionId) {
    return ACTIONS[actionId] || ACTIONS.ACTION_NONE;
  }

  /**
   * Returns an array of all defined gestures.
   * @returns {object[]}
   */
  function getAllGestures() {
    return Object.values(GESTURES);
  }

  /**
   * Returns an array of all defined actions.
   * @returns {object[]}
   */
  function getAllActions() {
    return Object.values(ACTIONS);
  }

  /**
   * Returns actions belonging to a specific category.
   * @param {string} category - 'POINTER' | 'NAVIGATION' | 'ZOOM' | 'SYSTEM'
   * @returns {object[]}
   */
  function getActionsByCategory(category) {
    return Object.values(ACTIONS).filter((action) => action.category === category);
  }

  /**
   * Checks whether a gesture ID is valid and recognized.
   * @param {string} gestureId
   * @returns {boolean}
   */
  function isValidGesture(gestureId) {
    return Boolean(GESTURES[gestureId]);
  }

  /**
   * Checks whether an action ID is valid and recognized.
   * @param {string} actionId
   * @returns {boolean}
   */
  function isValidAction(actionId) {
    return Boolean(ACTIONS[actionId]);
  }

  return {
    ACTION_CATEGORIES,
    GESTURES,
    ACTIONS,
    getGestureById,
    getActionById,
    getAllGestures,
    getAllActions,
    getActionsByCategory,
    isValidGesture,
    isValidAction
  };
});
