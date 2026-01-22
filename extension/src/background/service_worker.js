// Service Worker: Background processing, metrics, early exit detection, message handling

// Import shared modules (inline for MV3 compatibility)
// Paths are relative to service worker file location
importScripts('../shared/plan.js', '../shared/metrics.js', '../shared/settings.js');

// Extract from global scope
const { getPlan, getEffectiveSettings, setProPlan } = self.FocusNudgePlan;
const { ensureWeekInitialized, recordNudgeShown, maybeRecordEarlyExit, getWeeklySummary, resetWeeklySummary } = self.FocusNudgeMetrics;

const MESSAGES = {
  sarcastic: [
    "Bold of you to call this \"networking.\"",
    "You've been marinating in the feed. Want to do the thing you came for?",
    "Your future self just cleared their throat.",
    "If scrolling paid bills, you'd be a billionaire."
  ],
  motivational: [
    "Quick reset: what's the one thing you want to finish next?",
    "Small step now. Big relief later.",
    "Choose progress for 5 minutes. Just 5."
  ],
  gentle: [
    "Tiny nudge: do you want to stay here a bit longer?",
    "If this isn't serving you, it's okay to step away."
  ]
};

function pickMessage(tone) {
  const arr = MESSAGES[tone] || MESSAGES.gentle;
  return arr[Math.floor(Math.random() * arr.length)];
}

function nowMs() {
  return Date.now();
}

// State per tab
const tabState = new Map();
// tabId -> { driftMs, lastNudgeMs, lastUrl, lastMode, lastTickMs }

// Track active LinkedIn tab for early exit detection
let lastActiveLinkedInTabId = null;

// Initialize on startup
chrome.runtime.onStartup.addListener(() => {
  ensureWeekInitialized();
});

chrome.runtime.onInstalled.addListener(() => {
  ensureWeekInitialized();
});

// Early exit detection: track when user leaves LinkedIn
async function checkForEarlyExit(newActiveTab) {
  if (!lastActiveLinkedInTabId) return;
  
  // Check if previous LinkedIn tab is still active
  try {
    const prevTab = await chrome.tabs.get(lastActiveLinkedInTabId);
    if (prevTab && prevTab.url?.startsWith("https://www.linkedin.com/")) {
      // Previous tab is still LinkedIn, check if new tab is not
      if (newActiveTab && !newActiveTab.url?.startsWith("https://www.linkedin.com/")) {
        // User switched away from LinkedIn
        await maybeRecordEarlyExit(nowMs());
      }
    }
  } catch {
    // Tab was closed or doesn't exist
    await maybeRecordEarlyExit(nowMs());
  }
}

// Track tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url?.startsWith("https://www.linkedin.com/")) {
      lastActiveLinkedInTabId = activeInfo.tabId;
    } else {
      await checkForEarlyExit(tab);
      lastActiveLinkedInTabId = null;
    }
  } catch {
    // Tab doesn't exist
    lastActiveLinkedInTabId = null;
  }
});

// Track tab updates (URL changes)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    if (tab.url.startsWith("https://www.linkedin.com/")) {
      lastActiveLinkedInTabId = tabId;
    } else if (tabId === lastActiveLinkedInTabId) {
      // User navigated away from LinkedIn
      await checkForEarlyExit(tab);
      lastActiveLinkedInTabId = null;
    }
  }
});

// Track tab removal
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId === lastActiveLinkedInTabId) {
    await maybeRecordEarlyExit(nowMs());
    lastActiveLinkedInTabId = null;
  }
  tabState.delete(tabId);
});

// Main tick function
async function tick() {
  // Check if extension is enabled (stored separately)
  const stored = await chrome.storage.local.get({ focusNudgeEnabled: true });
  if (!stored.focusNudgeEnabled) return;

  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!active?.id || !active.url?.startsWith("https://www.linkedin.com/")) return;

  const tabId = active.id;

  const state = tabState.get(tabId) || {
    driftMs: 0,
    lastNudgeMs: 0,
    lastUrl: "",
    lastMode: "UNKNOWN",
    lastTickMs: nowMs()
  };

  const delta = nowMs() - state.lastTickMs;
  state.lastTickMs = nowMs();

  // Ask content script for mode + behavior
  let resp;
  try {
    resp = await chrome.tabs.sendMessage(tabId, { type: "FOCUS_NUDGE_GET_STATE" });
  } catch (err) {
    tabState.set(tabId, state);
    return;
  }

  const mode = resp?.mode?.mode || "UNKNOWN";
  const behavior = resp?.behavior || { scrollPerMin: 0, keyPerMin: 0, clickPerMin: 0 };

  // Passive heuristic: scrolling a lot, little typing
  const passive = behavior.scrollPerMin >= 5 && behavior.keyPerMin <= 2;

  // Accumulate drift time only when in DRIFT mode AND passive
  if (mode === "DRIFT" && passive) {
    state.driftMs += delta;
  } else {
    // decay drift when user becomes active or changes mode
    state.driftMs = Math.max(0, state.driftMs - delta * 2);
  }

  // Get effective settings based on plan
  const effectiveSettings = await getEffectiveSettings();
  const driftThresholdMs = effectiveSettings.drift_threshold_min * 60_000;
  const cooldownMs = effectiveSettings.cooldown_min * 60_000;

  const canNudge = nowMs() - state.lastNudgeMs >= cooldownMs;

  if (state.driftMs >= driftThresholdMs && canNudge) {
    const msg = pickMessage(effectiveSettings.tone);
    await chrome.tabs.sendMessage(tabId, { type: "FOCUS_NUDGE_SHOW_OVERLAY", message: msg });
    state.lastNudgeMs = nowMs();
    // slight reset so it doesn't spam if they ignore
    state.driftMs = driftThresholdMs * 0.6;
  }

  state.lastMode = mode;
  state.lastUrl = resp?.url || active.url;

  tabState.set(tabId, state);
}

// Run every 5 seconds
setInterval(tick, 5000);

// Message handlers
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "NUDGE_SHOWN") {
        await ensureWeekInitialized();
        await recordNudgeShown(msg.ts_ms || nowMs());
        sendResponse({ ok: true });
        return;
      }

      if (msg.type === "GET_EFFECTIVE_SETTINGS") {
        const settings = await getEffectiveSettings();
        sendResponse(settings);
        return;
      }

      if (msg.type === "GET_WEEKLY_SUMMARY") {
        const summary = await getWeeklySummary();
        sendResponse(summary);
        return;
      }

      if (msg.type === "RESET_WEEKLY_SUMMARY") {
        await resetWeeklySummary();
        sendResponse({ ok: true });
        return;
      }

      if (msg.type === "SET_PRO_DEV") {
        await setProPlan(msg.isPro);
        sendResponse({ ok: true });
        return;
      }

      if (msg.type === "GET_PLAN") {
        const plan = await getPlan();
        sendResponse(plan);
        return;
      }

    } catch (err) {
      sendResponse({ error: err.message });
    }
  })();
  return true; // Will respond asynchronously
});
