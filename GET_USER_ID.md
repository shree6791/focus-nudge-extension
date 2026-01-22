# How to Get Your User ID

## Method 1: From Options Page Console (Easiest)

1. **Open Extension Options Page**:
   - Right-click extension icon → Options
   - OR go to `chrome://extensions` → Find "Focus Nudge" → Click "Options"

2. **Open Console**:
   - Press F12 (or right-click → Inspect)
   - Go to Console tab

3. **Run this command**:
   ```javascript
   chrome.storage.local.get('focusNudgeUserId', (r) => console.log('User ID:', r.focusNudgeUserId))
   ```

4. **Copy the User ID** (starts with `fn_`)

## Method 2: From Extension Background Console

1. **Open Extension Background Console**:
   - Go to `chrome://extensions`
   - Find "Focus Nudge"
   - Click "service worker" (or "background page")
   - This opens the service worker console

2. **Run this command**:
   ```javascript
   chrome.storage.local.get('focusNudgeUserId').then(r => console.log(r.focusNudgeUserId))
   ```

## Method 3: Add Debug Button to Options Page

I can add a button to the options page that shows your User ID. Would you like me to do that?

## Method 4: Check Extension Storage Directly

1. Go to `chrome://extensions`
2. Find "Focus Nudge"
3. Click "Details"
4. Scroll down to "Inspect views"
5. Click on the options page
6. In the console, run:
   ```javascript
   chrome.storage.local.get(null, (data) => console.log(data))
   ```
7. Look for `focusNudgeUserId` in the output

## Quick Test

If you're on the Options page, you can also just run:
```javascript
self.FocusNudgePlan.getUserId().then(id => console.log('User ID:', id))
```

This uses the extension's own function to get the User ID.
