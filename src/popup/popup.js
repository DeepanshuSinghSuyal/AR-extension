// AeroTouch - Popup Controller

document.addEventListener('DOMContentLoaded', async () => {
  const btnOpenSidepanel = document.getElementById('btn-open-sidepanel');
  const btnOpenWindow = document.getElementById('btn-open-window');
  const btnGrantPermission = document.getElementById('btn-grant-permission');
  const btnOptions = document.getElementById('btn-popup-options');
  const btnTest = document.getElementById('btn-popup-test');

  const toggleActive = document.getElementById('popup-toggle-active');
  const toggleCursor = document.getElementById('popup-toggle-cursor');
  const toggleSound = document.getElementById('popup-toggle-sound');
  const sensSlider = document.getElementById('popup-sens-slider');
  const sensVal = document.getElementById('popup-sens-val');
  const statusPill = document.getElementById('popup-status-pill');

  // Load config safely
  let config = {};
  try {
    if (typeof ConfigManager !== 'undefined' && ConfigManager.get) {
      config = await ConfigManager.get();
    } else if (chrome && chrome.storage && chrome.storage.local) {
      const data = await chrome.storage.local.get('ar_extension_config');
      config = data.ar_extension_config || {};
    }
  } catch (err) {
    console.warn('[Popup] Error reading config:', err);
  }

  // Populate UI
  if (config.tracking) {
    sensSlider.value = config.tracking.sensitivityX || 1.4;
    sensVal.textContent = `${sensSlider.value}x`;
  }

  if (config.ui) {
    toggleCursor.checked = config.ui.showCursor !== false;
    toggleSound.checked = config.ui.playSound !== false;
  }

  if (config.active !== undefined) {
    toggleActive.checked = config.active !== false;
  }

  // 1. Primary Action: Open Side Panel Camera
  if (btnOpenSidepanel) {
    btnOpenSidepanel.addEventListener('click', async () => {
      btnOpenSidepanel.disabled = true;
      btnOpenSidepanel.textContent = 'Opening Camera...';

      // Attempt Chrome native Side Panel on focused browser window
      try {
        let win = null;
        try {
          win = await chrome.windows.getLastFocused({ populate: false });
        } catch (e) {}

        if (!win || !win.id) {
          const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          if (tab && tab.windowId) win = { id: tab.windowId };
        }

        if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function' && win && win.id) {
          await chrome.sidePanel.open({ windowId: win.id });
          setTimeout(() => window.close(), 120);
          return;
        }
      } catch (err) {
        console.warn('[Popup] Native SidePanel open failed (likely on internal page or unsupported):', err);
      }

      // Fallback: Open in dedicated floating window
      try {
        await chrome.windows.create({
          url: chrome.runtime.getURL('src/sidepanel/sidepanel.html'),
          type: 'popup',
          width: 400,
          height: 680,
          focused: true
        });
        setTimeout(() => window.close(), 100);
        return;
      } catch (e) {
        console.warn('[Popup] Window fallback failed, opening new tab:', e);
      }

      // Fallback 2: Open in a new tab (always succeeds)
      chrome.tabs.create({ url: chrome.runtime.getURL('src/sidepanel/sidepanel.html') });
      window.close();
    });
  }

  // 2. Secondary Action: Open in Floating Window directly
  if (btnOpenWindow) {
    btnOpenWindow.addEventListener('click', async () => {
      try {
        await chrome.windows.create({
          url: chrome.runtime.getURL('src/sidepanel/sidepanel.html'),
          type: 'popup',
          width: 400,
          height: 680,
          focused: true
        });
        setTimeout(() => window.close(), 100);
      } catch (e) {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/sidepanel/sidepanel.html') });
        window.close();
      }
    });
  }

  // 3. Grant Camera Permission in a full tab (triggers Chrome's native prompt)
  if (btnGrantPermission) {
    btnGrantPermission.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/permission/permission.html') });
      window.close();
    });
  }

  // 4. Open Options Page
  if (btnOptions) {
    btnOptions.addEventListener('click', () => {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html') });
      }
      window.close();
    });
  }

  // 4. Open Diagnostic Playground
  if (btnTest) {
    btnTest.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/test/gesture_test.html') });
      window.close();
    });
  }

  // Toggles update
  async function updateConfig() {
    try {
      const updates = {
        active: toggleActive.checked,
        tracking: {
          sensitivityX: parseFloat(sensSlider.value),
          sensitivityY: parseFloat(sensSlider.value)
        },
        ui: {
          showCursor: toggleCursor.checked,
          playSound: toggleSound.checked
        }
      };

      if (typeof ConfigManager !== 'undefined' && ConfigManager.update) {
        await ConfigManager.update(updates);
      } else if (chrome && chrome.storage && chrome.storage.local) {
        const cur = (await chrome.storage.local.get('ar_extension_config')).ar_extension_config || {};
        cur.active = toggleActive.checked;
        cur.tracking = cur.tracking || {};
        cur.tracking.sensitivityX = parseFloat(sensSlider.value);
        cur.tracking.sensitivityY = parseFloat(sensSlider.value);
        cur.ui = cur.ui || {};
        cur.ui.showCursor = toggleCursor.checked;
        cur.ui.playSound = toggleSound.checked;
        await chrome.storage.local.set({ ar_extension_config: cur });
      }
    } catch (e) {
      console.warn('[Popup] Error saving updates:', e);
    }
  }

  if (toggleActive) toggleActive.addEventListener('change', updateConfig);
  if (toggleCursor) toggleCursor.addEventListener('change', updateConfig);
  if (toggleSound) toggleSound.addEventListener('change', updateConfig);

  if (sensSlider) {
    sensSlider.addEventListener('input', () => {
      sensVal.textContent = `${sensSlider.value}x`;
    });
    sensSlider.addEventListener('change', updateConfig);
  }
});
