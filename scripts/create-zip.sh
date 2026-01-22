#!/bin/bash
# Simple ZIP creation script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$SCRIPT_DIR/../extension"
OUTPUT="$SCRIPT_DIR/../focus-nudge-extension.zip"

echo "Creating ZIP from extension directory..."

cd "$EXT_DIR"
zip -r "$OUTPUT" . -x "*.git*" "*.DS_Store" "*.zip" "*.sh"

echo "ZIP created: $OUTPUT"
