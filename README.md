# Focus Nudge

A browser extension that provides playful nudges when you drift into endless scrolling on LinkedIn.

## Features

- 🎯 **Smart Detection**: Identifies when you're passively scrolling (drift mode)
- 💬 **Playful Messages**: Choose from sarcastic, motivational, or gentle tones
- ⚙️ **Customizable**: Set your drift threshold and cooldown periods
- 🔒 **Privacy First**: No data collection, no tracking, everything runs locally
- 🎨 **Non-Intrusive**: Gentle reminders that don't block your browsing

## How It Works

Focus Nudge monitors your activity on LinkedIn and detects when you're in "drift mode" - passively scrolling through the feed without engaging. After a set amount of time (default: 15 minutes), you'll receive a friendly nudge to help you refocus.

## Installation

### From Chrome Web Store (Coming Soon)
1. Visit the Chrome Web Store
2. Click "Add to Chrome"
3. Start using LinkedIn more intentionally!

### Manual Installation (Development)
1. Download the extension files
2. Go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the extension folder

## Usage

1. **Open LinkedIn** and navigate to your feed
2. **Configure settings** by clicking the extension icon:
   - Enable/disable the extension
   - Choose your preferred tone
   - Set drift threshold (minutes before nudging)
   - Set cooldown period (time between nudges)
3. **Use LinkedIn normally** - the extension works in the background
4. **Receive nudges** when you've been scrolling passively for too long

## Settings

- **Enabled**: Toggle the extension on/off
- **Tone**: Choose between sarcastic, motivational, or gentle messages
- **Drift (min)**: How many minutes of passive scrolling before a nudge (default: 15)
- **Cooldown**: Minutes between nudges (default: 10)

## Privacy

Focus Nudge is designed with privacy in mind:
- ✅ No data collection
- ✅ No tracking
- ✅ No external servers
- ✅ Everything runs locally on your device
- ✅ Only works on LinkedIn

## Technical Details

- **Manifest Version**: 3
- **Permissions**: `tabs`, `storage`
- **Host Permissions**: `https://www.linkedin.com/*`
- **Content Scripts**: Runs on LinkedIn pages only


