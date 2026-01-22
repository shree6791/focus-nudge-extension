# Testing Pro Flow

## Quick Start: Enable Pro Mode

### Method 1: Via Options Page (Recommended)

1. **Open Options Page**:
   - Right-click the extension icon → **Options**
   - OR go to `chrome://extensions` → Find "Focus Nudge" → Click **"Options"**

2. **Enable Pro Toggle**:
   - In the "Plan" section, you should see a checkbox: **"Enable Pro (dev)"**
   - Check the box to enable Pro mode
   - The plan status should change from "Basic" to "Pro"

3. **Configure Pro Settings**:
   - The Pro Settings section should now be unlocked
   - Change **Tone**: Select from Gentle / Motivational / Sarcastic
   - Change **Drift Threshold**: Set to 1-120 minutes (try 1 minute for quick testing)
   - Change **Cooldown**: Set to 1-120 minutes (try 1 minute for quick testing)
   - Settings save automatically when changed

### Method 2: Via Service Worker Console (Advanced)

1. **Open Service Worker Console**:
   - Go to `chrome://extensions`
   - Find "Focus Nudge"
   - Click **"service worker"** (or "Inspect views: service worker")

2. **Enable Pro**:
   ```javascript
   chrome.runtime.sendMessage({ type: "SET_PRO_DEV", isPro: true });
   ```

3. **Verify**:
   ```javascript
   chrome.runtime.sendMessage({ type: "GET_PLAN" }, (response) => {
     console.log(response); // Should show { isPro: true }
   });
   ```

## Testing Pro Features

### 1. Test Tone Customization

**Setup:**
- Enable Pro mode
- Set Tone to "Sarcastic"
- Set Drift Threshold to 1 minute (for quick testing)
- Set Cooldown to 1 minute

**Test:**
- Go to LinkedIn feed
- Scroll passively (at least 5 scrolls per minute, type ≤2 times)
- Wait ~1 minute
- You should see a **sarcastic** nudge message like:
  - "Bold of you to call this 'networking.'"
  - "You've been marinating in the feed..."

**Verify:**
- Change tone to "Motivational" and repeat
- Should see messages like "Quick reset: what's the one thing you want to finish next?"

### 2. Test Custom Drift Threshold

**Setup:**
- Enable Pro mode
- Set Drift Threshold to **2 minutes**
- Set Cooldown to 1 minute

**Test:**
- Scroll passively on LinkedIn feed
- Nudge should appear after **2 minutes** (not the default 15)

### 3. Test Custom Cooldown

**Setup:**
- Enable Pro mode
- Set Drift Threshold to 1 minute
- Set Cooldown to **5 minutes**

**Test:**
- Trigger a nudge (wait 1 minute of passive scrolling)
- Try to trigger another nudge immediately after
- Should **not** appear until 5 minutes have passed

### 4. Test Basic Enforcement

**Setup:**
- **Disable Pro** (uncheck "Enable Pro (dev)")
- Try to change Tone/Settings in storage manually (via DevTools)

**Test:**
- Even if storage is tampered, Basic should always use:
  - Tone: Gentle
  - Drift: 15 minutes
  - Cooldown: 30 minutes

**Verify:**
- Open DevTools Console on options page:
  ```javascript
  // Try to set Pro settings manually
  chrome.storage.local.set({ 
    focusNudgeSettings: { tone: "sarcastic", drift_threshold_min: 1, cooldown_min: 1 }
  });
  ```
- Reload options page
- Settings should still show Basic defaults (Gentle, 15, 30)

### 5. Test Weekly Summary

**Setup:**
- Enable Pro mode
- Open Options page

**Test:**
- View "Weekly Summary" section
- Should show: "This week (Pro): Nudges X | Early exits Y | Est. time reclaimed ~Z min"
- If Basic: "This week: Nudges X | Early exits Y | Est. time reclaimed ~Z min"

**Verify:**
- Trigger some nudges
- Navigate away from LinkedIn within 2 minutes of a nudge (early exit)
- Check summary updates

### 6. Test Suppression Window

**Setup:**
- Enable Pro mode
- Set Drift Threshold to 1 minute
- Set Cooldown to 1 minute

**Test:**
- Trigger a nudge
- Immediately try to trigger another (keep scrolling)
- Should **not** appear for 30 minutes (global suppression)

**Verify:**
- Check service worker console for `next_allowed_nudge_ms`
- Should be set to current time + 30 minutes

## Quick Test Checklist

- [ ] Dev toggle appears in Options page
- [ ] Can enable/disable Pro mode
- [ ] Pro settings unlock when Pro is enabled
- [ ] Pro settings lock when Basic
- [ ] Tone changes affect nudge messages
- [ ] Custom drift threshold works
- [ ] Custom cooldown works
- [ ] Basic always enforces defaults (even if storage tampered)
- [ ] Weekly summary shows Pro label when Pro
- [ ] Suppression window works (30 min after nudge)

## Troubleshooting

**Dev toggle not showing?**
- Check `options.js` - `isDevBuild` should be `true` for testing
- Reload the extension
- Clear browser cache

**Settings not saving?**
- Check browser console for errors
- Verify `chrome.storage.local` permissions
- Check service worker console for errors

**Nudges not appearing?**
- Verify you're on LinkedIn feed (`/feed`)
- Check you're scrolling passively (≥5 scrolls/min, ≤2 keys/min)
- Verify drift threshold is reached
- Check suppression window hasn't blocked it
- Check service worker console for logs

## Service Worker Console Commands

```javascript
// Get current plan
chrome.runtime.sendMessage({ type: "GET_PLAN" }, console.log);

// Enable Pro
chrome.runtime.sendMessage({ type: "SET_PRO_DEV", isPro: true }, console.log);

// Disable Pro
chrome.runtime.sendMessage({ type: "SET_PRO_DEV", isPro: false }, console.log);

// Get effective settings
chrome.runtime.sendMessage({ type: "GET_EFFECTIVE_SETTINGS" }, console.log);

// Get weekly summary
chrome.runtime.sendMessage({ type: "GET_WEEKLY_SUMMARY" }, console.log);

// Reset weekly summary
chrome.runtime.sendMessage({ type: "RESET_WEEKLY_SUMMARY" }, console.log);
```
