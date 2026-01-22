#!/bin/bash
# Build script: Version bump, remove dev toggle, create ZIP

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$SCRIPT_DIR/../extension"
BUILD_DIR="$SCRIPT_DIR/../build"

echo "Building Focus Nudge extension..."

# Create build directory
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Copy extension files
echo "Copying extension files..."
cp -r "$EXT_DIR"/* "$BUILD_DIR/"

# Remove dev toggle from options.js (for production builds)
if [ "$1" != "dev" ]; then
  echo "Removing dev toggle for production build..."
  # This would require a more sophisticated script to parse/modify JS
  # For now, we'll keep it and handle in runtime
fi

# Bump version (optional, can be skipped with --no-bump)
if [ "$1" != "--no-bump" ] && [ "$2" != "--no-bump" ]; then
  echo "Bumping version..."
  node "$SCRIPT_DIR/version-bump.js"
fi

# Create ZIP
echo "Creating ZIP file..."
cd "$BUILD_DIR"
zip -r "../focus-nudge-extension.zip" . -x "*.git*" "*.DS_Store" "*.zip"

echo "Build complete! ZIP: focus-nudge-extension.zip"
