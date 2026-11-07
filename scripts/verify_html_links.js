const fs = require('fs');
const path = require('path');

const htmlFiles = [
  'src/sidepanel/sidepanel.html',
  'src/options/options.html',
  'src/popup/popup.html',
  'src/test/gesture_test.html',
  'src/tracker/tracker.html'
];

let allOk = true;

htmlFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const matches = [...content.matchAll(/src=["']([^"']+)["']/g)].map(m => m[1]);
  matches.forEach(src => {
    if (src.startsWith('http')) return;
    const resolved = path.resolve(path.dirname(file), src);
    if (fs.existsSync(resolved)) {
      console.log(`✓ ${file} -> ${src}`);
    } else {
      console.error(`✗ MISSING: ${file} -> ${src} (resolved: ${resolved})`);
      allOk = false;
    }
  });

  const cssMatches = [...content.matchAll(/href=["']([^"']+\.css)["']/g)].map(m => m[1]);
  cssMatches.forEach(href => {
    const resolved = path.resolve(path.dirname(file), href);
    if (fs.existsSync(resolved)) {
      console.log(`✓ CSS: ${file} -> ${href}`);
    } else {
      console.error(`✗ MISSING CSS: ${file} -> ${href}`);
      allOk = false;
    }
  });
});

if (allOk) {
  console.log('\nAll HTML script and stylesheet references verified successfully!');
} else {
  process.exit(1);
}
