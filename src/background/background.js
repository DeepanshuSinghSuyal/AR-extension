/**
 * @file background.js
 * @description AeroTouch Background Service Worker.
 * Manages one-click toolbar activation, companion tracker window lifecycle,
 * and high-speed streaming to active browser tabs across all websites.
 */

let isTracking = false;
let trackerWindowId = null;
let cachedActiveTabId = null;
let cachedWindowId = null;
let isRetargeting = false;
let lastTabCheckTime = 0;

// URL validation to prevent tracking extension pages or browser internals
function isRestrictedUrl(url) {
  if (!url || typeof url !== 'string') return true;
  const restricted = [
    'chrome:',
    'chrome-extension:',
    'edge:',
    'opera:',
    'brave:',
    'about:',
    'data:',
    'view-source:',
    'devtools:'
  ];
  return restricted.some(p => url.startsWith(p)) || url.startsWith('https://chrome.google.com/webstore');
}

// Determines if a tab is a legitimate user browsing webpage
function isValidWebpageTab(tab) {
  if (!tab || !tab.id || tab.id === chrome.tabs.TAB_ID_NONE) return false;
  if (trackerWindowId && tab.windowId === trackerWindowId) return false;
  if (isRestrictedUrl(tab.url) || isRestrictedUrl(tab.pendingUrl)) return false;
  return true;
}

// Locate and cache the user's actual browser webpage tab
async function updateActiveTab() {
  try {
    // 1. Check active tab in last focused window
    const [lastFocusedTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (isValidWebpageTab(lastFocusedTab)) {
      cachedActiveTabId = lastFocusedTab.id;
      cachedWindowId = lastFocusedTab.windowId;
      return cachedActiveTabId;
    }

    // 2. Fallback: inspect normal browser windows (excluding tracker popup)
    const normalWindows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
    
    // Prioritize focused normal window
    const focusedWin = normalWindows.find(w => w.focused && (!trackerWindowId || w.id !== trackerWindowId));
    if (focusedWin && focusedWin.tabs) {
      const activeTab = focusedWin.tabs.find(t => t.active);
      if (isValidWebpageTab(activeTab)) {
        cachedActiveTabId = activeTab.id;
        cachedWindowId = focusedWin.id;
        return cachedActiveTabId;
      }
    }

    // Next search all normal windows for an active valid tab
    for (const win of normalWindows) {
      if (trackerWindowId && win.id === trackerWindowId) continue;
      if (win.tabs) {
        const activeTab = win.tabs.find(t => t.active);
        if (isValidWebpageTab(activeTab)) {
          cachedActiveTabId = activeTab.id;
          cachedWindowId = win.id;
          return cachedActiveTabId;
        }
      }
    }
  } catch (err) {
    console.warn('[AeroTouch Background] updateActiveTab error:', err);
  }
  return null;
}

// Dynamically inject content script and CSS into a tab if not yet present
async function ensureContentScriptInjected(tabId) {
  if (!tabId) return false;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!isValidWebpageTab(tab)) return false;

    // Ping existing content script
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
      if (res && res.status === 'ok') return true;
    } catch (e) {
      // Content script not present or responsive -> inject dynamically
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['src/content/content_script.js']
      });
      return true;
    }
  } catch (err) {
    return false;
  }
  return true;
}

// Safely send message to a valid webpage tab
async function sendToTab(tabId, message) {
  if (!tabId) return null;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!isValidWebpageTab(tab)) return null;
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    return null;
  }
}

// Tab switched by user (e.g. switched from GitHub to YouTube)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (trackerWindowId && activeInfo.windowId === trackerWindowId) return;
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (!isValidWebpageTab(tab)) return;

    cachedActiveTabId = tab.id;
    cachedWindowId = activeInfo.windowId;

    if (isTracking && cachedActiveTabId) {
      await ensureContentScriptInjected(cachedActiveTabId);
      sendToTab(cachedActiveTabId, { type: 'SET_TRACKING_STATE', enabled: true });
    }
  } catch (err) {}
});

