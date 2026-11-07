/**
 * @file content_script.js
 * @description AeroTouch - Precision Virtual Cursor & Interaction Engine.
 * 
 * Luxury Digital Cursor:
 * - High-contrast dual-layer design (Obsidian backdrop + Titanium white dot)
 * - Immediate presence on tracking enable (defaulting to screen center)
 * - Gentle subtle breathing pulse in ready/searching state (.aerotouch-searching)
 * - Smooth exponential lerp gliding to hand coordinates on detection (.aerotouch-active)
 * - Responsive 38px expansion hover halo (.aerotouch-hover)
 * - Tactile micro-contraction scale(0.85) and clean white expanding shockwave (.aerotouch-ripple)
 * - Universal Cross-Site Compatibility: YouTube, Google, GitHub, SPAs, Banking
 *   (100% immune to TrustedHTML and strict CSP via programmatic DOM & inlined styles)
 * - Universal scrolling engine (window, document.scrollingElement, ytd-app, overflow containers)
 * - Isolated Shadow DOM container (#aerotouch-root)
 * - STRICT ZERO-NEON PALETTE: Obsidian #07090e, frosted glass, slate, titanium, and white.
 */

(function () {
  'use strict';

  // Prevent multiple injections
  if (window.__AEROTOUCH_INITIALIZED__) {
    return;
  }
  window.__AEROTOUCH_INITIALIZED__ = true;

  // Complete Inlined Cursor Styles (Immune to CSP and TrustedHTML on YouTube and Google)
  const CURSOR_CSS_TEXT = `
:host, .aerotouch-host {
  all: initial !important;
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  pointer-events: none !important;
  z-index: 2147483647 !important;
  overflow: hidden !important;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
  -webkit-font-smoothing: antialiased;
}
#aerotouch-root,
#aerotouch-root *,
#aerotouch-root *::before,
#aerotouch-root *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  pointer-events: none !important;
  user-select: none !important;
}
#aerotouch-cursor {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  will-change: transform;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  transform: translate3d(50vw, 50vh, 0);
}
#aerotouch-cursor.aerotouch-visible {
  opacity: 1;
  visibility: visible;
}
.aerotouch-pointer {
  position: absolute;
  top: 0;
  left: 0;
  width: 28px;
  height: 28px;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  will-change: transform;
  transition: transform 0.14s cubic-bezier(0.16, 1, 0.3, 1);
}
.aerotouch-halo {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1.5px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(0, 0, 0, 0.9);
  transition: width 0.22s cubic-bezier(0.16, 1, 0.3, 1), height 0.22s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  pointer-events: none;
}
.aerotouch-core-dot {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.9), 0 1px 4px rgba(0, 0, 0, 0.7);
  transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), background 0.18s ease;
  z-index: 2;
  pointer-events: none;
}
.aerotouch-crosshair {
  position: absolute;
  top: 50%;
  left: 50%;
  background: rgba(255, 255, 255, 0.55);
  box-shadow: 0 0 1px rgba(0, 0, 0, 0.9);
  pointer-events: none;
  z-index: 1;
  transition: width 0.22s cubic-bezier(0.16, 1, 0.3, 1), height 0.22s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
}
.aerotouch-crosshair.crosshair-x {
  transform: translate(-50%, -50%);
  width: 14px;
  height: 1px;
}
.aerotouch-crosshair.crosshair-y {
  transform: translate(-50%, -50%);
  width: 1px;
  height: 14px;
}
.aerotouch-pulse-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px dashed rgba(255, 255, 255, 0.35);
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}
#aerotouch-cursor.aerotouch-searching .aerotouch-pointer {
  animation: aerotouch-searching-pulse 2.8s ease-in-out infinite;
}
#aerotouch-cursor.aerotouch-searching .aerotouch-pulse-ring {
  opacity: 1;
  animation: aerotouch-ring-breathe 2.8s ease-in-out infinite, aerotouch-ring-rotate 14s linear infinite;
}
@keyframes aerotouch-searching-pulse {
  0%, 100% { transform: translate(-50%, -50%) scale(0.96); opacity: 0.82; }
  50% { transform: translate(-50%, -50%) scale(1.08); opacity: 1; }
}
@keyframes aerotouch-ring-breathe {
  0%, 100% { transform: translate(-50%, -50%) scale(0.94); opacity: 0.3; }
  50% { transform: translate(-50%, -50%) scale(1.15); opacity: 0.75; }
}
@keyframes aerotouch-ring-rotate {
  0% { transform: translate(-50%, -50%) rotate(0deg); }
  100% { transform: translate(-50%, -50%) rotate(360deg); }
}
#aerotouch-cursor.aerotouch-active .aerotouch-pointer {
  animation: none;
  opacity: 1;
}
#aerotouch-cursor.aerotouch-active .aerotouch-pulse-ring {
  opacity: 0;
  animation: none;
}
#aerotouch-cursor.aerotouch-active .aerotouch-halo {
  border-color: rgba(255, 255, 255, 0.95);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(0, 0, 0, 0.9), 0 0 8px rgba(255, 255, 255, 0.15);
}
#aerotouch-cursor.aerotouch-hover .aerotouch-halo {
  width: 38px;
  height: 38px;
  background: rgba(15, 23, 42, 0.92);
  border-color: #ffffff;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(0, 0, 0, 0.95), 0 0 14px rgba(255, 255, 255, 0.25);
}
#aerotouch-cursor.aerotouch-hover .aerotouch-core-dot {
  transform: translate(-50%, -50%) scale(1.3);
  box-shadow: 0 0 0 1.5px rgba(0, 0, 0, 0.9), 0 2px 6px rgba(0, 0, 0, 0.8), 0 0 8px rgba(255, 255, 255, 0.95);
}
#aerotouch-cursor.aerotouch-hover .aerotouch-crosshair.crosshair-x { width: 22px; }
#aerotouch-cursor.aerotouch-hover .aerotouch-crosshair.crosshair-y { height: 22px; }
#aerotouch-cursor.aerotouch-clicking .aerotouch-pointer {
  transform: translate(-50%, -50%) scale(0.85) !important;
  transition: transform 0.08s cubic-bezier(0.16, 1, 0.3, 1);
}
#aerotouch-cursor.aerotouch-clicking .aerotouch-halo {
  background: rgba(30, 41, 59, 0.95);
  border-color: #ffffff;
}
#aerotouch-cursor.aerotouch-clicking .aerotouch-core-dot {
  transform: translate(-50%, -50%) scale(0.85);
}
.aerotouch-ripple {
  position: absolute;
  top: 0;
  left: 0;
  width: 24px;
  height: 24px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.95);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.85), 0 4px 14px rgba(0, 0, 0, 0.5);
  pointer-events: none;
  animation: at-ripple-expand 0.38s cubic-bezier(0.12, 0.8, 0.3, 1) forwards;
  will-change: transform, opacity, width, height;
}
.aerotouch-ripple.double {
  border-width: 2px;
  border-color: #f1f5f9;
  animation: at-ripple-expand 0.46s cubic-bezier(0.12, 0.8, 0.3, 1) forwards;
}
.aerotouch-ripple.right-click {
  border-style: dashed;
  border-color: #e2e8f0;
  animation: at-ripple-expand 0.42s cubic-bezier(0.12, 0.8, 0.3, 1) forwards;
}
@keyframes at-ripple-expand {
  0% { width: 20px; height: 20px; opacity: 1; transform: translate(-50%, -50%) scale(0.7); }
  100% { width: 66px; height: 66px; opacity: 0; transform: translate(-50%, -50%) scale(1.35); }
}
.aerotouch-scroll-pill {
  position: fixed;
  right: 28px;
  top: 50%;
  transform: translateY(-50%) translateX(24px);
  padding: 10px 16px;
  border-radius: 30px;
  background: rgba(15, 23, 42, 0.88);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1.5px solid rgba(255, 255, 255, 0.22);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #f8fafc;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  pointer-events: none;
  z-index: 2147483647;
}
.aerotouch-scroll-pill.active {
  opacity: 1;
  visibility: visible;
  transform: translateY(-50%) translateX(0);
}
.aerotouch-scroll-pill .aerotouch-scroll-chevron {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.45);
  transition: color 0.15s ease, transform 0.15s ease;
}
.aerotouch-scroll-pill.scroll-up .chevron-up { color: #ffffff; transform: translateY(-3px); }
.aerotouch-scroll-pill.scroll-down .chevron-down { color: #ffffff; transform: translateY(3px); }
.aerotouch-scroll-pill .aerotouch-scroll-track {
  width: 3px;
  height: 18px;
  background: rgba(255, 255, 255, 0.18);
  border-radius: 2px;
  overflow: hidden;
  position: relative;
}
.aerotouch-scroll-pill .aerotouch-scroll-thumb {
  width: 100%;
  height: 6px;
  background: #ffffff;
  border-radius: 2px;
  position: absolute;
  top: 6px;
  box-shadow: 0 0 4px rgba(255, 255, 255, 0.8);
  transition: top 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}
.aerotouch-scroll-pill.scroll-up .aerotouch-scroll-thumb { top: 1px; }
.aerotouch-scroll-pill.scroll-down .aerotouch-scroll-thumb { top: 11px; }
.aerotouch-scroll-pill .aerotouch-scroll-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #f1f5f9;
}
.aerotouch-context-menu {
  position: fixed;
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 12px;
  padding: 6px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(0, 0, 0, 0.95);
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 175px;
  z-index: 2147483647;
  pointer-events: auto !important;
  opacity: 0;
  transform: scale(0.94);
  transition: opacity 0.16s cubic-bezier(0.16, 1, 0.3, 1), transform 0.16s cubic-bezier(0.16, 1, 0.3, 1);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}
.aerotouch-context-menu.visible {
  opacity: 1;
  transform: scale(1);
}
.aerotouch-context-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  color: #e2e8f0;
  cursor: pointer;
  pointer-events: auto !important;
  user-select: none !important;
  transition: background 0.12s ease, color 0.12s ease;
}
.aerotouch-context-item:hover, .aerotouch-context-item.hovered {
  background: rgba(255, 255, 255, 0.14);
  color: #ffffff;
}
.aerotouch-context-item .icon {
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  color: rgba(255, 255, 255, 0.85);
}
`;

  // Configuration
  const config = {
    smoothing: 0.68,
    enableAudioFeedback: true,
    audioVolume: 0.28,
    scrollSensitivity: 1.2
  };

  // Internal State
  const state = {
    targetX: window.innerWidth / 2,
    targetY: window.innerHeight / 2,
    currentX: window.innerWidth / 2,
    currentY: window.innerHeight / 2,
    isVisible: false,
    isTrackingActive: false,
    isHandDetected: false,
    isScrolling: false,
    lastHoveredElement: null,
    hoverCheckCounter: 0,
    audioCtx: null,
    scrollTimeout: null
  };

  // DOM Elements (Inside Shadow DOM)
  let hostEl = null;
  let shadowRoot = null;
  let cursorEl = null;
  let pointerEl = null;
  let ripplesContainer = null;
  let scrollPillEl = null;

  /**
   * Initialize offline Web Audio Context
   */
  function getAudioContext() {
    if (!config.enableAudioFeedback) return null;
    if (!state.audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        state.audioCtx = new AudioCtxClass();
      }
    }
    if (state.audioCtx && state.audioCtx.state === 'suspended') {
      state.audioCtx.resume().catch(() => {});
    }
    return state.audioCtx;
  }

  function playClickAudio() {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.025);
      gain.gain.setValueAtTime(config.audioVolume * 0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.03);
    } catch (e) {}
  }

  function playDoubleClickAudio() {
    playClickAudio();
    setTimeout(() => playClickAudio(), 70);
  }

  function playRightClickAudio() {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(450, now);
      osc.frequency.exponentialRampToValueAtTime(750, now + 0.04);
      gain.gain.setValueAtTime(config.audioVolume * 0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.045);
    } catch (e) {}
  }

  /**
   * Helper: Create SVG Chevron element programmatically (Zero TrustedHTML issues)
   */
  function createSvgChevron(points) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '13');
    svg.setAttribute('height', '13');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.2');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', points);
    svg.appendChild(polyline);
    return svg;
  }

  /**
   * Construct Shadow DOM and UI elements programmatically (100% TrustedHTML & CSP immune)
   */
  function buildShadowDOM() {
    const existingHost = document.getElementById('aerotouch-host');
    if (existingHost) {
      existingHost.remove();
    }

    hostEl = document.createElement('div');
    hostEl.id = 'aerotouch-host';
    hostEl.className = 'aerotouch-host';
    hostEl.setAttribute('aria-hidden', 'true');
    hostEl.style.cssText = `all: initial !important; position: fixed !important; top: 0 !important; left: 0 !important; width: 100vw !important; height: 100vh !important; pointer-events: none !important; z-index: 2147483647 !important; overflow: hidden !important; display: ${state.isTrackingActive ? 'block' : 'none'} !important;`;

    shadowRoot = hostEl.attachShadow({ mode: 'open' });

    // Inlined Stylesheet (100% immune to YouTube & Google CSP and CORS blocks)
    const styleEl = document.createElement('style');
    styleEl.textContent = CURSOR_CSS_TEXT;
    shadowRoot.appendChild(styleEl);

    // Container & Digital Cursor Reticle
    const container = document.createElement('div');
    container.id = 'aerotouch-root';

    cursorEl = document.createElement('div');
    cursorEl.id = 'aerotouch-cursor';
    cursorEl.className = 'aerotouch-searching';

    pointerEl = document.createElement('div');
    pointerEl.className = 'aerotouch-pointer';

    const halo = document.createElement('div');
    halo.className = 'aerotouch-halo';

    const crosshairX = document.createElement('div');
    crosshairX.className = 'aerotouch-crosshair crosshair-x';

    const crosshairY = document.createElement('div');
    crosshairY.className = 'aerotouch-crosshair crosshair-y';

    const coreDot = document.createElement('div');
    coreDot.className = 'aerotouch-core-dot';

    const pulseRing = document.createElement('div');
    pulseRing.className = 'aerotouch-pulse-ring';

    pointerEl.appendChild(halo);
    pointerEl.appendChild(crosshairX);
    pointerEl.appendChild(crosshairY);
    pointerEl.appendChild(coreDot);
    pointerEl.appendChild(pulseRing);
    cursorEl.appendChild(pointerEl);
    container.appendChild(cursorEl);

    // 4. Expanding Ripples Container
    ripplesContainer = document.createElement('div');
    ripplesContainer.id = 'aerotouch-ripples';
    container.appendChild(ripplesContainer);

    // 5. Air Scroll Indicator Pill
    scrollPillEl = document.createElement('div');
    scrollPillEl.id = 'aerotouch-scroll-pill';
    scrollPillEl.className = 'aerotouch-scroll-pill';

    const chevronUp = document.createElement('div');
    chevronUp.className = 'aerotouch-scroll-chevron chevron-up';
    chevronUp.appendChild(createSvgChevron('18 15 12 9 6 15'));

    const scrollTrack = document.createElement('div');
    scrollTrack.className = 'aerotouch-scroll-track';
    const scrollThumb = document.createElement('div');
    scrollThumb.className = 'aerotouch-scroll-thumb';
    scrollTrack.appendChild(scrollThumb);

    const chevronDown = document.createElement('div');
    chevronDown.className = 'aerotouch-scroll-chevron chevron-down';
    chevronDown.appendChild(createSvgChevron('6 9 12 15 18 9'));

    const scrollLabel = document.createElement('span');
    scrollLabel.className = 'aerotouch-scroll-label';
    scrollLabel.textContent = 'SCROLL';

    scrollPillEl.appendChild(chevronUp);
    scrollPillEl.appendChild(scrollTrack);
    scrollPillEl.appendChild(chevronDown);
    scrollPillEl.appendChild(scrollLabel);
    container.appendChild(scrollPillEl);

    shadowRoot.appendChild(container);

    // Initial position at screen center
    if (cursorEl) {
      cursorEl.style.transform = `translate3d(${state.currentX}px, ${state.currentY}px, 0)`;
      if (state.isTrackingActive) {
        cursorEl.classList.add('aerotouch-visible');
        if (state.isHandDetected) {
          cursorEl.classList.add('aerotouch-active');
          cursorEl.classList.remove('aerotouch-searching');
        } else {
          cursorEl.classList.add('aerotouch-searching');
          cursorEl.classList.remove('aerotouch-active');
        }
      }
    }

    (document.documentElement || document.body).appendChild(hostEl);
  }

  let activeContextMenu = null;

  function dismissContextMenu() {
    if (activeContextMenu) {
      activeContextMenu.remove();
      activeContextMenu = null;
    }
  }

  function showContextMenu(x, y, linkUrl) {
    dismissContextMenu();
    if (!shadowRoot) return;

    const menu = document.createElement('div');
    menu.className = 'aerotouch-context-menu';

    // Position menu clamped to viewport
    const menuX = Math.min(Math.max(10, x), window.innerWidth - 185);
    const menuY = Math.min(Math.max(10, y), window.innerHeight - 175);
    menu.style.left = `${menuX}px`;
    menu.style.top = `${menuY}px`;

    function addItem(icon, label, onClick) {
      const item = document.createElement('div');
      item.className = 'aerotouch-context-item';

      const iconSpan = document.createElement('span');
      iconSpan.className = 'icon';
      iconSpan.textContent = icon;

      const labelSpan = document.createElement('span');
      labelSpan.textContent = label;

      item.appendChild(iconSpan);
      item.appendChild(labelSpan);

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        dismissContextMenu();
        onClick();
      });

      menu.appendChild(item);
    }

    if (linkUrl) {
      addItem('↗', 'Open in New Tab', () => {
        chrome.runtime.sendMessage({ type: 'OPEN_TAB', url: linkUrl }).catch(() => {
          window.open(linkUrl, '_blank');
        });
      });
      addItem('📋', 'Copy Link', () => {
        try {
          navigator.clipboard.writeText(linkUrl);
        } catch (e) {}
      });
    }

    addItem('⬅', 'Back', () => {
      chrome.runtime.sendMessage({ type: 'NAV_BACK' }).catch(() => {
        window.history.back();
      });
    });

    addItem('➡', 'Forward', () => {
      chrome.runtime.sendMessage({ type: 'NAV_FORWARD' }).catch(() => {
        window.history.forward();
      });
    });

    addItem('🔄', 'Reload', () => {
      chrome.runtime.sendMessage({ type: 'NAV_RELOAD' }).catch(() => {
        window.location.reload();
      });
    });

    shadowRoot.appendChild(menu);
    activeContextMenu = menu;

    requestAnimationFrame(() => {
      menu.classList.add('visible');
    });

    setTimeout(() => {
      if (activeContextMenu === menu) {
        dismissContextMenu();
      }
    }, 6000);
  }

  /**
   * Pierce Shadow DOM and locate the deepest element under point (x, y)
   * Guaranteed to never return #aerotouch-host or internal cursor elements.
   */
  function getElementDeep(x, y) {
    if (typeof x !== 'number' || typeof y !== 'number') return null;
    if (x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) return null;

    let hostPrevDisplay = null;
    if (hostEl) {
      hostEl.style.pointerEvents = 'none';
      if (document.elementFromPoint(x, y) === hostEl) {
        hostPrevDisplay = hostEl.style.display;
        hostEl.style.display = 'none';
      }
    }

    let el = document.elementFromPoint(x, y);

    if (hostPrevDisplay !== null && hostEl) {
      hostEl.style.display = hostPrevDisplay;
    }

    while (el && el.shadowRoot && typeof el.shadowRoot.elementFromPoint === 'function') {
      const nested = el.shadowRoot.elementFromPoint(x, y);
      if (!nested || nested === el) break;
      el = nested;
    }
    return el;
  }

  /**
   * Find closest actionable or focusable element (Universal: Google, YouTube, SPAs, Buttons, Links)
   */
  function findActionableElement(el) {
    if (!el || el === document.body || el === document.documentElement) return null;
    return el.closest(
      'a, button, input, textarea, select, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="menuitem"], [tabindex], [contenteditable="true"], ytd-thumbnail, ytd-video-renderer, ytd-rich-item-renderer, yt-icon-button, tp-yt-paper-button, #thumbnail, a#video-title'
    ) || el;
  }

  /**
   * Determine if element is interactive (for hover highlighting)
   */
  function isInteractiveElement(el) {
    if (!el) return false;
    const actionable = findActionableElement(el);
    if (actionable && actionable !== document.body && actionable !== document.documentElement) {
      const tag = actionable.tagName.toLowerCase();
      if (['a', 'button', 'input', 'textarea', 'select'].includes(tag)) return true;
      if (actionable.getAttribute('role') === 'button' || actionable.getAttribute('role') === 'link' || actionable.getAttribute('role') === 'tab') return true;
      if (tag.startsWith('ytd-') || tag.startsWith('yt-') || tag.startsWith('tp-yt-')) return true;
    }
    const computed = window.getComputedStyle(el);
    return computed && computed.cursor === 'pointer';
  }

  /**
   * Find scrollable container under cursor (Supports YouTube ytd-app, body, documentElement, window)
   */
  function findScrollableContainer(startEl) {
    let curr = startEl;
    while (curr && curr !== document.body && curr !== document.documentElement) {
      const style = window.getComputedStyle(curr);
      const overflowY = style.overflowY;
      const canScrollY = (overflowY === 'auto' || overflowY === 'scroll') && (curr.scrollHeight > curr.clientHeight + 10);
      if (canScrollY) {
        return curr;
      }
      curr = curr.parentElement;
    }
    return window;
  }

  /**
   * Trigger clean white expanding shockwave ripple
   */
  function triggerRipple(x, y, type = '') {
    if (!ripplesContainer) return;

    const ripple = document.createElement('div');
    ripple.className = `aerotouch-ripple ${type}`.trim();
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;

    ripplesContainer.appendChild(ripple);
    setTimeout(() => {
      ripple.remove();
    }, 450);
  }

  /**
   * Dispatch full synthetic click event lifecycle (Universal: Google search, YouTube videos, SPAs)
   */
  function simulateClick(x, y) {
    // Check if context menu is active: if so, click context menu item or dismiss
    if (activeContextMenu) {
      const menuEl = activeContextMenu;
      const rect = menuEl.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        const items = menuEl.querySelectorAll('.aerotouch-context-item');
        for (const item of items) {
          const r = item.getBoundingClientRect();
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
            item.click();
            return;
          }
        }
      }
      dismissContextMenu();
      return;
    }

    const rawEl = getElementDeep(x, y);
    if (!rawEl) return;
    const target = findActionableElement(rawEl) || rawEl;

    playClickAudio();
    triggerRipple(x, y);

    if (cursorEl) {
      cursorEl.classList.add('aerotouch-clicking');
      setTimeout(() => {
        if (cursorEl) cursorEl.classList.remove('aerotouch-clicking');
      }, 140);
    }

    const mouseOpts = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      detail: 1,
      clientX: Math.round(x),
      clientY: Math.round(y),
      screenX: Math.round(x + (window.screenX || 0)),
      screenY: Math.round(y + (window.screenY || 0)),
      button: 0,
      buttons: 1,
      which: 1
    };

    const ptrDown = new PointerEvent('pointerdown', { ...mouseOpts, pointerId: 1, pointerType: 'mouse', isPrimary: true });
    const mouseDown = new MouseEvent('mousedown', mouseOpts);
    const ptrUp = new PointerEvent('pointerup', { ...mouseOpts, pointerId: 1, pointerType: 'mouse', isPrimary: true });
    const mouseUp = new MouseEvent('mouseup', mouseOpts);
    const clickEvt = new MouseEvent('click', { ...mouseOpts, buttons: 0 });

    rawEl.dispatchEvent(ptrDown);
    rawEl.dispatchEvent(mouseDown);
    rawEl.dispatchEvent(ptrUp);
    rawEl.dispatchEvent(mouseUp);
    rawEl.dispatchEvent(clickEvt);

    if (target && target !== rawEl) {
      target.dispatchEvent(ptrDown);
      target.dispatchEvent(mouseDown);
      target.dispatchEvent(ptrUp);
      target.dispatchEvent(mouseUp);
      target.dispatchEvent(clickEvt);
    }

    // Input & form elements focus & interaction
    const tag = (target.tagName || '').toLowerCase();
    const rawTag = (rawEl.tagName || '').toLowerCase();
    const focusTarget = (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) ? target :
                        (rawTag === 'input' || rawTag === 'textarea' || rawTag === 'select' || rawEl.isContentEditable) ? rawEl : null;

    if (focusTarget) {
      try { focusTarget.focus(); } catch (e) {}
      if (focusTarget.type === 'checkbox' || focusTarget.type === 'radio') {
        try { focusTarget.click(); } catch (e) {}
      }
      return;
    }

    // Anchor Link navigation
    const link = target.closest ? target.closest('a') : (rawEl.closest ? rawEl.closest('a') : null);
    if (link) {
      try {
        link.focus();
        if (typeof link.click === 'function') {
          link.click();
        }
      } catch (e) {}
      return;
    }

    // Buttons and custom elements
    if (typeof target.click === 'function' && target !== document.body && target !== document.documentElement) {
      try {
        target.click();
      } catch (e) {}
    } else if (typeof rawEl.click === 'function' && rawEl !== document.body && rawEl !== document.documentElement) {
      try {
        rawEl.click();
      } catch (e) {}
    }
  }

  /**
   * Dispatch double-click simulation
   */
  function simulateDoubleClick(x, y) {
    const rawEl = getElementDeep(x, y);
    if (!rawEl) return;
    const target = findActionableElement(rawEl) || rawEl;

    playDoubleClickAudio();
    triggerRipple(x, y, 'double');

    if (cursorEl) {
      cursorEl.classList.add('aerotouch-clicking');
      setTimeout(() => {
        if (cursorEl) cursorEl.classList.remove('aerotouch-clicking');
      }, 140);
    }

    const mouseOpts = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: Math.round(x),
      clientY: Math.round(y),
      screenX: Math.round(x + (window.screenX || 0)),
      screenY: Math.round(y + (window.screenY || 0)),
      button: 0,
      buttons: 1,
      which: 1
    };

    rawEl.dispatchEvent(new MouseEvent('mousedown', { ...mouseOpts, detail: 1 }));
    rawEl.dispatchEvent(new MouseEvent('mouseup', { ...mouseOpts, detail: 1 }));
    rawEl.dispatchEvent(new MouseEvent('click', { ...mouseOpts, detail: 1, buttons: 0 }));

    rawEl.dispatchEvent(new MouseEvent('mousedown', { ...mouseOpts, detail: 2 }));
    rawEl.dispatchEvent(new MouseEvent('mouseup', { ...mouseOpts, detail: 2 }));
    rawEl.dispatchEvent(new MouseEvent('click', { ...mouseOpts, detail: 2, buttons: 0 }));
    rawEl.dispatchEvent(new MouseEvent('dblclick', { ...mouseOpts, detail: 2, buttons: 0 }));

    if (target && target !== rawEl) {
      target.dispatchEvent(new MouseEvent('dblclick', { ...mouseOpts, detail: 2, buttons: 0 }));
    }
  }

  /**
   * Dispatch right-click / context menu simulation
   */
  function simulateRightClick(x, y) {
    dismissContextMenu();

    const rawEl = getElementDeep(x, y);
    if (!rawEl) return;
    const target = findActionableElement(rawEl) || rawEl;

    playRightClickAudio();
    triggerRipple(x, y, 'right-click');

    const mouseOpts = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: Math.round(x),
      clientY: Math.round(y),
      screenX: Math.round(x + (window.screenX || 0)),
      screenY: Math.round(y + (window.screenY || 0)),
      button: 2,
      buttons: 2,
      which: 3
    };

    const ptrDown = new PointerEvent('pointerdown', { ...mouseOpts, pointerId: 1, pointerType: 'mouse', isPrimary: true });
    const mouseDown = new MouseEvent('mousedown', mouseOpts);
    const ptrUp = new PointerEvent('pointerup', { ...mouseOpts, pointerId: 1, pointerType: 'mouse', isPrimary: true });
    const mouseUp = new MouseEvent('mouseup', mouseOpts);
    const contextEvt = new MouseEvent('contextmenu', { ...mouseOpts, buttons: 0 });

    rawEl.dispatchEvent(ptrDown);
    rawEl.dispatchEvent(mouseDown);
    rawEl.dispatchEvent(ptrUp);
    rawEl.dispatchEvent(mouseUp);
    rawEl.dispatchEvent(contextEvt);

    if (target && target !== rawEl) {
      target.dispatchEvent(contextEvt);
    }

    const link = target.closest ? target.closest('a') : (rawEl.closest ? rawEl.closest('a') : null);
    const linkUrl = link ? (link.href || link.getAttribute('href')) : null;

    showContextMenu(x, y, linkUrl);
  }

  /**
   * Air Scroll Handler with dynamic chevrons (Universal: YouTube ytd-app, window, document.scrollingElement)
   */
  function handleAirScroll(deltaY) {
    const rawEl = getElementDeep(state.currentX, state.currentY);
    const container = findScrollableContainer(rawEl);

    const dy = deltaY * config.scrollSensitivity;

    if (container === window) {
      window.scrollBy({ top: dy, left: 0, behavior: 'auto' });
      if (document.scrollingElement) {
        document.scrollingElement.scrollTop += dy;
      }
      const ytd = document.querySelector('ytd-app');
      if (ytd && ytd.scrollHeight > ytd.clientHeight) {
        ytd.scrollTop += dy;
      }
    } else {
      container.scrollTop += dy;
    }

    if (scrollPillEl) {
      scrollPillEl.classList.add('active');
      if (dy > 0) {
        scrollPillEl.classList.add('scroll-down');
        scrollPillEl.classList.remove('scroll-up');
      } else if (dy < 0) {
        scrollPillEl.classList.add('scroll-up');
        scrollPillEl.classList.remove('scroll-down');
      }

      if (state.scrollTimeout) clearTimeout(state.scrollTimeout);
      state.scrollTimeout = setTimeout(() => {
        if (!state.isScrolling && scrollPillEl) {
          scrollPillEl.classList.remove('active', 'scroll-up', 'scroll-down');
        }
      }, 350);
    }
  }

  /**
   * Set Tracking State (Enabled / Disabled)
   * When enabled, cursor APPEARS IMMEDIATELY in viewport (defaulting to screen center)
   * in gentle searching / ready state.
   */
  function setTrackingState(enabled) {
    state.isTrackingActive = !!enabled;

    if (state.isTrackingActive) {
      if (hostEl) {
        hostEl.style.display = 'block';
      }
      state.isVisible = true;

      // If hand is not yet detected, default to screen center in searching state
      if (!state.isHandDetected) {
        state.targetX = window.innerWidth / 2;
        state.targetY = window.innerHeight / 2;
        state.currentX = window.innerWidth / 2;
        state.currentY = window.innerHeight / 2;

        if (cursorEl) {
          cursorEl.style.transform = `translate3d(${state.currentX}px, ${state.currentY}px, 0)`;
          cursorEl.classList.add('aerotouch-visible', 'aerotouch-searching');
          cursorEl.classList.remove('aerotouch-active', 'aerotouch-hover', 'aerotouch-clicking');
        }
      } else {
        if (cursorEl) {
          cursorEl.classList.add('aerotouch-visible', 'aerotouch-active');
          cursorEl.classList.remove('aerotouch-searching');
        }
      }
    } else {
      state.isTrackingActive = false;
      state.isHandDetected = false;
      state.isVisible = false;
      state.isScrolling = false;

      dismissContextMenu();

      if (cursorEl) {
        cursorEl.classList.remove(
          'aerotouch-visible',
          'aerotouch-searching',
          'aerotouch-active',
          'aerotouch-hover',
          'aerotouch-clicking'
        );
      }
      if (scrollPillEl) {
        scrollPillEl.classList.remove('active', 'scroll-up', 'scroll-down');
      }

      // Completely hide / cut off overlay, restoring 100% real mouse behavior
      if (hostEl) {
        hostEl.style.display = 'none';
      }
    }
  }

  /**
   * Process Gesture Stream Packet from Tracker
   * Coordinates: data.cursor.x * window.innerWidth, data.cursor.y * window.innerHeight
   * Transitions to active tracking mode and glides smoothly via exponential lerp.
   */
  function handleGestureStream(data) {
    if (!data) return;

    // Hand lost or stream paused
    if (data.handLost || !data.active || data.handDetected === false) {
      state.isHandDetected = false;
      state.isScrolling = false;
      if (scrollPillEl) {
        scrollPillEl.classList.remove('active', 'scroll-up', 'scroll-down');
      }

      // Revert to gentle breathing pulse searching state at current position
      if (state.isTrackingActive && cursorEl) {
        cursorEl.classList.add('aerotouch-searching');
        cursorEl.classList.remove('aerotouch-active', 'aerotouch-hover');
      }
      return;
    }

    state.isTrackingActive = true;

    // First hand detection: smoothly transition from searching to active tracking
    if (!state.isHandDetected) {
      state.isHandDetected = true;
      if (cursorEl) {
        cursorEl.classList.add('aerotouch-active');
        cursorEl.classList.remove('aerotouch-searching');
      }
    }

    // 1. Update Target Coordinates (16:9 Screen Mapping)
    if (data.cursor && typeof data.cursor.x === 'number' && typeof data.cursor.y === 'number') {
      state.targetX = data.cursor.x * window.innerWidth;
      state.targetY = data.cursor.y * window.innerHeight;
    }

    // 2. Air Scrolling
    state.isScrolling = !!data.isScrolling;
    if (state.isScrolling) {
      if (scrollPillEl) scrollPillEl.classList.add('active');
      if (typeof data.scrollDeltaY === 'number' && Math.abs(data.scrollDeltaY) > 0.5) {
        handleAirScroll(data.scrollDeltaY);
      }
    } else {
      if (scrollPillEl && !state.scrollTimeout) {
        scrollPillEl.classList.remove('active', 'scroll-up', 'scroll-down');
      }
    }

    // 3. Discrete Actions
    if (data.action) {
      switch (data.action) {
        case 'ACTION_CLICK':
          simulateClick(state.currentX, state.currentY);
          break;

        case 'ACTION_DOUBLE_CLICK':
          simulateDoubleClick(state.currentX, state.currentY);
          break;

        case 'ACTION_RIGHT_CLICK':
          simulateRightClick(state.currentX, state.currentY);
          break;

        default:
          break;
      }
    }
  }

  /**
   * Main Render & Animation Loop (Hardware-Accelerated 60 FPS)
   */
  function renderLoop() {
    if (state.isTrackingActive) {
      // Smooth Exponential Lerp
      const factor = state.isHandDetected ? config.smoothing : 0.15;
      state.currentX += (state.targetX - state.currentX) * factor;
      state.currentY += (state.targetY - state.currentY) * factor;

      // Clamping to screen boundaries
      state.currentX = Math.max(0, Math.min(window.innerWidth, state.currentX));
      state.currentY = Math.max(0, Math.min(window.innerHeight, state.currentY));

      // Hardware-accelerated translate3d
      if (cursorEl) {
        cursorEl.style.transform = `translate3d(${state.currentX}px, ${state.currentY}px, 0)`;

        if (!state.isVisible) {
          state.isVisible = true;
          cursorEl.classList.add('aerotouch-visible');
        }
      }

      // Context menu item hover highlighting
      if (activeContextMenu) {
        const items = activeContextMenu.querySelectorAll('.aerotouch-context-item');
        for (const item of items) {
          const r = item.getBoundingClientRect();
          if (state.currentX >= r.left && state.currentX <= r.right && state.currentY >= r.top && state.currentY <= r.bottom) {
            item.classList.add('hovered');
          } else {
            item.classList.remove('hovered');
          }
        }
      }

      // Interactive hover state detection (sampled every 3 frames during active hand tracking)
      state.hoverCheckCounter++;
      if (state.isHandDetected && state.hoverCheckCounter % 3 === 0) {
        const el = getElementDeep(state.currentX, state.currentY);
        if (el !== state.lastHoveredElement) {
          state.lastHoveredElement = el;
          const interactive = isInteractiveElement(el);
          if (cursorEl) {
            if (interactive) {
              cursorEl.classList.add('aerotouch-hover');
            } else {
              cursorEl.classList.remove('aerotouch-hover');
            }
          }
        }
      }
    } else {
      if (state.isVisible && cursorEl) {
        state.isVisible = false;
        cursorEl.classList.remove('aerotouch-visible');
      }
    }

    requestAnimationFrame(renderLoop);
  }

  /**
   * Runtime Message Listener
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return;

    switch (message.type) {
      case 'GESTURE_STREAM':
        handleGestureStream(message.data);
        sendResponse({ success: true });
        break;

      case 'SET_TRACKING_STATE':
        setTrackingState(message.enabled);
        sendResponse({ success: true });
        break;

      case 'CONFIG_UPDATE':
        if (message.config) {
          Object.assign(config, message.config);
        }
        sendResponse({ success: true });
        break;

      case 'PING':
        sendResponse({ status: 'ok', url: window.location.href, trackingActive: state.isTrackingActive });
        break;

      default:
        break;
    }
  });

  // Load preferences from storage
  chrome.storage.local.get(['cursorSpeed', 'scrollSensitivity'], (stored) => {
    if (stored) {
      if (typeof stored.scrollSensitivity === 'number') config.scrollSensitivity = stored.scrollSensitivity;
      if (typeof stored.cursorSpeed === 'number') config.smoothing = Math.max(0.4, Math.min(0.9, 0.68 * stored.cursorSpeed));
    }
  });

  // Query background service worker for active tracking status on injection
  try {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res && res.isTracking) {
        setTrackingState(true);
      }
    });
  } catch (e) {}

  // Initialize Shadow DOM & Start Render Loop
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      buildShadowDOM();
      requestAnimationFrame(renderLoop);
    });
  } else {
    buildShadowDOM();
    requestAnimationFrame(renderLoop);
  }

  // Ensure Shadow DOM host survives dynamic body modifications (SPAs, React, YouTube navigations)
  const observer = new MutationObserver(() => {
    if (!document.getElementById('aerotouch-host')) {
      buildShadowDOM();
    }
  });
  observer.observe(document.documentElement, { childList: true });

  // Ensure real mouse clicks dismiss any open context menu seamlessly
  window.addEventListener('click', () => {
    if (activeContextMenu) dismissContextMenu();
  }, { passive: true, capture: true });

})();
