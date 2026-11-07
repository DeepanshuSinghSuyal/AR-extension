# AeroTouch - Hand Gesture Controller

<p align="center">
  <strong>100% Offline, Privacy-Preserving Computer Vision Navigation for Web Browsers</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-10b981?style=flat-square" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/Privacy-100%25_Offline-0ea5e9?style=flat-square" alt="100% Offline" />
  <img src="https://img.shields.io/badge/Performance-60_FPS_Unthrottled-6366f1?style=flat-square" alt="60 FPS" />
  <img src="https://img.shields.io/badge/Zero-External_CDNs-8b5cf6?style=flat-square" alt="Zero External CDNs" />
  <img src="https://img.shields.io/badge/License-MIT-334155?style=flat-square" alt="MIT License" />
</p>

---

## Overview

**AeroTouch** is a high-precision, cross-browser extension (Chrome, Edge, Brave, Opera) that turns your webcam into a touch-free, vision-based browser controller. 

Using on-device machine learning with **MediaPipe Hands** and **1-Euro Filter** jitter dampening, AeroTouch lets you point your index finger to glide an artificial digital cursor across any webpage, tap your fingers for genuine mouse clicks, and air-scroll long feeds like YouTube and GitHub effortlessly.

Your real physical mouse remains **100% untouched and functional** at all times.

---

## 🖐️ Gesture Control Matrix

| Action | Biomechanical Gesture | Visual & Physical Feedback |
| :--- | :--- | :--- |
| **Move Cursor** | **Point Index Finger** | Dual-layer obsidian & titanium reticle glides with hardware-accelerated 60 FPS lerp across the 16:9 screen |
| **Primary Left Click** | **Touch Middle Finger & Thumb** | Instant 0-latency click with tactile scale contraction (0.85) + clean white expanding shockwave ripple + subtle acoustic click |
| **Double Click** | **Double Tap Middle Finger & Thumb** | Rapid double tap within 350ms dispatches double click + dual shockwave ripple |
| **Right Click** | **Touch Ring Finger & Thumb** | Dispatches `contextmenu` + summons functional luxury obsidian context menu (*Open in New Tab*, *Copy Link*, *Back*, *Reload*) |
| **Air-Scroll** | **Pinch Index Finger & Thumb** | Continuous vertical scrolling following hand movement, with frosted glass HUD pill and directional chevrons |

> **Ergonomic Design**: Separating **Air-Scroll** to the *Index + Thumb* and **Left Click** to the *Middle + Thumb* completely prevents accidental clicks while scrolling through documents or video feeds.

---

## 🔒 100% Offline & Private: Zero Cloud, Zero API Keys

- **Bundled WebAssembly**: MediaPipe Hands `.wasm`, `.binarypb`, and `.tflite` model binaries are bundled directly inside the extension (`lib/mediapipe/`).
- **Zero Network Traffic**: Video frames are processed entirely on your GPU/CPU via WebAssembly. No data or telemetry ever leaves your computer.
- **No API Keys or Accounts**: Instant, plug-and-play functionality out of the box.

---

## ⚡ High-Performance Architecture

1. **Anti-Throttling Web Worker Engine**:
   Chromium aggressively throttles background windows down to 1 FPS or halts `requestVideoFrameCallback` when windows are covered or minimized. AeroTouch uses an isolated **Web Worker Ticker** (`ticker_worker.js`) running on a dedicated OS thread combined with a silent Web Audio keepalive. Tracking maintains a locked **60 FPS** even when the companion camera window is behind your browser or minimized.
2. **Universal Website Compatibility**:
   - **TrustedHTML Immune**: Programmatic DOM creation avoids innerHTML string assignments, preventing crashes on YouTube's strict `TrustedHTML` policy.
   - **Strict CSP Resilience**: Digital cursor styles are inlined inside Shadow DOM roots, bypassing Content Security Policy blocks on Google and YouTube.
   - **Deep Shadow DOM Piercing**: Click events are dispatched with `composed: true`, allowing synthetic clicks to cross Web Component boundaries into video thumbnails, buttons, and SPAs.