// Window focus changed
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE || (trackerWindowId && windowId === trackerWindowId)) return;
  cachedWindowId = windowId;
  const tabId = await updateActiveTab();
  if (isTracking && tabId) {
    await ensureContentScriptInjected(tabId);
    sendToTab(tabId, { type: 'SET_TRACKING_STATE', enabled: true });
  }
});

// Webpage updated, reloaded, or navigated (e.g. navigated to Google or YouTube)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (trackerWindowId && tab && tab.windowId === trackerWindowId) return;
  if (!isValidWebpageTab(tab)) return;

  // If this tab is the active tab in its window, update cachedActiveTabId immediately
  if (tab.active) {
    cachedActiveTabId = tab.id;
    cachedWindowId = tab.windowId;

    if (isTracking && (changeInfo.status === 'complete' || changeInfo.url)) {
      await ensureContentScriptInjected(tabId);
      sendToTab(tabId, { type: 'SET_TRACKING_STATE', enabled: true });
    }
  }
});

// Companion window closed by user
chrome.windows.onRemoved.addListener(async (windowId) => {
  if (windowId === trackerWindowId) {
    trackerWindowId = null;
    isTracking = false;
    chrome.action.setBadgeText({ text: '' });
    try {
      const allTabs = await chrome.tabs.query({});
      for (const tab of allTabs) {
        if (isValidWebpageTab(tab)) {
          chrome.tabs.sendMessage(tab.id, { type: 'SET_TRACKING_STATE', enabled: false }).catch(() => {});
        }
      }
    } catch (tabErr) {}
    console.log('[AeroTouch Background] Companion tracker window closed.');
  }
});

// Start tracking session
async function startTracking(activeTab) {
  try {
    let currentWin = null;
    try {
      currentWin = await chrome.windows.getCurrent();
    } catch (e) {}

    // 1. Establish valid active webpage tab
    if (activeTab && isValidWebpageTab(activeTab)) {
      cachedActiveTabId = activeTab.id;
      cachedWindowId = activeTab.windowId;
    } else {
      await updateActiveTab();
    }

    // 2. Immediately inject content script & show cursor on user's screen without waiting!
    if (cachedActiveTabId) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: cachedActiveTabId },
          files: ['src/content/content_script.js']
        }).catch(() => {});

        await chrome.tabs.sendMessage(cachedActiveTabId, {
          type: 'SET_TRACKING_STATE',
          enabled: true
        }).catch(() => {});
      } catch (injErr) {
        console.warn('[AeroTouch Background] Initial injection warning:', injErr);
      }
    }

    // 3. Check if tracker window is already open
    if (trackerWindowId) {
      try {
        const existingWin = await chrome.windows.get(trackerWindowId);
        if (existingWin) {
          isTracking = true;
          await chrome.action.setBadgeText({ text: 'ON' });
          await chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
          return;
        }
      } catch (e) {
        trackerWindowId = null;
      }
    }

    // 4. Calculate optimal position in corner of user's display
    let left = 20;
    let top = 40;
    try {
      if (currentWin && currentWin.width) {
        left = Math.max(10, (currentWin.left || 0) + currentWin.width - 340);
        top = Math.max(10, (currentWin.top || 0) + 30);
      }
    } catch (e) {}

    // 5. Create compact companion tracker window
    const trackerWin = await chrome.windows.create({
      url: chrome.runtime.getURL('src/tracker/tracker.html'),
      type: 'popup',
      width: 320,
      height: 240,
      left: left,
      top: top,
      focused: false
    });

    trackerWindowId = trackerWin.id;
    isTracking = true;

    // 6. Refocus the user's work window
    if (currentWin && currentWin.id) {
      try {
        await chrome.windows.update(currentWin.id, { focused: true });
      } catch (focusErr) {}
    }

    await chrome.action.setBadgeText({ text: 'ON' });
    await chrome.action.setBadgeBackgroundColor({ color: '#10b981' });

    console.log('[AeroTouch Background] Tracker window created. Tracking active.');
  } catch (err) {
    console.error('[AeroTouch Background] Failed to start tracking:', err);
    isTracking = false;
    await chrome.action.setBadgeText({ text: '' });
  }
}

