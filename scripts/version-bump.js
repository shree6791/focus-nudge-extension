#!/usr/bin/env node
// Version bump script: Auto-increment patch version

const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, '../extension/manifest.json');

try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const version = manifest.version.split('.');
  
  // Increment patch version
  version[2] = (parseInt(version[2]) + 1).toString();
  manifest.version = version.join('.');
  
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Version bumped to ${manifest.version}`);
} catch (err) {
  console.error('Error bumping version:', err);
  process.exit(1);
}