3. **16:9 Screen Reach Mapping**:
   Calibrated bounding box maps your hand movements across the camera viewfinder directly edge-to-edge across your 16:9 display.

---

## 🚀 Installation & Quick Start

### For Developers & Users (Load Unpacked)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/aerotouch.git
   cd aerotouch
   ```
2. **Open Extensions in your Chromium browser**:
   - Google Chrome: `chrome://extensions/`
   - Microsoft Edge: `edge://extensions/`
   - Brave: `brave://extensions/`
3. **Enable Developer Mode** (toggle in the top-right corner).
4. Click **"Load unpacked"** (top-left) and select the `aerotouch` project folder.
5. **Activate**:
   - Click the **AeroTouch** icon in your browser toolbar to toggle tracking.
   - A compact companion window (320x240) opens in the top-right corner showing your camera reticle.
   - Point your index finger to glide the digital cursor, touch middle+thumb to click, and pinch index+thumb to air-scroll!
   - Click the toolbar icon again at any time to instantly cut off tracking and restore standard mouse browsing.

---

## ⚙️ Settings & Calibration

Right-click the AeroTouch toolbar icon and select **AeroTouch Settings** (or click the *Settings* button in the companion window footer) to access the dedicated options tab:

- **Webcam Device Selection**: Choose between internal laptop webcams or external USB cameras.
- **Edge Reach Calibration**: Adjust the 16:9 mapping margin (5% - 22%) to reach screen corners comfortably.
- **Pointer Speed**: Fine-tune cursor tracking travel multiplier (0.6x - 2.4x).
- **Air-Scroll Sensitivity**: Adjust vertical scrolling responsiveness.
- **Live Calibration Viewfinder**: Interactive sandbox to practice clicking, double-clicking, and air-scrolling in real time.

---

## 📦 Building for the Chrome Web Store

To generate a store-ready, production ZIP package:

```bash
npm run build:zip
```

This compiles a clean distribution archive in `dist/aerotouch-v1.0.0.zip` ready for upload to the **Chrome Web Store Developer Dashboard** and **Microsoft Edge Add-ons**.

---

## 📂 Project Structure

```
aerotouch/
├── manifest.json              # Manifest V3 configuration
├── package.json               # NPM scripts and build configuration
├── README.md                  # Project documentation
├── .gitignore                 # Git ignore rules
├── assets/
│   └── icons/                 # 16, 32, 48, 128px high-resolution icons
├── lib/
│   ├── mediapipe/             # Bundled offline MediaPipe Hands WASM & models
│   └── smooth_filter.js       # One-Euro Filter & PointSmoother
├── scripts/
│   ├── package_extension.js   # Automated store ZIP packager
│   └── verify_html_links.js   # HTML link & asset integrity validator
└── src/
    ├── background/
    │   └── background.js      # Service Worker (window lifecycle, tab streaming)
    ├── content/
    │   ├── content_script.js  # Digital cursor, event dispatching, Shadow DOM
    │   └── cursor.css         # Scoped cursor styles & context menu
    ├── tracker/
    │   ├── tracker.html       # Companion viewfinder UI
    │   ├── tracker.js         # Landmark processing, gesture state machine
    │   ├── ticker_worker.js   # Dedicated 60 FPS Web Worker timer
    │   └── tracker.css        # Obsidian styling
    └── options/
        ├── options.html       # Calibration studio & interactive sandbox
        ├── options.js         # Settings persistence & device selection
        └── options.css        # Studio design tokens
```

---

## 🧪 Testing

Run the offline unit test suite:

```bash
npm test
```

Verifies gesture detection invariants, 1-Euro smoothing filters, deadzone attenuation, and action categorization (24/24 tests).

---

## 📄 License

MIT License. Designed and built with high-performance WebAssembly computer vision.