// Stop tracking session
async function stopTracking() {
  try {
    if (trackerWindowId) {
      const winId = trackerWindowId;
      trackerWindowId = null;
      try {
        await chrome.windows.remove(winId);
      } catch (e) {}
    }

    isTracking = false;
    await chrome.action.setBadgeText({ text: '' });

    // Notify ALL tabs to immediately disable digital cursor and restore full physical mouse
    try {
      const allTabs = await chrome.tabs.query({});
      for (const tab of allTabs) {
        if (isValidWebpageTab(tab)) {
          chrome.tabs.sendMessage(tab.id, { type: 'SET_TRACKING_STATE', enabled: false }).catch(() => {});
        }
      }
    } catch (tabErr) {}

    console.log('[AeroTouch Background] Tracking deactivated. Physical mouse completely restored.');
  } catch (err) {
    console.warn('[AeroTouch Background] Error stopping tracking:', err);
  }
}

// One-Click Toolbar Action: Toggle camera tracking on/off
chrome.action.onClicked.addListener(async (tab) => {
  if (isTracking) {
    await stopTracking();
  } else {
    await startTracking(tab);
  }
});

// Setup Context Menu for Opening Settings
chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({
      id: 'aerotouch-open-settings',
      title: 'AeroTouch Settings',
      contexts: ['action']
    });
  } catch (e) {}
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'aerotouch-open-settings') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html') });
  }
});

// Forward GESTURE_STREAM packets to active webpage with automatic re-targeting
async function forwardGestureStream(message) {
  if (!isTracking) return;

  const now = performance.now();

  // Periodically re-verify active tab every 400ms to instantly follow tab switches
  if (now - lastTabCheckTime > 400) {
    lastTabCheckTime = now;
    await updateActiveTab();
  }

  if (cachedActiveTabId) {
    try {
      await chrome.tabs.sendMessage(cachedActiveTabId, message);
      return;
    } catch (err) {
      // Send failed -> tab closed, reloaded, or navigated
    }
  }

  // Prevent multiple simultaneous re-targeting queries during rapid 60 FPS streaming
  if (isRetargeting) return;
  isRetargeting = true;

  try {
    const newTabId = await updateActiveTab();
    if (newTabId) {
      await ensureContentScriptInjected(newTabId);
      await sendToTab(newTabId, { type: 'SET_TRACKING_STATE', enabled: true });
      try {
        await chrome.tabs.sendMessage(newTabId, message);
      } catch (e) {}
    }
  } finally {
    isRetargeting = false;
  }
}

// Runtime Message Bus
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  switch (message.type) {
    case 'GESTURE_STREAM':
      forwardGestureStream(message);
      break;

    case 'TOGGLE_TRACKING':
      if (isTracking) {
        stopTracking();
      } else {
        startTracking();
      }
      sendResponse({ isTracking });
      break;

    case 'GET_STATUS':
      sendResponse({ isTracking, trackerWindowId });
      break;

    case 'OPEN_SETTINGS':
      chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html') });
      break;

    case 'NAV_BACK':
      if (sender && sender.tab && sender.tab.id) {
        chrome.tabs.goBack(sender.tab.id).catch(() => {});
      }
      sendResponse({ success: true });
      break;

    case 'NAV_FORWARD':
      if (sender && sender.tab && sender.tab.id) {
        chrome.tabs.goForward(sender.tab.id).catch(() => {});
      }
      sendResponse({ success: true });
      break;

    case 'NAV_RELOAD':
      if (sender && sender.tab && sender.tab.id) {
        chrome.tabs.reload(sender.tab.id).catch(() => {});
      }
      sendResponse({ success: true });
      break;

    case 'OPEN_TAB':
      if (message.url) {
        chrome.tabs.create({ url: message.url, active: true });
      }
      sendResponse({ success: true });
      break;

    default:
      break;
  }
  return true;
});

// Initialize on startup
updateActiveTab();
