/**
 * @file package_extension.js
 * @description Packages AeroTouch into a clean, store-ready ZIP file for
 * Chrome Web Store, Microsoft Edge Add-ons, and Firefox AMO.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const STAGING_DIR = path.join(DIST_DIR, 'aerotouch-package');
const pkg = require('../package.json');
const ZIP_NAME = `aerotouch-v${pkg.version || '1.0.0'}.zip`;
const ZIP_PATH = path.join(DIST_DIR, ZIP_NAME);

// Items to include in the store distribution
const INCLUDE_ITEMS = [
  'manifest.json',
  'assets',
  'lib',
  'src/background',
  'src/content',
  'src/core',
  'src/options',
  'src/permission',
  'src/tracker',
  'src/popup',
  'src/sidepanel'
];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const file of fs.readdirSync(src)) {
      copyRecursive(path.join(src, file), path.join(dest, file));
    }
  } else {
    const parent = path.dirname(dest);
    if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

console.log('====================================================');
console.log(`Packaging AeroTouch v${pkg.version} for Chrome Web Store`);
console.log('====================================================\n');

// 1. Prepare clean staging directory
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(STAGING_DIR, { recursive: true });

// 2. Copy production assets
console.log('Copying production files to staging...');
for (const item of INCLUDE_ITEMS) {
  const src = path.join(ROOT_DIR, item);
  const dest = path.join(STAGING_DIR, item);
  if (fs.existsSync(src)) {
    copyRecursive(src, dest);
    console.log(`  ✓ ${item}`);
  } else {
    console.warn(`  ! Warning: ${item} not found.`);
  }
}

// 3. Compress using .NET System.IO.Compression (Fast, headless, no progress bar errors)
console.log(`\nCompressing into ${ZIP_NAME}...`);
try {
  const stagingNorm = STAGING_DIR.replace(/\\/g, '/');
  const zipNorm = ZIP_PATH.replace(/\\/g, '/');
  const psCmd = `powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${stagingNorm}', '${zipNorm}')"`;
  execSync(psCmd, { stdio: 'inherit' });

  // Clean staging directory
  fs.rmSync(STAGING_DIR, { recursive: true, force: true });

  const stat = fs.statSync(ZIP_PATH);
  const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);

  console.log('\n====================================================');
  console.log('Package created successfully!');
  console.log(`Location: ${ZIP_PATH}`);
  console.log(`Size:     ${sizeMb} MB`);
  console.log('Ready for upload to Chrome Web Store Developer Dashboard.');
  console.log('====================================================\n');
} catch (err) {
  console.error('Failed to compress archive:', err.message);
  process.exit(1);
}
